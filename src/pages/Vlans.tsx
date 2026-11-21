import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { VlanForm } from "../components/NetconfVlanForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const MENU = "/rest/interface/vlan";

export function VlansPage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);

  const interfaces = createMemo(() => [
    ...new Set(dash.interfaces().map((r) => r.name).filter(Boolean)),
  ]);

  return (
    <div>
      <PageHeader title="VLAN" subtitle="RouterOS 软件 VLAN 接口；802.1Q 过滤请在网桥设置中启用 VLAN 过滤">
        <AddButton label="创建 VLAN" onClick={() => setEditing("new")} />
      </PageHeader>
      <Show
        when={dash.vlans().length > 0}
        fallback={<EmptyState title={dash.ready() ? "没有 VLAN 接口" : "正在读取"} detail="在路由器上创建 VLAN 接口，将其分配给网桥或物理接口后，可用于防火墙和路由。" />}
      >
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>名称</th>
                <th>VLAN ID</th>
                <th>父接口</th>
                <th>MTU</th>
                <th>备注</th>
                <th>启用</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={dash.vlans()} keyed={(row) => row[".id"]}>
                {(row) => (
                  <tr class={flag(row().disabled) ? "is-dim" : ""}>
                    <td>
                      <span class={`pill ${flag(row().running) ? "pill-good" : "pill-muted"}`}>
                        {flag(row().running) ? "运行" : "停止"}
                      </span>
                    </td>
                    <td class="font-mono text-[12.5px]">{row().name}</td>
                    <td>
                      <Pill tone="accent">{row()["vlan-id"]}</Pill>
                    </td>
                    <td class="font-mono text-[12.5px]">{row().interface}</td>
                    <td class="text-muted">{row().mtu || "—"}</td>
                    <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                    <td>
                      <EnableSwitch menu={MENU} row={row()} label={row().name} />
                    </td>
                    <td>
                      <Show when={can("write")}>
                        <RowMenu
                          items={[
                            { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing(row()) },
                            {
                              label: "删除",
                              icon: <Trash2 aria-hidden="true" />,
                              danger: true,
                              onSelect: () => setDeleting(row()),
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
        </section>
      </Show>

      <Show when={editing()} keyed>
        {(current) => (
          <VlanForm
            entry={current === "new" ? undefined : current}
            interfaces={interfaces()}
            onClose={() => setEditing(null)}
          />
        )}
      </Show>
      <Show when={deleting()} keyed>
        {(row) => (
          <ConfirmDialog
            title="删除 VLAN？"
            message={`将删除 VLAN 接口 ${row.name}（VLAN ID ${row["vlan-id"]}）。引用此接口的规则需手动更新。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除 VLAN", () => ros.remove(MENU, row[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
