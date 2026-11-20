import { createMemo, createSignal } from "solid-js";
import { TopologyCanvas } from "../components/TopologyCanvas";
import { PageHeader, Segmented } from "../components/ui";
import { useDashboard } from "../lib/store";

export function TopologyPage() {
  const dash = useDashboard();
  const [query, setQuery] = createSignal("");
  const [offline, setOffline] = createSignal<"show" | "hide">("show");
  const online = createMemo(() => dash.clients().filter((client) => client.online).length);

  return (
    <div>
      <PageHeader title="拓扑" subtitle={`${online()} 台在线 · 共 ${dash.clients().length} 台客户端 · 拖动平移，滚轮缩放，点击节点查看详情`}>
        <div class="flex flex-wrap items-center gap-2">
          <Segmented
            label="离线设备"
            value={offline()}
            onChange={setOffline}
            options={[
              { value: "show", label: "含离线" },
              { value: "hide", label: "仅在线" },
            ]}
          />
          <input
            class="field"
            type="search"
            placeholder="高亮设备：名称、IP、MAC"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
      </PageHeader>
      <section class="card overflow-hidden">
        <TopologyCanvas height="calc(100vh - 190px)" wheelZoom query={query()} showOffline={offline() === "show"} />
      </section>
    </div>
  );
}
