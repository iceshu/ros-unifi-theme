import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanRouterText,
  displayArch,
  formatBps,
  formatBytes,
  formatLastSeen,
  formatUptime,
  parseDurationSeconds,
} from "./format.mjs";

test("parses RouterOS uptime and clock-style durations", () => {
  assert.equal(parseDurationSeconds("2d20h12m20s"), 2 * 86400 + 20 * 3600 + 12 * 60 + 20);
  assert.equal(parseDurationSeconds("1w2d3h4m5s"), 7 * 86400 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5);
  assert.equal(parseDurationSeconds("35s"), 35);
  assert.equal(parseDurationSeconds("2w3d04:23:15"), 2 * 7 * 86400 + 3 * 86400 + 4 * 3600 + 23 * 60 + 15);
  assert.equal(parseDurationSeconds("never"), null);
  assert.equal(parseDurationSeconds(""), null);
  assert.equal(parseDurationSeconds("hello"), null);
});

test("formats durations in Chinese", () => {
  assert.equal(formatUptime("2d20h12m20s"), "2 天 20 小时 12 分");
  assert.equal(formatUptime("35s"), "35 秒");
  assert.equal(formatUptime(""), "—");
  assert.equal(formatLastSeen("never"), "从未");
  assert.equal(formatLastSeen("1m12s"), "1 分 12 秒前");
});

test("strips RouterOS placeholder board text", () => {
  assert.equal(cleanRouterText("x86 Default string Default string"), "x86");
  assert.equal(cleanRouterText("Default string"), "");
  assert.equal(cleanRouterText("  RB5009  "), "RB5009");
  assert.equal(displayArch("x86_64"), "x86");
  assert.equal(displayArch("arm64"), "arm64");
});

test("formats bytes and bit rates", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.50 KB");
  assert.equal(formatBytes("1048576"), "1.00 MB");
  assert.deepEqual(formatBps(999), { value: "999", unit: "bps" });
  assert.deepEqual(formatBps(1500), { value: "1.50", unit: "Kbps" });
  assert.deepEqual(formatBps(160_000_000), { value: "160", unit: "Mbps" });
  assert.equal(formatBps(-1), null);
});
