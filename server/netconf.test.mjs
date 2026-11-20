import assert from "node:assert/strict";
import test from "node:test";
import { validateWrite } from "./writes.mjs";
import { create } from "./features/netconf.mjs";

const { writes: NETCONF_MENUS } = create();

function ok(method, path, body) {
  const result = validateWrite(method, path, body, NETCONF_MENUS);
  assert.ok(result.ok, `expected ok for ${method} ${path}: ${result.message ?? ""}`);
  return result;
}

function fail(method, path, body, expectedCode) {
  const result = validateWrite(method, path, body, NETCONF_MENUS);
  assert.ok(!result.ok, `expected failure for ${method} ${path}`);
  if (expectedCode) assert.equal(result.code, expectedCode);
  return result;
}

// ─── IP address ───────────────────────────────────────────────────────────────

test("ip/address: create with valid fields", () => {
  ok("PUT", "/rest/ip/address", { address: "192.168.1.1/24", interface: "bridge1" });
});

test("ip/address: create rejects unknown field", () => {
  fail("PUT", "/rest/ip/address", { address: "192.168.1.1/24", interface: "bridge1", "broadcast": "192.168.1.255" }, "bad_field");
});

test("ip/address: update accepted fields", () => {
  ok("PATCH", "/rest/ip/address/*1", { comment: "test", disabled: "true" });
});

test("ip/address: delete allowed", () => {
  ok("DELETE", "/rest/ip/address/*1", undefined);
});

// ─── Static route ─────────────────────────────────────────────────────────────

test("ip/route: create static route", () => {
  ok("PUT", "/rest/ip/route", { "dst-address": "10.0.0.0/8", gateway: "192.168.1.1", distance: "10" });
});

test("ip/route: create rejects unknown field", () => {
  fail("PUT", "/rest/ip/route", { "dst-address": "0.0.0.0/0", gateway: "pppoe1", scope: "30" }, "bad_field");
});

test("ip/route: update with routing-table", () => {
  ok("PATCH", "/rest/ip/route/*5", { "routing-table": "main", comment: "备用" });
});

test("ip/route: delete allowed", () => {
  ok("DELETE", "/rest/ip/route/*5", undefined);
});

// ─── VLAN ─────────────────────────────────────────────────────────────────────

test("interface/vlan: create with required fields", () => {
  ok("PUT", "/rest/interface/vlan", { name: "vlan-guest", "vlan-id": "30", interface: "bridge1" });
});

test("interface/vlan: create rejects arp field", () => {
  fail("PUT", "/rest/interface/vlan", { name: "vlan-guest", "vlan-id": "30", interface: "bridge1", arp: "enabled" }, "bad_field");
});

test("interface/vlan: update mtu and comment", () => {
  ok("PATCH", "/rest/interface/vlan/*1", { mtu: "1500", comment: "Guest" });
});

test("interface/vlan: delete allowed", () => {
  ok("DELETE", "/rest/interface/vlan/*1", undefined);
});

// ─── Bridge ───────────────────────────────────────────────────────────────────

test("interface/bridge: create with name and protocol-mode", () => {
  ok("PUT", "/rest/interface/bridge", { name: "bridge2", "protocol-mode": "rstp" });
});

test("interface/bridge: create rejects vlan-filtering", () => {
  fail("PUT", "/rest/interface/bridge", { name: "br2", "vlan-filtering": "true" }, "bad_field");
});

test("interface/bridge: update comment and disabled", () => {
  ok("PATCH", "/rest/interface/bridge/*A", { comment: "test", disabled: "false" });
});

test("interface/bridge: delete allowed", () => {
  ok("DELETE", "/rest/interface/bridge/*A", undefined);
});

// ─── Bridge port ──────────────────────────────────────────────────────────────

test("interface/bridge/port: create with required fields", () => {
  ok("PUT", "/rest/interface/bridge/port", { bridge: "bridge1", interface: "ether1", pvid: "1" });
});

test("interface/bridge/port: create rejects horizon", () => {
  fail("PUT", "/rest/interface/bridge/port", { bridge: "bridge1", interface: "ether1", horizon: "1" }, "bad_field");
});

test("interface/bridge/port: delete allowed", () => {
  ok("DELETE", "/rest/interface/bridge/port/*1", undefined);
});

// ─── Interface list ───────────────────────────────────────────────────────────

test("interface/list: create custom list", () => {
  ok("PUT", "/rest/interface/list", { name: "MGMT", comment: "Management" });
});

test("interface/list: create rejects extra field", () => {
  fail("PUT", "/rest/interface/list", { name: "MGMT", dynamic: "false" }, "bad_field");
});

test("interface/list: delete allowed", () => {
  ok("DELETE", "/rest/interface/list/*3", undefined);
});

// ─── List member ──────────────────────────────────────────────────────────────

test("interface/list/member: create member", () => {
  ok("PUT", "/rest/interface/list/member", { list: "LAN", interface: "ether3", disabled: "false" });
});

test("interface/list/member: create rejects type field", () => {
  fail("PUT", "/rest/interface/list/member", { list: "LAN", interface: "ether3", type: "default" }, "bad_field");
});

test("interface/list/member: delete allowed", () => {
  ok("DELETE", "/rest/interface/list/member/*1", undefined);
});

// ─── PPPoE client ─────────────────────────────────────────────────────────────

test("interface/pppoe-client: create with user/password", () => {
  ok("PUT", "/rest/interface/pppoe-client", { name: "pppoe-wan", interface: "ether0", user: "user@isp", password: "secret" });
});

test("interface/pppoe-client: create rejects dial-on-demand", () => {
  fail("PUT", "/rest/interface/pppoe-client", { name: "pppoe-wan", interface: "ether0", user: "u", "dial-on-demand": "true" }, "bad_field");
});

test("interface/pppoe-client: update user and add-default-route", () => {
  ok("PATCH", "/rest/interface/pppoe-client/*1", { user: "newuser", "add-default-route": "true", "use-peer-dns": "false" });
});

test("interface/pppoe-client: update password accepted", () => {
  ok("PATCH", "/rest/interface/pppoe-client/*1", { password: "newpassword" });
});

test("interface/pppoe-client: delete allowed", () => {
  ok("DELETE", "/rest/interface/pppoe-client/*1", undefined);
});

test("interface/pppoe-client: disabled field accepted for redial", () => {
  ok("PATCH", "/rest/interface/pppoe-client/*1", { disabled: "true" });
  ok("PATCH", "/rest/interface/pppoe-client/*1", { disabled: "false" });
});
