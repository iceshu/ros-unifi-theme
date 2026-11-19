import { createMemo, For } from "solid-js";
import { EmptyState, PageHeader, Pill, RateText } from "../components/ui";
import { formatBytes } from "../lib/format";
import {
  compareName,
  flag,
  ifaceRole,
  linkState,
  num,
  roleLabel,
  typeLabel,
  type Role,
  type RosRecord,
} from "../lib/model";
import { useDashboard } from "../lib/store";

export function InterfacesPage() {
  const dash = useDashboard();
  const roleOf = (row: RosRecord): Role =>
    ifaceRole(row, dash.wanNames(), dash.lanNames(), dash.listMembers(), dash.bridgePorts());
  const ordered = createMemo(() =>
    [...dash.interfaces()].sort((a, b) => {
      const rank = { wan: 0, lan: 1, other: 2 };
      const byRole = rank[roleOf(a)] - rank[roleOf(b)];
      if (byRole) return byRole;
      return compareName(a.name || "", b.name || "");
    }),
  );
  const ethers = createMemo(() =>
    dash
      .interfaces()
      .filter((row) => row.type === "ether")
      .sort((a, b) => compareName(a.name || "", b.name || "")),
  );
  const speedOf = createMemo(() => {
    const map = new Map<string, string>();
    for (const row of dash.ethernet()) if (row.name && row.speed) map.set(row.name, row.speed);
    return map;
  });
  const bridgeOf = createMemo(() => {
    const map = new Map<string, string>();
    for (const row of dash.bridgePorts()) if (row.interface && row.bridge) map.set(row.interface, row.bridge);
    return map;
  });

  return (
    <div>
      <PageHeader
        title="接口"
        description="运行状态、收发速率和错误计数。广域网默认是 liantong 与 ether0，局域网默认是 bridge1，也可以用环境变量改。"
      />
      {ethers().length > 0 ? (
        <section class="card mb-4 p-5">
          <p class="kicker mb-4">以太网口</p>
          <div class="flex gap-3 overflow-x-auto pb-1">
            <For each={ethers()}>
              {(row) => (
                <PortTile
                  row={row}
                  role={roleOf(row)}
                  speed={speedOf().get(row.name)}
                  bridge={bridgeOf().get(row.name)}
                />
              )}
            </For>
          </div>
        </section>
      ) : null}
      {ordered().length === 0 ? (
        <EmptyState title={dash.ready() ? "没有接口数据" : "正在读取接口"} detail="数据来自 GET /rest/interface。" />
      ) : (
        <div class="card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>接口</th>
                <th>角色</th>
                <th>状态</th>
                <th>接收</th>
                <th>发送</th>
                <th>累计</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              <For each={ordered()} keyed={(row) => row[".id"] || row.name}>
                {(row) => <IfaceRow name={row().name} role={roleOf(row())} />}
              </For>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PortTile(props: { row: RosRecord; role: Role; speed?: string; bridge?: string }) {
  const state = () => linkState(props.row);
  const led = () => (flag(props.row.disabled) ? "led-muted" : flag(props.row.running) ? "led-good" : "led-bad");
  return (
    <div class={`port ${props.role === "wan" ? "shadow-[inset_0_0_0_1px_rgba(74,163,255,0.45)]" : ""}`}>
      <div class="port-jack">
        <span class={`led ${led()}`} />
        <span class="text-[10px] text-faint">{props.speed || props.row.type}</span>
      </div>
      <div>
        <div class="font-medium">{props.row.name}</div>
        <div class="text-xs text-faint">{props.row.comment || props.bridge || roleLabel(props.role)}</div>
      </div>
      <Pill tone={state().tone}>{state().label}</Pill>
    </div>
  );
}

function IfaceRow(props: { name: string; role: Role }) {
  const dash = useDashboard();
  const row = createMemo(() => dash.interfaces().find((item) => item.name === props.name));
  const rate = createMemo(() => dash.rates()[props.name]);
  const errors = createMemo(() => {
    const current = row();
    if (!current) return 0;
    return (
      (num(current["rx-error"]) ?? 0) +
      (num(current["tx-error"]) ?? 0) +
      (num(current["rx-drop"]) ?? 0) +
      (num(current["tx-drop"]) ?? 0)
    );
  });
  return (
    <tr class={props.role === "wan" ? "bg-accent/5" : ""}>
      <td>
        <div class="font-medium">{props.name}</div>
        <div class="text-xs text-faint">
          {typeLabel(row()?.type)}
          {row()?.comment ? ` · ${row()?.comment}` : ""}
        </div>
      </td>
      <td>
        <Pill tone={props.role === "wan" ? "accent" : props.role === "lan" ? "good" : "muted"}>{roleLabel(props.role)}</Pill>
      </td>
      <td>
        <Pill tone={linkState(row()).tone}>{linkState(row()).label}</Pill>
      </td>
      <td>
        <RateText bps={rate()?.rxBps} />
      </td>
      <td>
        <RateText bps={rate()?.txBps} />
      </td>
      <td class="text-sm text-muted">
        <div>收 {formatBytes(row()?.["rx-byte"])}</div>
        <div>发 {formatBytes(row()?.["tx-byte"])}</div>
      </td>
      <td class={errors() > 0 ? "text-warn" : "text-muted"}>{errors()}</td>
    </tr>
  );
}
