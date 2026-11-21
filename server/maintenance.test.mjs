import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db.mjs";
import { stripFirstComment, sha256 } from "./features/maintenance.mjs";
import { diff, collapseContext } from "../shared/diff.mjs";

// ── Backup: hash ignores timestamp line ──────────────────────────────────────

test("stripFirstComment: removes first comment line", () => {
  const text = "# oct/01/2026 03:00:00 by RouterOS 7.16.2\n/system identity\nset name=router\n";
  assert.equal(stripFirstComment(text), "/system identity\nset name=router\n");
});

test("stripFirstComment: preserves text without leading comment", () => {
  const text = "/system identity\nset name=router\n";
  assert.equal(stripFirstComment(text), text);
});

test("backup: same hash when only timestamp line differs", () => {
  const body = "/system identity\nset name=router\n";
  const text1 = `# oct/01/2026 03:00:00 by RouterOS 7.16.2\n${body}`;
  const text2 = `# nov/15/2026 10:30:00 by RouterOS 7.16.2\n${body}`;
  assert.equal(sha256(stripFirstComment(text1)), sha256(stripFirstComment(text2)));
});

test("backup: different content gives different hash", () => {
  const text1 = "# ts1\n/system identity\nset name=router1\n";
  const text2 = "# ts2\n/system identity\nset name=router2\n";
  assert.notEqual(sha256(stripFirstComment(text1)), sha256(stripFirstComment(text2)));
});

// ── Backup: retention pruning ────────────────────────────────────────────────

test("backup: retention pruning keeps last N", () => {
  const db = openDb(":memory:");
  const ins = db.raw.prepare(
    "INSERT INTO backups (t, hash, size, trigger, user, text) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const count = () => db.raw.prepare("SELECT COUNT(*) AS n FROM backups").get().n;
  const oldest = (n) => db.raw.prepare("SELECT id FROM backups ORDER BY t ASC LIMIT ?").all(n);
  const del = db.raw.prepare("DELETE FROM backups WHERE id = ?");

  for (let i = 0; i < 5; i++) {
    ins.run((i + 1) * 1000, `hash${i}`, 100, "auto", "scheduler", `text${i}`);
  }
  assert.equal(count(), 5);

  const retention = 3;
  const n = count();
  if (n > retention) {
    for (const row of oldest(n - retention)) del.run(row.id);
  }
  assert.equal(count(), 3);

  const remaining = db.raw.prepare("SELECT t FROM backups ORDER BY t ASC").all();
  assert.deepEqual(
    remaining.map((r) => r.t),
    [3000, 4000, 5000],
  );
  db.close();
});

// ── Diff algorithm ────────────────────────────────────────────────────────────

test("diff: identical inputs", () => {
  const edits = diff(["a", "b"], ["a", "b"]);
  assert.deepEqual(edits, [
    { type: "equal", line: "a" },
    { type: "equal", line: "b" },
  ]);
});

test("diff: simple substitution (remove before add)", () => {
  const edits = diff(["a", "b", "c"], ["a", "x", "c"]);
  assert.equal(edits.filter((e) => e.type === "equal").length, 2);
  assert.equal(edits.filter((e) => e.type === "remove").length, 1);
  assert.equal(edits.filter((e) => e.type === "add").length, 1);
  const removeIdx = edits.findIndex((e) => e.type === "remove");
  const addIdx = edits.findIndex((e) => e.type === "add");
  assert.ok(removeIdx < addIdx, "remove should come before add");
  assert.equal(edits[removeIdx].line, "b");
  assert.equal(edits[addIdx].line, "x");
});

test("diff: addition only", () => {
  const edits = diff(["a", "c"], ["a", "b", "c"]);
  assert.deepEqual(edits, [
    { type: "equal", line: "a" },
    { type: "add", line: "b" },
    { type: "equal", line: "c" },
  ]);
});

test("diff: deletion only", () => {
  const edits = diff(["a", "b", "c"], ["a", "c"]);
  assert.deepEqual(edits, [
    { type: "equal", line: "a" },
    { type: "remove", line: "b" },
    { type: "equal", line: "c" },
  ]);
});

test("diff: empty a", () => {
  const edits = diff([], ["x", "y"]);
  assert.deepEqual(edits, [
    { type: "add", line: "x" },
    { type: "add", line: "y" },
  ]);
});

test("diff: empty b", () => {
  const edits = diff(["x", "y"], []);
  assert.deepEqual(edits, [
    { type: "remove", line: "x" },
    { type: "remove", line: "y" },
  ]);
});

test("collapseContext: short equal run is not collapsed", () => {
  const edits = diff(["a", "b", "c"], ["a", "x", "c"]);
  const collapsed = collapseContext(edits, 3);
  assert.equal(collapsed.filter((e) => e.type === "ctx").length, 0);
});

test("collapseContext: long equal runs before and after change are collapsed", () => {
  const before = Array.from({ length: 10 }, (_, idx) => ({ type: "equal", line: `l${idx}` }));
  const after = Array.from({ length: 10 }, (_, idx) => ({ type: "equal", line: `m${idx}` }));
  const edits = [...before, { type: "add", line: "added" }, ...after];
  const collapsed = collapseContext(edits, 3);
  const ctxItems = collapsed.filter((e) => e.type === "ctx");
  assert.equal(ctxItems.length, 2);
  assert.ok(ctxItems.every((e) => e.count > 0));
  assert.equal(collapsed.filter((e) => e.type === "add").length, 1);
});

// ── History: downsampling query ───────────────────────────────────────────────

test("history long: SQL downsamples into buckets", () => {
  const db = openDb(":memory:");
  const ins = db.raw.prepare("INSERT INTO traffic (name, t, rx, tx) VALUES (?, ?, ?, ?)");

  // Insert 12 rows at 1-minute intervals (seconds 0, 60, 120, … 660)
  for (let i = 0; i < 12; i++) {
    ins.run("eth0", i * 60, (i + 1) * 1000, (i + 1) * 500);
  }

  const stepSec = 180; // 3-minute buckets
  const cutoff = 0;
  const rows = db.raw
    .prepare(
      "SELECT CAST(t / ? AS INTEGER) * ? AS bucket, AVG(rx) AS rx, AVG(tx) AS tx" +
      " FROM traffic WHERE name = ? AND t >= ? GROUP BY 1 ORDER BY 1",
    )
    .all(stepSec, stepSec, "eth0", cutoff);

  // 12 minutes / 3 min = 4 buckets
  assert.equal(rows.length, 4);

  // First bucket: t=0,60,120 → avg rx = (1000+2000+3000)/3 = 2000
  assert.ok(Math.abs(rows[0].rx - 2000) < 0.001, `expected ~2000 got ${rows[0].rx}`);
  assert.equal(rows[0].bucket, 0);
  assert.equal(rows[1].bucket, 180);

  db.close();
});

test("history long: excludes rows before cutoff", () => {
  const db = openDb(":memory:");
  const ins = db.raw.prepare("INSERT INTO traffic (name, t, rx, tx) VALUES (?, ?, ?, ?)");
  ins.run("eth0", 100, 500, 250);  // t=100 < cutoff 150 → excluded
  ins.run("eth0", 200, 1000, 500); // t=200, bucket = CAST(200/200)*200 = 200
  ins.run("eth0", 250, 1500, 750); // t=250, bucket = CAST(250/200)*200 = 200

  const stepSec = 200;
  const cutoff = 150;
  const rows = db.raw
    .prepare(
      "SELECT CAST(t / ? AS INTEGER) * ? AS bucket, AVG(rx) AS rx, AVG(tx) AS tx" +
      " FROM traffic WHERE name = ? AND t >= ? GROUP BY 1 ORDER BY 1",
    )
    .all(stepSec, stepSec, "eth0", cutoff);

  // Only t=200 and t=250 qualify; both land in bucket 200 → avg rx = (1000+1500)/2 = 1250
  assert.equal(rows.length, 1);
  assert.ok(Math.abs(rows[0].rx - 1250) < 0.001, `expected 1250 got ${rows[0].rx}`);
  assert.equal(rows[0].bucket, 200);
  db.close();
});
