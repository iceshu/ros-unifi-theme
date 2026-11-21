import assert from "node:assert/strict";
import test from "node:test";
import { createGuard } from "./guard.mjs";

const SESSION = { user: "netadmin", group: "dash-admin" };

function guardWith(tables, env = { ROUTEROS_HOST: "http://192.168.2.1" }) {
  return createGuard({ env, read: async (_session, path) => tables[path] ?? [] });
}

const BASE = {
  "/rest/ip/address": [
    { ".id": "*1", address: "192.168.2.1/24", interface: "bridge1" },
    { ".id": "*2", address: "10.8.0.1/24", interface: "wg0" },
  ],
  "/rest/interface": [
    { ".id": "*A", name: "bridge1" },
    { ".id": "*5", name: "ether4" },
  ],
  "/rest/ip/firewall/filter": [
    { ".id": "*3", chain: "input", action: "accept", comment: "允许局域网管理" },
    { ".id": "*4", chain: "forward", action: "drop" },
  ],
  "/rest/ip/service": [
    { ".id": "*W", name: "www" },
    { ".id": "*S", name: "ssh" },
  ],
  "/rest/user": [
    { ".id": "*1", name: "netadmin", group: "dash-admin" },
    { ".id": "*2", name: "viewer", group: "dash-read" },
  ],
  "/rest/user/group": [{ ".id": "*G", name: "dash-admin" }],
  "/rest/ip/route": [{ ".id": "*R", "dst-address": "0.0.0.0/0" }],
};

test("disabling the interface holding the management address is refused", async () => {
  const guard = guardWith(BASE);
  const verdict = await guard({ session: SESSION, method: "PATCH", pathname: "/rest/interface/*A", menu: "/rest/interface", op: "update", fields: { disabled: "true" } });
  assert.match(verdict.block, /bridge1/);
  const other = await guard({ session: SESSION, method: "PATCH", pathname: "/rest/interface/*5", menu: "/rest/interface", op: "update", fields: { disabled: "true" } });
  assert.equal(other, null);
  const comment = await guard({ session: SESSION, method: "PATCH", pathname: "/rest/interface/*A", menu: "/rest/interface", op: "update", fields: { comment: "x" } });
  assert.equal(comment, null);
});

test("management address cannot be removed or moved, others can", async () => {
  const guard = guardWith(BASE);
  const remove = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/ip/address/*1", menu: "/rest/ip/address", op: "remove", fields: {} });
  assert.ok(remove.block);
  const other = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/ip/address/*2", menu: "/rest/ip/address", op: "remove", fields: {} });
  assert.equal(other, null);
});

test("input accept rules and input drops ask first; forward rules do not", async () => {
  const guard = guardWith(BASE);
  const input = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/ip/firewall/filter/*3", menu: "/rest/ip/firewall/filter", op: "remove", fields: {} });
  assert.ok(input.confirm);
  const forward = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/ip/firewall/filter/*4", menu: "/rest/ip/firewall/filter", op: "remove", fields: {} });
  assert.equal(forward, null);
  const newDrop = await guard({ session: SESSION, method: "PUT", pathname: "/rest/ip/firewall/filter", menu: "/rest/ip/firewall/filter", op: "create", fields: { chain: "input", action: "drop" } });
  assert.ok(newDrop.confirm);
});

test("the web service the dashboard uses cannot be disabled; https follows the scheme", async () => {
  const http = guardWith(BASE);
  const www = await http({ session: SESSION, method: "PATCH", pathname: "/rest/ip/service/*W", menu: "/rest/ip/service", op: "update", fields: { disabled: "true" } });
  assert.ok(www.block);
  const ssh = await http({ session: SESSION, method: "PATCH", pathname: "/rest/ip/service/*S", menu: "/rest/ip/service", op: "update", fields: { disabled: "true" } });
  assert.equal(ssh, null);
  const https = guardWith(BASE, { ROUTEROS_HOST: "https://192.168.2.1" });
  const wwwOverHttps = await https({ session: SESSION, method: "PATCH", pathname: "/rest/ip/service/*W", menu: "/rest/ip/service", op: "update", fields: { disabled: "true" } });
  assert.equal(wwwOverHttps, null);
});

test("own account and group are protected; other users are not", async () => {
  const guard = guardWith(BASE);
  const self = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/user/*1", menu: "/rest/user", op: "remove", fields: {} });
  assert.ok(self.block);
  const other = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/user/*2", menu: "/rest/user", op: "remove", fields: {} });
  assert.equal(other, null);
  const ownGroup = await guard({ session: SESSION, method: "PATCH", pathname: "/rest/user/group/*G", menu: "/rest/user/group", op: "update", fields: { policy: "read" } });
  assert.ok(ownGroup.block);
});

test("default route removal asks first", async () => {
  const guard = guardWith(BASE);
  const verdict = await guard({ session: SESSION, method: "DELETE", pathname: "/rest/ip/route/*R", menu: "/rest/ip/route", op: "remove", fields: {} });
  assert.ok(verdict.confirm);
});
