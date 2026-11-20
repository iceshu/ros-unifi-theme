import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createApp } from "./server/app.mjs";

function routerosDevProxy(env: Record<string, string | undefined>): Plugin {
  return {
    name: "routeros-dev-proxy",
    configureServer(server) {
      // Sampler only for `vite` dev, never during `vite build`.
      const app = createApp(env, { staticDir: false });
      app.start();
      server.httpServer?.once("close", () => app.stop());
      const handler = app.handler;
      // Same login + allowlist proxy as production. Registered before Vite's SPA
      // fallback so /rest and /api are not swallowed by index.html.
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url || "").split("?")[0] || "";
        if (!pathOnly.startsWith("/rest") && !pathOnly.startsWith("/api/")) {
          next();
          return;
        }
        Promise.resolve(handler(req, res))
          .then((handled) => {
            if (!handled) next();
          })
          .catch((error) => {
            console.error("[ros] dev proxy error", error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ code: "proxy_error", message: "代理内部错误" }));
            }
          });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };
  return {
    plugins: [solid(), tailwindcss(), routerosDevProxy(env)],
    server: {
      host: true,
      port: 5173,
    },
  };
});
