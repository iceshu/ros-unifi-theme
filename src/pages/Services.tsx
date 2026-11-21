import { Pencil } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { SystemServiceForm } from "../components/SystemServiceForm";
import { EnableSwitch, RowMenu } from "../components/form";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { flag, type RosRecord } from "../lib/model";
import { can } from "../lib/session";
import { useRos } from "../lib/useRos";

const INSECURE = new Set(["telnet", "ftp", "api"]);

export function ServicesPage() {
  const { rows, loaded } = useRos("/rest/ip/service");
  const [editing, setEditing] = createSignal<RosRecord | null>(null);

  return (
    <div>
      <PageHeader title="服务" subtitle="RouterOS 管理接口配置" />

      <Card>
        <Show
          when={rows().length > 0}
          fallback={<EmptyState title={loaded() ? "暂无服务数据" : "正在读取"} compact />}
        >
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>服务</th>
                  <th>端口</th>
                  <th>允许地址</th>
                  <th>证书</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr class="is-clickable" onClick={() => can("write") && setEditing(row)}>
                      <td>
                        <span class="font-mono font-medium">{row.name}</span>
                        <Show when={INSECURE.has(row.name) && !flag(row.disabled)}>
                          <span class="ml-2 pill pill-warn text-[11px]">明文传输</span>
                        </Show>
                      </td>
                      <td class="font-mono">{row.port || "—"}</td>
                      <td class="text-muted">{row.address || <span class="text-faint">全部</span>}</td>
                      <td class="text-muted">{row.certificate && row.certificate !== "none" ? row.certificate : <span class="text-faint">—</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <EnableSwitch menu="/rest/ip/service" row={row} label={row.name} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Show when={can("write")}>
                          <RowMenu
                            items={[
                              {
                                label: "编辑",
                                icon: <Pencil size={14} />,
                                onSelect: () => setEditing(row),
                              },
                            ]}
                          />
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Card>

      <Show when={editing()}>
        {(row) => <SystemServiceForm service={row()} onClose={() => setEditing(null)} />}
      </Show>
    </div>
  );
}
