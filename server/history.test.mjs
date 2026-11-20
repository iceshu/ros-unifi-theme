import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { once } from "node:events";
import { createHistory } from "./history.mjs";
import { createHandler } from "./ros-proxy.mjs";

// Fake timer: setTimer stores the pending callback; fire() invokes it.
function makeFakeTimer() {
  let pending = null;
  let lastDelay = null;
  const setTimer = (fn, delay) => {
    lastDelay = delay;
    const id = { fn, delay, unref() {} };
    pending = id;
    return id;
  };
  const clearTimer = () => { pending = null; };
  const fire = async () => {
    if (pending) {
      const fn = pending.fn;
      pending = null;
      await fn();
    }
  };
  return {
    setTimer,
    clearTimer,
    fire,
    get pending() { return pending; },
    get lastDelay() { return lastDelay; },
  };
}

function ifaces(entries) {
  return entries.map(([name, rx, tx]) => ({ name, "rx-byte": String(rx), "tx-byte": String(tx) }));
}

// --- Rate computation ---

test("rates computed correctly from counter deltas", async () => {
  let nowMs = 1_700_000_000_000;
  const timer = makeFakeTimer();
  let tick = 0;
  const samples = [
    ifaces([["eth0", 0, 0]]),
    ifaces([["eth0", 1_000_000, 500_000]]),
  ];
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(samples[tick])) }),
      now: () => nowMs,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();

  tick = 0; nowMs = 1_700_000_000_000;
  await timer.fire(); // stores prev, no sample produced yet

  tick = 1; nowMs = 1_700_000_005_000; // +5 s
  await timer.fire();

  const result = history.query("eth0", 300);
  assert.equal(result.name, "eth0");
  assert.equal(result.range, 300);
  assert.equal(result.step, 5);
  assert.equal(result.points.length, 1);
  const [tMs, rxBps, txBps] = result.points[0];
  assert.equal(tMs, 1_700_000_005_000);
  // 1_000_000 bytes * 8 / 5 s = 1_600_000 bps
  assert.ok(Math.abs(rxBps - 1_600_000) < 1, `rxBps=${rxBps}`);
  assert.ok(Math.abs(txBps - 800_000) < 1, `txBps=${txBps}`);
});

// --- Counter reset skip ---

test("counter reset does not produce a sample", async () => {
  let nowMs = 1_700_000_000_000;
  const timer = makeFakeTimer();
  let tick = 0;
  const samples = [
    ifaces([["eth0", 5_000_000, 1_000_000]]),
    ifaces([["eth0", 4_000_000, 900_000]]), // backward counters
  ];
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(samples[tick])) }),
      now: () => nowMs,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();

  tick = 0; await timer.fire();
  tick = 1; nowMs += 5000; await timer.fire();

  assert.equal(history.query("eth0", 300).points.length, 0);
});

// --- dt out of range ---

test("dt below minimum does not produce a sample", async () => {
  let nowMs = 1_700_000_000_000;
  const timer = makeFakeTimer();
  let tick = 0;
  const samples = [
    ifaces([["eth0", 0, 0]]),
    ifaces([["eth0", 1000, 500]]),
  ];
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(samples[tick])) }),
      now: () => nowMs,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  tick = 0; await timer.fire();
  tick = 1; nowMs += 100; // 100ms < 400ms minimum
  await timer.fire();
  assert.equal(history.query("eth0", 300).points.length, 0);
});

// --- Coarse bucket averaging ---

test("coarse bucket averages multiple samples in the same minute", async () => {
  const BASE_T = 1_700_000_000_000;
  const MINUTE = 60_000;
  const bucket0 = Math.floor(BASE_T / MINUTE) * MINUTE;
  let nowMs = BASE_T;
  const timer = makeFakeTimer();
  let tick = 0;
  // 3 ticks, all in the same 60s bucket; bytes increase by 1_000_000 each step at 5s intervals
  // → rxBps = 1_600_000 each step; coarse avg = 1_600_000
  const samples = [
    ifaces([["eth0", 0, 0]]),
    ifaces([["eth0", 1_000_000, 0]]),
    ifaces([["eth0", 2_000_000, 0]]),
    ifaces([["eth0", 3_000_000, 0]]),
  ];
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(samples[tick])) }),
      now: () => nowMs,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  for (let i = 0; i <= 3; i++) {
    tick = i;
    nowMs = BASE_T + i * 5000;
    await timer.fire();
  }

  // Coarse query for 1h range (> 3600 would be coarse; but range 21600 is coarse tier)
  const result = history.query("eth0", 21600);
  assert.equal(result.step, 60);
  assert.ok(result.points.length >= 1);
  // The coarse bucket for bucket0 should have avgRx close to 1_600_000
  const p = result.points.find(([t]) => t === bucket0);
  assert.ok(p, "bucket should exist");
  assert.ok(Math.abs(p[1] - 1_600_000) < 1, `coarse rxBps=${p[1]}`);
});

// --- Range clamping and step ---

test("range clamping and step values", async () => {
  const BASE_T = 1_700_000_000_000;
  let nowMs = BASE_T;
  const timer = makeFakeTimer();
  let tick = 0;
  const samples = [
    ifaces([["eth0", 0, 0]]),
    ifaces([["eth0", 1_000_000, 0]]),
  ];
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(samples[tick])) }),
      now: () => nowMs,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  tick = 0; await timer.fire();
  tick = 1; nowMs += 5000; await timer.fire();

  // range=100 → clamps to 300, fine tier, step=5
  const r1 = history.query("eth0", 100);
  assert.equal(r1.range, 300);
  assert.equal(r1.step, 5);

  // range=2000 → clamps to 3600, fine tier, step=5
  const r2 = history.query("eth0", 2000);
  assert.equal(r2.range, 3600);
  assert.equal(r2.step, 5);

  // range=15000 → clamps to 21600 (midpoint between 3600 and 21600 is 12600), coarse tier, step=60
  const r3 = history.query("eth0", 15000);
  assert.equal(r3.range, 21600);
  assert.equal(r3.step, 60);

  // range=99999 → clamps to 86400, coarse tier, step=60
  const r4 = history.query("eth0", 99999);
  assert.equal(r4.range, 86400);
  assert.equal(r4.step, 60);

  // missing range (undefined/NaN) → 300
  const r5 = history.query("eth0", undefined);
  assert.equal(r5.range, 300);
});

// --- Cutoff filtering ---

test("points older than range cutoff are excluded", async () => {
  const BASE_T = 1_700_000_000_000;
  let nowMs = BASE_T;
  const timer = makeFakeTimer();
  let rxBytes = 0;
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(ifaces([["eth0", rxBytes, 0]]))) }),
      now: () => nowMs,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  // Seed prev
  await timer.fire();

  // Add 10 samples, spaced 5s apart
  for (let i = 0; i < 10; i++) {
    rxBytes += 1_000_000;
    nowMs = BASE_T + (i + 1) * 5000;
    await timer.fire();
  }

  // Query range=300 (5 min = 300s); cutoff = nowMs - 300_000
  // nowMs = BASE_T + 50_000; cutoff = BASE_T - 250_000 → all 10 samples are inside the window
  const result = history.query("eth0", 300);
  assert.equal(result.points.length, 10);

  // Advance clock by 1h so older samples fall out of range=300
  nowMs = BASE_T + 50_000 + 3700_000; // well past 1h
  const result2 = history.query("eth0", 300);
  assert.equal(result2.points.length, 0, "all old points should be outside 300s window");
});

// --- Unknown name ---

test("unknown interface name returns empty points", async () => {
  const timer = makeFakeTimer();
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    { request: async () => ({ status: 200, headers: {}, body: Buffer.from("[]") }), setTimer: timer.setTimer, clearTimer: timer.clearTimer },
  );
  history.start();
  const result = history.query("nonexistent", 300);
  assert.equal(result.points.length, 0);
  assert.equal(result.name, "nonexistent");
});

// --- 401 backoff ---

test("401 response schedules 60s backoff", async () => {
  const timer = makeFakeTimer();
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 401, headers: {}, body: Buffer.from("") }),
      now: Date.now,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  await timer.fire(); // first tick gets 401
  assert.equal(timer.lastDelay, 60_000);
});

// --- Other error backoff ---

test("non-401 failure schedules 15s backoff", async () => {
  const timer = makeFakeTimer();
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => { throw new Error("ECONNREFUSED"); },
      now: Date.now,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  await timer.fire();
  assert.equal(timer.lastDelay, 15_000);
});

// --- stop() cancels timer ---

test("stop cancels the pending timer", async () => {
  const timer = makeFakeTimer();
  const history = createHistory(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from("[]") }),
      now: Date.now,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    },
  );
  history.start();
  history.stop();
  assert.equal(timer.pending, null);
});

// --- HTTP endpoint helpers ---

function listen(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res))
      .then((handled) => { if (!handled && !res.writableEnded) { res.statusCode = 404; res.end(); } })
      .catch((err) => { if (!res.headersSent) { res.statusCode = 500; res.end(String(err)); } });
  });
  server.listen(0, "127.0.0.1");
  return server;
}

function rawRequest(port, requestPath, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: requestPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function withHistoryServer(env, historyOptions, fn) {
  const timer = makeFakeTimer();
  const history = createHistory(env, { ...historyOptions, setTimer: timer.setTimer, clearTimer: timer.clearTimer });
  history.start();
  const server = listen(createHandler(env, { staticDir: false, history }));
  await once(server, "listening");
  const { port } = server.address();
  try {
    return await fn(port, timer);
  } finally {
    history.stop();
    server.close();
    await once(server, "close");
  }
}

// --- Endpoint: 404 when history disabled ---

test("endpoint 404 when history not passed to createHandler", async () => {
  const handler = createHandler({}, { staticDir: false });
  const server = listen(handler);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const res = await rawRequest(port, "/api/history?name=eth0");
    assert.equal(res.status, 404);
    assert.equal(JSON.parse(res.body).code, "history_disabled");
  } finally {
    server.close();
    await once(server, "close");
  }
});

// --- Endpoint: 400 for bad name ---

test("endpoint 400 for invalid interface name", async () => {
  await withHistoryServer(
    { DEMO_MODE: "true" },
    {},
    async (port) => {
      const res1 = await rawRequest(port, "/api/history?name=../../etc");
      assert.equal(res1.status, 400);
      assert.equal(JSON.parse(res1.body).code, "bad_name");

      const res2 = await rawRequest(port, "/api/history"); // missing name
      assert.equal(res2.status, 400);
      assert.equal(JSON.parse(res2.body).code, "bad_name");

      const longName = "a".repeat(65);
      const res3 = await rawRequest(port, `/api/history?name=${longName}`);
      assert.equal(res3.status, 400);
    },
  );
});

// --- Endpoint: 200 with correct shape ---

test("endpoint 200 returns correct shape for known interface", async () => {
  const BASE_T = 1_700_000_000_000;
  let nowMs = BASE_T;
  let tick = 0;
  const samples = [
    ifaces([["liantong", 0, 0]]),
    ifaces([["liantong", 1_000_000, 500_000]]),
  ];
  await withHistoryServer(
    { ROUTEROS_HOST: "http://192.168.2.1", ROUTEROS_USER: "u", ROUTEROS_PASSWORD: "p" },
    {
      request: async () => ({ status: 200, headers: {}, body: Buffer.from(JSON.stringify(samples[tick])) }),
      now: () => nowMs,
    },
    async (port, timer) => {
      tick = 0; await timer.fire();
      tick = 1; nowMs += 5000; await timer.fire();

      const res = await rawRequest(port, "/api/history?name=liantong&range=300");
      assert.equal(res.status, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.name, "liantong");
      assert.equal(body.range, 300);
      assert.equal(body.step, 5);
      assert.ok(Array.isArray(body.points));
      assert.equal(body.points.length, 1);
      const [t, rx, tx] = body.points[0];
      assert.equal(t, 1_700_000_005_000);
      assert.ok(Math.abs(rx - 1_600_000) < 1);
      assert.ok(Math.abs(tx - 800_000) < 1);
    },
  );
});

// --- Endpoint: 200 with unknown name returns empty ---

test("endpoint 200 with empty points for unknown interface", async () => {
  await withHistoryServer(
    { DEMO_MODE: "true" },
    {},
    async (port) => {
      const res = await rawRequest(port, "/api/history?name=no_such_iface&range=300");
      assert.equal(res.status, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.name, "no_such_iface");
      assert.deepEqual(body.points, []);
    },
  );
});

// --- Endpoint: Cache-Control header ---

test("endpoint sets Cache-Control: no-store", async () => {
  const handler = createHandler({}, { staticDir: false });
  const server = listen(handler);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, path: "/api/history?name=eth0" }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString() }));
      });
      req.on("error", reject);
      req.end();
    });
    // history_disabled (404), but Cache-Control should still be no-store
    assert.equal(res.headers["cache-control"], "no-store");
  } finally {
    server.close();
    await once(server, "close");
  }
});

// --- meta payload includes historyEnabled ---

test("meta includes historyEnabled=true when history passed", async () => {
  const timer = makeFakeTimer();
  const history = createHistory({ DEMO_MODE: "true" }, { setTimer: timer.setTimer, clearTimer: timer.clearTimer });
  history.start();
  const handler = createHandler({ DEMO_MODE: "true" }, { staticDir: false, history });
  const server = listen(handler);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const res = await rawRequest(port, "/api/meta");
    const body = JSON.parse(res.body);
    assert.equal(body.historyEnabled, true);
  } finally {
    history.stop();
    server.close();
    await once(server, "close");
  }
});

test("meta includes historyEnabled=false when history not passed", async () => {
  const handler = createHandler({}, { staticDir: false });
  const server = listen(handler);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const res = await rawRequest(port, "/api/meta");
    const body = JSON.parse(res.body);
    assert.equal(body.historyEnabled, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});
