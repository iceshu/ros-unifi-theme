/** Feature module: admin — terminal, users/groups CRUD, audit log. */
import { registerDemo } from "../demo.mjs";

const ALL_POLICIES = ["local","telnet","ssh","ftp","reboot","read","write","policy","test","winbox","password","web","sniff","sensitive","api","romon","rest-api"];

registerDemo("/rest/user", () => [
  { ".id": "*1", name: "admin", group: "full", address: "", comment: "主管理员", disabled: "false", "last-logged-in": "2026-11-20 08:00:00" },
  { ".id": "*2", name: "viewer", group: "read-only", address: "192.168.88.0/24", comment: "只读账号", disabled: "false", "last-logged-in": "2026-11-19 14:30:00" },
  { ".id": "*3", name: "api-user", group: "api-only", address: "", comment: "API 专用", disabled: "false", "last-logged-in": "never" },
], { kind: "table", defaults: { disabled: "false", address: "", comment: "", "last-logged-in": "never" } });

registerDemo("/rest/user/group", () => [
  { ".id": "*1", name: "full", policy: "local,telnet,ssh,ftp,reboot,read,write,policy,test,winbox,password,web,sniff,sensitive,api,romon,rest-api", skin: "default", comment: "" },
  { ".id": "*2", name: "read-only", policy: "local,telnet,ssh,ftp,read,winbox,web,api,rest-api,!reboot,!write,!policy,!test,!password,!sniff,!sensitive,!romon", skin: "default", comment: "只读" },
  { ".id": "*3", name: "api-only", policy: "api,rest-api,read,!local,!telnet,!ssh,!ftp,!reboot,!write,!policy,!test,!winbox,!password,!web,!sniff,!sensitive,!romon", skin: "default", comment: "API 访问" },
], { kind: "table", defaults: { skin: "default", comment: "" } });

registerDemo("/rest/user/active", () => [
  { ".id": "*A1", user: "admin", address: "192.168.88.100", via: "web", when: "2026-11-20 10:00:00" },
], { kind: "table" });

function demoOutput(command) {
  const cmd = command.trim();
  const low = cmd.toLowerCase();
  if (low.includes("/system resource print") || low.includes("/system/resource print")) {
    return `uptime: 13d2h15m20s\nversion: 7.16.2 (stable)\nboard-name: RB750Gr3\nplatform: MikroTik\ncpu: MIPS 24Kc V7.4\ncpu-count: 1\ncpu-load: 4\nfree-memory: 55.8MiB\ntotal-memory: 64.0MiB\nhdd-usage: 12%\nfree-hdd-space: 115.5MiB\ntotal-hdd-space: 128.0MiB\narchitecture-name: mipsbe\nbuild-time: Dec/02/2026 12:00:00\nfactory-firmware: 7.14`;
  }
  if (low.includes("/ip address print") || low.includes("/ip/address print")) {
    return `Flags: D - DYNAMIC\n Columns: ADDRESS, NETWORK, INTERFACE\n#   ADDRESS            NETWORK        INTERFACE\n0   192.168.88.1/24    192.168.88.0   bridge1\n1   10.9.0.1/24        10.9.0.0       wg0\n2 D 100.64.1.5/32      100.64.1.0     liantong`;
  }
  const putMatch = cmd.match(/^:put\s+(.*)/i);
  if (putMatch) return putMatch[1].replace(/^["']|["']$/g, "");
  return "演示模式不执行命令";
}

/** CSV cell; cells that spreadsheets would evaluate as formulas get a leading apostrophe. */
export function csvEscape(val) {
  let s = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Terminal commands are audited; hide values of secret-looking arguments (password=…, secret=…, *-key=…, passphrase=…). */
export function redactCommand(command) {
  return command.replace(/\b((?:[\w-]*(?:password|secret|key)|passphrase)\s*=\s*)("(?:[^"\\]|\\.)*"|\S+)/gi, "$1***");
}

/** Build a RouterOS policy string from arrays of enabled and all policy names. */
export function buildPolicyString(enabled, all = ALL_POLICIES) {
  return all.map((p) => (enabled.includes(p) ? p : `!${p}`)).join(",");
}

/** Parse a RouterOS policy string into the set of enabled policy names. */
export function parsePolicyString(policy) {
  if (!policy) return new Set();
  return new Set(
    policy.split(",").flatMap((p) => {
      const trimmed = p.trim();
      return trimmed.startsWith("!") ? [] : [trimmed];
    }),
  );
}

export function create(app) {
  return {
    reads: ["/rest/user", "/rest/user/group", "/rest/user/active"],
    writes: {
      "/rest/user": {
        create: ["name", "group", "password", "address", "comment", "disabled"],
        update: ["group", "password", "address", "comment", "disabled"],
        remove: true,
        policy: "policy",
      },
      "/rest/user/group": {
        create: ["name", "policy", "comment"],
        update: ["name", "policy", "comment"],
        remove: true,
        policy: "policy",
      },
    },
    routes: [
      {
        method: "POST",
        path: "/api/terminal",
        policy: "write",
        async handle(ctx) {
          const command = typeof ctx.body.command === "string" ? ctx.body.command.trim() : "";
          if (!command) {
            ctx.send(400, { code: "bad_input", message: "命令不能为空。" });
            return;
          }
          if (command.length > 4096) {
            ctx.send(400, { code: "too_long", message: "命令超过 4096 字符。" });
            return;
          }
          const detail = redactCommand(command).slice(0, 500);
          if (ctx.demo) {
            const output = demoOutput(command);
            ctx.audit({ action: "POST", target: "/rest/execute", status: 200, outcome: "ok", detail });
            ctx.send(200, { output });
            return;
          }

          try {
            const result = await ctx.router("POST", "/rest/execute", { script: command, "as-string": "" }, 55000);
            const output = result?.ret ?? "";
            ctx.audit({ action: "POST", target: "/rest/execute", status: 200, outcome: "ok", detail });
            ctx.send(200, { output: String(output) });
          } catch (error) {
            ctx.audit({ action: "POST", target: "/rest/execute", status: error.status ?? 500, outcome: "error", detail });
            ctx.send(error.status ?? 500, { code: error.code ?? "router_error", message: error.message ?? "命令执行失败" });
          }
        },
      },
      {
        method: "GET",
        path: "/api/audit",
        async handle(ctx) {
          const limit = Math.min(500, Math.max(1, Number(ctx.url.searchParams.get("limit") ?? "100") || 100));
          const before = ctx.url.searchParams.get("before");
          const user = ctx.url.searchParams.get("user") || "";
          const outcome = ctx.url.searchParams.get("outcome") || "";
          const q = ctx.url.searchParams.get("q") || "";

          let sql = "SELECT id, t, user, ip, action, target, status, outcome, detail FROM audit WHERE 1=1";
          const params = [];
          if (before) {
            sql += " AND t < ?";
            params.push(Number(before));
          }
          if (user) {
            sql += " AND user = ?";
            params.push(user);
          }
          if (outcome) {
            sql += " AND outcome = ?";
            params.push(outcome);
          }
          if (q) {
            const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
            sql += " AND (action LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' OR user LIKE ? ESCAPE '\\')";
            params.push(like, like, like, like);
          }
          sql += " ORDER BY t DESC, id DESC LIMIT ?";
          params.push(limit);

          const rows = ctx.db.raw.prepare(sql).all(...params);
          ctx.send(200, rows);
        },
      },
      {
        method: "GET",
        path: "/api/audit/export",
        async handle(ctx) {
          const user = ctx.url.searchParams.get("user") || "";
          const outcome = ctx.url.searchParams.get("outcome") || "";
          const q = ctx.url.searchParams.get("q") || "";

          let sql = "SELECT id, t, user, ip, action, target, status, outcome, detail FROM audit WHERE 1=1";
          const params = [];
          if (user) {
            sql += " AND user = ?";
            params.push(user);
          }
          if (outcome) {
            sql += " AND outcome = ?";
            params.push(outcome);
          }
          if (q) {
            const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
            sql += " AND (action LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' OR user LIKE ? ESCAPE '\\')";
            params.push(like, like, like, like);
          }
          sql += " ORDER BY t DESC, id DESC LIMIT 10000";

          const rows = ctx.db.raw.prepare(sql).all(...params);

          const header = ["时间", "用户", "IP", "操作", "目标", "结果", "状态码", "详情"];
          const lines = [header.map(csvEscape).join(",")];
          for (const row of rows) {
            const dt = new Date(row.t);
            lines.push(
              [
                csvEscape(Number.isFinite(dt.getTime()) ? dt.toISOString().replace("T", " ").slice(0, 19) : ""),
                csvEscape(row.user),
                csvEscape(row.ip),
                csvEscape(row.action),
                csvEscape(row.target),
                csvEscape(row.outcome),
                csvEscape(row.status),
                csvEscape(row.detail),
              ].join(","),
            );
          }

          const csv = "\uFEFF" + lines.join("\r\n");
          ctx.res.setHeader("Content-Type", "text/csv; charset=utf-8");
          ctx.res.setHeader("Content-Disposition", `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
          ctx.res.statusCode = 200;
          ctx.res.end(csv);
        },
      },
    ],
  };
}
