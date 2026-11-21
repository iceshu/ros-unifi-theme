import { demoBody } from "./demo.mjs";
import { normalizeRouterHost, parseBool, routerRequest, timeoutMs } from "./ros-proxy.mjs";

const ALLOWED_RANGES = [300, 3600, 21600, 86400];
const FINE_MAX_AGE_MS = 3_600_000;
const COARSE_MAX_AGE_MS = 86_400_000;
const COARSE_BUCKET_MS = 60_000;

function clampRange(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return 300;
  let best = ALLOWED_RANGES[0];
  let bestDist = Math.abs(n - best);
  for (const v of ALLOWED_RANGES) {
    const d = Math.abs(n - v);
    if (d < bestDist) { best = v; bestDist = d; }
  }
  return best;
}

class RingBuffer {
  constructor(capacity) {
    this._cap = capacity;
    this._buf = new Array(capacity);
    this._head = 0;
    this._size = 0;
  }
  push(item) {
    if (this._size < this._cap) {
      this._buf[(this._head + this._size) % this._cap] = item;
      this._size++;
    } else {
      this._buf[this._head] = item;
      this._head = (this._head + 1) % this._cap;
    }
  }
  filter(predicate) {
    const out = [];
    for (let i = 0; i < this._size; i++) {
      const item = this._buf[(this._head + i) % this._cap];
      if (!predicate || predicate(item)) out.push(item);
    }
    return out;
  }
  get latest() {
    if (this._size === 0) return null;
    return this._buf[(this._head + this._size - 1) % this._cap];
  }
  clear() { this._head = 0; this._size = 0; }
}

/** ROUTEROS_USER / ROUTEROS_PASSWORD from .env, or null when not configured. */
export function envCredentials(env) {
  const user = String(env.ROUTEROS_USER ?? "").trim();
  const password = String(env.ROUTEROS_PASSWORD ?? "");
  return user && password ? { user, password } : null;
}

export function createHistory(env, {
  request = routerRequest,
  // Service account from .env by default; the server passes a provider that falls back to a logged-in session.
  credentials = () => envCredentials(env),
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const demo = parseBool(env.DEMO_MODE);
  const rawInterval = Number(env.HISTORY_INTERVAL_MS ?? 5000);
  const intervalMs = Math.min(60_000, Math.max(2_000, Number.isFinite(rawInterval) ? Math.round(rawInterval) : 5000));
  const intervalSec = intervalMs / 1000;
  const fineCapacity = Math.ceil(FINE_MAX_AGE_MS / intervalMs) + 10;
  const coarseCapacity = Math.ceil(COARSE_MAX_AGE_MS / COARSE_BUCKET_MS) + 10;

  // name → { fine: RingBuffer<[tMs, rxBps, txBps]>, coarse: RingBuffer<[tMs, rxBps, txBps]>, lastSeen: number }
  const store = new Map();
  // name → { rxByte, txByte, t } — previous counter sample for delta computation
  const prevSample = new Map();
  // name → { bucket, sumRx, sumTx, count } — in-progress coarse bucket accumulator
  const coarseAcc = new Map();

  let timer = null;
  let stopped = false;
  let lastLoggedState = "";

  function logState(msg) {
    if (msg !== lastLoggedState) {
      console.info(`[ros] history ${msg}`);
      lastLoggedState = msg;
    }
  }

  function ensureStore(name, nowMs) {
    if (!store.has(name)) {
      store.set(name, {
        fine: new RingBuffer(fineCapacity),
        coarse: new RingBuffer(coarseCapacity),
        lastSeen: nowMs,
      });
    } else {
      store.get(name).lastSeen = nowMs;
    }
    return store.get(name);
  }

  function pushSample(name, tMs, rxBps, txBps) {
    const { fine, coarse } = ensureStore(name, tMs);
    fine.push([tMs, rxBps, txBps]);

    const bucket = Math.floor(tMs / COARSE_BUCKET_MS) * COARSE_BUCKET_MS;
    const acc = coarseAcc.get(name);
    if (acc && acc.bucket === bucket) {
      acc.sumRx += rxBps;
      acc.sumTx += txBps;
      acc.count++;
      // Update the bucket tuple in-place so queries always see the running average.
      const latest = coarse.latest;
      if (latest && latest[0] === bucket) {
        latest[1] = acc.sumRx / acc.count;
        latest[2] = acc.sumTx / acc.count;
      }
    } else {
      coarseAcc.set(name, { bucket, sumRx: rxBps, sumTx: txBps, count: 1 });
      coarse.push([bucket, rxBps, txBps]);
    }
  }

  function processSamples(ifaces, tMs) {
    const minDtMs = 400;
    const maxDtMs = 3 * intervalMs + 5000;
    for (const iface of ifaces) {
      const name = String(iface.name || "");
      if (!name) continue;
      const rxByte = Number(iface["rx-byte"]);
      const txByte = Number(iface["tx-byte"]);
      if (!Number.isFinite(rxByte) || !Number.isFinite(txByte)) continue;
      const p = prevSample.get(name);
      if (p) {
        const dt = tMs - p.t;
        if (dt >= minDtMs && dt <= maxDtMs && rxByte >= p.rxByte && txByte >= p.txByte) {
          const dtSec = dt / 1000;
          pushSample(name, tMs, (rxByte - p.rxByte) * 8 / dtSec, (txByte - p.txByte) * 8 / dtSec);
        }
      }
      prevSample.set(name, { rxByte, txByte, t: tMs });
    }
  }

  function dropStaleInterfaces(nowMs) {
    for (const [name, s] of store) {
      if (nowMs - s.lastSeen > COARSE_MAX_AGE_MS) {
        store.delete(name);
        prevSample.delete(name);
        coarseAcc.delete(name);
      }
    }
  }

  async function fetchRouter() {
    let origin;
    try {
      origin = normalizeRouterHost(env.ROUTEROS_HOST);
    } catch {
      return { error: "bad_host" };
    }
    const account = credentials();
    if (!account) return { error: "not_configured" };
    const { user, password } = account;

    const target = new URL("/rest/interface?.proplist=name,rx-byte,tx-byte", origin);
    const token = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
    try {
      const upstream = await request(target, {
        method: "GET",
        headers: {
          Authorization: `Basic ${token}`,
          Accept: "application/json",
          "Accept-Encoding": "identity",
          Host: target.host,
        },
        timeout: timeoutMs(env),
        insecure: parseBool(env.ROUTEROS_TLS_INSECURE),
        signal: null,
      });
      if (upstream.status === 401) return { error: "auth" };
      if (upstream.status >= 400) return { error: "http_error" };
      let parsed;
      try { parsed = JSON.parse(upstream.body.toString("utf8")); } catch { return { error: "bad_response" }; }
      if (!Array.isArray(parsed)) return { error: "bad_response" };
      return { data: parsed };
    } catch {
      return { error: "network" };
    }
  }

  async function tick() {
    const tMs = now();
    let delayMs = intervalMs;

    if (demo) {
      const body = demoBody("/rest/interface", tMs);
      if (Array.isArray(body)) processSamples(body, tMs);
      logState("running (demo)");
    } else {
      const result = await fetchRouter();
      if (result.error === "not_configured") {
        logState("paused: not configured");
        // Checking for credentials is free; resume within one interval after someone logs in.
        delayMs = intervalMs;
      } else if (result.error === "auth") {
        logState("paused: auth");
        delayMs = 60_000;
      } else if (result.error) {
        logState(`paused: ${result.error}`);
        delayMs = 15_000;
      } else {
        processSamples(result.data, tMs);
        logState("running");
      }
    }

    dropStaleInterfaces(tMs);
    if (!stopped) {
      timer = setTimer(tick, delayMs);
      if (timer?.unref) timer.unref();
    }
  }

  function backfillDemo(nowMs) {
    const fineStart = nowMs - FINE_MAX_AGE_MS;
    // Start one interval before the 24h window so the first sample has a prev to diff against.
    const startMs = nowMs - COARSE_MAX_AGE_MS - intervalMs;
    for (let tMs = startMs; tMs <= nowMs; tMs += intervalMs) {
      const body = demoBody("/rest/interface", tMs);
      if (!Array.isArray(body)) continue;
      for (const iface of body) {
        const name = String(iface.name || "");
        if (!name) continue;
        const rxByte = Number(iface["rx-byte"]);
        const txByte = Number(iface["tx-byte"]);
        if (!Number.isFinite(rxByte) || !Number.isFinite(txByte)) continue;
        const p = prevSample.get(name);
        if (p && rxByte >= p.rxByte && txByte >= p.txByte) {
          const dt = tMs - p.t;
          if (dt > 0) {
            const dtSec = dt / 1000;
            const rxBps = (rxByte - p.rxByte) * 8 / dtSec;
            const txBps = (txByte - p.txByte) * 8 / dtSec;
            const { fine, coarse } = ensureStore(name, tMs);
            if (tMs >= fineStart) fine.push([tMs, rxBps, txBps]);

            const bucket = Math.floor(tMs / COARSE_BUCKET_MS) * COARSE_BUCKET_MS;
            const acc = coarseAcc.get(name);
            if (acc && acc.bucket === bucket) {
              acc.sumRx += rxBps;
              acc.sumTx += txBps;
              acc.count++;
              const latest = coarse.latest;
              if (latest && latest[0] === bucket) {
                latest[1] = acc.sumRx / acc.count;
                latest[2] = acc.sumTx / acc.count;
              }
            } else {
              coarseAcc.set(name, { bucket, sumRx: rxBps, sumTx: txBps, count: 1 });
              coarse.push([bucket, rxBps, txBps]);
            }
          }
        } else {
          ensureStore(name, tMs);
        }
        prevSample.set(name, { rxByte, txByte, t: tMs });
      }
    }
  }

  return {
    start() {
      stopped = false;
      if (demo) backfillDemo(now());
      timer = setTimer(tick, intervalMs);
      if (timer?.unref) timer.unref();
    },

    stop() {
      stopped = true;
      if (timer != null) {
        clearTimer(timer);
        timer = null;
      }
    },

    query(name, rangeSec) {
      const range = clampRange(rangeSec);
      const useFine = range <= 3600;
      const step = useFine ? intervalSec : 60;
      const cutoff = now() - range * 1000;
      if (!store.has(name)) return { name, range, step, points: [] };
      const { fine, coarse } = store.get(name);
      const points = (useFine ? fine : coarse).filter(([t]) => t >= cutoff);
      return { name, range, step, points };
    },
  };
}
