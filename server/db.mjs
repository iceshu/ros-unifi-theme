import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Local persistence (built-in node:sqlite, no native dependency): dashboard
 * settings, audit trail, alert events, long-term traffic, client sightings and
 * configuration backups. Everything lives in DATA_DIR (default ./data).
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,
  user TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_t ON audit (t);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  resolved_t INTEGER,
  acked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_t ON events (t);
CREATE TABLE IF NOT EXISTS traffic (
  name TEXT NOT NULL,
  t INTEGER NOT NULL,
  rx REAL NOT NULL,
  tx REAL NOT NULL,
  PRIMARY KEY (name, t)
);
CREATE TABLE IF NOT EXISTS clients (
  mac TEXT PRIMARY KEY,
  ip TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  user TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL
);
`;

/** @param {string} file path, or ":memory:" for tests */
export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA);

  const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
  const putSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const insertAudit = db.prepare(
    "INSERT INTO audit (t, user, ip, action, target, status, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  return {
    raw: db,
    /** JSON setting with a default when missing or unreadable. */
    setting(key, fallback) {
      const row = getSetting.get(key);
      if (!row) return fallback;
      try {
        return JSON.parse(row.value);
      } catch {
        return fallback;
      }
    },
    setSetting(key, value) {
      putSetting.run(key, JSON.stringify(value));
    },
    audit({ t = Date.now(), user, ip = "", action, target = "", status = 0, outcome = "", detail = "" }) {
      insertAudit.run(t, String(user), String(ip), String(action), String(target), Number(status) || 0, String(outcome), String(detail).slice(0, 2000));
    },
    close() {
      db.close();
    },
  };
}

export function defaultDbFile(env) {
  return path.resolve(env.DATA_DIR || path.join(process.cwd(), "data"), "dashboard.db");
}
