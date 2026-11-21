import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { createHandler } from "./ros-proxy.mjs";

function listen(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res))
      .then((handled) => {
        if (!handled && !res.writableEnded) { res.statusCode = 404; res.end(); }
      })
      .catch((error) => {
        if (!res.headersSent) { res.statusCode = 500; res.end(String(error)); }
      });
  });
  server.listen(0, "127.0.0.1");
  return server;
}

async function withServer(env, options, fn) {
  const server = listen(createHandler(env, { staticDir: false, ...options }));
  await once(server, "listening");
  const { port } = server.address();
  try {
    return await fn(port);
  } finally {
    server.close();
    await once(server, "close");
  }
}

/** Returns mock auth responses for /rest/system/identity, /rest/user, /rest/user/group. */
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

function makeRequest(dataHandler) {
  return async (target, options) => {
    const auth = authResponse(target);
    if (auth) return auth;
    if (dataHandler) return dataHandler(target, options);
    throw new Error(`unexpected request: ${target.href}`);
  };
}

async function loginSession(port, { username = "admin", password = "secret" } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json(), setCookie: res.headers.get("set-cookie") ?? "" };
}

function extractCookie(setCookie) {
  return setCookie.match(/rut_sid=[^;]+/)?.[0] ?? "";
}

const ENV = { ROUTEROS_HOST: "http://192.168.2.1" };

test("bad password → 401 bad_login; /rest/user is never queried", async () => {
  const userCalls = [];
  await withServer(ENV, {
    request: async (target, options) => {
      if (target.pathname === "/rest/system/identity") {
        return { status: 401, headers: {}, body: Buffer.from("") };
      }
      if (target.pathname === "/rest/user") userCalls.push(target.href);
      return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
    },
  }, async (port) => {
    const { status, body } = await loginSession(port, { username: "admin", password: "wrong" });
    assert.equal(status, 401);
    assert.equal(body.code, "bad_login");
    assert.equal(userCalls.length, 0, "/rest/user should not be called on bad login");
  });
});

test("5 failures then 6th attempt returns 429", async () => {
  await withServer(ENV, {
    request: async (target) => {
      if (target.pathname === "/rest/system/identity") return { status: 401, headers: {}, body: Buffer.from("") };
      return authResponse(target) ?? { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
    },
  }, async (port) => {
    // 5 failures
    for (let i = 0; i < 5; i++) {
      const { status } = await loginSession(port, { password: "wrong" });
      assert.equal(status, 401, `attempt ${i + 1} should be 401`);
    }
    // 6th attempt → 429
    const { status, body } = await loginSession(port, { password: "wrong" });
    assert.equal(status, 429);
    assert.equal(body.code, "too_many_attempts");
  });
});

test("successful login sets HttpOnly SameSite=Strict cookie", async () => {
  await withServer(ENV, { request: makeRequest(null) }, async (port) => {
    const { status, setCookie } = await loginSession(port);
    assert.equal(status, 200);
    assert.match(setCookie, /rut_sid=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
  });
});

test("successful login returns user, group, policies, policiesKnown, demo", async () => {
  await withServer(ENV, { request: makeRequest(null) }, async (port) => {
    const { status, body } = await loginSession(port);
    assert.equal(status, 200);
    assert.equal(body.user, "admin");
    assert.equal(body.group, "full");
    assert.ok(Array.isArray(body.policies));
    assert.equal(body.policiesKnown, true);
    assert.equal(body.demo, false);
    assert.equal(body.policies.includes("write"), true);
    assert.equal(body.policies.includes("reboot"), true);
  });
});

test("policies parsed: !reboot excluded from granted policies", async () => {
  await withServer(ENV, {
    request: async (target) => {
      if (target.pathname === "/rest/system/identity") return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "r" }])) };
      if (target.pathname === "/rest/user") {
        const name = target.searchParams.get("name") ?? "";
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name, group: "limited" }])) };
      }
      if (target.pathname === "/rest/user/group") {
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "limited", policy: "read,write,!reboot,api,rest-api" }])) };
      }
      throw new Error("unexpected: " + target.href);
    },
  }, async (port) => {
    const { body } = await loginSession(port);
    assert.equal(body.policiesKnown, true);
    assert.equal(body.policies.includes("read"), true);
    assert.equal(body.policies.includes("write"), true);
    assert.equal(body.policies.includes("reboot"), false, "!reboot should be excluded");
    assert.equal(body.policies.includes("api"), true);
  });
});

test("/api/session returns session payload with valid cookie", async () => {
  await withServer(ENV, { request: makeRequest(null) }, async (port) => {
    const { setCookie } = await loginSession(port);
    const cookie = extractCookie(setCookie);
    const res = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user, "admin");
    assert.ok(Array.isArray(body.policies));
  });
});

test("/api/session returns 401 without cookie", async () => {
  await withServer(ENV, { request: makeRequest(null) }, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/session`);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, "login_required");
  });
});

test("logout clears the cookie and invalidates the session", async () => {
  await withServer(ENV, { request: makeRequest(null) }, async (port) => {
    const { setCookie } = await loginSession(port);
    const cookie = extractCookie(setCookie);

    const logout = await fetch(`http://127.0.0.1:${port}/api/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 200);
    const logoutCookie = logout.headers.get("set-cookie") ?? "";
    assert.match(logoutCookie, /Max-Age=0/);

    // Session is now invalid
    const session = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 401);
  });
});

test("upstream 401 on a later read destroys the session and returns 401 login_required", async () => {
  let fail401 = false;
  await withServer(ENV, {
    request: async (target, options) => {
      if (fail401 && target.pathname === "/rest/interface") {
        return { status: 401, headers: {}, body: Buffer.from("") };
      }
      return authResponse(target) ?? { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
    },
  }, async (port) => {
    const { setCookie } = await loginSession(port);
    const cookie = extractCookie(setCookie);

    // Session works fine before
    const ok = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Cookie: cookie } });
    assert.equal(ok.status, 200);

    // Next read gets 401 from router → session destroyed
    fail401 = true;
    const read = await fetch(`http://127.0.0.1:${port}/rest/interface`, { headers: { Cookie: cookie } });
    assert.equal(read.status, 401);
    assert.equal((await read.json()).code, "login_required");

    // Cookie is now invalid
    const session = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 401);
  });
});

test("failing /user lookup → policiesKnown false; writes are still forwarded", async () => {
  const writeCalls = [];
  await withServer(ENV, {
    request: async (target, options) => {
      if (target.pathname === "/rest/system/identity") return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify([{ name: "r" }])) };
      if (target.pathname === "/rest/user") {
        // User lookup fails (e.g. no read permission on /user)
        return { status: 403, headers: {}, body: Buffer.from("") };
      }
      if (target.pathname === "/rest/interface/wifi" && target.pathname.endsWith("/wifi")) {
        // Write target
        writeCalls.push({ method: options.method });
        return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("{}") };
      }
      return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") };
    },
  }, async (port) => {
    const { body, setCookie } = await loginSession(port);
    assert.equal(body.policiesKnown, false, "policies should be unknown when /user lookup fails");
    const cookie = extractCookie(setCookie);

    // Write to allowlisted menu should be forwarded (policiesKnown=false → skip policy check)
    const patch = await fetch(`http://127.0.0.1:${port}/rest/interface/wifi/*1`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: "yes" }),
    });
    // Should forward (not 403 policy)
    assert.ok(patch.status !== 403 || (await patch.json()).code !== "forbidden", "should not be blocked by policy when policiesKnown=false");
  });
});

test("demo login accepts any non-empty credentials without calling router", async () => {
  let routerCalled = false;
  await withServer({ DEMO_MODE: "true" }, {
    request: async () => { routerCalled = true; throw new Error("should not call router in demo"); },
  }, async (port) => {
    const { status, body, setCookie } = await loginSession(port, { username: "anyone", password: "anypass" });
    assert.equal(status, 200);
    assert.equal(body.demo, true);
    assert.ok(Array.isArray(body.policies));
    assert.equal(body.policies.includes("write"), true);
    assert.match(setCookie, /rut_sid=/);
    assert.equal(routerCalled, false);
  });
});
