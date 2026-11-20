import { createMemo, createSignal, For, Show } from "solid-js";
import { EChart, chartColors, chartTooltip, type ChartOption } from "../components/charts";
import { EmptyState, PageHeader, RateText } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useLoad } from "../lib/useRos";

interface AppClient {
  ip: string;
  name: string;
  rate: number;
  bytes: number;
}

interface AppEntry {
  name: string;
  rate: number;
  bytes: number;
  clients: AppClient[];
}

interface AppsData {
  apps: AppEntry[];
}

export function AppsPage() {
  const loaded = useLoad<AppsData>(() => "/api/apps", 10_000, (raw) => raw as AppsData);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [selected, setSelected] = createSignal<string | null>(null);

  const apps = createMemo(() => loaded.data()?.apps ?? []);

  const topN = createMemo(() => apps().slice(0, 12));

  const donutOption = createMemo((): ChartOption => {
    const colors = chartColors();
    const data = topN().map((app) => ({ name: app.name, value: app.rate }));
    return {
      tooltip: {
        ...chartTooltip(),
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number };
          return `${p.name}<br/>${formatBytes(p.value)}/s`;
        },
      } as ChartOption["tooltip"],
      color: colors.palette,
      series: [
        {
          type: "pie" as const,
          radius: ["45%", "72%"],
          center: ["50%", "50%"],
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 13, fontWeight: "bold" } },
          data,
        },
      ],
    };
  });

  function toggleExpand(name: string) {
    setExpanded(expanded() === name ? null : name);
  }

  return (
    <div>
      <PageHeader
        title="应用识别"
        subtitle={loaded.loaded() ? `识别到 ${apps().length} 个应用` : "加载中…"}
      />

      <Show when={loaded.error()}>
        <div class="card mb-4 p-4 text-[13px] text-bad">{loaded.error()}</div>
      </Show>

      <Show when={loaded.loaded() && apps().length === 0}>
        <EmptyState
          title="暂无应用数据"
          detail="当前没有活跃连接，或 DNS 缓存中没有可识别的域名。"
        />
      </Show>

      <Show when={apps().length > 0}>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Donut chart */}
          <section class="card">
            <div class="card-head"><h2 class="card-title">流量占比</h2></div>
            <EChart
              option={donutOption()}
              height={260}
              onClick={(name) => setSelected(selected() === name ? null : name)}
            />
          </section>

          {/* App table */}
          <section class="card">
            <div class="card-head"><h2 class="card-title">应用列表</h2></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>应用</th>
                    <th>当前速率</th>
                    <th>累计流量</th>
                    <th>客户端数</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={apps()}>
                    {(app) => (
                      <>
                        <tr
                          class={`is-clickable ${selected() === app.name || expanded() === app.name ? "bg-accent/5" : ""}`}
                          onClick={() => toggleExpand(app.name)}
                        >
                          <td>
                            <span class="font-medium">{app.name}</span>
                            <span class="ml-2 text-[11px] text-muted">{expanded() === app.name ? "▲" : "▼"}</span>
                          </td>
                          <td><RateText bps={app.rate} /></td>
                          <td class="text-[13px]">{formatBytes(app.bytes)}</td>
                          <td class="text-[13px]">{app.clients.length}</td>
                        </tr>
                        <Show when={expanded() === app.name}>
                          <For each={app.clients}>
                            {(client) => (
                              <tr class="is-dim">
                                <td class="pl-8 text-[12px] text-muted">{client.name}</td>
                                <td><RateText bps={client.rate} /></td>
                                <td class="text-[13px]">{formatBytes(client.bytes)}</td>
                                <td />
                              </tr>
                            )}
                          </For>
                        </Show>
                      </>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
}
