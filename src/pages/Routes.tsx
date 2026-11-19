import { createMemo, createSignal, For } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { flag } from "../lib/model";
import { useDashboard } from "../lib/store";

export function RoutesPage() {
  const dash = useDashboard();
  const [activeOnly, setActiveOnly] = createSignal(false);
  const rows = createMemo(() =>
    dash
      .routes()
      .map((route, index) => ({ route, index }))
      .filter((item) => (activeOnly() ? flag(item.route.active) && !flag(item.route.disabled) : true))
      .sort((a, b) => {
        const aDefault = a.route["dst-address"] === "0.0.0.0/0" ? 0 : 1;
        const bDefault = b.route["dst-address"] === "0.0.0.0/0" ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
        const aActive = flag(a.route.active) ? 0 : 1;
        const bActive = flag(b.route.active) ? 0 : 1;
        return aActive - bActive;
      }),
  );

  return (
    <div>
      <PageHeader title="路由" />
      <div class="mb-4">
        <button
          type="button"
          class={activeOnly() ? "chip is-on" : "chip"}
          aria-pressed={activeOnly() ? "true" : "false"}
          onClick={() => {
            setActiveOnly(!activeOnly());
          }}
        >
          只看活动路由
        </button>
      </div>
      {rows().length === 0 ? (
        <EmptyState title={dash.ready() ? "没有路由" : "正在读取"} />
      ) : (
        <div class="card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>目的网络</th>
                <th>网关</th>
                <th>距离</th>
                <th>表</th>
                <th>标记</th>
                <th>注释</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()} keyed={(item) => item.route[".id"] || String(item.index)}>
                {(item) => {
                  const route = () => item().route;
                  return (
                    <tr class={flag(route().disabled) ? "opacity-50" : ""}>
                      <td class="font-mono">{route()["dst-address"] || "—"}</td>
                      <td class="font-mono">{route().gateway || "—"}</td>
                      <td>{route().distance || "—"}</td>
                      <td>{route()["routing-table"] || "main"}</td>
                      <td>
                        <div class="flex flex-wrap gap-1.5">
                          {flag(route().active) ? <Pill tone="good">活动</Pill> : <Pill tone="muted">非活动</Pill>}
                          {flag(route().connect) ? <Pill tone="accent">直连</Pill> : null}
                          {flag(route().dynamic) ? <Pill tone="muted">动态</Pill> : null}
                          {flag(route().static) ? <Pill tone="muted">静态</Pill> : null}
                          {flag(route().disabled) ? <Pill tone="warn">禁用</Pill> : null}
                        </div>
                      </td>
                      <td class="text-sm text-muted">{route().comment || ""}</td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
