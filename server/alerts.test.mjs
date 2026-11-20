import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { openDb } from "./db.mjs";
import { create, maskSecret, feishuSign, dingTalkSign, feishuPayload, dingTalkPayload } from "./features/alerts.mjs";

function makeApp(serviceImpl = async () => null) {
  const db = openDb(":memory:");
  const bus = new EventEmitter();
  let _svc = serviceImpl;
  return {
    db,
    bus,
    demo: false,
    env: {},
    service: async (m, p, b, o) => _svc(m, p, b, o),
    setSvc(fn) { _svc = fn; },
  };
}

// ── Pure helpers ──

test("maskSecret: hides all but last 4 chars", () => {
  assert.equal(maskSecret("abcdefgh"), "••••efgh");
  assert.equal(maskSecret("ab"), "••••");
  assert.equal(maskSecret(""), "");
  assert.equal(maskSecret(null), "");
  assert.equal(maskSecret("abcd"), "••••");
});

test("feishuSign: deterministic base64", () => {
  const s1 = feishuSign(1700000000, "mySecret");
  const s2 = feishuSign(1700000000, "mySecret");
  assert.equal(s1, s2);
  assert.match(s1, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(s1.length > 10);
  // Different timestamp → different sig
  const s3 = feishuSign(1700000001, "mySecret");
  assert.notEqual(s1, s3);
});

test("dingTalkSign: deterministic base64", () => {
  const s1 = dingTalkSign(1700000000, "mySecret");
  const s2 = dingTalkSign(1700000000, "mySecret");
  assert.equal(s1, s2);
  assert.match(s1, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(s1.length > 10);
  assert.notEqual(dingTalkSign(1700000001, "mySecret"), s1);
});

test("feishuPayload: includes sign+timestamp when signSecret set", () => {
  const ch = { type: "feishu", webhook: "https://open.feishu.cn/xxx", signSecret: "s3cr3t" };
  const [url, body] = feishuPayload(ch, "Title", "body");
  assert.equal(url, "https://open.feishu.cn/xxx");
  assert.equal(body.msg_type, "text");
  assert.ok(body.sign, "sign field should be present");
  assert.ok(body.timestamp, "timestamp field should be present");
  assert.match(String(body.sign), /^[A-Za-z0-9+/]+=*$/);
});

test("feishuPayload: no sign when signSecret absent", () => {
  const ch = { type: "feishu", webhook: "https://open.feishu.cn/yyy", signSecret: "" };
  const [, body] = feishuPayload(ch, "T", "B");
  assert.ok(!body.sign, "sign should be absent");
});

test("dingTalkPayload: appends timestamp+sign to URL when signSecret set", () => {
  const ch = {
    type: "dingtalk",
    webhook: "https://oapi.dingtalk.com/robot/send?access_token=tok",
    signSecret: "s3cr3t",
  };
  const [url, body] = dingTalkPayload(ch, "T", "B");
  assert.ok(url.includes("timestamp="), "URL should include timestamp");
  assert.ok(url.includes("sign="), "URL should include sign");
  assert.equal(body.msgtype, "text");
});

test("dingTalkPayload: no extra params when signSecret absent", () => {
  const ch = { type: "dingtalk", webhook: "https://oapi.dingtalk.com/robot/send?access_token=tok", signSecret: "" };
  const [url] = dingTalkPayload(ch, "T", "B");
  assert.ok(!url.includes("timestamp="));
});

// ── Stateful: rule de-dup / resolve ──

test("WAN down: single event even on repeated evaluations", async () => {
  const app = makeApp(async (method, path) => {
    if (method === "GET" && path === "/rest/interface") {
      return [{ ".id": "*1", name: "liantong", type: "pppoe-out", running: "false", disabled: "false", comment: "" }];
    }
    return null;
  });
  const feat = create(app);
  feat.start();

  await feat._eval();
  await feat._eval();
  const { cnt } = app.db.raw.prepare("SELECT COUNT(*) as cnt FROM events WHERE kind='wan'").get();
  assert.equal(cnt, 1);

  feat.stop();
});

test("WAN event resolves when link comes back up", async () => {
  let wanDown = true;
  const app = makeApp(async (method, path) => {
    if (method === "GET" && path === "/rest/interface") {
      return [{ ".id": "*1", name: "liantong", type: "pppoe-out", running: wanDown ? "false" : "true", disabled: "false", comment: "" }];
    }
    return null;
  });
  const feat = create(app);
  feat.start();

  await feat._eval();
  const before = app.db.raw.prepare("SELECT resolved_t FROM events WHERE kind='wan' ORDER BY id DESC LIMIT 1").get();
  assert.equal(before?.resolved_t, null, "event should be open initially");

  wanDown = false;
  await feat._eval();
  const after = app.db.raw.prepare("SELECT resolved_t FROM events WHERE kind='wan' ORDER BY id DESC LIMIT 1").get();
  assert.ok(after?.resolved_t != null, "event should have been resolved");

  feat.stop();
});

// ── New device detection ──

test("new device: first run seeds table, no events; same run again = no events; new MAC = 1 event", async () => {
  const devices = [
    { "mac-address": "aa:bb:cc:dd:ee:ff", "active-mac-address": "aa:bb:cc:dd:ee:ff", "active-address": "192.168.1.1", "host-name": "PC1", status: "bound" },
  ];
  const app = makeApp(async (method, path) => {
    if (method === "GET" && path === "/rest/ip/dhcp-server/lease") return [...devices];
    if (method === "GET" && path === "/rest/ip/arp") return [];
    return null;
  });
  const feat = create(app);
  feat.start();

  // First run: seeds table, no events
  await feat._eval();
  const c1 = app.db.raw.prepare("SELECT COUNT(*) as cnt FROM events WHERE kind='new_device'").get();
  assert.equal(c1.cnt, 0, "first run: no new_device events");

  // Same devices: still no events
  await feat._eval();
  const c2 = app.db.raw.prepare("SELECT COUNT(*) as cnt FROM events WHERE kind='new_device'").get();
  assert.equal(c2.cnt, 0, "repeated run: no new_device events");

  // New device appears
  devices.push({ "mac-address": "11:22:33:44:55:66", "active-mac-address": "11:22:33:44:55:66", "active-address": "192.168.1.2", "host-name": "NewPhone", status: "bound" });
  await feat._eval();
  const c3 = app.db.raw.prepare("SELECT COUNT(*) as cnt FROM events WHERE kind='new_device'").get();
  assert.equal(c3.cnt, 1, "new device should trigger exactly one event");

  // Same new device: no duplicate
  await feat._eval();
  const c4 = app.db.raw.prepare("SELECT COUNT(*) as cnt FROM events WHERE kind='new_device'").get();
  assert.equal(c4.cnt, 1, "no duplicate for same device");

  feat.stop();
});

// ── Secret masking in settings GET ──

test("secrets masked in GET /api/alerts/settings response", async () => {
  const app = makeApp();
  app.db.setSetting("alerts.channels", [
    {
      type: "feishu",
      name: "飞书",
      enabled: true,
      webhook: "https://open.feishu.cn/xxx",
      signSecret: "super-secret-key",
    },
    {
      type: "telegram",
      name: "TG",
      enabled: true,
      botToken: "1234567890:ABCDEFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      chatId: "-100123456",
    },
  ]);

  const feat = create(app);
  feat.start();

  // Simulate the GET settings handler
  const channels = app.db.setting("alerts.channels", []);
  const masked = channels.map((ch) => ({
    ...ch,
    signSecret: ch.signSecret ? maskSecret(ch.signSecret) : "",
    botToken: ch.botToken ? maskSecret(ch.botToken) : "",
  }));

  assert.ok(!masked[0].signSecret.includes("super-secret-key"), "signSecret must not appear in full");
  assert.match(masked[0].signSecret, /^••••/, "signSecret starts with ••••");
  assert.ok(!masked[1].botToken.includes("ABCDEF"), "botToken must not appear in full");
  assert.match(masked[1].botToken, /^••••/, "botToken starts with ••••");

  feat.stop();
});

// ── Channel payload content ──

test("feishu payload body content includes title and severity", () => {
  const ch = { type: "feishu", webhook: "https://example.com", signSecret: "" };
  const [, body] = feishuPayload(ch, "高 CPU", "CPU 95%，已持续 10 分钟");
  assert.ok(body.content.text.includes("高 CPU"), "title in body");
  assert.ok(body.content.text.includes("CPU 95%"), "detail in body");
});

test("dingtalk payload body content includes title", () => {
  const ch = { type: "dingtalk", webhook: "https://example.com", signSecret: "" };
  const [, body] = dingTalkPayload(ch, "WAN 断线", "接口 liantong 未运行");
  assert.ok(body.text.content.includes("WAN 断线"), "title in body");
});
