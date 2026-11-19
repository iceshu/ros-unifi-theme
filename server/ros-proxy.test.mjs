import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { integratedBytes, instantBps } from "./demo.mjs";
import {
  ALLOWED_PATHS,
  classifyNetworkError,
  createHandler,
  crossSiteError,
  normalizeRestPath,
  normalizeRouterHost,
  redactSecrets,
  sanitizeSearch,
} from "./ros-proxy.mjs";

const PASSWORD = "s3cret-value";

function listen(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res))
      .then((handled) => {
        if (!handled && !res.writableEnded) {
          res.statusCode = 404;
          res.end();
        }
      })
      .catch((error) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
  });
  server.listen(0, "127.0.0.1");
  return server;
}

function rawRequest(port, requestPath, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: requestPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function withServer(env, options, fn) {
  const server = listen(createHandler(env, { staticDir: false, ...options }));
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    return await fn(port);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("host normalization drops paths and rejects credentials", () => {
  assert.equal(normalizeRouterHost(""), "http://192.168.2.1");
  assert.equal(normalizeRouterHost("192.168.2.1"), "http://192.168.2.1");
  assert.equal(normalizeRouterHost("http://192.168.2.1/rest"), "http://192.168.2.1");
  assert.equal(normalizeRouterHost("https://router.lan:8443"), "https://router.lan:8443");
  assert.throws(() => normalizeRouterHost("http://dash:secret@192.168.2.1"), /credentials/);
  assert.throws(() => normalizeRouterHost("ftp://192.168.2.1"), /scheme/);
});

test("rest paths reject traversal and unknown menus", () => {
  assert.equal(normalizeRestPath("/rest/system/resource/"), "/rest/system/resource");
  assert.equal(normalizeRestPath("/rest/interface/wireguard/peers"), "/rest/interface/wireguard/peers");
  assert.equal(normalizeRestPath("/rest/../user"), null);
  assert.equal(normalizeRestPath("/rest/%2e%2e/user"), null);
  assert.equal(normalizeRestPath("/rest/system/resource/../../user"), null);
  assert.equal(sanitizeSearch("?.proplist=name,rx-byte,tx-byte"), "?.proplist=name%2Crx-byte%2Ctx-byte");
  assert.equal(sanitizeSearch("?password=nope"), null);
});

test("redact strips secrets and keeps public keys", () => {
  const value = redactSecrets([
    {
      name: "wg0",
      password: "nope",
      "private-key": "hidden",
      "preshared-key": "hidden",
      "public-key": "visible",
      user: "demo",
      nested: { passphrase: "hidden", comment: "ok" },
    },
  ]);
  const text = JSON.stringify(value);
  assert.equal(text.includes("nope"), false);
  assert.equal(text.includes("hidden"), false);
  assert.equal(text.includes("visible"), true);
  assert.equal(text.includes("demo"), true);
});

test("classifies connection failures", () => {
  assert.equal(classifyNetworkError(Object.assign(new Error("x"), { code: "ECONNREFUSED" })).code, "refused");
  assert.equal(classifyNetworkError(Object.assign(new Error("x"), { code: "EHOSTUNREACH" })).code, "unreachable");
  assert.equal(classifyNetworkError(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })).code, "timeout");
  assert.equal(
    classifyNetworkError(Object.assign(new Error("self signed"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" })).code,
    "tls",
  );
  assert.equal(crossSiteError({ origin: "http://evil.test", host: "127.0.0.1:8080" }), "cross_origin");
  assert.equal(crossSiteError({ "sec-fetch-site": "cross-site", host: "127.0.0.1" }), "cross_site");
  assert.equal(crossSiteError({ host: "127.0.0.1:8080" }), null);
});

test("demo counters integrate to the advertised rate", () => {
  const spec = { base: 1000, baseBps: 160e6, amp: 45e6, period: 50, phase: 0.4 };
  const t0 = Date.UTC(2026, 10, 19, 3, 0, 0);
  const dt = 2;
  const deltaBits = (integratedBytes(t0 + dt * 1000, spec) - integratedBytes(t0, spec)) * 8;
  const measured = deltaBits / dt;
  const expected = instantBps(t0 + dt * 500, spec);
  assert.ok(Math.abs(measured - expected) / expected < 0.05, `${measured} vs ${expected}`);
});

test("proxy is read-only, allowlisted, and does not leak the password", async () => {
  const calls = [];
  const env = {
    ROUTEROS_HOST: "http://192.168.2.1",
    ROUTEROS_USER: "dashboard",
    ROUTEROS_PASSWORD: PASSWORD,
    DEMO_MODE: "false",
    WAN_INTERFACES: "liantong,ether0",
    LAN_INTERFACES: "bridge1",
  };
  await withServer(
    env,
    {
      request: async (target, options) => {
        calls.push({ href: target.href, authorization: options.headers.Authorization, method: options.method });
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(
            JSON.stringify([{ name: "liantong", password: "router-secret", "public-key": "abc", user: "pppoe" }]),
          ),
        };
      },
    },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const ok = await fetch(`${base}/rest/system/resource`);
      const body = await ok.json();
      assert.equal(ok.status, 200);
      assert.equal(JSON.stringify(body).includes("router-secret"), false);
      assert.equal(JSON.stringify(body).includes(PASSWORD), false);
      assert.equal(body[0]["public-key"], "abc");
      assert.equal(body[0].user, "pppoe");
      assert.equal(calls[0].method, "GET");
      assert.equal(calls[0].href, "http://192.168.2.1/rest/system/resource");
      assert.equal(
        calls[0].authorization,
        `Basic ${Buffer.from(`dashboard:${PASSWORD}`, "utf8").toString("base64")}`,
      );

      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const denied = await fetch(`${base}/rest/interface`, { method });
        const deniedBody = await denied.json();
        assert.equal(denied.status, 405, method);
        assert.equal(deniedBody.code, "method_not_allowed");
      }
      assert.equal(calls.length, 1);

      const user = await fetch(`${base}/rest/user`);
      assert.equal(user.status, 403);
      const monitor = await fetch(`${base}/rest/interface/monitor-traffic`);
      assert.equal(monitor.status, 403);
      const traversal = await rawRequest(port, "/rest/system/resource/../../user");
      assert.ok(traversal.status === 400 || traversal.status === 403);
      assert.equal(calls.length, 1);

      const cross = await fetch(`${base}/rest/system/resource`, {
        headers: { Origin: "http://evil.test" },
      });
      assert.equal(cross.status, 403);

      const meta = await fetch(`${base}/api/meta`);
      const metaBody = await meta.json();
      assert.equal(metaBody.passwordConfigured, true);
      assert.equal(JSON.stringify(metaBody).includes(PASSWORD), false);
      assert.equal(metaBody.readonly, true);
      assert.deepEqual(metaBody.wanInterfaces, ["liantong", "ether0"]);
      assert.equal(metaBody.allowedPaths.includes("/rest/ip/firewall/filter"), true);
      assert.equal(metaBody.allowedPaths.includes("/rest/user"), false);
    },
  );
});

test("x86 missing menus are not_found instead of a surfaced router error", async () => {
  await withServer(
    {
      ROUTEROS_HOST: "http://192.168.2.1",
      ROUTEROS_USER: "dashboard",
      ROUTEROS_PASSWORD: PASSWORD,
    },
    {
      request: async (target) => {
        if (target.pathname === "/rest/system/routerboard" || target.pathname === "/rest/interface/wireguard") {
          const name = target.pathname.split("/").pop();
          return {
            status: 400,
            headers: { "content-type": "application/json" },
            body: Buffer.from(
              JSON.stringify({
                error: 400,
                message: "Bad Request",
                detail: `no such command or directory (${name})`,
              }),
            ),
          };
        }
        if (target.pathname === "/rest/system/resource") {
          return {
            status: 400,
            headers: { "content-type": "application/json" },
            body: Buffer.from(JSON.stringify({ error: 400, message: "Bad Request", detail: "invalid value" })),
          };
        }
        return {
          status: 404,
          headers: { "content-type": "application/json" },
          body: Buffer.from(JSON.stringify({ error: 404, message: "Not Found" })),
        };
      },
    },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const board = await fetch(`${base}/rest/system/routerboard`);
      const boardBody = await board.json();
      assert.equal(board.status, 404);
      assert.equal(boardBody.code, "not_found");
      assert.equal(String(boardBody.message).includes("no such command"), false);

      const wireguard = await fetch(`${base}/rest/interface/wireguard`);
      const wireguardBody = await wireguard.json();
      assert.equal(wireguard.status, 404);
      assert.equal(wireguardBody.code, "not_found");
      assert.match(wireguardBody.detail, /wireguard/);

      const rejected = await fetch(`${base}/rest/system/resource`);
      const rejectedBody = await rejected.json();
      assert.equal(rejected.status, 400);
      assert.equal(rejectedBody.code, "router_error");

      const health = await fetch(`${base}/rest/system/health`);
      const healthBody = await health.json();
      assert.equal(health.status, 404);
      assert.equal(healthBody.code, "not_found");
    },
  );
});

test("missing credentials do not call the router", async () => {
  let called = false;
  await withServer(
    { ROUTEROS_HOST: "http://192.168.2.1", DEMO_MODE: "false" },
    {
      request: async () => {
        called = true;
        throw new Error("should not dial");
      },
    },
    async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/rest/interface`);
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.code, "not_configured");
      assert.equal(called, false);
    },
  );
});

test("demo mode serves every allowlisted path and strips secrets", async () => {
  await withServer({ DEMO_MODE: "true", ROUTEROS_HOST: "http://192.168.2.1" }, {}, async (port) => {
    for (const pathName of ALLOWED_PATHS) {
      const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
      const text = await response.text();
      assert.equal(response.status, 200, pathName);
      assert.equal(response.headers.get("x-demo-mode"), "1", pathName);
      assert.equal(text.includes("demo-should-not-leak"), false, pathName);
      assert.equal(text.includes("demo-private-key-should-not-leak"), false, pathName);
      assert.equal(text.includes("demo-preshared-should-not-leak"), false, pathName);
      const json = JSON.parse(text);
      assert.ok(Array.isArray(json), pathName);
    }
    const meta = await fetch(`http://127.0.0.1:${port}/api/meta`);
    const body = await meta.json();
    assert.equal(body.demo, true);
  });
});

test("network failures become structured errors and do not include the password", async () => {
  await withServer(
    {
      ROUTEROS_HOST: "http://192.168.2.1",
      ROUTEROS_USER: "dashboard",
      ROUTEROS_PASSWORD: PASSWORD,
    },
    {
      request: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      },
    },
    async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/rest/system/resource`);
      const body = await response.json();
      assert.equal(response.status, 502);
      assert.equal(body.code, "refused");
      assert.equal(JSON.stringify(body).includes(PASSWORD), false);
      assert.match(body.message, /www/);
    },
  );
});

test("frontend source does not embed router credentials", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx|ts|css)$/.test(entry)) files.push(full);
    }
  };
  walk(path.resolve("src"));
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(source.includes("ROUTEROS_PASSWORD"), false);
  assert.equal(source.includes("Authorization"), false);
  assert.match(readFileSync(path.resolve("README.md"), "utf8"), /192\.168\.2\.1/);
  assert.match(readFileSync(path.resolve(".gitignore"), "utf8"), /^\.env$/m);
});
