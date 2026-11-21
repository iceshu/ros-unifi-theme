import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { AddressForm } from "../components/NetconfAddressForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { EmptyState, PageHeader } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const MENU = "/rest/ip/address";

export function AddressesPage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);

  const interfaces = createMemo(() => [
    ...new Set(dash.interfaces().map((r) => r.name).filter(Boolean)),
  ]);

  return (
    <div>
      <PageHeader title="IP 地址" subtitle="接口绑定的 IP 地址；动态地址（如 PPPoE、DHCP）只读">
        <AddButton label="添加地址" onClick={() => setEditing("new")} />
      </PageHeader>
      <Show
        when={dash.addresses().length > 0}
        fallback={<EmptyState title={dash.ready() ? "没有 IP 地址" : "正在读取"} />}
      >
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>地址/前缀</th>
                <th>接口</th>
                <th>网络</th>
                <th>备注</th>
                <th>启用</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={dash.addresses()} keyed={(row) => row[".id"]}>
                {(row) => {
                  const isDynamic = () => flag(row().dynamic) || flag(row().invalid);
                  return (
                    <tr class={flag(row().disabled) ? "is-dim" : ""}>
                      <td class="font-mono text-[12.5px]">{row().address}</td>
                      <td>
                        <span class="pill pill-accent">{row().interface}</span>
                      </td>
                      <td class="font-mono text-[12px] text-muted">{row().network || "—"}</td>
                      <td class="text-[12.5px] text-muted">
                        {row().comment || ""}
                        {isDynamic() ? <span class="ml-1.5 pill pill-muted">动态</span> : null}
                      </td>
                      <td>
                        <Show when={!isDynamic()}>
                          <EnableSwitch menu={MENU} row={row()} label={row().address} confirm="管理地址变更可能导致断开连接" />
                        </Show>
                      </td>
                      <td>
                        <Show when={can("write") && !isDynamic()}>
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
                  );
                }}
              </For>
            </tbody>
          </table>
        </section>
      </Show>

      <Show when={editing()} keyed>
        {(current) => (
          <AddressForm
            entry={current === "new" ? undefined : current}
            interfaces={interfaces()}
            onClose={() => setEditing(null)}
          />
        )}
      </Show>
      <Show when={deleting()} keyed>
        {(row) => (
          <ConfirmDialog
            title="删除 IP 地址？"
            message={`将从接口 ${row.interface} 删除地址 ${row.address}。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除地址", () => ros.remove(MENU, row[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
