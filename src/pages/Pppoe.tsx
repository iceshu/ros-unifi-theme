import { Pencil, RefreshCw, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { PppoeForm } from "../components/NetconfPppoeForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const MENU = "/rest/interface/pppoe-client";

export function PppoePage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);
  const [redialing, setRedialing] = createSignal<RosRecord | null>(null);

  const etherInterfaces = createMemo(() =>
    dash.interfaces().filter((r) => r.type === "ether").map((r) => r.name).filter(Boolean),
  );

  const ipOf = (name: string) =>
    dash.addresses().find((a) => a.interface === name && !flag(a.disabled))?.address ?? null;

  const ifaceRow = (name: string) =>
    dash.interfaces().find((r) => r.name === name);

  return (
    <div>
      <PageHeader title="PPPoE 拨号" subtitle="PPPoE 客户端接口；密码写入后不可读取">
        <AddButton label="新建拨号" onClick={() => setEditing("new")} />
      </PageHeader>
      <Show
        when={dash.pppoe().length > 0}
        fallback={
          <EmptyState
            title={dash.ready() ? "没有 PPPoE 拨号" : "正在读取"}
            detail="需要 write 策略才能创建。典型用途：光猫桥接模式下由路由器直接拨号。"
          />
        }
      >
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>名称</th>
                <th>上行接口</th>
                <th>用户名</th>
                <th>当前 IP</th>
                <th>运行时间</th>
                <th>备注</th>
                <th>启用</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={dash.pppoe()} keyed={(row) => row[".id"]}>
                {(row) => {
                  const iface = () => ifaceRow(row().name);
                  const running = () => flag(iface()?.running);
                  const ip = () => ipOf(row().name);
                  return (
                    <tr class={flag(row().disabled) ? "is-dim" : ""}>
                      <td>
                        <Pill tone={running() ? "good" : flag(row().disabled) ? "muted" : "warn"}>
                          {running() ? "已连接" : flag(row().disabled) ? "禁用" : "断开"}
                        </Pill>
                      </td>
                      <td class="font-mono text-[12.5px]">{row().name}</td>
                      <td class="font-mono text-[12.5px]">{row().interface}</td>
                      <td class="text-[12.5px]">{row().user || "—"}</td>
                      <td class="font-mono text-[12px] text-muted">{ip() ?? "—"}</td>
                      <td class="text-[12.5px] text-muted">{iface()?.uptime ?? "—"}</td>
                      <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                      <td>
                        <EnableSwitch menu={MENU} row={row()} label={row().name} confirm="禁用拨号接口会断开互联网连接" />
                      </td>
                      <td>
                        <Show when={can("write")}>
                          <RowMenu
                            items={[
                              {
                                label: "重新拨号",
                                icon: <RefreshCw aria-hidden="true" />,
                                onSelect: () => setRedialing(row()),
                              },
                              {
                                label: "编辑",
                                icon: <Pencil aria-hidden="true" />,
                                onSelect: () => setEditing(row()),
                              },
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
          <PppoeForm
            entry={current === "new" ? undefined : current}
            interfaces={etherInterfaces()}
            onClose={() => setEditing(null)}
          />
        )}
      </Show>

      <Show when={redialing()} keyed>
        {(row) => (
          <ConfirmDialog
            title="重新拨号？"
            message={
              <>
                <p>将断开 <strong>{row.name}</strong> 并立即重连，互联网访问会短暂中断（通常 5–15 秒）。</p>
                <p class="mt-2 text-[12.5px] text-muted">如果您正在通过此拨号访问路由器，可能短暂失联。</p>
              </>
            }
            confirmLabel="确认重拨"
            onClose={() => setRedialing(null)}
            onConfirm={async () => {
              const id = row[".id"];
              return runWrite(dash, "重新拨号成功", async () => {
                await ros.update(MENU, id, { disabled: "true" });
                await new Promise<void>((r) => setTimeout(r, 600));
                await ros.update(MENU, id, { disabled: "false" });
              });
            }}
          />
        )}
      </Show>

      <Show when={deleting()} keyed>
        {(row) => (
          <ConfirmDialog
            title="删除 PPPoE 拨号？"
            message={`将删除 ${row.name}（用户名：${row.user}）。如果它是默认路由的来源，删除后互联网访问将中断。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除拨号", () => ros.remove(MENU, row[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
