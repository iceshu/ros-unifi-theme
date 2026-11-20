import http from "node:http";
import { createHandler, loadEnvFile, parseBool, normalizeRouterHost } from "./ros-proxy.mjs";
import { createHistory } from "./history.mjs";

loadEnvFile();

const port = Number(process.env.PORT || 8080);
const bind = process.env.BIND_HOST || "0.0.0.0";
const historyEnabled = parseBool(process.env.HISTORY_ENABLED ?? "true");
const history = historyEnabled ? createHistory(process.env) : null;
if (history) history.start();
const handler = createHandler(process.env, { history: history ?? undefined });
const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res))
    .then((handled) => {
      if (!handled && !res.writableEnded) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ code: "not_found", message: "没有这个页面。" }));
      }
    })
    .catch((error) => {
      console.error("[ros] unhandled", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ code: "proxy_error", message: "代理内部错误" }));
      }
    });
});

server.requestTimeout = 30_000;
server.headersTimeout = 20_000;

server.listen(port, bind, () => {
  let host = process.env.ROUTEROS_HOST || "http://192.168.2.1";
  try {
    host = normalizeRouterHost(host);
  } catch {
    host = "(无效的 ROUTEROS_HOST)";
  }
  console.log(
    `[ros] listening on ${bind}:${port} demo=${parseBool(process.env.DEMO_MODE)} host=${host}`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
