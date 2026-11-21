import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { integratedBytes, instantBps, resetDemoState } from "./demo.mjs";
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

function rawRequest(port, requestPath, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: requestPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
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

/** Returns mock router responses for login auth paths. */
function authResponse(target) {
  if (target.pathname === "/rest/system/identity" && !target.search) {
    return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "router" }])) };
  }
  if (target.pathname === "/rest/user") {
    const name = target.searchParams.get("name") ?? "";
    return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name, group: "full" }])) };
  }
  if (target.pathname === "/rest/user/group") {
    return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "full", policy: "read,write,reboot,test,api,rest-api,sensitive,password" }])) };
  }
  return null;
}

/** Compose auth handler with a data handler. */
function makeRequest(dataHandler) {
  return async (target, options) => {
    const auth = authResponse(target);
    if (auth) return auth;
    if (dataHandler) return dataHandler(target, options);
    throw new Error(`unexpected request: ${target.href}`);
  };
}

/** Login and return the Cookie string to send in subsequent requests. */
async function loginSession(port, { username = "admin", password = PASSWORD } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(/rut_sid=[^;]+/)?.[0] ?? "";
}

// ─── Pure-function tests (no HTTP) ───────────────────────────────────────────

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
      "security.passphrase": "hidden-dotted",
      "wpa2-pre-shared-key": "hidden-psk",
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

// ─── HTTP proxy tests ─────────────────────────────────────────────────────────

test("proxy enforces allowlist and strips secrets (requires login)", async () => {
  const calls = [];
  const env = {
    ROUTEROS_HOST: "http://192.168.2.1",
    DEMO_MODE: "false",
    WAN_INTERFACES: "liantong,ether0",
    LAN_INTERFACES: "bridge1",
  };
  await withServer(
    env,
    {
      request: makeRequest(async (target, options) => {
        calls.push({ href: target.href, authorization: options.headers.Authorization, method: options.method });
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(
            JSON.stringify([{ name: "liantong", password: "router-secret", "public-key": "abc", user: "pppoe" }]),
          ),
        };
      }),
    },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;

      // Without session → 401
      const noAuth = await fetch(`${base}/rest/system/resource`);
      assert.equal(noAuth.status, 401);
      assert.equal((await noAuth.json()).code, "login_required");

      const cookie = await loginSession(port);
      calls.length = 0; // reset after login calls

      const ok = await fetch(`${base}/rest/system/resource`, { headers: { Cookie: cookie } });
      const body = await ok.json();
      assert.equal(ok.status, 200);
      assert.equal(JSON.stringify(body).includes("router-secret"), false);
      assert.equal(JSON.stringify(body).includes(PASSWORD), false);
      assert.equal(body[0]["public-key"], "abc");
      assert.equal(body[0].user, "pppoe");
      assert.equal(calls[0].method, "GET");
      assert.equal(calls[0].href, "http://192.168.2.1/rest/system/resource");
      // Session credentials used (admin:PASSWORD)
      assert.equal(calls[0].authorization, `Basic ${Buffer.from(`admin:${PASSWORD}`, "utf8").toString("base64")}`);

      // Non-allowlisted paths → 403
      const user = await fetch(`${base}/rest/user`, { headers: { Cookie: cookie } });
      assert.equal(user.status, 403);
      const monitor = await fetch(`${base}/rest/interface/monitor-traffic`, { headers: { Cookie: cookie } });
      assert.equal(monitor.status, 403);

      // Traversal
      const traversal = await rawRequest(port, "/rest/system/resource/../../user", { headers: { Cookie: cookie } });
      assert.ok(traversal.status === 400 || traversal.status === 403);

      // Cross-site check happens before session check
      const cross = await fetch(`${base}/rest/system/resource`, {
        headers: { Origin: "http://evil.test", Cookie: cookie },
      });
      assert.equal(cross.status, 403);

      // Meta: no passwordConfigured/readonly/writeEnabled; has serviceAccount, writeMenus
      const meta = await fetch(`${base}/api/meta`);
      const metaBody = await meta.json();
      assert.equal(metaBody.passwordConfigured, undefined);
      assert.equal(metaBody.readonly, undefined);
      assert.equal(metaBody.writeEnabled, undefined);
      assert.equal(typeof metaBody.serviceAccount, "boolean");
      assert.ok(Array.isArray(metaBody.writeMenus));
      assert.equal(JSON.stringify(metaBody).includes(PASSWORD), false);
      assert.deepEqual(metaBody.wanInterfaces, ["liantong", "ether0"]);
      assert.equal(metaBody.allowedPaths.includes("/rest/ip/firewall/filter"), true);
      assert.equal(metaBody.allowedPaths.includes("/rest/ip/firewall/connection"), true);
      assert.equal(metaBody.allowedPaths.includes("/rest/interface/bridge/host"), true);
      assert.equal(metaBody.allowedPaths.includes("/rest/user"), false);
    },
  );
});

test("x86 missing menus are not_found instead of a surfaced router error", async () => {
  const mockRequest = makeRequest(async (target) => {
    if (
      target.pathname === "/rest/system/routerboard" ||
      target.pathname === "/rest/interface/wireguard" ||
      target.pathname === "/rest/interface/bridge/host"
    ) {
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
  });

  await withServer(
    { ROUTEROS_HOST: "http://192.168.2.1" },
    { request: mockRequest },
    async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const cookie = await loginSession(port);
      const h = { Cookie: cookie };

      const board = await fetch(`${base}/rest/system/routerboard`, { headers: h });
      const boardBody = await board.json();
      assert.equal(board.status, 404);
      assert.equal(boardBody.code, "not_found");
      assert.equal(String(boardBody.message).includes("no such command"), false);

      const hosts = await fetch(`${base}/rest/interface/bridge/host`, { headers: h });
      const hostsBody = await hosts.json();
      assert.equal(hosts.status, 404);
      assert.equal(hostsBody.code, "not_found");

      const wireguard = await fetch(`${base}/rest/interface/wireguard`, { headers: h });
      const wireguardBody = await wireguard.json();
      assert.equal(wireguard.status, 404);
      assert.equal(wireguardBody.code, "not_found");
      assert.match(wireguardBody.detail, /wireguard/);

      for (const menu of ["wifi", "wifi/configuration", "wifi/registration-table"]) {
        const response = await fetch(`${base}/rest/interface/${menu}`, { headers: h });
        assert.equal(response.status, 404);
        assert.equal((await response.json()).code, "not_found");
      }

      const rejected = await fetch(`${base}/rest/system/resource`, { headers: h });
      const rejectedBody = await rejected.json();
      assert.equal(rejected.status, 400);
      assert.equal(rejectedBody.code, "router_error");

      const health = await fetch(`${base}/rest/system/health`, { headers: h });
      const healthBody = await health.json();
      assert.equal(health.status, 404);
      assert.equal(healthBody.code, "not_found");
    },
  );
});

test("log requests forward only the requested read projection", async () => {
  let seen;
  const mockRequest = makeRequest(async (target, options) => {
    seen = { path: target.pathname, projection: target.searchParams.get(".proplist"), method: options.method };
    return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
  });

  await withServer(
    { ROUTEROS_HOST: "http://192.168.2.1" },
    { request: mockRequest },
    async (port) => {
      const cookie = await loginSession(port);
      const response = await fetch(`http://127.0.0.1:${port}/rest/log?.proplist=time,topics,message`, {
        headers: { Cookie: cookie },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(seen, { path: "/rest/log", projection: "time,topics,message", method: "GET" });
    },
  );
});

test("demo mode serves every allowlisted path and strips secrets", async () => {
  await withServer({ DEMO_MODE: "true", ROUTEROS_HOST: "http://192.168.2.1" }, {}, async (port) => {
    const cookie = await loginSession(port, { username: "demo", password: "demo" });

    for (const pathName of ALLOWED_PATHS) {
      const response = await fetch(`http://127.0.0.1:${port}${pathName}`, { headers: { Cookie: cookie } });
      const text = await response.text();
      assert.equal(response.status, 200, pathName);
      assert.equal(response.headers.get("x-demo-mode"), "1", pathName);
      assert.equal(text.includes("demo-should-not-leak"), false, pathName);
      assert.equal(text.includes("demo-private-key-should-not-leak"), false, pathName);
      assert.equal(text.includes("demo-preshared-should-not-leak"), false, pathName);
      const json = JSON.parse(text);
      if (pathName === "/rest/ip/dns") {
        assert.equal(typeof json, "object", pathName);
        assert.ok(!Array.isArray(json) && json !== null, pathName);
        assert.equal(json["allow-remote-requests"], "true");
      } else {
        assert.ok(Array.isArray(json), pathName);
      }
    }
    const meta = await fetch(`http://127.0.0.1:${port}/api/meta`);
    const body = await meta.json();
    assert.equal(body.demo, true);
  });
});

test("network failures become structured errors and do not include the password", async () => {
  let fail = false;
  await withServer(
    { ROUTEROS_HOST: "http://192.168.2.1" },
    {
      request: async (target, options) => {
        if (fail) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        return authResponse(target) ?? { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
      },
    },
    async (port) => {
      const cookie = await loginSession(port);
      fail = true;
      const response = await fetch(`http://127.0.0.1:${port}/rest/system/resource`, { headers: { Cookie: cookie } });
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

// ─── Write tests ──────────────────────────────────────────────────────────────

test("allowlisted writes forward the validated JSON with session auth and raw * ids", async () => {
  const writeCalls = [];
  const env = { ROUTEROS_HOST: "http://192.168.2.1" };

  await withServer(env, {
    request: makeRequest(async (target, options) => {
      writeCalls.push({ target, options });
      return {
        status: 202,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ disabled: "yes", "private-key": "hidden" })),
      };
    }),
  }, async (port) => {
    const cookie = await loginSession(port);
    const patchHeaders = { Cookie: cookie, "Content-Type": "application/json" };

    const patch = (p, body = { disabled: "yes" }, extra = {}) =>
      fetch(`http://127.0.0.1:${port}${p}`, {
        method: "PATCH",
        headers: patchHeaders,
        body: JSON.stringify(body),
        ...extra,
      });

    // Unknown menu → 403
    assert.equal((await patch("/rest/user/*1", { group: "full" })).status, 403);
    // No ID → 403
    assert.equal((await patch("/rest/interface", { disabled: "yes" })).status, 403);
    // Extra segment after ID → 403
    assert.equal((await patch("/rest/interface/*1/extra", { disabled: "yes" })).status, 403);
    // Write-only menu without update → 403
    assert.equal((await patch("/rest/interface/ethernet/*1", { disabled: "yes" })).status, 403);
    // Query string on write → 403
    assert.equal((await patch("/rest/interface/*1?disabled=no")).status, 403);
    // Unknown field → 400
    assert.equal((await patch("/rest/interface/*1", { disabled: "yes", name: "oops" })).status, 400);
    // ID field in body → 400
    assert.equal((await patch("/rest/interface/*1", { disabled: "yes", ".id": "*2" })).status, 400);
    // Object value → 400
    assert.equal((await patch("/rest/interface/*1", { disabled: {} })).status, 400);
    // Non-JSON content-type → 415
    assert.equal(
      (await patch("/rest/interface/*1", {}, { headers: { Cookie: cookie, "Content-Type": "text/plain" } })).status,
      415,
    );
    // Cross-site → 403
    assert.equal(
      (await patch("/rest/interface/*1", {}, { headers: { ...patchHeaders, Origin: "http://evil.test" } })).status,
      403,
    );
    assert.equal(writeCalls.length, 0, "no upstream calls for rejected writes");

    // Valid writes on different menus with raw * IDs
    for (const p of ["/rest/interface/*1", "/rest/ip/firewall/filter/*A", "/rest/interface/wireguard/peers/%2A2"]) {
      const res = await patch(p);
      assert.equal(res.status, 202, p);
      // Secret key stripped from response
      assert.equal(JSON.stringify(await res.json()).includes("hidden"), false);
    }
    assert.equal(writeCalls.length, 3);
    assert.equal(writeCalls[0].options.method, "PATCH");
    assert.deepEqual(JSON.parse(writeCalls[0].options.body), { disabled: "yes" });
    assert.equal(writeCalls[0].options.headers["Content-Type"], "application/json");
    assert.equal(
      writeCalls[0].options.headers.Authorization,
      `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}`,
    );
    assert.equal(writeCalls[0].target.pathname, "/rest/interface/*1");
  });
});

test("PUT creates a record; body is forwarded; query string is refused", async () => {
  const putCalls = [];
  await withServer({ ROUTEROS_HOST: "http://192.168.2.1" }, {
    request: makeRequest(async (target, options) => {
      putCalls.push({ target, options });
      return { status: 201, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify({ ".id": "*FF", chain: "input", action: "accept" })) };
    }),
  }, async (port) => {
    const cookie = await loginSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/filter`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "input", action: "accept" }),
    });
    assert.equal(res.status, 201);
    assert.equal(putCalls.length, 1);
    assert.equal(putCalls[0].options.method, "PUT");
    assert.deepEqual(JSON.parse(putCalls[0].options.body), { chain: "input", action: "accept" });
    assert.equal(putCalls[0].target.search, "");
  });
});

test("read-only account (no write policy) → 403 forbidden without upstream", async () => {
  const upstreamCalls = [];
  await withServer({ ROUTEROS_HOST: "http://192.168.2.1" }, {
    request: async (target, options) => {
      if (target.pathname === "/rest/system/identity") return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "r" }])) };
      if (target.pathname === "/rest/user") {
        const name = target.searchParams.get("name") ?? "";
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name, group: "readonly" }])) };
      }
      if (target.pathname === "/rest/user/group") {
        // read policy only, no write
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "readonly", policy: "read,api,rest-api" }])) };
      }
      upstreamCalls.push(target.href);
      return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("{}") };
    },
  }, async (port) => {
    const cookie = await loginSession(port);
    upstreamCalls.length = 0;

    const res = await fetch(`http://127.0.0.1:${port}/rest/interface/*1`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: "yes" }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "forbidden");
    assert.equal(upstreamCalls.length, 0, "upstream should not be called");
  });
});

test("reboot requires reboot policy; blocked without it", async () => {
  const upstreamCalls = [];
  await withServer({ ROUTEROS_HOST: "http://192.168.2.1" }, {
    request: async (target, options) => {
      if (target.pathname === "/rest/system/identity") return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "r" }])) };
      if (target.pathname === "/rest/user") {
        const name = target.searchParams.get("name") ?? "";
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name, group: "noreboot" }])) };
      }
      if (target.pathname === "/rest/user/group") {
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "noreboot", policy: "read,write,api,rest-api" }])) };
      }
      upstreamCalls.push(target.href);
      return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
    },
  }, async (port) => {
    const cookie = await loginSession(port);
    upstreamCalls.length = 0;

    const res = await fetch(`http://127.0.0.1:${port}/rest/system/reboot`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "forbidden");
    assert.equal(upstreamCalls.length, 0);
  });
});

test("router 500 not-enough-permissions → code forbidden", async () => {
  await withServer({ ROUTEROS_HOST: "http://192.168.2.1" }, {
    request: makeRequest(async () => ({
      status: 500,
      headers: { "content-type": "application/json" },
      body: Buffer.from(JSON.stringify({ detail: "not enough permissions (write)", message: "Internal Server Error" })),
    })),
  }, async (port) => {
    const cookie = await loginSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/rest/interface/*1`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: "yes" }),
    });
    assert.equal((await res.json()).code, "forbidden");
  });
});

test("router 204 → proxy returns 200 {}", async () => {
  await withServer({ ROUTEROS_HOST: "http://192.168.2.1" }, {
    request: makeRequest(async () => ({
      status: 204,
      headers: {},
      body: Buffer.from(""),
    })),
  }, async (port) => {
    const cookie = await loginSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/filter/*1`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {});
  });
});

// ─── Demo overlay tests ───────────────────────────────────────────────────────

test("demo overlay: create NAT rule then GET shows it", async () => {
  resetDemoState();
  try {
    await withServer({ DEMO_MODE: "true" }, {}, async (port) => {
      const cookie = await loginSession(port, { username: "demo", password: "demo" });
      const h = { Cookie: cookie };

      const created = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/nat`, {
        method: "PUT",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "dstnat", action: "dst-nat", "to-addresses": "192.168.2.100" }),
      });
      assert.equal(created.status, 201);
      const newRow = await created.json();
      assert.ok(newRow[".id"], "created row should have .id");

      const list = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/nat`, { headers: h });
      const natRules = await list.json();
      assert.ok(natRules.some((r) => r[".id"] === newRow[".id"]), "new rule should appear in GET");
    });
  } finally {
    resetDemoState();
  }
});

test("demo overlay: move reorders filter rules", async () => {
  resetDemoState();
  try {
    await withServer({ DEMO_MODE: "true" }, {}, async (port) => {
      const cookie = await loginSession(port, { username: "demo", password: "demo" });
      const h = { Cookie: cookie };

      const list1 = await (await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/filter`, { headers: h })).json();
      const firstId = list1[0][".id"];
      const thirdId = list1[2][".id"];
      const secondId = list1[1][".id"];

      const move = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/filter/move`, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ".id": firstId, destination: thirdId }),
      });
      assert.equal(move.status, 200);

      const list2 = await (await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/filter`, { headers: h })).json();
      // firstId removed from head, placed before thirdId: [secondId, firstId, thirdId, ...]
      assert.equal(list2[0][".id"], secondId);
      assert.equal(list2[1][".id"], firstId);
      assert.equal(list2[2][".id"], thirdId);
    });
  } finally {
    resetDemoState();
  }
});

test("demo overlay: PATCH interface disabled is reflected while counters keep changing", async () => {
  resetDemoState();
  try {
    await withServer({ DEMO_MODE: "true" }, {}, async (port) => {
      const cookie = await loginSession(port, { username: "demo", password: "demo" });
      const h = { Cookie: cookie };

      const patch = await fetch(`http://127.0.0.1:${port}/rest/interface/*1`, {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: "yes" }),
      });
      assert.equal(patch.status, 200);

      const list = await (await fetch(`http://127.0.0.1:${port}/rest/interface`, { headers: h })).json();
      const ether0 = list.find((i) => i[".id"] === "*1");
      assert.equal(ether0.disabled, "yes");
      // Counters are still live (non-zero from integrated bytes)
      assert.ok(Number(ether0["rx-byte"]) > 0, "rx-byte should still be live");
    });
  } finally {
    resetDemoState();
  }
});

test("demo overlay: DELETE removes a rule; resetDemoState isolates tests", async () => {
  resetDemoState();
  try {
    await withServer({ DEMO_MODE: "true" }, {}, async (port) => {
      const cookie = await loginSession(port, { username: "demo", password: "demo" });
      const h = { Cookie: cookie };

      // Add a rule first
      const created = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/nat`, {
        method: "PUT",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "dstnat", action: "dst-nat" }),
      });
      const { ".id": id } = await created.json();

      // Delete it
      const del = await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/nat/${id}`, {
        method: "DELETE",
        headers: h,
      });
      assert.equal(del.status, 204);

      const list = await (await fetch(`http://127.0.0.1:${port}/rest/ip/firewall/nat`, { headers: h })).json();
      assert.ok(!list.some((r) => r[".id"] === id), "deleted rule should not appear");
    });
  } finally {
    resetDemoState();
  }
});

// ─── WireGuard keypair ────────────────────────────────────────────────────────

test("/api/wireguard/keypair requires session; keys are 32 bytes; public matches private", async () => {
  await withServer({ ROUTEROS_HOST: "http://192.168.2.1" }, { request: makeRequest(null) }, async (port) => {
    // Without session → 401
    const noAuth = await fetch(`http://127.0.0.1:${port}/api/wireguard/keypair`, { method: "POST" });
    assert.equal(noAuth.status, 401);

    const cookie = await loginSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/wireguard/keypair`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    const { privateKey, publicKey } = await res.json();

    const privBytes = Buffer.from(privateKey, "base64");
    const pubBytes = Buffer.from(publicKey, "base64");
    assert.equal(privBytes.length, 32, "private key should be 32 bytes");
    assert.equal(pubBytes.length, 32, "public key should be 32 bytes");

    // Verify keypair consistency via Diffie-Hellman exchange:
    // DH(wireguardPriv, tempPub) must equal DH(tempPriv, wireguardPub)
    const privJwk = {
      kty: "OKP", crv: "X25519",
      d: privBytes.toString("base64url"),
      x: Buffer.from(publicKey, "base64").toString("base64url"),
    };
    const pubJwk = { kty: "OKP", crv: "X25519", x: Buffer.from(publicKey, "base64").toString("base64url") };
    const wireguardPrivKey = crypto.createPrivateKey({ key: privJwk, format: "jwk" });
    const wireguardPubKey = crypto.createPublicKey({ key: pubJwk, format: "jwk" });
    const { privateKey: tempPriv, publicKey: tempPub } = crypto.generateKeyPairSync("x25519");
    const shared1 = crypto.diffieHellman({ privateKey: wireguardPrivKey, publicKey: tempPub });
    const shared2 = crypto.diffieHellman({ privateKey: tempPriv, publicKey: wireguardPubKey });
    assert.deepEqual(shared1, shared2, "DH exchange must match: public key must correspond to private key");
  });
});
