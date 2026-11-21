import { ReadTable } from "../components/ReadData";
import { session } from "../lib/session";
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
    body: "路由器拒绝了这个账号：密码已改、账号被禁用，或所在组缺少 api / rest-api 权限。请重新登录。连续失败时登录会被暂时锁定一分钟，避免触发路由器的登录限制。",
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
      <ReadTable title="已安装包" rows={dash.packages()} fields={["name", "version", "disabled"]} />
      <section class="card mb-4 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="kicker">当前状态</p>
            <p class="mt-2 text-2xl font-semibold">{status()}</p>
            <p class="mt-1 text-sm text-muted">最近成功读取 {formatAgo(dash.updatedAt(), dash.now())}</p>
          </div>
          <button type="button" class="chip button-primary" onClick={() => dash.retry()}>
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
        <Field label="登录账号" value={`${session()?.user || "—"}（组 ${session()?.group || "未知"}）`} />
        <div>
          <p class="kicker">账号权限</p>
          <p class="mt-1 flex flex-wrap gap-1">
            {session()?.policiesKnown
              ? (session()?.policies ?? []).map((policy) => <span class="policy-chip">{policy}</span>)
              : <span class="text-sm text-muted">该账号读不到自己的组，按钮照常显示，由路由器决定是否允许。</span>}
          </p>
        </div>
        <Field label="后台采样账号" value={dash.meta()?.serviceAccount ? ".env 中已配置" : "未配置，使用当前登录的账号"} />
        <Field label="证书校验" value={dash.meta()?.tlsInsecure ? "已跳过（仅建议用于局域网自签证书）" : "严格"} />
        <Field label="广域网接口" value={(dash.meta()?.wanInterfaces ?? ["liantong", "ether0"]).join("、")} />
        <Field label="局域网接口" value={(dash.meta()?.lanInterfaces ?? ["bridge1"]).join("、")} />
      </section>
      <div class="grid gap-3 md:grid-cols-2">
        {CARDS.map((card) => {
          const on = () => code() != null && card.codes.includes(code() || "");
          return (
            <article class={on() ? "card p-5 shadow-[inset_0_0_0_1px_rgba(255,77,79,0.45)]" : "card p-5"}>
              <h2 class="font-semibold">{card.title}</h2>
              <p class="mt-2 text-sm text-muted">{card.body}</p>
            </article>
          );
        })}
      </div>
      <section class="card mt-4 p-5">
        <h2 class="font-semibold">可修改的菜单</h2>
        <p class="mt-2 text-sm text-muted">
          页面用你登录的 RouterOS 账号访问路由器。账号所在组有 <span class="policy-chip">write</span> 才能修改，有{" "}
          <span class="policy-chip">reboot</span> 才能重启；路由器也会再按账号权限检查一次。仪表只会修改下面这些菜单，用户、脚本、文件、证书、导入导出等一律拒绝。
        </p>
        <ul class="mt-3 grid gap-1 font-mono text-xs text-muted sm:grid-cols-2">
          {(dash.meta()?.writeMenus ?? []).map((path) => (
            <li>{path.replace(/^\/rest/, "") || "/"}</li>
          ))}
        </ul>
        <h2 class="mt-6 font-semibold">允许读取的路径</h2>
        <ul class="mt-3 grid gap-1 font-mono text-xs text-muted sm:grid-cols-2">
          {(dash.meta()?.allowedPaths ?? []).map((path) => (
            <li>{path.replace(/^\/rest/, "")}</li>
          ))}
        </ul>
        <p class="mt-4 text-sm text-muted">
          要改路由器地址等服务端设置，编辑 N100 上的 <span class="font-mono">.env</span>，然后执行{" "}
          <span class="font-mono">docker compose up -d</span>。
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
