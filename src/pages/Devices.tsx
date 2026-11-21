import { Cable, Wifi } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { CopyText } from "../components/CopyText";
import { DeviceGlyph, DeviceIcon, KIND_LABELS } from "../components/DeviceIcon";
import { createTableSort, SortHeader, useTableKeyboard } from "../components/TableSort";
import { EmptyState, PageHeader, RateText, Segmented } from "../components/ui";
import { formatBytes, formatLastSeen, parseDurationSeconds } from "../lib/format";
import { dhcpStatusLabel, ipSortKey, type DeviceKind } from "../lib/model";
import { useDashboard } from "../lib/store";
import { macKey, sameMac, type TopoClient } from "../lib/topology";

type Status = "all" | "online" | "offline" | "wired" | "wireless";

function matches(client: TopoClient, query: string): boolean {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  const blob = [client.title, client.subtitle, client.vendor, client.ip, client.mac, client.port, client.ssid].join(" ").toLowerCase();
  return blob.includes(raw) || (macKey(raw).length >= 4 && macKey(blob).includes(macKey(raw)));
}

export function DevicesPage() {
  const dash = useDashboard();
  let search: HTMLInputElement | undefined;
  useTableKeyboard(() => search);
  const sorting = createTableSort<TopoClient>();
  const [query, setQuery] = createSignal("");
  const [status, setStatus] = createSignal<Status>("all");
  const [kind, setKind] = createSignal<DeviceKind | null>(null);

  const traffic = (client: TopoClient) => (client.ip ? dash.clientTraffic()[client.ip] : undefined);
  const kinds = createMemo(() => {
    const counts = new Map<DeviceKind, number>();
    for (const client of dash.clients()) counts.set(client.kind, (counts.get(client.kind) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  });
  const counts = createMemo(() => {
    const all = dash.clients();
    return {
      all: all.length,
      online: all.filter((client) => client.online).length,
      offline: all.filter((client) => !client.online).length,
      wired: all.filter((client) => !client.wireless).length,
      wireless: all.filter((client) => client.wireless).length,
    };
  });

  const rows = createMemo(() =>
    dash
      .clients()
      .filter((client) => {
        const mode = status();
        if (mode === "online" && !client.online) return false;
        if (mode === "offline" && client.online) return false;
        if (mode === "wired" && client.wireless) return false;
        if (mode === "wireless" && !client.wireless) return false;
        if (kind() && client.kind !== kind()) return false;
        return matches(client, query());
      })
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) ||
          (traffic(b)?.rxBps ?? 0) + (traffic(b)?.txBps ?? 0) - ((traffic(a)?.rxBps ?? 0) + (traffic(a)?.txBps ?? 0)) ||
          ipSortKey(a.ip) - ipSortKey(b.ip),
      ),
  );
  const sorted = () =>
    sorting.rows(rows(), (client, key) => {
      if (key === "name") return client.title;
      if (key === "ip") return ipSortKey(client.ip);
      if (key === "port") return client.port || "~";
      if (key === "down") return traffic(client)?.rxBps ?? -1;
      if (key === "up") return traffic(client)?.txBps ?? -1;
      if (key === "usage") return (traffic(client)?.downBytes ?? 0) + (traffic(client)?.upBytes ?? 0);
      if (key === "seen") return parseDurationSeconds(client.lease?.["last-seen"]);
      return null;
    });
  const selectedKey = createMemo(() => {
    const selection = dash.selection();
    if (selection?.type !== "client") return "";
    return dash.clients().find((client) => sameMac(client.mac, selection.mac) || (!!selection.ip && client.ip === selection.ip))?.key ?? "";
  });

  const open = (client: TopoClient) => dash.setSelection({ type: "client", ip: client.ip, mac: client.mac });

  return (
    <div>
      <PageHeader title="客户端" subtitle={`${counts().online} 台在线 · 共 ${counts().all} 台 · 按 / 搜索，点击行查看详情`}>
        <input
          ref={search}
          aria-label="搜索客户端"
          class="field"
          type="search"
          placeholder="名称、IP、MAC、端口…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </PageHeader>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="状态"
          value={status()}
          onChange={setStatus}
          options={[
            { value: "all", label: `全部 ${counts().all}` },
            { value: "online", label: `在线 ${counts().online}` },
            { value: "offline", label: `离线 ${counts().offline}` },
            { value: "wired", label: `有线 ${counts().wired}` },
            { value: "wireless", label: `无线 ${counts().wireless}` },
          ]}
        />
        <span class="mx-1 h-5 w-px bg-line" />
        <For each={kinds()}>
          {([key, count]) => (
            <button type="button" class={kind() === key ? "chip is-on" : "chip"} aria-pressed={kind() === key ? "true" : "false"} onClick={() => setKind(kind() === key ? null : key)}>
              <span class="[&>svg]:h-3.5 [&>svg]:w-3.5">
                <DeviceGlyph kind={key} />
              </span>
              {KIND_LABELS[key]}
              <span class="count">{count}</span>
            </button>
          )}
        </For>
      </div>

      <Show when={sorted().length > 0} fallback={<EmptyState title={dash.ready() ? "没有匹配的客户端" : "正在读取"} />}>
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <SortHeader column="name" state={sorting.sort()} toggle={sorting.toggle}>名称</SortHeader>
                <SortHeader column="port" state={sorting.sort()} toggle={sorting.toggle}>连接</SortHeader>
                <SortHeader column="ip" state={sorting.sort()} toggle={sorting.toggle}>IP 地址</SortHeader>
                <th>MAC 地址</th>
                <SortHeader column="down" state={sorting.sort()} toggle={sorting.toggle}>下载</SortHeader>
                <SortHeader column="up" state={sorting.sort()} toggle={sorting.toggle}>上传</SortHeader>
                <SortHeader column="usage" state={sorting.sort()} toggle={sorting.toggle}>连接用量</SortHeader>
                <SortHeader column="seen" state={sorting.sort()} toggle={sorting.toggle}>最近活动</SortHeader>
              </tr>
            </thead>
            <tbody>
              <For each={sorted()} keyed={(client) => client.key}>
                {(client) => {
                  const rate = () => traffic(client());
                  return (
                    <tr
                      class={`is-clickable ${client().online ? "" : "is-dim"} ${selectedKey() === client().key ? "is-selected" : ""}`}
                      tabindex={0}
                      onClick={() => open(client())}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          open(client());
                        }
                      }}
                    >
                      <td>
                        <div class="client">
                          <DeviceIcon kind={client().kind} online={client().online} />
                          <div class="min-w-0">
                            <div class="client-name truncate">{client().title}</div>
                            <div class="client-sub truncate">{client().subtitle || client().vendor || KIND_LABELS[client().kind]}</div>
                          </div>
                        </div>
                      </td>
                      <td class="whitespace-nowrap text-[12.5px]">
                        {client().port ? (
                          <span class="inline-flex items-center gap-1.5">
                            {client().wireless ? <Wifi class="h-3.5 w-3.5 text-accent" aria-hidden="true" /> : <Cable class="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
                            <span>{client().wireless ? client().ssid || client().port : client().port}</span>
                            {client().signal ? <span class="text-faint">{client().signal}</span> : null}
                          </span>
                        ) : (
                          <span class="text-faint">未定位</span>
                        )}
                      </td>
                      <td>{client().ip ? <CopyText class="font-mono text-[12.5px]" value={client().ip} /> : <span class="text-faint">—</span>}</td>
                      <td>{client().mac ? <CopyText class="font-mono text-[12px] text-muted" value={client().mac} /> : "—"}</td>
                      <td>
                        <RateText bps={rate()?.rxBps} class={(rate()?.rxBps ?? 0) > 0 ? "rate-down" : "text-faint"} />
                      </td>
                      <td>
                        <RateText bps={rate()?.txBps} class={(rate()?.txBps ?? 0) > 0 ? "rate-up" : "text-faint"} />
                      </td>
                      <td class="whitespace-nowrap text-[12.5px] text-muted num">
                        {rate() ? formatBytes((rate()?.downBytes ?? 0) + (rate()?.upBytes ?? 0)) : "—"}
                        {rate()?.connections ? <span class="ml-1 text-faint">· {rate()?.connections} 条</span> : null}
                      </td>
                      <td class="whitespace-nowrap text-[12.5px]">
                        <div>{client().lease ? formatLastSeen(client().lease?.["last-seen"]) : client().online ? "在线" : "—"}</div>
                        <div class="text-[11.5px] text-faint">{client().lease ? dhcpStatusLabel(client().lease?.status) : client().arp ? "仅 ARP" : "无线注册"}</div>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </section>
      </Show>
      <p class="mt-2 text-[11.5px] text-faint">
        速率与用量来自防火墙连接表，只统计当前活动连接，不是设备的长期总用量。
      </p>
    </div>
  );
}
