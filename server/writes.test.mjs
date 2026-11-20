import assert from "node:assert/strict";
import test from "node:test";
import { validateWrite } from "./writes.mjs";

test("move requires .id field", () => {
  const r = validateWrite("POST", "/rest/ip/firewall/filter/move", { destination: "*2" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_body");
});

test("move with valid .id succeeds", () => {
  const r = validateWrite("POST", "/rest/ip/firewall/filter/move", { ".id": "*1", destination: "*2" });
  assert.equal(r.ok, true);
  assert.equal(r.policy, "write");
});

test("place-before must be a record id", () => {
  const r = validateWrite("PUT", "/rest/ip/firewall/filter", { chain: "input", action: "accept", "place-before": "not-an-id" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("place-before as valid id succeeds", () => {
  const r = validateWrite("PUT", "/rest/ip/firewall/filter", { chain: "input", action: "accept", "place-before": "*3" });
  assert.equal(r.ok, true);
});

test("place-before empty string is allowed (append)", () => {
  const r = validateWrite("PUT", "/rest/ip/firewall/filter", { chain: "input", action: "accept", "place-before": "" });
  assert.equal(r.ok, true);
});

test("empty PATCH body is refused", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", {});
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_body");
});

test("control character \\x01 in value is refused", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", { comment: "bad\x01value" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("newline \\x0a in value is refused", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", { comment: "bad\nvalue" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("DEL \\x7f in value is refused", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", { comment: "bad\x7fvalue" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("tab \\x09 in value is allowed", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", { comment: "tab\there" });
  assert.equal(r.ok, true);
});

test("object value is refused", () => {
  const r = validateWrite("PATCH", "/rest/interface/*1", { disabled: { nested: true } });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("unknown field is refused", () => {
  const r = validateWrite("PATCH", "/rest/interface/*1", { unknown: "field" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_field");
});

test("unknown menu is refused", () => {
  const r = validateWrite("PATCH", "/rest/user/*1", { group: "full" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "forbidden_path");
});

test("bad id format in path is refused", () => {
  const r = validateWrite("PATCH", "/rest/interface/not-an-id", { disabled: "yes" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "forbidden_path");
});

test("DELETE allowed for menu with remove:true", () => {
  const r = validateWrite("DELETE", "/rest/ip/firewall/filter/*1", null);
  assert.equal(r.ok, true);
  assert.equal(r.policy, "write");
  assert.equal(r.body, undefined);
});

test("DELETE refused for menu without remove", () => {
  const r = validateWrite("DELETE", "/rest/interface/*1", null);
  assert.equal(r.ok, false);
  assert.equal(r.code, "forbidden_path");
});

test("reboot POST requires reboot policy", () => {
  const r = validateWrite("POST", "/rest/system/reboot", {});
  assert.equal(r.ok, true);
  assert.equal(r.policy, "reboot");
});

test("identity set uses write policy", () => {
  const r = validateWrite("POST", "/rest/system/identity/set", { name: "my-router" });
  assert.equal(r.ok, true);
  assert.equal(r.policy, "write");
});

test("dotted key security.passphrase allowed for wifi", () => {
  const r = validateWrite("PATCH", "/rest/interface/wifi/*1", { "security.passphrase": "mypass" });
  assert.equal(r.ok, true);
});

test("wpa2-pre-shared-key allowed for wireless security-profiles", () => {
  const r = validateWrite("PATCH", "/rest/interface/wireless/security-profiles/*1", { "wpa2-pre-shared-key": "secret" });
  assert.equal(r.ok, true);
});

test(".id field in move body must be a valid id", () => {
  const r = validateWrite("POST", "/rest/ip/firewall/filter/move", { ".id": "not-an-id", destination: "*2" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("destination field in move must be a valid id or empty", () => {
  const r = validateWrite("POST", "/rest/ip/firewall/filter/move", { ".id": "*1", destination: "not-an-id" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("destination empty string (move to end) is allowed", () => {
  const r = validateWrite("POST", "/rest/ip/firewall/filter/move", { ".id": "*1", destination: "" });
  assert.equal(r.ok, true);
});

test("PUT to menu with no create list is refused", () => {
  const r = validateWrite("PUT", "/rest/interface", { disabled: "yes" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "forbidden_path");
});

test("value exceeding MAX_VALUE is refused", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", { comment: "x".repeat(4097) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "bad_value");
});

test("null body value coerces to empty string", () => {
  const r = validateWrite("PATCH", "/rest/ip/firewall/filter/*1", { comment: null });
  assert.equal(r.ok, true);
  const parsed = JSON.parse(r.body);
  assert.equal(parsed.comment, "");
});

test("non-object body is refused", () => {
  assert.equal(validateWrite("PATCH", "/rest/ip/firewall/filter/*1", []).ok, false);
  assert.equal(validateWrite("PATCH", "/rest/ip/firewall/filter/*1", null).ok, false);
  assert.equal(validateWrite("PATCH", "/rest/ip/firewall/filter/*1", "string").ok, false);
});
