import assert from "node:assert/strict";
import test from "node:test";
import { validateWrite } from "./writes.mjs";
import { create } from "./features/system.mjs";

const menus = create().writes;

test("scheduler on-event allows newlines (multiline)", () => {
  const result = validateWrite("PUT", "/rest/system/scheduler", { name: "t", "on-event": "line1\nline2" }, menus);
  assert.ok(result.ok, result.message);
});

test("scheduler name refuses newlines", () => {
  const result = validateWrite("PUT", "/rest/system/scheduler", { name: "bad\nname", "on-event": "ok" }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "bad_value");
});

test("script source allows newlines (multiline)", () => {
  const result = validateWrite("PUT", "/rest/system/script", { name: "s", source: "line1\nline2\nline3" }, menus);
  assert.ok(result.ok, result.message);
});

test("script comment refuses newlines", () => {
  const result = validateWrite("PUT", "/rest/system/script", { name: "s", source: "ok", comment: "line1\nline2" }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "bad_value");
});

test("script run is not in writes allowlist (handled by /api route)", () => {
  const result = validateWrite("POST", "/rest/system/script/run", { ".id": "*1A" }, menus);
  assert.ok(!result.ok, "run should not be in the write allowlist");
});

test("clock set time-zone-name allowed", () => {
  const result = validateWrite("POST", "/rest/system/clock/set", { "time-zone-name": "Asia/Shanghai" }, menus);
  assert.ok(result.ok, result.message);
});

test("clock set refuses unknown field", () => {
  const result = validateWrite("POST", "/rest/system/clock/set", { date: "jan/01/2026" }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "bad_field");
});

test("ntp client set servers allowed", () => {
  const result = validateWrite("POST", "/rest/system/ntp/client/set", { servers: "pool.ntp.org" }, menus);
  assert.ok(result.ok, result.message);
});

test("ntp client set primary-ntp allowed", () => {
  const result = validateWrite("POST", "/rest/system/ntp/client/set", { "primary-ntp": "1.1.1.1" }, menus);
  assert.ok(result.ok, result.message);
});

test("service update port and address allowed", () => {
  const result = validateWrite("PATCH", "/rest/ip/service/*1", { port: "80", address: "" }, menus);
  assert.ok(result.ok, result.message);
});

test("service update refuses unknown field", () => {
  const result = validateWrite("PATCH", "/rest/ip/service/*1", { name: "telnet" }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "bad_field");
});

test("service create is not allowed (no create entry)", () => {
  const result = validateWrite("PUT", "/rest/ip/service", { name: "ssh", port: "22" }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "forbidden_path");
});

test("script source respects maxValue 65536", () => {
  const result = validateWrite("PUT", "/rest/system/script", { name: "s", source: "x".repeat(65537) }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "bad_value");
});

test("script source at maxValue 65536 is accepted", () => {
  const result = validateWrite("PUT", "/rest/system/script", { name: "s", source: "x".repeat(65536) }, menus);
  assert.ok(result.ok, result.message);
});

test("scheduler on-event respects maxValue 65536", () => {
  const result = validateWrite("PUT", "/rest/system/scheduler", { name: "t", "on-event": "x".repeat(65537) }, menus);
  assert.ok(!result.ok);
  assert.equal(result.code, "bad_value");
});
