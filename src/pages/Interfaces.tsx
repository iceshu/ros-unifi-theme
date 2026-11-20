import { createTableSort, SortHeader, useTableKeyboard } from "../components/TableSort";
import { WriteToggle } from "../components/WriteToggle";
import { createEffect, createMemo, createSignal, For, type Accessor } from "solid-js";
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
import { AllFields, ReadTable } from "../components/ReadData";
import { useDashboard } from "../lib/store";

export function InterfacesPage() {
  const dash = useDashboard();
  const escape = useTableKeyboard();
  const sorting = createTableSort<RosRecord>();
  const sorted = () => sorting.rows(ordered(), (row, key) => key === "role" ? roleLabel(roleOf(row)) : key === "rx" ? dash.rates()[row.name]?.rxBps : key === "tx" ? dash.rates()[row.name]?.txBps : row.name);
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
      <PageHeader title="接口" />
      {ethers().length > 0 ? (
        <section class="card mb-3 p-3">
          <div class="faceplate">
            <For each={ethers()} keyed={(row) => row.name}>
              {(row) => (
                <PortTile
                  row={row()}
                  role={roleOf(row())}
                  speed={speedOf().get(row().name)}
                  bridge={bridgeOf().get(row().name)}
                />
              )}
            </For>
            <For
              each={dash.interfaces().filter((row) => row.type === "pppoe-out" || row.type === "bridge")}
              keyed={(row) => row.name}
            >
              {(row) => <PortTile row={row()} role={roleOf(row())} />}
            </For>
          </div>
        </section>
      ) : null}
      {ordered().length === 0 ? (
        <EmptyState title={dash.ready() ? "没有接口" : "正在读取"} />
      ) : (
        <div class="card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <SortHeader column="name" state={sorting.sort()} toggle={sorting.toggle}>接口</SortHeader>
                <SortHeader column="role" state={sorting.sort()} toggle={sorting.toggle}>角色</SortHeader>
                <th>状态</th>
                <SortHeader column="rx" state={sorting.sort()} toggle={sorting.toggle}>接收</SortHeader>
                <SortHeader column="tx" state={sorting.sort()} toggle={sorting.toggle}>发送</SortHeader>
                <th>累计</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              <For each={sorted()} keyed={(row) => row[".id"] || row.name}>
                {(row) => <IfaceRow name={row().name} role={roleOf(row())} escape={escape} />}
              </For>
            </tbody>
          </table>
        </div>
      )}
      <div class="mt-4"><ReadTable title="VLAN" rows={dash.vlans()} fields={["name", "interface", "vlan-id", "mtu", "running", "disabled"]} /></div>
    </div>
  );
}

function PortTile(props: { row: RosRecord; role: Role; speed?: string; bridge?: string }) {
  const state = () => linkState(props.row);
  const led = () => (flag(props.row.disabled) ? "led-muted" : flag(props.row.running) ? "led-good" : "led-bad");
  return (
    <div class="jack">
      <span class={`led ${led()}`} />
      <div class="jack-name">{props.row.name}</div>
      <div class="jack-meta truncate">{props.row.comment || props.bridge || props.speed || roleLabel(props.role)}</div>
      <div class="text-[11px] text-faint">{state().label}</div>
    </div>
  );
}

function IfaceRow(props: { name: string; role: Role; escape: Accessor<number> }) {
  const [expanded, setExpanded] = createSignal(false);
  createEffect(() => props.escape(), () => { setExpanded(false); });
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
    <>
    <tr class={`${props.role === "wan" ? "row-wan" : ""} cursor-pointer`} onClick={() => setExpanded(!expanded())}>
      <td>
        <button type="button" class="font-medium" aria-expanded={expanded() ? "true" : "false"} onClick={(event) => { event.stopPropagation(); setExpanded(!expanded()); }}>{expanded() ? "▾" : "▸"} {props.name}</button>
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
        <WriteToggle path="/rest/interface" row={row()} />
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
    {expanded() ? <tr><td colspan={7}>
      <h3 class="text-xs text-faint">全部字段 · interface</h3><AllFields row={row() ?? {}} copy />
      {dash.ethernet().find((item) => item.name === props.name) ? <><h3 class="text-xs text-faint">全部字段 · ethernet</h3><AllFields row={dash.ethernet().find((item) => item.name === props.name)!} copy /></> : null}
    </td></tr> : null}
    </>
  );
}
