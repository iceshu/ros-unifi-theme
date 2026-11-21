import crypto from "node:crypto";

/**
 * Dashboard sessions backed by RouterOS accounts. The browser only ever holds
 * an opaque cookie; the RouterOS username/password stay in this process's
 * memory and are dropped on logout, idle expiry or restart.
 */

export const COOKIE = "rut_sid";

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function sessionCookie(id, maxAgeSec) {
  return `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`;
}

/** RouterOS group policy string, e.g. "read,write,!ftp,api,rest-api" → granted names. */
export function parsePolicies(policy) {
  return String(policy || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith("!"));
}

export function sessionTtlMs(env) {
  const hours = Number(env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 30) : 12) * 3_600_000;
}

export function createSessions({ ttlMs, now = Date.now, max = 64 }) {
  /** @type {Map<string, { id: string; user: string; password: string; group: string; policies: string[]; policiesKnown: boolean; created: number; lastSeen: number }>} */
  const sessions = new Map();

  function sweep() {
    const t = now();
    for (const [id, session] of sessions) if (t - session.lastSeen > ttlMs) sessions.delete(id);
  }

  return {
    ttlMs,
    create(info) {
      sweep();
      while (sessions.size >= max) sessions.delete(sessions.keys().next().value);
      const id = crypto.randomBytes(32).toString("base64url");
      const t = now();
      sessions.set(id, { ...info, id, created: t, lastSeen: t });
      return id;
    },
    get(id) {
      if (!id) return null;
      const session = sessions.get(id);
      if (!session) return null;
      if (now() - session.lastSeen > ttlMs) {
        sessions.delete(id);
        return null;
      }
      session.lastSeen = now();
      return session;
    },
    destroy(id) {
      sessions.delete(id);
    },
    /** Most recently active session, used by the history sampler when no service account is configured. */
    latest() {
      sweep();
      let best = null;
      for (const session of sessions.values()) if (!best || session.lastSeen > best.lastSeen) best = session;
      return best;
    },
    get size() {
      return sessions.size;
    },
  };
}

/** Five failures per client per minute, then a one-minute lockout; keeps RouterOS login limits untouched. */
export function createLoginLimiter({ max = 5, windowMs = 60_000, now = Date.now } = {}) {
  const failures = new Map();
  return {
    blocked(key) {
      const entry = failures.get(key);
      if (!entry) return 0;
      if (now() - entry.first > windowMs) {
        failures.delete(key);
        return 0;
      }
      return entry.count >= max ? Math.ceil((entry.first + windowMs - now()) / 1000) : 0;
    },
    fail(key) {
      const entry = failures.get(key);
      if (!entry || now() - entry.first > windowMs) failures.set(key, { first: now(), count: 1 });
      else entry.count += 1;
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
