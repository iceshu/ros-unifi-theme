import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { BridgeForm, BridgePortForm } from "../components/NetconfBridgeForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";

const BRIDGE = "/rest/interface/bridge";
const BRIDGE_PORT = "/rest/interface/bridge/port";

export function BridgesPage() {
  const dash = useDashboard();
  const bridgesData = useRos(BRIDGE);
  const [editingBridge, setEditingBridge] = createSignal<RosRecord | "new" | null>(null);
  const [deletingBridge, setDeletingBridge] = createSignal<RosRecord | null>(null);
  const [editingPort, setEditingPort] = createSignal<RosRecord | "new" | null>(null);
  const [deletingPort, setDeletingPort] = createSignal<RosRecord | null>(null);

  const bridgeNames = createMemo(() => bridgesData.rows().map((r) => r.name).filter(Boolean));
  const portInterfaces = createMemo(() => {
    const portIfaceSet = new Set(dash.bridgePorts().map((r) => r.interface));
    return dash.interfaces()
      .map((r) => r.name)
      .filter((n) => n && !portIfaceSet.has(n) && !bridgeNames().includes(n));
  });
  const allInterfaces = createMemo(() =>
    dash.interfaces().map((r) => r.name).filter(Boolean),
  );

  return (
    <div>
      <PageHeader title="网桥" subtitle="二层转发；添加端口前请先创建网桥" />

      <div class="space-y-4">
        <Card
          title="网桥列表"
          actions={<AddButton label="创建网桥" onClick={() => setEditingBridge("new")} />}
        >
          <Show
            when={bridgesData.rows().length > 0}
            fallback={
              <EmptyState
                title={bridgesData.loaded() ? "没有网桥" : "正在读取"}
                detail="需要 write 策略才能创建网桥。"
                compact
              />
            }
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>名称</th>
                  <th>协议模式</th>
                  <th>备注</th>
                  <th>启用</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={bridgesData.rows()} keyed={(row) => row[".id"]}>
                  {(row) => (
                    <tr class={flag(row().disabled) ? "is-dim" : ""}>
                      <td>
                        <span class={`pill ${flag(row().running) ? "pill-good" : "pill-muted"}`}>
                          {flag(row().running) ? "运行" : "停止"}
                        </span>
                      </td>
                      <td class="font-mono text-[12.5px]">{row().name}</td>
                      <td class="text-muted">{row()["protocol-mode"] || "rstp"}</td>
                      <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                      <td>
                        <EnableSwitch menu={BRIDGE} row={row()} label={row().name} />
                      </td>
                      <td>
                        <Show when={can("write")}>
                          <RowMenu
                            items={[
                              {
                                label: "编辑",
                                icon: <Pencil aria-hidden="true" />,
                                onSelect: () => setEditingBridge(row()),
                              },
                              {
                                label: "删除",
                                icon: <Trash2 aria-hidden="true" />,
                                danger: true,
                                onSelect: () => setDeletingBridge(row()),
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
          </Show>
        </Card>

        <Card
          title="网桥端口"
          actions={
            <Show when={bridgeNames().length > 0}>
              <AddButton label="添加端口" onClick={() => setEditingPort("new")} />
            </Show>
          }
        >
          <Show
            when={dash.bridgePorts().length > 0}
            fallback={<EmptyState title="没有端口" detail="先创建网桥，再添加物理接口作为端口。" compact />}
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>接口</th>
                  <th>网桥</th>
                  <th>PVID</th>
                  <th>备注</th>
                  <th>启用</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={dash.bridgePorts()} keyed={(row) => row[".id"]}>
                  {(row) => (
                    <tr class={flag(row().disabled) ? "is-dim" : ""}>
                      <td class="font-mono text-[12.5px]">{row().interface}</td>
                      <td class="font-mono text-[12.5px]">{row().bridge}</td>
                      <td class="text-muted">{row().pvid || "1"}</td>
                      <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                      <td>
                        <EnableSwitch menu={BRIDGE_PORT} row={row()} label={`${row().interface} → ${row().bridge}`} />
                      </td>
                      <td>
                        <Show when={can("write")}>
                          <RowMenu
                            items={[
                              {
                                label: "编辑",
                                icon: <Pencil aria-hidden="true" />,
                                onSelect: () => setEditingPort(row()),
                              },
                              {
                                label: "移除端口",
                                icon: <Trash2 aria-hidden="true" />,
                                danger: true,
                                onSelect: () => setDeletingPort(row()),
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
          </Show>
        </Card>
      </div>

      <Show when={editingBridge()} keyed>
        {(current) => (
          <BridgeForm
            entry={current === "new" ? undefined : current}
            onClose={() => setEditingBridge(null)}
          />
        )}
      </Show>
      <Show when={deletingBridge()} keyed>
        {(bridge) => (
          <ConfirmDialog
            title="删除网桥？"
            message={`将删除网桥 ${bridge.name}。其端口会自动解绑，但地址等配置需手动清理。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeletingBridge(null)}
            onConfirm={() => runWrite(dash, "已删除网桥", () => ros.remove(BRIDGE, bridge[".id"]))}
          />
        )}
      </Show>

      <Show when={editingPort()} keyed>
        {(current) => (
          <BridgePortForm
            entry={current === "new" ? undefined : current}
            bridges={bridgeNames()}
            interfaces={current === "new" ? portInterfaces() : allInterfaces()}
            onClose={() => setEditingPort(null)}
          />
        )}
      </Show>
      <Show when={deletingPort()} keyed>
        {(port) => (
          <ConfirmDialog
            title="移除端口？"
            message={`将把 ${port.interface} 从网桥 ${port.bridge} 中移除。`}
            confirmLabel="移除"
            danger
            onClose={() => setDeletingPort(null)}
            onConfirm={() => runWrite(dash, "已移除端口", () => ros.remove(BRIDGE_PORT, port[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
