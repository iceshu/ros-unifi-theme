import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db.mjs";
import { buildPolicyString, csvEscape, parsePolicyString, create, redactCommand } from "./features/admin.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeApp(extraDb) {
  const db = openDb(":memory:");
  if (extraDb) extraDb(db);
  return { env: {}, demo: true, db, sessions: null, bus: null };
}

function makeCtx(app, overrides = {}) {
  const auditLog = [];
  return {
    body: {},
    url: new URL("http://localhost/"),
    session: { user: "testuser", policies: ["write"], policiesKnown: true },
    demo: true,
    env: {},
    db: app.db,
    ip: "127.0.0.1",
    res: {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(body) { this._body = body; },
      _body: null,
      statusCode: 0,
    },
    _sent: null,
    send(status, payload) { this._sent = { status, payload }; },
    audit(entry) { auditLog.push(entry); },
    _auditLog: auditLog,
    router: async () => ({ ret: "demo-output" }),
    ...overrides,
  };
}

// ── Terminal input validation ────────────────────────────────────────────────

describe("terminal route", () => {
  it("rejects empty command", async () => {
    const app = makeApp();
    const feature = create(app);
    const route = feature.routes.find((r) => r.path === "/api/terminal");
    const ctx = makeCtx(app, { body: { command: "" } });
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 400);
    assert.equal(ctx._sent.payload.code, "bad_input");
  });

  it("rejects command over 4096 chars", async () => {
    const app = makeApp();
    const feature = create(app);
    const route = feature.routes.find((r) => r.path === "/api/terminal");
    const ctx = makeCtx(app, { body: { command: "a".repeat(4097) } });
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 400);
    assert.equal(ctx._sent.payload.code, "too_long");
  });

  it("accepts valid command and audits it in demo mode", async () => {
    const app = makeApp();
    const feature = create(app);
    const route = feature.routes.find((r) => r.path === "/api/terminal");
    const ctx = makeCtx(app, { body: { command: "/system resource print" } });
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.ok(typeof ctx._sent.payload.output === "string");
    assert.equal(ctx._auditLog.length, 1);
    assert.equal(ctx._auditLog[0].action, "POST");
    assert.equal(ctx._auditLog[0].target, "/rest/execute");
    assert.equal(ctx._auditLog[0].detail, "/system resource print");
  });

  it("truncates long command in audit detail to 500 chars", async () => {
    const app = makeApp();
    const feature = create(app);
    const route = feature.routes.find((r) => r.path === "/api/terminal");
    const longCmd = "a".repeat(4096);
    const ctx = makeCtx(app, { body: { command: longCmd } });
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.equal(ctx._auditLog[0].detail.length, 500);
  });

  it("does not log output", async () => {
    const app = makeApp();
    const feature = create(app);
    const route = feature.routes.find((r) => r.path === "/api/terminal");
    const ctx = makeCtx(app, { body: { command: ":put hello-secret" } });
    await route.handle(ctx);
    assert.ok(!ctx._auditLog[0].detail.includes("hello-secret") || ctx._auditLog[0].detail === ":put hello-secret");
    // detail is the command text only, not the output
    assert.equal(ctx._auditLog[0].detail, ":put hello-secret");
  });
});

// ── Audit query filters ──────────────────────────────────────────────────────

describe("audit GET route", () => {
  let app;
  let feature;

  before(() => {
    app = makeApp((db) => {
      const now = Date.now();
      db.audit({ t: now - 3000, user: "alice", ip: "1.1.1.1", action: "login", target: "", status: 200, outcome: "ok", detail: "" });
      db.audit({ t: now - 2000, user: "bob", ip: "2.2.2.2", action: "PUT", target: "/rest/ip/address", status: 201, outcome: "ok", detail: "" });
      db.audit({ t: now - 1000, user: "alice", ip: "1.1.1.1", action: "DELETE", target: "/rest/ip/address", status: 204, outcome: "ok", detail: "" });
      db.audit({ t: now, user: "alice", ip: "1.1.1.1", action: "POST", target: "/rest/execute", status: 400, outcome: "error", detail: "/ip address print" });
    });
    feature = create(app);
  });

  function mkCtx(search) {
    const ctx = makeCtx(app);
    ctx.url = new URL(`http://localhost/api/audit?${search}`);
    return ctx;
  }

  it("returns all rows with default limit", async () => {
    const route = feature.routes.find((r) => r.path === "/api/audit");
    const ctx = mkCtx("");
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.ok(Array.isArray(ctx._sent.payload));
    assert.ok(ctx._sent.payload.length >= 4);
  });

  it("filters by user", async () => {
    const route = feature.routes.find((r) => r.path === "/api/audit");
    const ctx = mkCtx("user=bob");
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.ok(ctx._sent.payload.every((row) => row.user === "bob"));
  });

  it("filters by outcome", async () => {
    const route = feature.routes.find((r) => r.path === "/api/audit");
    const ctx = mkCtx("outcome=error");
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.ok(ctx._sent.payload.every((row) => row.outcome === "error"));
  });

  it("full-text search with q", async () => {
    const route = feature.routes.find((r) => r.path === "/api/audit");
    const ctx = mkCtx("q=ip+address");
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.ok(ctx._sent.payload.length >= 1);
  });

  it("respects limit", async () => {
    const route = feature.routes.find((r) => r.path === "/api/audit");
    const ctx = mkCtx("limit=2");
    await route.handle(ctx);
    assert.equal(ctx._sent.status, 200);
    assert.ok(ctx._sent.payload.length <= 2);
  });
});

// ── CSV escaping ─────────────────────────────────────────────────────────────

describe("csvEscape", () => {
  it("passes plain text through", () => {
    assert.equal(csvEscape("hello"), "hello");
  });

  it("wraps values containing commas", () => {
    assert.equal(csvEscape("a,b"), '"a,b"');
  });

  it("escapes embedded quotes", () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  });

  it("neutralizes values a spreadsheet would run as a formula", () => {
    assert.equal(csvEscape("=1+1"), "'=1+1");
    assert.equal(csvEscape("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvEscape("-2+3,4"), `"'-2+3,4"`);
  });

  it("hides secret values in audited terminal commands", () => {
    assert.equal(
      redactCommand('/user add name=bob password="a b" group=full; /interface wifi security set 0 passphrase=abc wpa2-pre-shared-key=zz'),
      "/user add name=bob password=*** group=full; /interface wifi security set 0 passphrase=*** wpa2-pre-shared-key=***",
    );
  });

  it("wraps values containing newlines", () => {
    assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
  });

  it("handles Chinese text without quoting", () => {
    assert.equal(csvEscape("管理员"), "管理员");
  });
});

// ── Group policy string building ─────────────────────────────────────────────

describe("buildPolicyString", () => {
  const ALL = ["read", "write", "policy", "reboot"];

  it("enables listed policies and disables the rest", () => {
    const result = buildPolicyString(["read", "write"], ALL);
    assert.equal(result, "read,write,!policy,!reboot");
  });

  it("all disabled when empty array given", () => {
    const result = buildPolicyString([], ALL);
    assert.equal(result, "!read,!write,!policy,!reboot");
  });

  it("all enabled when all policies given", () => {
    const result = buildPolicyString(["read", "write", "policy", "reboot"], ALL);
    assert.equal(result, "read,write,policy,reboot");
  });
});

describe("parsePolicyString", () => {
  it("parses enabled policies from RouterOS string", () => {
    const enabled = parsePolicyString("read,write,!policy,!reboot");
    assert.ok(enabled.has("read"));
    assert.ok(enabled.has("write"));
    assert.ok(!enabled.has("policy"));
    assert.ok(!enabled.has("reboot"));
  });

  it("returns empty set for empty string", () => {
    assert.equal(parsePolicyString("").size, 0);
  });
});
