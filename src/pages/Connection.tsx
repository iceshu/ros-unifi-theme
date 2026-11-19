import { formatAgo } from "../lib/format";
import { useDashboard } from "../lib/store";

const CARDS = [
  {
    id: "www",
    title: "www 没开，或返回的不是 REST",
    codes: ["refused", "not_rest", "not_found"],
    body: "连接被拒绝，多半是 www / www-ssl 没启用，或地址端口不对。仪表不会替你打开服务。纯 HTTP 的 www 需要 RouterOS 7.9 及以上；更早的 7.x 请用 www-ssl。",
  },
  {
    id: "auth",
    title: "认证失败",
    codes: ["auth", "not_configured", "creds_in_host"],
    body: "检查 .env 里的用户名和密码。用户需要 read 和 rest-api 权限。密码不要写进 ROUTEROS_HOST。连续失败时页面会放慢重试，避免把路由器的登录限制打满。",
  },
  {
    id: "net",
    title: "主机不可达",
    codes: ["unreachable", "timeout", "dns", "network", "reset"],
    body: "N100 到路由器之间不通，或请求超时。确认地址是 192.168.2.1（或你实际的网关），并且两台机器在同一局域网或有路由。",
  },
  {
    id: "tls",
    title: "证书不受信任",
    codes: ["tls"],
    body: "www-ssl 的自签证书很常见。只在你信任这台局域网路由器时，把 ROUTEROS_TLS_INSECURE 设为 true。这不能当成把页面暴露到公网的理由。",
  },
];

export function ConnectionPage() {
  const dash = useDashboard();
  const code = () => dash.error()?.code;
  const status = () => {
    if (dash.meta()?.demo) return "演示模式";
    if (!dash.ready()) return "正在连接";
    if (dash.error()) return "未连上";
    return "已连上";
  };

  return (
    <div>
      <h1 class="mb-3 text-lg font-medium tracking-tight">连接</h1>
      <section class="card mb-4 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="kicker">当前状态</p>
            <p class="mt-2 text-2xl font-semibold">{status()}</p>
            <p class="mt-1 text-sm text-muted">最近成功读取 {formatAgo(dash.updatedAt(), dash.now())}</p>
          </div>
          <button type="button" class="chip" onClick={() => dash.retry()}>
            立即重试
          </button>
        </div>
        {dash.error() ? <p class="mt-4 text-sm text-bad">{dash.error()?.message}</p> : null}
        {dash.meta()?.hostError ? (
          <p class="mt-3 text-sm text-warn">ROUTEROS_HOST 无法解析：{dash.meta()?.hostError}</p>
        ) : null}
      </section>
      <section class="card mb-4 grid gap-4 p-5 md:grid-cols-2">
        <Field label="路由器" value={dash.meta()?.host || "—"} />
        <Field label="用户" value={dash.meta()?.user || "未配置"} />
        <Field label="密码" value={dash.meta()?.passwordConfigured ? "已在服务端配置" : "未配置"} />
        <Field label="证书校验" value={dash.meta()?.tlsInsecure ? "已跳过（仅建议用于局域网自签证书）" : "严格"} />
        <Field label="广域网接口" value={(dash.meta()?.wanInterfaces ?? ["liantong", "ether0"]).join("、")} />
        <Field label="局域网接口" value={(dash.meta()?.lanInterfaces ?? ["bridge1"]).join("、")} />
      </section>
      <div class="grid gap-3 md:grid-cols-2">
        {CARDS.map((card) => {
          const on = () => code() != null && card.codes.includes(code() || "");
          return (
            <article class={on() ? "card p-5 shadow-[inset_0_0_0_1px_rgba(255,93,115,0.45)]" : "card p-5"}>
              <h2 class="font-semibold">{card.title}</h2>
              <p class="mt-2 text-sm text-muted">{card.body}</p>
            </article>
          );
        })}
      </div>
      <section class="card mt-4 p-5">
        <h2 class="font-semibold">代理允许读取的路径</h2>
        <p class="mt-2 text-sm text-muted">其它路径会直接拒绝，包括用户、脚本、导出和 monitor-traffic。写方法一律返回 405。</p>
        <ul class="mt-3 grid gap-1 font-mono text-xs text-muted sm:grid-cols-2">
          {(dash.meta()?.allowedPaths ?? []).map((path) => (
            <li>{path}</li>
          ))}
        </ul>
        <p class="mt-4 text-sm text-muted">
          要改地址或密码，编辑 N100 上的 <span class="font-mono">.env</span>，然后执行{" "}
          <span class="font-mono">docker compose up -d</span>。改完才会生效。
        </p>
      </section>
    </div>
  );
}

function Field(props: { label: string; value: string }) {
  return (
    <div>
      <p class="kicker">{props.label}</p>
      <p class="mt-1 break-all font-mono text-sm">{props.value}</p>
    </div>
  );
}
