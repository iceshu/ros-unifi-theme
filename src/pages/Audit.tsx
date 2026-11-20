import { Download, Search } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { useLoad } from "../lib/useRos";
import { PageHeader, Pill } from "../components/ui";

interface AuditRow {
  id: number;
  t: number;
  user: string;
  ip: string;
  action: string;
  target: string;
  status: number;
  outcome: string;
  detail: string;
}

const ACTION_LABELS: Record<string, string> = {
  login: "登录",
  PUT: "新建",
  PATCH: "修改",
  DELETE: "删除",
  POST: "执行",
  GET: "读取",
};

const TARGET_LABELS: Record<string, string> = {
  "/rest/ip/address": "IP 地址",
  "/rest/ip/route": "路由",
  "/rest/ip/firewall/filter": "防火墙规则",
  "/rest/ip/firewall/nat": "NAT",
  "/rest/ip/firewall/mangle": "Mangle",
  "/rest/ip/firewall/address-list": "地址列表",
  "/rest/ip/dhcp-server": "DHCP 服务",
  "/rest/ip/dhcp-server/lease": "DHCP 租约",
  "/rest/ip/dns": "DNS",
  "/rest/ip/dns/static": "DNS 静态记录",
  "/rest/interface": "接口",
  "/rest/interface/bridge": "网桥",
  "/rest/interface/bridge/port": "网桥端口",
  "/rest/interface/vlan": "VLAN",
  "/rest/interface/list": "接口列表",
  "/rest/interface/list/member": "接口列表成员",
  "/rest/interface/wifi": "Wi-Fi",
  "/rest/interface/wireguard": "WireGuard",
  "/rest/interface/wireguard/peers": "WireGuard 对端",
  "/rest/queue/simple": "队列",
  "/rest/system/identity": "主机名",
  "/rest/system": "系统",
  "/rest/execute": "终端命令",
  "/rest/user": "用户",
  "/rest/user/group": "用户组",
};

const OUTCOME_TONES: Record<string, "good" | "bad" | "warn" | "muted"> = {
  ok: "good",
  error: "bad",
  denied: "warn",
  blocked: "warn",
  pending: "muted",
};

const OUTCOME_LABELS: Record<string, string> = {
  ok: "成功",
  error: "错误",
  denied: "拒绝",
  blocked: "锁定",
  pending: "执行中",
};

function formatTime(t: number): string {
  if (!t) return "—";
  return new Date(t).toLocaleString("zh-CN", { hour12: false });
}

function targetLabel(target: string): string {
  for (const [prefix, label] of Object.entries(TARGET_LABELS)) {
    if (target === prefix || target.startsWith(prefix + "/") || target.startsWith(prefix + " ")) {
      return label;
    }
  }
  return target || "—";
}

export function AuditPage() {
  const [userFilter, setUserFilter] = createSignal("");
  const [outcomeFilter, setOutcomeFilter] = createSignal("");
  const [q, setQ] = createSignal("");

  const queryUrl = () => {
    const params = new URLSearchParams({ limit: "200" });
    if (userFilter()) params.set("user", userFilter());
    if (outcomeFilter()) params.set("outcome", outcomeFilter());
    if (q()) params.set("q", q());
    return `/api/audit?${params}`;
  };

  const { data, error, loaded } = useLoad<AuditRow[]>(() => queryUrl());
  const rows = () => data() ?? [];

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (userFilter()) params.set("user", userFilter());
    if (outcomeFilter()) params.set("outcome", outcomeFilter());
    if (q()) params.set("q", q());
    const qs = params.toString();
    return `/api/audit/export${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader title="操作审计" subtitle="记录所有对路由器的写操作和登录行为">
        <a
          href={exportUrl()}
          download
          class="btn flex items-center gap-1.5"
          title="导出 CSV"
        >
          <Download class="h-3.5 w-3.5" aria-hidden="true" />
          导出 CSV
        </a>
      </PageHeader>

      {/* Filters */}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            class="input pl-8 text-[13px]"
            placeholder="搜索用户、目标、详情…"
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </div>
        <input
          class="input w-36 text-[13px]"
          placeholder="用户名"
          value={userFilter()}
          onInput={(e) => setUserFilter(e.currentTarget.value)}
        />
        <select
          class="input w-28 text-[13px]"
          value={outcomeFilter()}
          onChange={(e) => setOutcomeFilter(e.currentTarget.value)}
        >
          <option value="">全部结果</option>
          <option value="ok">成功</option>
          <option value="error">错误</option>
          <option value="denied">拒绝</option>
          <option value="blocked">锁定</option>
        </select>
      </div>

      <section class="card overflow-hidden">
        <Show
          when={loaded()}
          fallback={<div class="p-6 text-center text-[13px] text-muted">加载中…</div>}
        >
          <Show when={error()}>
            <div class="p-4 text-[13px] text-[var(--color-bad)]">{error()}</div>
          </Show>
          <Show
            when={rows().length > 0}
            fallback={<div class="p-6 text-center text-[13px] text-muted">没有符合条件的记录</div>}
          >
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>用户</th>
                    <th>IP</th>
                    <th>操作</th>
                    <th>目标</th>
                    <th>结果</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={rows()}>
                    {(row) => (
                      <tr>
                        <td class="whitespace-nowrap font-mono text-[12px] text-faint">
                          {formatTime(row.t)}
                        </td>
                        <td class="font-mono font-medium">{row.user}</td>
                        <td class="font-mono text-faint">{row.ip || "—"}</td>
                        <td>
                          <span class="pill pill-muted">
                            {ACTION_LABELS[row.action] ?? row.action}
                          </span>
                        </td>
                        <td class="text-[13px]">{targetLabel(row.target)}</td>
                        <td>
                          <Pill tone={OUTCOME_TONES[row.outcome] ?? "muted"}>
                            {OUTCOME_LABELS[row.outcome] ?? row.outcome}
                          </Pill>
                        </td>
                        <td class="max-w-xs truncate font-mono text-[12px] text-faint" title={row.detail}>
                          {row.detail || "—"}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </section>
    </div>
  );
}
