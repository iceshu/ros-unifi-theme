import { createMemo, createSignal, For } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { formatLastSeen } from "../lib/format";
import { DeviceIcon } from "../components/DeviceIcon";
import { EChart, chartColors, chartTooltip, type ChartOption } from "../components/charts";
import { arpStatusLabel, arpStatusTone, dhcpStatusLabel, dhcpStatusTone, ipSortKey, leaseIdentity, type DeviceKind, type RosRecord } from "../lib/model";
import { AllFields } from "../components/ReadData";
import { useDashboard } from "../lib/store";

const KIND_LABELS: Record<DeviceKind, string> = {
  phone: "手机 / 平板", laptop: "笔记本", server: "服务器", nas: "网络存储", ap: "无线接入点",
  camera: "摄像头", tv: "电视", console: "游戏主机", speaker: "音箱", printer: "打印机", generic: "其他设备",
};

type Filter = "all" | "bound" | "idle" | "reachable";

function macKey(value: string | undefined): string {
  return (value || "").toLowerCase();
}

function matches(parts: Array<string | undefined>, query: string): boolean {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  const blob = parts.filter(Boolean).join(" ").toLowerCase();
  const compact = raw.replace(/[:\-\s.]/g, "");
  return blob.includes(raw) || blob.replace(/[:\-\s.]/g, "").includes(compact);
}

export function DevicesPage() {
  const dash = useDashboard();
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<Filter>("all");
  const [kind, setKind] = createSignal<DeviceKind | null>(null);
  const distribution = createMemo(() => {
    const counts = new Map<DeviceKind, number>();
    for (const lease of dash.leases()) {
      const key = leaseIdentity(lease).kind;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  });
  const donutOption = createMemo<ChartOption>(() => ({
    color: [chartColors.download, chartColors.upload, chartColors.warn, chartColors.bad, chartColors.muted],
    tooltip: { ...chartTooltip, trigger: "item", formatter: "{b}：{c} 台（{d}%）" },
    legend: { type: "scroll", bottom: 0, textStyle: { color: chartColors.muted } },
    series: [{
      type: "pie", radius: ["45%", "70%"], center: ["50%", "43%"],
      label: { show: false },
      itemStyle: { borderColor: chartColors.background, borderWidth: 3, borderRadius: 5 },
      emphasis: { label: { show: true, formatter: "{b}\n{c} 台", color: chartColors.ink } },
      data: distribution().map(([key, value]) => ({
        name: KIND_LABELS[key], value,
        itemStyle: { opacity: kind() && kind() !== key ? 0.35 : 1 },
      })),
      animationDurationUpdate: 350,
    }],
  }));
  const selectKind = (name: string) => {
    const key = distribution().find(([key]) => KIND_LABELS[key] === name)?.[0];
    if (key) setKind(kind() === key ? null : key);
  };
  const arpByMac = createMemo(() => {
    const map = new Map<string, RosRecord>();
    for (const row of dash.arp()) {
      const key = macKey(row["mac-address"]);
      if (key) map.set(key, row);
    }
    return map;
  });
  const rows = createMemo(() => {
    const mode = filter();
    return dash
      .leases()
      .filter((lease) => {
        const arp = arpByMac().get(macKey(lease["mac-address"]));
        if (kind() && leaseIdentity(lease).kind !== kind()) return false;
        if (mode === "bound" && lease.status !== "bound") return false;
        if (mode === "idle" && lease.status === "bound") return false;
        if (mode === "reachable" && arp?.status !== "reachable") return false;
        return matches([lease["host-name"], lease.address, lease["mac-address"], lease.comment, arp?.interface], query());
      })
      .sort((a, b) => {
        const bound = Number(b.status === "bound") - Number(a.status === "bound");
        if (bound) return bound;
        return ipSortKey(a.address) - ipSortKey(b.address);
      });
  });
  const arpOnly = createMemo(() => {
    const known = new Set(dash.leases().map((lease) => macKey(lease["mac-address"])));
    return dash
      .arp()
      .filter((row) => {
        const key = macKey(row["mac-address"]);
        return key && !known.has(key) && matches([row.address, row["mac-address"], row.interface], query());
      })
      .sort((a, b) => ipSortKey(a.address) - ipSortKey(b.address));
  });
  const boundCount = createMemo(() => dash.leases().filter((lease) => lease.status === "bound").length);

  return (
    <div>
      <PageHeader title="设备">
        <div class="text-xs text-faint">
          {boundCount()} 在线 / {dash.leases().length}
        </div>
      </PageHeader>
      <section class="card mb-4 px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-medium">设备类型分布</h2>
          <span class="text-xs text-faint">点击类型筛选，再次点击取消</span>
        </div>
        <EChart option={donutOption()} height={260} onClick={selectKind} />
      </section>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <input
          class="field"
          type="search"
          placeholder="搜索"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <FilterChip label="全部" on={filter() === "all" && kind() === null} click={() => { setFilter("all"); setKind(null); }} />
        {kind() ? <FilterChip label={`${KIND_LABELS[kind()!]} ×`} on={true} click={() => setKind(null)} /> : null}
        <FilterChip label="已绑定" on={filter() === "bound"} click={() => setFilter("bound")} />
        <FilterChip label="未绑定" on={filter() === "idle"} click={() => setFilter("idle")} />
        <FilterChip label="ARP 可达" on={filter() === "reachable"} click={() => setFilter("reachable")} />
      </div>
      {rows().length === 0 ? (
        <EmptyState title={dash.ready() ? "没有设备" : "正在读取"} />
      ) : (
        <div class="card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>设备</th>
                <th>IP</th>
                <th>MAC</th>
                <th>租约</th>
                <th>最近出现</th>
                <th>ARP</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()} keyed={(row) => row[".id"] || row["mac-address"] || row.address}>
                {(row) => <LeaseRow lease={row()} arp={arpByMac().get(macKey(row()["mac-address"]))} />}
              </For>
            </tbody>
          </table>
        </div>
      )}
      {arpOnly().length > 0 ? (
        <section class="mt-6">
          <h2 class="mb-2 text-xs text-faint">ARP</h2>
          <div class="card overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>MAC</th>
                  <th>接口</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <For each={arpOnly()} keyed={(row) => row[".id"] || row.address}>
                  {(row) => (
                    <tr
                      class="cursor-pointer"
                      onClick={() => dash.setSelection({ type: "client", ip: row().address || "", mac: row()["mac-address"] || "" })}
                    >
                      <td class="font-mono">{row().address}</td>
                      <td class="font-mono">{row()["mac-address"]}</td>
                      <td>{row().interface || "—"}</td>
                      <td>
                        <Pill tone={arpStatusTone(row().status)}>{arpStatusLabel(row().status)}</Pill>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LeaseRow(props: { lease: RosRecord; arp: RosRecord | undefined }) {
  const dash = useDashboard();
  const [expanded, setExpanded] = createSignal(false);
  const identity = () => leaseIdentity(props.lease);
  return (
    <>
    <tr class="cursor-pointer" onClick={() => dash.setSelection({ type: "client", ip: props.lease.address || "", mac: props.lease["mac-address"] || "" })}>
      <td>
        <div class="client">
          <DeviceIcon kind={identity().kind} />
          <div class="min-w-0">
            <button type="button" class={`client-name truncate ${identity().title === "未知" ? "text-faint" : ""}`} aria-expanded={expanded() ? "true" : "false"} onClick={(event) => { event.stopPropagation(); setExpanded(!expanded()); }}>{expanded() ? "▾" : "▸"} {identity().title}</button>
            {identity().subtitle ? <div class="client-sub truncate">{identity().subtitle}</div> : null}
          </div>
        </div>
      </td>
      <td class="font-mono text-xs text-muted">{props.lease.address || "—"}</td>
      <td class="font-mono text-xs text-faint">{props.lease["mac-address"] || "—"}</td>
      <td>
        <Pill tone={dhcpStatusTone(props.lease.status)}>{dhcpStatusLabel(props.lease.status)}</Pill>
        {props.lease["expires-after"] ? (
          <div class="mt-1 text-xs text-faint">剩余 {props.lease["expires-after"]}</div>
        ) : null}
      </td>
      <td>{formatLastSeen(props.lease["last-seen"])}</td>
      <td>
        <Pill tone={arpStatusTone(props.arp?.status)}>{arpStatusLabel(props.arp?.status)}</Pill>
        {props.arp?.interface ? <div class="mt-1 text-xs text-faint">{props.arp.interface}</div> : null}
      </td>
    </tr>
    {expanded() ? <tr><td colspan={6}><h3 class="text-xs text-faint">全部字段</h3><AllFields row={props.lease} /></td></tr> : null}
    </>
  );
}

function FilterChip(props: { label: string; on: boolean; click: () => void }) {
  return (
    <button type="button" class={props.on ? "chip is-on" : "chip"} aria-pressed={props.on ? "true" : "false"} onClick={() => props.click()}>
      {props.label}
    </button>
  );
}
