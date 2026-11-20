import { CopyText } from "../components/CopyText";
import { createTableSort, SortHeader, useTableKeyboard } from "../components/TableSort";
import { createEffect, createMemo, createSignal, For, type Accessor } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { formatLastSeen, parseDurationSeconds } from "../lib/format";
import { DeviceIcon } from "../components/DeviceIcon";
import { arpStatusLabel, arpStatusTone, dhcpStatusLabel, dhcpStatusTone, ipSortKey, leaseIdentity, type RosRecord } from "../lib/model";
import { AllFields } from "../components/ReadData";
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
  let search: HTMLInputElement | undefined;
  const escape = useTableKeyboard(() => search);
  const sorting = createTableSort<RosRecord>();
  const sorted = () => sorting.rows(rows(), (row, key) => key === "ip" ? ipSortKey(row.address) : key === "hostname" ? row["host-name"] || leaseIdentity(row).title : key === "seen" ? parseDurationSeconds(row["last-seen"]) : row.status);
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
      <PageHeader title="设备">
        <div class="text-xs text-faint">
          {boundCount()} 在线 / {dash.leases().length}
        </div>
      </PageHeader>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <input
          ref={search}
          aria-label="搜索"
          class="field"
          type="search"
          placeholder="搜索"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <FilterChip label="全部" on={filter() === "all"} click={() => setFilter("all")} />
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
                <SortHeader column="hostname" state={sorting.sort()} toggle={sorting.toggle}>设备</SortHeader>
                <SortHeader column="ip" state={sorting.sort()} toggle={sorting.toggle}>IP</SortHeader>
                <th>MAC</th>
                <SortHeader column="status" state={sorting.sort()} toggle={sorting.toggle}>租约</SortHeader>
                <SortHeader column="seen" state={sorting.sort()} toggle={sorting.toggle}>最近出现</SortHeader>
                <th>ARP</th>
              </tr>
            </thead>
            <tbody>
              <For each={sorted()} keyed={(row) => row[".id"] || row["mac-address"] || row.address}>
                {(row) => <LeaseRow lease={row()} escape={escape} arp={arpByMac().get(macKey(row()["mac-address"]))} />}
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
                      tabindex={0}
                      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); dash.setSelection({ type: "client", ip: row().address || "", mac: row()["mac-address"] || "" }); } }}
                      onClick={(event) => { event.currentTarget.focus(); dash.setSelection({ type: "client", ip: row().address || "", mac: row()["mac-address"] || "" }); }}
                    >
                      <td class="font-mono"><CopyText value={row().address || ""} /></td>
                      <td class="font-mono"><CopyText value={row()["mac-address"] || ""} /></td>
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

function LeaseRow(props: { lease: RosRecord; arp: RosRecord | undefined; escape: Accessor<number> }) {
  const dash = useDashboard();
  const [expanded, setExpanded] = createSignal(false);
  createEffect(() => props.escape(), () => { setExpanded(false); });
  const identity = () => leaseIdentity(props.lease);
  return (
    <>
    <tr class="cursor-pointer" tabindex={0}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); dash.setSelection({ type: "client", ip: props.lease.address || "", mac: props.lease["mac-address"] || "" }); } }}
      onClick={(event) => { event.currentTarget.focus(); dash.setSelection({ type: "client", ip: props.lease.address || "", mac: props.lease["mac-address"] || "" }); }}>
      <td>
        <div class="client">
          <DeviceIcon kind={identity().kind} />
          <div class="min-w-0">
            <button type="button" class={`client-name truncate ${identity().title === "未知" ? "text-faint" : ""}`} aria-label={identity().title} aria-expanded={expanded() ? "true" : "false"} onClick={(event) => { event.stopPropagation(); setExpanded(!expanded()); }}>{expanded() ? "▾" : "▸"}</button>{" "}<CopyText class={`client-name truncate ${identity().title === "未知" ? "text-faint" : ""}`} value={identity().title}>{identity().title}</CopyText>
            {identity().subtitle ? <div class="client-sub truncate"><CopyText value={identity().subtitle}>{identity().subtitle}</CopyText></div> : null}
          </div>
        </div>
      </td>
      <td class="font-mono text-xs text-muted">{props.lease.address ? <CopyText value={props.lease.address} /> : "—"}</td>
      <td class="font-mono text-xs text-faint">{props.lease["mac-address"] ? <CopyText value={props.lease["mac-address"]} /> : "—"}</td>
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
    {expanded() ? <tr><td colspan={6}><h3 class="text-xs text-faint">全部字段</h3><AllFields row={props.lease} copy /></td></tr> : null}
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
