import { createSessions, sessionTtlMs } from "./auth.mjs";
import { createHistory, envCredentials } from "./history.mjs";
import { createHandler, parseBool } from "./ros-proxy.mjs";

/**
 * Wires the proxy, the login sessions and the throughput sampler the same way
 * for production (server/index.mjs) and `vite` dev. The sampler reads with the
 * optional .env service account, otherwise with the most recently active
 * logged-in session, and pauses when nobody is logged in.
 */
export function createApp(env, { staticDir } = {}) {
  const sessions = createSessions({ ttlMs: sessionTtlMs(env) });
  const history = parseBool(env.HISTORY_ENABLED ?? "true")
    ? createHistory(env, {
        credentials: () => {
          const service = envCredentials(env);
          if (service) return service;
          const session = sessions.latest();
          return session ? { user: session.user, password: session.password } : null;
        },
      })
    : undefined;
  const handler = createHandler(env, { staticDir, history, sessions });
  return {
    handler,
    start: () => history?.start(),
    stop: () => history?.stop(),
  };
}
