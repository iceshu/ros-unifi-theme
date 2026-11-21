/** Feature module: alerts — evaluator, notifications, events API. */
import crypto from "node:crypto";
import { parseDurationSeconds } from "../../shared/format.mjs";
// ───── Pure helpers (exported for tests) ─────

/** Mask a secret: show last 4 chars prefixed with bullets. */
export function maskSecret(s) {
  if (!s) return "";
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

/** Feishu bot sign: HMAC-SHA256(key=secret, msg="{timestamp}\n{secret}"), base64. */
export function feishuSign(timestamp, secret) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64");
}

/** DingTalk robot sign: HMAC-SHA256(key=secret, msg="{timestamp}\n{secret}"), base64. */
export function dingTalkSign(timestamp, secret) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64");
}

/** Build Feishu webhook [url, body]. Adds sign fields when signSecret set. */
export function feishuPayload(channel, title, text) {
  const payload = { msg_type: "text", content: { text: `[${title}]\n${text}` } };
  if (channel.signSecret) {
    const timestamp = Math.floor(Date.now() / 1000);
    payload.timestamp = String(timestamp);
    payload.sign = feishuSign(timestamp, channel.signSecret);
  }
  return [channel.webhook, payload];
}

/** Build DingTalk [url-with-sign, body]. */
export function dingTalkPayload(channel, title, text) {
  const payload = { msgtype: "text", text: { content: `[${title}]\n${text}` } };
  let url = channel.webhook;
  if (channel.signSecret) {
    const timestamp = Date.now();
    const sign = dingTalkSign(timestamp, channel.signSecret);
    url += `${url.includes("?") ? "&" : "?"}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }
  return [url, payload];
}

// ───── Defaults ─────

const DEFAULT_RULES = {
  wanInterfaces: ["liantong", "ether0"],
  monitorInterfaces: [],
  wgStaleMins: 10,
  cpuPercent: 90,
  cpuDurationMins: 5,
  memPercent: 85,
  enableWan: true,
  enableIface: true,
  enableWg: true,
  enableCpu: true,
  enableMem: true,
  enableNewDevice: true,
  enableUpdate: true,
};

const SEV_ORDER = { info: 0, warn: 1, critical: 2 };
function sevGte(sev, min) {
  return (SEV_ORDER[sev] ?? 0) >= (SEV_ORDER[min] ?? 0);
}

// ───── Feature factory ─────

export function create(app) {
  const { db, bus, service, demo } = app;

  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS alert_conditions (
      cond_key TEXT PRIMARY KEY,
      event_id INTEGER NOT NULL,
      opened_t INTEGER NOT NULL
    );
  `);

  const q = {
    insertEvent: db.raw.prepare(
      "INSERT INTO events (t, kind, severity, title, body) VALUES (?, ?, ?, ?, ?)"
    ),
    resolveEvent: db.raw.prepare(
      "UPDATE events SET resolved_t = ? WHERE id = ? AND resolved_t IS NULL"
    ),
    insertCond: db.raw.prepare(
      "INSERT OR REPLACE INTO alert_conditions (cond_key, event_id, opened_t) VALUES (?, ?, ?)"
    ),
    deleteCond: db.raw.prepare("DELETE FROM alert_conditions WHERE cond_key = ?"),
    openConds: db.raw.prepare("SELECT cond_key, event_id, opened_t FROM alert_conditions"),
    getEventsAll: db.raw.prepare(
      "SELECT id, t, kind, severity, title, body, resolved_t, acked FROM events ORDER BY id DESC LIMIT ?"
    ),
    getEventsBefore: db.raw.prepare(
      "SELECT id, t, kind, severity, title, body, resolved_t, acked FROM events WHERE id < ? ORDER BY id DESC LIMIT ?"
    ),
    unreadCount: db.raw.prepare("SELECT COUNT(*) as cnt FROM events WHERE acked = 0"),
    ackAll: db.raw.prepare("UPDATE events SET acked = 1"),
    ackIds: db.raw.prepare(
      "UPDATE events SET acked = 1 WHERE id IN (SELECT value FROM json_each(?))"
    ),
    countClients: db.raw.prepare("SELECT COUNT(*) as cnt FROM clients"),
    upsertClient: db.raw.prepare(
      "INSERT INTO clients (mac, ip, name, first_seen, last_seen) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(mac) DO UPDATE SET ip=excluded.ip, name=excluded.name, last_seen=excluded.last_seen"
    ),
    getClient: db.raw.prepare("SELECT mac FROM clients WHERE mac = ?"),
  };

  // Restore active conditions from DB across restarts
  const active = new Map(); // cond_key → { eventId, openedT }
  for (const row of q.openConds.all()) {
    active.set(row.cond_key, { eventId: row.event_id, openedT: row.opened_t });
  }

  const sendStatus = new Map(); // "type:name" → { ok, t, error }
  let lastUpdateCheck = 0;
  let cpuHighSince = 0;
  let clientsBootstrapped = false;
  let timer = null;
  let initTimer = null;

  function getSettings() {
    return {
      channels: db.setting("alerts.channels", []),
      rules: { ...DEFAULT_RULES, ...(db.setting("alerts.rules", {})) },
    };
  }

  function openEvent(key, kind, severity, title, body) {
    if (active.has(key)) return null;
    const t = Date.now();
    const result = q.insertEvent.run(t, kind, severity, title, body);
    const eventId = Number(result.lastInsertRowid);
    q.insertCond.run(key, eventId, t);
    active.set(key, { eventId, openedT: t });
    sendNotification(kind, severity, title, body).catch(() => {});
    return eventId;
  }

  function closeEvent(key) {
    const cond = active.get(key);
    if (!cond) return;
    q.resolveEvent.run(Date.now(), cond.eventId);
    q.deleteCond.run(key);
    active.delete(key);
  }

  async function sendNotification(kind, severity, title, body) {
    const { channels } = getSettings();
    for (const ch of channels) {
      if (!ch.enabled) continue;
      if (ch.minSeverity && !sevGte(severity, ch.minSeverity)) continue;
      if (ch.kinds?.length && !ch.kinds.includes(kind)) continue;
      const key = `${ch.type}:${ch.name}`;
      try {
        await sendChannel(ch, { title, body, severity, kind, t: Date.now() });
        sendStatus.set(key, { ok: true, t: Date.now(), error: null });
      } catch (err) {
        sendStatus.set(key, { ok: false, t: Date.now(), error: String(err?.message ?? err) });
      }
    }
  }

  async function sendChannel(ch, { title, body, severity, kind, t }) {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 10000);
    try {
      const text = `[${severity.toUpperCase()}] ${title}\n${body}`;
      let url, payload, fetchOpts;

      if (ch.type === "feishu") {
        [url, payload] = feishuPayload(ch, title, text);
        fetchOpts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ac.signal };
      } else if (ch.type === "dingtalk") {
        [url, payload] = dingTalkPayload(ch, title, text);
        fetchOpts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ac.signal };
      } else if (ch.type === "wecom") {
        url = ch.webhook;
        payload = { msgtype: "text", text: { content: text } };
        fetchOpts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ac.signal };
      } else if (ch.type === "telegram") {
        url = `https://api.telegram.org/bot${ch.botToken}/sendMessage`;
        payload = { chat_id: ch.chatId, text, parse_mode: "HTML" };
        fetchOpts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ac.signal };
      } else if (ch.type === "bark") {
        url = `${String(ch.serverUrl).replace(/\/$/, "")}/${encodeURIComponent(ch.key)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
        fetchOpts = { method: "POST", signal: ac.signal };
      } else if (ch.type === "ntfy") {
        url = ch.topicUrl;
        fetchOpts = {
          method: "POST",
          headers: {
            Title: title,
            Priority: severity === "critical" ? "urgent" : severity === "warn" ? "high" : "default",
          },
          body,
          signal: ac.signal,
        };
      } else if (ch.type === "webhook") {
        url = ch.webhook;
        payload = { title, body, severity, kind, t };
        fetchOpts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ac.signal };
      } else {
        return;
      }

      const res = await fetch(url, fetchOpts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally {
      clearTimeout(to);
    }
  }

  // ── Evaluator ──

  async function evaluate() {
    const { rules } = getSettings();
    const now = Date.now();

    try {
      let ifaces = null;

      // 1. WAN up/down
      if (rules.enableWan) {
        ifaces = await service("GET", "/rest/interface").catch(() => null);
        if (ifaces) {
          const wanNames = rules.wanInterfaces?.length ? rules.wanInterfaces : DEFAULT_RULES.wanInterfaces;
          let wan = ifaces.find((i) => wanNames.includes(i.name) && i.type === "pppoe-out");
          if (!wan) wan = ifaces.find((i) => wanNames.includes(i.name));
          if (wan) {
            if (wan.running !== "true") {
              openEvent("wan_down", "wan", "critical", "WAN 断线", `接口 ${wan.name} 未运行`);
            } else {
              closeEvent("wan_down");
            }
          }
        }
      }

      // 2. Interface monitor
      if (rules.enableIface) {
        if (!ifaces) ifaces = await service("GET", "/rest/interface").catch(() => null);
        if (ifaces) {
          const wanNames = rules.wanInterfaces?.length ? rules.wanInterfaces : DEFAULT_RULES.wanInterfaces;
          const monitorNames = rules.monitorInterfaces?.length
            ? rules.monitorInterfaces
            : [...wanNames, ...ifaces.filter((i) => i.type === "ether" && i.comment).map((i) => i.name)];
          for (const ifc of ifaces) {
            if (!monitorNames.includes(ifc.name)) continue;
            if (ifc.type === "loopback") continue;
            const key = `iface_down:${ifc.name}`;
            const isDown = ifc.running !== "true" && ifc.disabled !== "true";
            if (isDown) {
              openEvent(key, "iface", "warn", `接口 ${ifc.name} 断开`, `接口 ${ifc.name} (${ifc.type}) 未运行`);
            } else {
              closeEvent(key);
            }
          }
        }
      }

      // 3. WireGuard peer stale
      if (rules.enableWg) {
        const peers = await service("GET", "/rest/interface/wireguard/peers").catch(() => null);
        if (peers) {
          const staleThresholdSec = (rules.wgStaleMins ?? 10) * 60;
          for (const peer of peers) {
            if (peer.disabled === "true") continue;
            const key = `wg_stale:${peer[".id"]}`;
            const name = peer.comment || peer["public-key"]?.slice(0, 12) || peer[".id"];
            const hs = parseDurationSeconds(peer["last-handshake"]);
            const isStale = hs == null || hs > staleThresholdSec;
            if (isStale) {
              openEvent(key, "wg", "warn", `WireGuard 对端 "${name}" 长时间未握手`, `对端 "${name}" 最后握手: ${peer["last-handshake"] || "从未"}`);
            } else {
              closeEvent(key);
            }
          }
        }
      }

      // 4. CPU + memory
      if (rules.enableCpu || rules.enableMem) {
        const res = await service("GET", "/rest/system/resource").catch(() => null);
        const r = res ? (Array.isArray(res) ? res[0] : res) : null;

        if (rules.enableCpu && r) {
          const cpuLoad = Number(r["cpu-load"] ?? 0);
          if (cpuLoad >= (rules.cpuPercent ?? 90)) {
            if (!cpuHighSince) cpuHighSince = now;
            const mins = (now - cpuHighSince) / 60000;
            if (mins >= (rules.cpuDurationMins ?? 5)) {
              openEvent("cpu_high", "cpu", "warn", `CPU 使用率持续偏高 (${cpuLoad}%)`, `CPU 使用率 ${cpuLoad}%，已持续 ${Math.round(mins)} 分钟`);
            }
          } else {
            cpuHighSince = 0;
            closeEvent("cpu_high");
          }
        }

        if (rules.enableMem && r) {
          const total = Number(r["total-memory"] ?? 1);
          const free = Number(r["free-memory"] ?? 0);
          const usedPct = total > 0 ? Math.round((1 - free / total) * 100) : 0;
          if (usedPct >= (rules.memPercent ?? 85)) {
            openEvent("mem_high", "mem", "warn", `内存使用率过高 (${usedPct}%)`, `内存使用率 ${usedPct}%，剩余 ${Math.round(free / 1024 / 1024)} MiB`);
          } else {
            closeEvent("mem_high");
          }
        }
      }

      // 5. New device
      if (rules.enableNewDevice) {
        await checkNewDevices();
      }

      // 6. RouterOS update (once per day)
      if (rules.enableUpdate && now - lastUpdateCheck > 86400000) {
        lastUpdateCheck = now;
        await checkUpdate();
      }
    } catch (err) {
      console.error("[alerts] evaluator error:", err?.message ?? err);
    }
  }

  async function checkNewDevices() {
    const [leases, arp] = await Promise.all([
      service("GET", "/rest/ip/dhcp-server/lease").catch(() => []),
      service("GET", "/rest/ip/arp").catch(() => []),
    ]);

    const seen = new Map(); // normalized mac → { ip, name }
    for (const l of (leases ?? [])) {
      const mac = (l["active-mac-address"] || l["mac-address"] || "").toLowerCase();
      if (!mac) continue;
      seen.set(mac, { ip: l["active-address"] || l.address || "", name: l["host-name"] || "" });
    }
    for (const a of (arp ?? [])) {
      const mac = (a["mac-address"] || "").toLowerCase();
      if (!mac || seen.has(mac)) continue;
      seen.set(mac, { ip: a.address || "", name: "" });
    }

    const { cnt } = q.countClients.get();
    const isFirstRun = !clientsBootstrapped && cnt === 0;
    clientsBootstrapped = true;

    const t = Date.now();
    for (const [mac, { ip, name }] of seen) {
      const existing = q.getClient.get(mac);
      q.upsertClient.run(mac, ip, name, t, t);
      if (!existing && !isFirstRun) {
        q.insertEvent.run(t, "new_device", "info", "新设备上线", `${name || mac} (${ip || "未知 IP"})`);
        sendNotification("new_device", "info", "新设备上线", `${name || mac} (${ip || "未知 IP"})`).catch(() => {});
      }
    }
  }

  async function checkUpdate() {
    try {
      await service("POST", "/rest/system/package/update/check-for-updates", {}).catch(() => {});
      const info = await service("GET", "/rest/system/package/update");
      if (!info) return;
      const data = Array.isArray(info) ? info[0] : info;
      if (data?.status === "new-version-is-available") {
        openEvent(
          "update_available",
          "update",
          "info",
          `RouterOS 更新可用 (${data["latest-version"]})`,
          `最新版本: ${data["latest-version"]}，当前版本: ${data["installed-version"] || "未知"}`
        );
      } else {
        closeEvent("update_available");
      }
    } catch {
      // tolerate failure
    }
  }

  function onBusEvent({ kind = "system", severity = "info", title, body = "" }) {
    if (!title) return;
    const t = Date.now();
    q.insertEvent.run(t, kind, severity, String(title), String(body));
    sendNotification(kind, severity, title, body).catch(() => {});
  }

  // ── Routes ──

  const routes = [
    {
      method: "GET",
      path: "/api/events",
      async handle(ctx) {
        const limit = Math.min(200, Math.max(1, Number(ctx.url.searchParams.get("limit") || 50)));
        const beforeRaw = ctx.url.searchParams.get("before");
        const before = beforeRaw ? Number(beforeRaw) : null;
        const events = before ? q.getEventsBefore.all(before, limit) : q.getEventsAll.all(limit);
        const { cnt: unread } = q.unreadCount.get();
        ctx.send(200, { events, unread });
      },
    },
    {
      method: "POST",
      path: "/api/events/ack",
      policy: "write",
      async handle(ctx) {
        const { ids, all } = ctx.body ?? {};
        if (all) {
          q.ackAll.run();
        } else if (Array.isArray(ids) && ids.length) {
          q.ackIds.run(JSON.stringify(ids));
        }
        const { cnt: unread } = q.unreadCount.get();
        ctx.audit({ action: "ack_events", target: all ? "all" : String(ids), status: 200 });
        ctx.send(200, { unread });
      },
    },
    {
      method: "GET",
      path: "/api/alerts/settings",
      async handle(ctx) {
        const { channels, rules } = getSettings();
        const masked = channels.map((ch) => {
          const key = `${ch.type}:${ch.name}`;
          return {
            ...ch,
            signSecret: ch.signSecret ? maskSecret(ch.signSecret) : "",
            botToken: ch.botToken ? maskSecret(ch.botToken) : "",
            key: ch.key ? maskSecret(ch.key) : "",
            _lastSend: sendStatus.get(key) ?? null,
          };
        });
        ctx.send(200, { channels: masked, rules });
      },
    },
    {
      method: "PUT",
      path: "/api/alerts/settings",
      policy: "write",
      async handle(ctx) {
        const { channels: newCh, rules: newRules } = ctx.body ?? {};
        const existing = db.setting("alerts.channels", []);
        const prevByKey = new Map(existing.map((ch) => [`${ch.type}:${ch.name}`, ch]));
        const merged = (Array.isArray(newCh) ? newCh : []).map((ch) => {
          const prev = prevByKey.get(`${ch.type}:${ch.name}`) ?? {};
          return {
            ...ch,
            signSecret: ch.signSecret && !ch.signSecret.startsWith("••••") ? ch.signSecret : (prev.signSecret ?? ""),
            botToken: ch.botToken && !ch.botToken.startsWith("••••") ? ch.botToken : (prev.botToken ?? ""),
            key: ch.key && !ch.key.startsWith("••••") ? ch.key : (prev.key ?? ""),
          };
        });
        db.setSetting("alerts.channels", merged);
        if (newRules && typeof newRules === "object") db.setSetting("alerts.rules", newRules);
        ctx.audit({ action: "update_alerts_settings", status: 200 });
        ctx.send(200, { ok: true });
      },
    },
    {
      method: "POST",
      path: "/api/alerts/test",
      policy: "write",
      async handle(ctx) {
        const { channelIndex } = ctx.body ?? {};
        const channels = db.setting("alerts.channels", []);
        const ch = channels[Number(channelIndex)];
        if (!ch) {
          ctx.send(404, { code: "not_found", message: "找不到该通知渠道" });
          return;
        }
        try {
          await sendChannel(ch, { title: "测试通知", body: "这是来自网关仪表盘的测试消息。", severity: "info", kind: "test", t: Date.now() });
          ctx.audit({ action: "test_alert_channel", target: `${ch.type}:${ch.name}`, status: 200 });
          ctx.send(200, { ok: true });
        } catch (err) {
          ctx.send(502, { code: "send_failed", message: String(err?.message ?? err) });
        }
      },
    },
  ];

  // ── Lifecycle ──

  function start() {
    bus.on("event", onBusEvent);

    if (demo) {
      const { cnt } = db.raw.prepare("SELECT COUNT(*) as cnt FROM events").get();
      if (cnt === 0) {
        const t = Date.now();
        // Inserted oldest first: the events list pages by id.
        // WAN outage (resolved)
        const wanR = q.insertEvent.run(t - 86400000, "wan", "critical", "WAN 断线", "接口 liantong 未运行");
        db.raw.prepare("UPDATE events SET resolved_t = ? WHERE id = ?").run(t - 86000000, Number(wanR.lastInsertRowid));
        // Update available (persistent)
        const updR = q.insertEvent.run(t - 43200000, "update", "info", "RouterOS 更新可用 (7.20.4)", "最新版本: 7.20.4，当前版本: 7.16.2");
        const updId = Number(updR.lastInsertRowid);
        q.insertCond.run("update_available", updId, t - 43200000);
        active.set("update_available", { eventId: updId, openedT: t - 43200000 });
        // WG stale (persistent, seed conditions table so evaluator doesn't duplicate)
        const wgR = q.insertEvent.run(t - 7200000, "wg", "warn", 'WireGuard 对端 "办公室" 长时间未握手', '对端 "办公室" 最后握手: 2d3h');
        const wgId = Number(wgR.lastInsertRowid);
        q.insertCond.run("wg_stale:*2", wgId, t - 7200000);
        active.set("wg_stale:*2", { eventId: wgId, openedT: t - 7200000 });
        // New device (one-shot)
        q.insertEvent.run(t - 3600000, "new_device", "info", "新设备上线", "iPhone (192.168.2.23)");
      }
    }

    const tick = () => evaluate().catch((err) => console.error("[alerts] tick:", err?.message ?? err));
    initTimer = setTimeout(tick, 2000);
    if (initTimer.unref) initTimer.unref();
    timer = setInterval(tick, 15000);
    if (timer.unref) timer.unref();
  }

  function stop() {
    bus.off("event", onBusEvent);
    clearTimeout(initTimer);
    clearInterval(timer);
    initTimer = null;
    timer = null;
  }

  return { routes, start, stop, _eval: evaluate };
}
