/** Pure helpers for RouterOS connection-tracking rows. Values stay strings on the wire. */

export function splitEndpoint(value) {
  if (value == null) return { ip: "", port: "" };
  const text = String(value).trim();
  const match = text.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/);
  if (!match) return { ip: text, port: "" };
  return { ip: match[1], port: match[2] || "" };
}

export function parseRateBps(value) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  const unit = text.match(/^([\d.]+)\s*([kmg])?bps$/i);
  if (unit) {
    const amount = Number(unit[1]);
    if (!Number.isFinite(amount)) return null;
    const prefix = (unit[2] || "").toLowerCase();
    const scale = prefix === "g" ? 1e9 : prefix === "m" ? 1e6 : prefix === "k" ? 1e3 : 1;
    return amount * scale;
  }
  const plain = Number(text);
  return Number.isFinite(plain) ? plain : null;
}

function finiteBytes(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Fold connection rows onto known client IPs.
 * Upload is orig-bytes when the client is the source; download is repl-bytes.
 * Inbound rows (client is the destination) are flipped so they are not counted twice.
 */
export function summarizeConnections(rows, clientIps) {
  const clients = new Set((clientIps || []).filter(Boolean));
  const totals = {};
  const counts = {};
  const peerBuckets = {};
  const reported = {};

  for (const row of rows || []) {
    const src = splitEndpoint(row["src-address"]).ip;
    const dst = splitEndpoint(row["dst-address"]).ip;
    const orig = finiteBytes(row["orig-bytes"]);
    const repl = finiteBytes(row["repl-bytes"]);
    const fromClient = clients.has(src);
    const toClient = !fromClient && clients.has(dst);
    if (!fromClient && !toClient) continue;
    const client = fromClient ? src : dst;
    const up = fromClient ? orig : repl;
    const down = fromClient ? repl : orig;
    const peer = fromClient ? dst : src;
    if (!totals[client]) totals[client] = { up: 0, down: 0 };
    totals[client].up += up;
    totals[client].down += down;
    counts[client] = (counts[client] || 0) + 1;

    const origRate = parseRateBps(row["orig-rate"]);
    const replRate = parseRateBps(row["repl-rate"]);
    if (origRate != null || replRate != null) {
      if (!reported[client]) reported[client] = { txBps: 0, rxBps: 0 };
      reported[client].txBps += fromClient ? origRate || 0 : replRate || 0;
      reported[client].rxBps += fromClient ? replRate || 0 : origRate || 0;
    }

    if (peer && peer !== client) {
      if (!peerBuckets[client]) peerBuckets[client] = new Map();
      const current = peerBuckets[client].get(peer) || { bytes: 0, count: 0 };
      current.bytes += up + down;
      current.count += 1;
      peerBuckets[client].set(peer, current);
    }
  }

  const peers = {};
  for (const [ip, bucket] of Object.entries(peerBuckets)) {
    peers[ip] = [...bucket.entries()]
      .map(([peer, item]) => ({ ip: peer, bytes: item.bytes, count: item.count }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 6);
  }

  return { totals, counts, peers, reportedRates: reported };
}

export function ratesFromDeltas(previous, next, dtSeconds) {
  const rates = {};
  if (!(dtSeconds >= 0.4 && dtSeconds <= 30)) return rates;
  for (const [ip, total] of Object.entries(next || {})) {
    const before = previous?.[ip];
    if (!before) continue;
    if (total.up < before.up || total.down < before.down) continue;
    rates[ip] = {
      txBps: ((total.up - before.up) * 8) / dtSeconds,
      rxBps: ((total.down - before.down) * 8) / dtSeconds,
    };
  }
  return rates;
}
