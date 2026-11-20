import { createMemo, For, Show } from "solid-js";
import { ReadTable } from "../components/ReadData";
import { createTableSort, SortHeader } from "../components/TableSort";
import { EmptyState, PageHeader, Pill, RateText } from "../components/ui";
import { EnableSwitch } from "../components/form";
import { formatBytes } from "../lib/format";
import { compareName, flag, ifaceRole, linkState, num, roleLabel, typeLabel, type Role, type RosRecord } from "../lib/model";
import { useDashboard, type HistoryPoint } from "../lib/store";

/** UniFi colours a port by negotiated speed. */
function speedTone(row: RosRecord, speed: string | undefined): { color: string; label: string } {
  if (flag(row.disabled)) return { color: "var(--color-faint)", label: "已禁用" };
  if (!flag(row.running)) return { color: "var(--link-idle)", label: "未连接" };
  const mbps = speed ? Number.parseFloat(speed) * (/G/i.test(speed) ? 1000 : /M/i.test(speed) ? 1 : 0.001) : 0;
  if (mbps >= 2500) return { color: "var(--color-accent)", label: speed || "" };
  if (mbps >= 1000) return { color: "var(--color-good)", label: speed || "" };
  if (mbps > 0) return { color: "var(--color-warn)", label: speed || "" };
  return { color: "var(--color-good)", label: "运行中" };
}

function Rj45() {
  return (
    <svg viewBox="0 0 44 36" aria-hidden="true">
      <rect x="1" y="1" width="42" height="34" rx="5" fill="currentColor" opacity="0.14" />
      <path d="M8 8h28v14h-5v5h-4v3H17v-3h-4v-5H8z" fill="currentColor" />
      <g fill="var(--color-panel)" opacity="0.85">
        <rect x="12" y="10" width="2" height="5" rx="0.5" />
        <rect x="16" y="10" width="2" height="5" rx="0.5" />
        <rect x="20" y="10" width="2" height="5" rx="0.5" />
        <rect x="24" y="10" width="2" height="5" rx="0.5" />
        <rect x="28" y="10" width="2" height="5" rx="0.5" />
      </g>
    </svg>
  );
}

function Spark(props: { points: HistoryPoint[] }) {
  const paths = createMemo(() => {
    const points = props.points.slice(-40);
    if (points.length < 2) return null;
    const max = Math.max(1, ...points.map((point) => Math.max(point.rxBps, point.txBps)));
    const line = (key: "rxBps" | "txBps") =>
      points.map((point, index) => `${index ? "L" : "M"}${((index / (points.length - 1)) * 100).toFixed(1)} ${(22 - (point[key] / max) * 20).toFixed(1)}`).join("");
    return { rx: line("rxBps"), tx: line("txBps") };
  });
  return (
    <Show when={paths()} fallback={<span class="text-faint">—</span>}>
      {(p) => (
        <svg viewBox="0 0 100 24" preserveAspectRatio="none" class="h-6 w-28" aria-hidden="true">
          <path d={p().rx} fill="none" stroke="var(--color-accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <path d={p().tx} fill="none" stroke="var(--color-upload)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        </svg>
      )}
    </Show>
  );
}

export function InterfacesPage() {
  const dash = useDashboard();
  const sorting = createTableSort<RosRecord>();
  const roleOf = (row: RosRecord): Role => ifaceRole(row, dash.wanNames(), dash.lanNames(), dash.listMembers(), dash.bridgePorts());
  const speedOf = createMemo(() => new Map(dash.ethernet().map((row) => [row.name, row.speed])));
  const bridgeOf = createMemo(() => new Map(dash.bridgePorts().map((row) => [row.interface, row.bridge])));
  const clientsOn = createMemo(() => {
    const counts = new Map<string, number>();
    for (const client of dash.clients()) if (client.port && client.online) counts.set(client.port, (counts.get(client.port) ?? 0) + 1);
    return counts;
  });
  const ordered = createMemo(() =>
    [...dash.interfaces()].sort((a, b) => {
      const rank = { wan: 0, lan: 1, other: 2 };
      return rank[roleOf(a)] - rank[roleOf(b)] || compareName(a.name || "", b.name || "");
    }),
  );
  const sorted = () =>
    sorting.rows(ordered(), (row, key) =>
      key === "role" ? roleLabel(roleOf(row)) : key === "rx" ? dash.rates()[row.name]?.rxBps : key === "tx" ? dash.rates()[row.name]?.txBps : key === "type" ? typeLabel(row.type) : row.name,
    );
  const ethers = createMemo(() => dash.interfaces().filter((row) => row.type === "ether").sort((a, b) => compareName(a.name, b.name)));
  const selectedName = () => {
    const selection = dash.selection();
    return selection?.type === "iface" ? selection.name : "";
  };
  const errors = (row: RosRecord) =>
    (num(row["rx-error"]) ?? 0) + (num(row["tx-error"]) ?? 0) + (num(row["rx-drop"]) ?? 0) + (num(row["tx-drop"]) ?? 0);

  return (
    <div>
      <PageHeader title="端口" subtitle={`${ethers().filter((row) => flag(row.running)).length} / ${ethers().length} 个以太网口已连接 · 点击端口查看流量与详情`} />

      <Show when={ethers().length > 0}>
        <section class="card mb-4 p-4">
          <div class="faceplate">
            <For each={ethers()} keyed={(row) => row.name}>
              {(row) => {
                const tone = () => speedTone(row(), speedOf().get(row().name));
                const rate = () => dash.rates()[row().name];
                const role = () => roleOf(row());
                return (
                  <button
                    type="button"
                    class={`port ${selectedName() === row().name ? "is-selected" : ""}`}
                    style={{ "--port-color": tone().color }}
                    title={`${row().name} · ${linkState(row()).label}${row().comment ? ` · ${row().comment}` : ""}`}
                    onClick={() => dash.setSelection({ type: "iface", name: row().name })}
                  >
                    <span class="rj45">
                      <Rj45 />
                      {role() === "wan" ? <span class="absolute -top-1.5 -right-2 rounded bg-accent px-1 text-[9px] leading-[14px] font-semibold text-white">WAN</span> : null}
                      {clientsOn().get(row().name) ? (
                        <span class="absolute -bottom-1.5 -right-2 rounded-full bg-panel px-1 text-[10px] leading-[14px] font-semibold text-muted shadow">{clientsOn().get(row().name)}</span>
                      ) : null}
                    </span>
                    <span class="port-name">{row().name}</span>
                    <span class="port-meta" title={row().comment}>{row().comment || bridgeOf().get(row().name) || roleLabel(role())}</span>
                    <span class="port-rate">
                      <span class="block rate-down">↓ {rateShort(rate()?.txBps)}</span>
                      <span class="block rate-up">↑ {rateShort(rate()?.rxBps)}</span>
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
          <div class="port-legend mt-3">
            <span><i style={{ background: "var(--color-accent)" }} />2.5G 以上</span>
            <span><i style={{ background: "var(--color-good)" }} />1G</span>
            <span><i style={{ background: "var(--color-warn)" }} />100M 及以下</span>
            <span><i style={{ background: "var(--link-idle)" }} />未连接</span>
            <span class="text-faint">↓ 发往该口设备 · ↑ 来自该口设备</span>
          </div>
        </section>
      </Show>

      <Show when={ordered().length > 0} fallback={<EmptyState title={dash.ready() ? "没有接口" : "正在读取"} />}>
        <section class="card table-wrap mb-4">
          <table class="data-table">
            <thead>
              <tr>
                <SortHeader column="name" state={sorting.sort()} toggle={sorting.toggle}>接口</SortHeader>
                <SortHeader column="role" state={sorting.sort()} toggle={sorting.toggle}>角色</SortHeader>
                <th>状态</th>
                <SortHeader column="rx" state={sorting.sort()} toggle={sorting.toggle}>接收</SortHeader>
                <SortHeader column="tx" state={sorting.sort()} toggle={sorting.toggle}>发送</SortHeader>
                <th>最近趋势</th>
                <th>累计</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              <For each={sorted()} keyed={(row) => row[".id"] || row.name}>
                {(row) => {
                  const role = () => roleOf(row());
                  const rate = () => dash.rates()[row().name];
                  return (
                    <tr
                      class={`is-clickable ${flag(row().disabled) ? "is-dim" : ""} ${selectedName() === row().name ? "is-selected" : ""}`}
                      tabindex={0}
                      onClick={() => dash.setSelection({ type: "iface", name: row().name })}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          dash.setSelection({ type: "iface", name: row().name });
                        }
                      }}
                    >
                      <td>
                        <div class="flex items-center gap-2.5">
                          <i class={`led led-${linkState(row()).tone}`} />
                          <div class="min-w-0">
                            <div class="font-medium">{row().name}</div>
                            <div class="truncate text-[12px] text-faint">
                              {typeLabel(row().type)}
                              {row().comment ? ` · ${row().comment}` : ""}
                              {speedOf().get(row().name) && flag(row().running) ? ` · ${speedOf().get(row().name)}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Pill tone={role() === "wan" ? "accent" : role() === "lan" ? "good" : "muted"}>{roleLabel(role())}</Pill>
                      </td>
                      <td class="whitespace-nowrap">
                        <Pill tone={linkState(row()).tone}>{linkState(row()).label}</Pill>
                        <span class="ml-2 align-middle" onClick={(event) => event.stopPropagation()}>
                          <EnableSwitch menu="/rest/interface" row={row()} label={row().name} confirm="禁用接口会立即断开经过它的连接。如果你正通过这个口访问路由器，页面会失联。" />
                        </span>
                      </td>
                      <td><RateText bps={rate()?.rxBps} /></td>
                      <td><RateText bps={rate()?.txBps} /></td>
                      <td><Spark points={dash.history()[row().name] ?? []} /></td>
                      <td class="whitespace-nowrap text-[12px] text-muted num">
                        <div>收 {formatBytes(row()["rx-byte"])}</div>
                        <div>发 {formatBytes(row()["tx-byte"])}</div>
                      </td>
                      <td class={errors(row()) > 0 ? "text-warn num" : "text-faint num"}>{errors(row())}</td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </section>
      </Show>
      <ReadTable title="VLAN" rows={dash.vlans()} fields={["name", "interface", "vlan-id", "mtu", "running", "disabled"]} />
    </div>
  );
}

function rateShort(bps: number | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return "—";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)}G`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(bps >= 1e8 ? 0 : 1)}M`;
  if (bps >= 1e3) return `${Math.round(bps / 1e3)}K`;
  return `${Math.round(bps)}`;
}
