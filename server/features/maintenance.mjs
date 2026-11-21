import crypto from "node:crypto";
import { demoBody, registerDemo } from "../demo.mjs";

registerDemo(
  "/rest/system/package/update",
  () => ({
    ".id": "*1",
    "installed-version": "7.16.2",
    "latest-version": "7.20.4",
    channel: "stable",
    status: "New version is available",
  }),
  { kind: "singleton" },
);

export function stripFirstComment(text) {
  const nl = text.indexOf("\n");
  if (nl < 0) return text;
  const first = text.slice(0, nl).trimEnd();
  return first.startsWith("#") ? text.slice(nl + 1) : text;
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function demoExportText(variant = 0) {
  const headers = [
    "# oct/01/2026 03:00:00 by RouterOS 7.16.2\n",
    "# oct/15/2026 03:00:00 by RouterOS 7.16.2\n",
    "# nov/01/2026 03:00:00 by RouterOS 7.16.2\n",
    "# nov/15/2026 10:00:00 by RouterOS 7.16.2\n",
  ];
  const base = `/interface bridge
add name=bridge1 comment="局域网"
/ip address
add address=192.168.2.1/24 interface=bridge1 network=192.168.2.0
add address=10.8.0.1/24 interface=wg0 network=10.8.0.0
/ip dns
set allow-remote-requests=yes servers=1.1.1.1,9.9.9.9
/system identity
set name=x86
`;
  const addons = [
    "",
    "/ip firewall filter\nadd action=accept chain=input comment=\"allow-mgmt\"\n",
    "/ip firewall filter\nadd action=accept chain=input comment=\"allow-mgmt\"\n/queue simple\nadd max-limit=20M/100M name=Guest target=192.168.30.0/24\n",
    "/ip firewall filter\nadd action=accept chain=input comment=\"allow-mgmt\"\n/queue simple\nadd max-limit=20M/100M name=Guest target=192.168.30.0/24\n/ip dns/static\nadd address=192.168.2.1 name=gateway.home.arpa type=A\n",
  ];
  const v = variant % 4;
  return headers[v] + base + addons[v];
}

/** Read the router's `/export` text: export to a file, read it in chunks (`/file/read`, RouterOS 7.13+), delete it. */
async function readBackupFromRouter(caller) {
  const FILE_RSC = "rut-backup.rsc";
  const findFile = async () => {
    const files = await caller("GET", "/rest/file");
    return Array.isArray(files) ? files.find((r) => r.name === FILE_RSC) : undefined;
  };

  // A file left over from an interrupted run would be read instead of the fresh export.
  const stale = await findFile().catch(() => undefined);
  if (stale) await caller("DELETE", `/rest/file/${stale[".id"]}`).catch(() => {});

  await caller("POST", "/rest/export", { file: "rut-backup" });

  const deadline = Date.now() + 30_000;
  let file;
  while (Date.now() < deadline) {
    await sleep(2000);
    file = await findFile().catch(() => undefined);
    if (file) break;
  }
  if (!file) throw Object.assign(new Error("备份文件未在 30 秒内出现"), { code: "timeout" });

  try {
    // `data` is the chunk as a plain string; `offset` counts bytes.
    const CHUNK = 32768;
    const parts = [];
    let offset = 0;
    for (let attempts = 0; attempts < 500; attempts++) {
      let reply;
      try {
        reply = await caller("POST", "/rest/file/read", { file: FILE_RSC, "chunk-size": String(CHUNK), offset: String(offset) });
      } catch (error) {
        if (offset > 0) break; // offset exactly at end of file fails on RouterOS
        throw error;
      }
      const data = (Array.isArray(reply) ? reply[0]?.data : reply?.data) ?? "";
      if (!data) break;
      const bytes = Buffer.from(data, "utf8");
      parts.push(bytes);
      offset += bytes.length;
      if (bytes.length < CHUNK) break;
    }
    return Buffer.concat(parts).toString("utf8");
  } finally {
    await caller("DELETE", `/rest/file/${file[".id"]}`).catch(() => {});
  }
}

export function create(app) {
  const { db } = app;

  const upsertTraffic = db.raw.prepare(
    "INSERT INTO traffic (name, t, rx, tx) VALUES (?, ?, ?, ?)" +
    " ON CONFLICT(name, t) DO UPDATE SET rx = excluded.rx, tx = excluded.tx",
  );
  const queryTrafficLong = db.raw.prepare(`
    SELECT CAST(t / ? AS INTEGER) * ? AS bucket, AVG(rx) AS rx, AVG(tx) AS tx
    FROM traffic WHERE name = ? AND t >= ?
    GROUP BY 1 ORDER BY 1
  `);
  const pruneTraffic = db.raw.prepare("DELETE FROM traffic WHERE t < ?");
  const getDistinctNames = db.raw.prepare(
    "SELECT DISTINCT name FROM traffic WHERE t > ? LIMIT 100",
  );
  const listBackups = db.raw.prepare(
    "SELECT id, t, hash, size, trigger, user FROM backups ORDER BY t DESC",
  );
  const getBackupRow = db.raw.prepare("SELECT * FROM backups WHERE id = ?");
  const latestHash = db.raw.prepare("SELECT hash FROM backups ORDER BY t DESC LIMIT 1");
  const insertBackup = db.raw.prepare(
    "INSERT INTO backups (t, hash, size, trigger, user, text) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const deleteBackupRow = db.raw.prepare("DELETE FROM backups WHERE id = ?");
  const countBackups = db.raw.prepare("SELECT COUNT(*) AS n FROM backups");
  const oldestBackupIds = db.raw.prepare(
    "SELECT id FROM backups ORDER BY t ASC LIMIT ?",
  );

  let aggTimer = null;
  let pruneTimer = null;
  let schedTimer = null;
  let stopped = false;
  let lastScheduledMs = 0;
  let demoBackupsSeeded = false;

  async function tickAgg() {
    if (stopped) return;
    const nowMs = Date.now();
    const bucketSec = Math.floor(nowMs / 60_000) * 60 - 60;

    try {
      let ifaces = [];
      if (app.demo) {
        const data = demoBody("/rest/interface", nowMs);
        if (Array.isArray(data)) ifaces = data.map((r) => r.name).filter(Boolean);
      } else {
        try {
          const data = await app.service("GET", "/rest/interface", undefined, { timeout: 8_000 });
          if (Array.isArray(data)) ifaces = data.map((r) => r.name).filter(Boolean);
        } catch {
          ifaces = getDistinctNames.all(bucketSec - 3600).map((r) => r.name);
        }
      }

      if (app.history && ifaces.length > 0) {
        for (const name of ifaces) {
          const { points } = app.history.query(name, 300);
          const inBucket = points.filter(([t]) => {
            const tSec = t / 1000;
            return tSec >= bucketSec && tSec < bucketSec + 60;
          });
          if (inBucket.length === 0) continue;
          const avgRx = inBucket.reduce((s, [, rx]) => s + rx, 0) / inBucket.length;
          const avgTx = inBucket.reduce((s, [, , tx]) => s + tx, 0) / inBucket.length;
          upsertTraffic.run(name, bucketSec, avgRx, avgTx);
        }
      }
    } catch (err) {
      console.error("[maintenance/agg]", err.message);
    }

    if (!stopped) {
      const nextMs = (Math.floor(Date.now() / 60_000) + 1) * 60_000;
      aggTimer = setTimeout(tickAgg, Math.max(1000, nextMs - Date.now()));
      if (aggTimer.unref) aggTimer.unref();
    }
  }

  function tickPrune() {
    if (stopped) return;
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86_400;
    try {
      pruneTraffic.run(cutoff);
    } catch (err) {
      console.error("[maintenance/prune]", err.message);
    }
    if (!stopped) {
      pruneTimer = setTimeout(tickPrune, 86_400_000);
      if (pruneTimer.unref) pruneTimer.unref();
    }
  }

  function getBackupSettings() {
    return db.setting("backups", { schedule: "daily", hour: 3, retention: 30 });
  }

  async function runBackup(caller, trigger, user) {
    let text;
    if (app.demo) {
      text = demoExportText(3); // always variant 3; first run creates, second says "无变化"
    } else {
      text = await readBackupFromRouter(caller);
    }

    const stripped = stripFirstComment(text);
    const hash = sha256(stripped);
    const existing = latestHash.get();
    if (existing && existing.hash === hash) {
      return { changed: false };
    }

    const size = Buffer.byteLength(stripped, "utf8");
    const t = Date.now();
    insertBackup.run(t, hash, size, trigger, user || "", text);

    const { retention } = getBackupSettings();
    const { n } = countBackups.get();
    if (n > retention) {
      const rows = oldestBackupIds.all(n - retention);
      for (const row of rows) deleteBackupRow.run(row.id);
    }

    return { changed: true };
  }

  async function tickSched() {
    if (stopped) return;
    const { schedule, hour } = getBackupSettings();
    if (schedule !== "off") {
      const now = new Date();
      const currentHour = now.getUTCHours();
      const dayMatches = schedule === "weekly" ? now.getUTCDay() === 1 : true;
      if (dayMatches && currentHour === hour && Date.now() - lastScheduledMs > 2 * 3_600_000) {
        lastScheduledMs = Date.now();
        try {
          await runBackup(
            (method, path, body, timeout) =>
              app.service(method, path, body, { timeout: timeout ?? 60_000 }),
            "auto",
            "scheduler",
          );
        } catch (err) {
          app.bus.emit("event", {
            kind: "backup_failed",
            severity: "warn",
            title: "备份失败",
            body: err.message,
          });
          console.error("[maintenance/sched]", err.message);
        }
      }
    }
    if (!stopped) {
      schedTimer = setTimeout(tickSched, 15 * 60_000);
      if (schedTimer.unref) schedTimer.unref();
    }
  }

  function demoBackfillTraffic() {
    const existing = db.raw.prepare("SELECT COUNT(*) AS n FROM traffic").get();
    if (existing.n > 0) return;

    const nowMs = Date.now();
    const startMs = nowMs - 30 * 86_400_000;
    const step = 15 * 60_000;
    const ifaces = ["liantong", "bridge1", "ether1", "ether2", "wg0"];
    const prevBytes = new Map();

    db.raw.exec("BEGIN");
    try {
      for (let tMs = startMs; tMs <= nowMs; tMs += step) {
        const data = demoBody("/rest/interface", tMs);
        if (!Array.isArray(data)) continue;
        const tSec = Math.floor(tMs / 1000);

        for (const row of data) {
          const name = row.name;
          if (!ifaces.includes(name)) continue;
          const rxByte = Number(row["rx-byte"]) || 0;
          const txByte = Number(row["tx-byte"]) || 0;
          const prev = prevBytes.get(name);
          if (prev && rxByte >= prev.rx && txByte >= prev.tx && prev.rx > 0) {
            const dtSec = step / 1000;
            const rxBps = ((rxByte - prev.rx) * 8) / dtSec;
            const txBps = ((txByte - prev.tx) * 8) / dtSec;
            const bucketSec = Math.floor(tSec / 60) * 60;
            upsertTraffic.run(name, bucketSec, rxBps, txBps);
          }
          prevBytes.set(name, { rx: rxByte, tx: txByte });
        }
      }
      db.raw.exec("COMMIT");
    } catch (err) {
      db.raw.exec("ROLLBACK");
      console.error("[maintenance/backfill]", err.message);
    }
  }

  function seedDemoBackups() {
    if (!app.demo || demoBackupsSeeded) return;
    demoBackupsSeeded = true;
    if (countBackups.get().n > 0) return;

    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const t = now - (2 - i) * 7 * 86_400_000;
      const text = demoExportText(i);
      const stripped = stripFirstComment(text);
      const hash = sha256(stripped);
      const size = Buffer.byteLength(stripped, "utf8");
      const trigger = i < 2 ? "auto" : "manual";
      const user = i < 2 ? "scheduler" : "admin";
      insertBackup.run(t, hash, size, trigger, user, text);
    }
  }

  const reads = ["/rest/system/package/update"];

  const writes = {
    "/rest/system/package/update": {
      commands: { set: ["channel"], install: [] },
      commandPolicy: { install: "reboot" },
    },
    "/rest/system/routerboard": {
      commands: { upgrade: [] },
      commandPolicy: { upgrade: "reboot" },
    },
  };

  const routes = [
    {
      method: "GET",
      path: "/api/history/long",
      handle(ctx) {
        const rawName = ctx.url.searchParams.get("name") || "";
        if (!rawName || rawName.length > 64 || /[\x00-\x1f\x7f/\\]/.test(rawName)) {
          return ctx.send(400, { code: "bad_name" });
        }
        const rawRange = Number(ctx.url.searchParams.get("range"));
        const range = rawRange === 2592000 ? 2592000 : 604800;
        const stepSec = range === 2592000 ? 3600 : 900;
        const cutoffSec = Math.floor(Date.now() / 1000) - range;
        const rows = queryTrafficLong.all(stepSec, stepSec, rawName, cutoffSec);
        const points = rows.map((r) => [r.bucket * 1000, r.rx, r.tx]);
        ctx.send(200, { name: rawName, range, step: stepSec, points });
      },
    },
    {
      method: "GET",
      path: "/api/backups",
      handle(ctx) {
        ctx.send(200, listBackups.all());
      },
    },
    {
      method: "GET",
      path: "/api/backups/item",
      handle(ctx) {
        const id = Number(ctx.url.searchParams.get("id"));
        if (!id) return ctx.send(400, { code: "bad_id" });
        const row = getBackupRow.get(id);
        if (!row) return ctx.send(404, { code: "not_found" });
        ctx.send(200, row);
      },
    },
    {
      method: "GET",
      path: "/api/backups/download",
      async handle(ctx) {
        const id = Number(ctx.url.searchParams.get("id"));
        if (!id) return ctx.send(400, { code: "bad_id" });
        const row = getBackupRow.get(id);
        if (!row) return ctx.send(404, { code: "not_found" });
        let identity = "router";
        try {
          const idData = await ctx.router("GET", "/rest/system/identity");
          const rec = Array.isArray(idData) ? idData[0] : idData;
          if (rec?.name) identity = String(rec.name);
        } catch {
          // use "router" fallback
        }
        const date = new Date(row.t).toISOString().slice(0, 10);
        const filename = `${identity}-${date}.rsc`.replace(/[^a-z0-9._-]/gi, "_");
        ctx.res.setHeader("Content-Type", "text/plain; charset=utf-8");
        ctx.res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        ctx.res.writeHead(200);
        ctx.res.end(row.text);
      },
    },
    {
      method: "POST",
      path: "/api/backups/run",
      policy: "write",
      async handle(ctx) {
        const result = await runBackup(
          (method, path, body, timeout) => ctx.router(method, path, body, timeout),
          "manual",
          ctx.session.user,
        );
        ctx.audit({ action: "backup.run", status: 200, outcome: result.changed ? "created" : "no_change" });
        ctx.send(200, { changed: result.changed });
      },
    },
    {
      method: "POST",
      path: "/api/backups/delete",
      policy: "write",
      handle(ctx) {
        const id = Number(ctx.body?.id);
        if (!id) return ctx.send(400, { code: "bad_id" });
        const row = getBackupRow.get(id);
        if (!row) return ctx.send(404, { code: "not_found" });
        deleteBackupRow.run(id);
        ctx.audit({ action: "backup.delete", target: String(id), status: 200 });
        ctx.send(200, { ok: true });
      },
    },
    {
      method: "GET",
      path: "/api/backups/settings",
      handle(ctx) {
        ctx.send(200, getBackupSettings());
      },
    },
    {
      method: "PUT",
      path: "/api/backups/settings",
      policy: "write",
      handle(ctx) {
        const { schedule, hour, retention } = ctx.body ?? {};
        if (!["off", "daily", "weekly"].includes(schedule)) {
          return ctx.send(400, { code: "bad_schedule" });
        }
        const h = Number(hour);
        if (!Number.isInteger(h) || h < 0 || h > 23)
          return ctx.send(400, { code: "bad_hour" });
        const r = Number(retention);
        if (!Number.isInteger(r) || r < 1 || r > 365)
          return ctx.send(400, { code: "bad_retention" });
        db.setSetting("backups", { schedule, hour: h, retention: r });
        ctx.audit({ action: "backup.settings", status: 200 });
        ctx.send(200, { schedule, hour: h, retention: r });
      },
    },
    {
      method: "POST",
      path: "/api/updates/check",
      async handle(ctx) {
        if (ctx.demo) {
          const data = demoBody("/rest/system/package/update", Date.now());
          const rec = Array.isArray(data) ? data[0] : data;
          return ctx.send(200, rec ?? {});
        }
        try {
          await ctx.router("POST", "/rest/system/package/update/check-for-updates", {}, 30_000);
          const result = await ctx.router("GET", "/rest/system/package/update");
          const rec = Array.isArray(result) ? result[0] : result;
          ctx.send(200, rec ?? {});
        } catch (err) {
          ctx.send(err.status || 500, {
            code: err.code || "check_failed",
            message: err.message || "检查更新失败",
          });
        }
      },
    },
  ];

  return {
    reads,
    writes,
    routes,
    start() {
      stopped = false;
      if (app.demo) {
        demoBackfillTraffic();
        seedDemoBackups();
      }
      const nowMs = Date.now();
      const nextMinMs = (Math.floor(nowMs / 60_000) + 1) * 60_000;
      aggTimer = setTimeout(tickAgg, Math.max(1000, nextMinMs - nowMs));
      if (aggTimer.unref) aggTimer.unref();
      pruneTimer = setTimeout(tickPrune, 60_000);
      if (pruneTimer.unref) pruneTimer.unref();
      schedTimer = setTimeout(tickSched, 5 * 60_000);
      if (schedTimer.unref) schedTimer.unref();
    },
    stop() {
      stopped = true;
      clearTimeout(aggTimer);
      clearTimeout(pruneTimer);
      clearTimeout(schedTimer);
      aggTimer = pruneTimer = schedTimer = null;
    },
  };
}
