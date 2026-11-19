import { createMemo, createSignal, For } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { formatLastSeen } from "../lib/format";
import { arpStatusLabel, arpStatusTone, dhcpStatusLabel, dhcpStatusTone, ipSortKey, type RosRecord } from "../lib/model";
import { useDashboard } from "../lib/store";

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
      <PageHeader
        title="设备"
        description="DHCP 租约，并用 ARP 补充是否还在链路上。这里只能看，不能绑定、阻断或删除租约。"
      >
        <div class="text-sm text-muted">
          {dash.leases().length} 条租约 · {boundCount()} 已绑定
        </div>
      </PageHeader>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <input
          class="field"
          type="search"
          placeholder="搜索主机名、IP 或 MAC"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <FilterChip label="全部" on={filter() === "all"} click={() => setFilter("all")} />
        <FilterChip label="已绑定" on={filter() === "bound"} click={() => setFilter("bound")} />
        <FilterChip label="未绑定" on={filter() === "idle"} click={() => setFilter("idle")} />
        <FilterChip label="ARP 可达" on={filter() === "reachable"} click={() => setFilter("reachable")} />
      </div>
      {rows().length === 0 ? (
        <EmptyState
          title={dash.ready() ? "没有匹配的租约" : "正在读取 DHCP 租约"}
          detail="列表来自 /ip/dhcp-server/lease。默认局域网是 192.168.2.0/24，但这里会显示路由器返回的全部租约。"
        />
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
          <h2 class="mb-3 text-sm text-muted">只出现在 ARP 里</h2>
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
                    <tr>
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
  const name = () => props.lease["host-name"] || props.lease.comment || "未命名设备";
  return (
    <tr>
      <td>
        <div class="font-medium">{name()}</div>
        {props.lease.comment && props.lease.comment !== name() ? (
          <div class="text-xs text-faint">{props.lease.comment}</div>
        ) : null}
      </td>
      <td class="font-mono">{props.lease.address || "—"}</td>
      <td class="font-mono text-sm">{props.lease["mac-address"] || "—"}</td>
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
  );
}

function FilterChip(props: { label: string; on: boolean; click: () => void }) {
  return (
    <button type="button" class={props.on ? "chip is-on" : "chip"} aria-pressed={props.on ? "true" : "false"} onClick={() => props.click()}>
      {props.label}
    </button>
  );
}
