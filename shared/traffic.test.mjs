import assert from "node:assert/strict";
import test from "node:test";
import { parseRateBps, ratesFromDeltas, splitEndpoint, summarizeConnections } from "./traffic.mjs";

test("splits IPv4 endpoints and parses RouterOS rates", () => {
  assert.deepEqual(splitEndpoint("192.168.2.21:54321"), { ip: "192.168.2.21", port: "54321" });
  assert.deepEqual(splitEndpoint("1.1.1.1"), { ip: "1.1.1.1", port: "" });
  assert.equal(parseRateBps("8000"), 8000);
  assert.equal(parseRateBps("1.5Mbps"), 1.5e6);
  assert.equal(parseRateBps("12kbps"), 12e3);
  assert.equal(parseRateBps(""), null);
});

test("attributes connection bytes to the LAN client once", () => {
  const rows = [
    {
      "src-address": "192.168.2.21:40000",
      "dst-address": "1.1.1.1:443",
      "orig-bytes": "1000",
      "repl-bytes": "8000",
      "orig-rate": "8000",
      "repl-rate": "64000",
      protocol: "tcp",
    },
    {
      "src-address": "9.9.9.9:443",
      "dst-address": "192.168.2.21:40001",
      "orig-bytes": "500",
      "repl-bytes": "100",
      protocol: "tcp",
    },
    {
      "src-address": "8.8.8.8",
      "dst-address": "1.0.0.1",
      "orig-bytes": "99999",
      "repl-bytes": "99999",
    },
  ];
  const summary = summarizeConnections(rows, ["192.168.2.21"]);
  assert.deepEqual(summary.totals["192.168.2.21"], { up: 1100, down: 8500 });
  assert.equal(summary.counts["192.168.2.21"], 2);
  assert.equal(summary.reportedRates["192.168.2.21"].txBps, 8000);
  assert.equal(summary.reportedRates["192.168.2.21"].rxBps, 64000);
  assert.deepEqual(
    summary.peers["192.168.2.21"].map((peer) => peer.ip),
    ["1.1.1.1", "9.9.9.9"],
  );
  assert.equal(summary.totals["8.8.8.8"], undefined);
});

test("byte deltas become bit rates and ignore counter resets", () => {
  const previous = { "192.168.2.21": { up: 1000, down: 8000 } };
  const next = { "192.168.2.21": { up: 2000, down: 18000 } };
  const rates = ratesFromDeltas(previous, next, 2);
  assert.equal(rates["192.168.2.21"].txBps, 4000);
  assert.equal(rates["192.168.2.21"].rxBps, 40000);
  assert.deepEqual(ratesFromDeltas(previous, { "192.168.2.21": { up: 10, down: 10 } }, 2), {});
  assert.deepEqual(ratesFromDeltas(previous, next, 0.1), {});
});
