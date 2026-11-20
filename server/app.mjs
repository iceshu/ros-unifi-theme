import { EventEmitter } from "node:events";
import { createSessions, sessionTtlMs } from "./auth.mjs";
import { defaultDbFile, openDb } from "./db.mjs";
import { createGuard } from "./guard.mjs";
import { createHistory, envCredentials } from "./history.mjs";
import { createHandler, demoCall, parseBool, routerCall, routerRequest } from "./ros-proxy.mjs";
import * as admin from "./features/admin.mjs";
import * as alerts from "./features/alerts.mjs";
import * as insight from "./features/insight.mjs";
import * as maintenance from "./features/maintenance.mjs";
import * as netconf from "./features/netconf.mjs";
import * as system from "./features/system.mjs";

/** Feature modules: each exports create(app) → { reads?, writes?, routes?, start?(), stop?() }. */
const FEATURES = [alerts, maintenance, insight, netconf, system, admin];

/**
 * @typedef {object} App
 * @property {Record<string, string | undefined>} env
 * @property {boolean} demo
 * @property {ReturnType<typeof openDb>} db
 * @property {ReturnType<typeof createSessions>} sessions
 * @property {ReturnType<typeof createHistory> | undefined} history
 * @property {EventEmitter} bus  in-process events between features (e.g. "event" for alerts)
 * @property {(method: string, path: string, body?: unknown, opts?: { policies?: string[], timeout?: number }) => Promise<any>} service
 *   RouterOS call for background jobs: the .env service account, otherwise the most
 *   recently active logged-in session that holds `policies`. Throws code "no_account" when neither exists.
 * @property {(session: object, method: string, path: string, body?: unknown, timeout?: number) => Promise<any>} asSession
 */

/**
 * Wires the proxy, login sessions, persistence, lockout guards, background
 * sampler and feature modules the same way for production and `vite` dev.
 */
export function createApp(env, { staticDir, request = routerRequest, dbFile } = {}) {
  const demo = parseBool(env.DEMO_MODE);
  const sessions = createSessions({ ttlMs: sessionTtlMs(env) });
  const db = openDb(dbFile ?? defaultDbFile(env));
  const bus = new EventEmitter();

  const asSession = (session, method, path, body, timeout) =>
    demo
      ? demoCall(method, path, body)
      : routerCall({ env, request, user: session.user, password: session.password, method, path, body, timeout });

  const service = async (method, path, body, { policies = [], timeout } = {}) => {
    if (demo) return demoCall(method, path, body);
    const account = envCredentials(env);
    if (account) return routerCall({ env, request, ...account, method, path, body, timeout });
    const session = sessions.latest();
    if (!session || (session.policiesKnown && !policies.every((policy) => session.policies.includes(policy)))) {
      throw Object.assign(new Error("没有可用的 RouterOS 账号：请在 .env 配置 ROUTEROS_USER，或保持一个有权限的账号登录。"), {
        code: "no_account",
        status: 503,
      });
    }
    return routerCall({ env, request, user: session.user, password: session.password, method, path, body, timeout });
  };

  const history = parseBool(env.HISTORY_ENABLED ?? "true")
    ? createHistory(env, {
        request,
        credentials: () => {
          const account = envCredentials(env);
          if (account) return account;
          const session = sessions.latest();
          return session ? { user: session.user, password: session.password } : null;
        },
      })
    : undefined;

  /** @type {App} */
  const app = { env, demo, db, sessions, history, bus, service, asSession };
  const features = FEATURES.map((module) => module.create(app));
  const guard = createGuard({ env, read: (session, path) => asSession(session, "GET", path) });
  const handler = createHandler(env, { staticDir, request, history, sessions, features, db, guard });

  return {
    handler,
    app,
    start() {
      history?.start();
      for (const feature of features) feature.start?.();
    },
    stop() {
      history?.stop();
      for (const feature of features) feature.stop?.();
      db.close();
    },
  };
}
