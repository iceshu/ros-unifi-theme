import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { RouteForm } from "../components/NetconfRouteForm";
import { AddButton, ConfirmDialog, RowMenu } from "../components/form";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const MENU = "/rest/ip/route";

export function RoutesPage() {
  const dash = useDashboard();
  const [activeOnly, setActiveOnly] = createSignal(false);
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);

  const isStatic = (route: RosRecord) => flag(route.static) && !flag(route.dynamic) && !flag(route.connect);

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

  const interfaces = createMemo(() => [
    ...new Set(dash.interfaces().map((r) => r.name).filter(Boolean)),
  ]);

  return (
    <div>
      <PageHeader title="路由" subtitle="静态路由可编辑；动态路由（直连、PPPoE 等）只读">
        <AddButton label="添加静态路由" onClick={() => setEditing("new")} />
      </PageHeader>
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
                <th>备注</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={rows()} keyed={(item) => item.route[".id"] || String(item.index)}>
                {(item) => {
                  const route = () => item().route;
                  const editable = () => isStatic(route());
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
                      <td>
                        <Show when={can("write") && editable()}>
                          <RowMenu
                            items={[
                              { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing(route()) },
                              {
                                label: "删除",
                                icon: <Trash2 aria-hidden="true" />,
                                danger: true,
                                onSelect: () => setDeleting(route()),
                              },
                            ]}
                          />
                        </Show>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      )}

      <Show when={editing()} keyed>
        {(current) => (
          <RouteForm
            entry={current === "new" ? undefined : current}
            interfaces={interfaces()}
            onClose={() => setEditing(null)}
          />
        )}
      </Show>
      <Show when={deleting()} keyed>
        {(route) => (
          <ConfirmDialog
            title="删除静态路由？"
            message={`将删除到 ${route["dst-address"]} 经 ${route.gateway || "—"} 的路由。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除路由", () => ros.remove(MENU, route[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
