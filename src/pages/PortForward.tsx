import { Copy, Pencil, Trash2, TriangleAlert } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { PortForwardForm } from "../components/PortForwardForm";
import { EmptyState, PageHeader } from "../components/ui";
import { ros } from "../lib/api";
import { describePorts } from "../lib/firewall";
import { formatBytes } from "../lib/format";
import { flag, num, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const NAT = "/rest/ip/firewall/nat";

/** UniFi "Port Forwarding": friendly view over NAT dstnat rules. */
export function PortForwardPage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);
  const rules = createMemo(() => dash.nat().filter((rule) => rule.chain === "dstnat"));
  const clientName = (ip: string | undefined) => {
    if (!ip) return "";
    const client = dash.clients().find((item) => item.ip === ip);
    return client ? client.title : "";
  };
  const incoming = (rule: RosRecord) =>
    rule["in-interface-list"] ? `列表 ${rule["in-interface-list"]}` : rule["in-interface"] || rule["dst-address"] || "任意";

  return (
    <div>
      <PageHeader title="端口转发" subtitle="让外网通过路由器的端口访问内网设备（NAT dstnat 规则）">
        <AddButton label="新建端口转发" onClick={() => setEditing("new")} />
      </PageHeader>

      <div class="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-panel px-4 py-3 text-[12.5px] text-muted">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
        <p>
          转发规则只负责改写目的地址。RouterOS 默认防火墙用 <span class="font-mono">connection-nat-state=!dstnat</span> 的 forward
          规则丢弃外网新连接，经过转发的连接会被放行；如果你改过默认防火墙，记得在 forward 链放行这些连接，否则外网仍然连不进来。
        </p>
      </div>

      <Show
        when={rules().length > 0}
        fallback={
          <EmptyState
            title={dash.ready() ? "还没有端口转发" : "正在读取"}
            detail="例如把外网 8443 端口转发到 NAS 的 443，就能在外面访问家里的 NAS。点右上角“新建端口转发”开始。"
          />
        }
      >
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>外部端口</th>
                <th>转发到</th>
                <th>入口</th>
                <th>来源限制</th>
                <th>命中流量</th>
                <th>启用</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={rules()} keyed={(rule) => rule[".id"]}>
                {(rule) => (
                  <tr class={flag(rule().disabled) ? "is-dim" : ""}>
                    <td class="font-medium">{rule().comment || <span class="text-faint">未命名</span>}</td>
                    <td class="font-mono text-[12.5px]">{describePorts(rule())}</td>
                    <td>
                      <div class="font-mono text-[12.5px]">
                        {rule()["to-addresses"] || "—"}
                        {rule()["to-ports"] ? `:${rule()["to-ports"]}` : ""}
                      </div>
                      <Show when={clientName(rule()["to-addresses"])}>
                        <div class="text-[12px] text-faint">{clientName(rule()["to-addresses"])}</div>
                      </Show>
                    </td>
                    <td class="text-[12.5px]">{incoming(rule())}</td>
                    <td class="font-mono text-[12.5px]">{rule()["src-address"] || <span class="font-sans text-faint">任意</span>}</td>
                    <td class="num text-[12.5px] text-muted">{formatBytes(num(rule().bytes) ?? 0)}</td>
                    <td>
                      <EnableSwitch menu={NAT} row={rule()} label={rule().comment || "端口转发"} />
                    </td>
                    <td>
                      <Show when={can("write") && !flag(rule().dynamic)}>
                        <RowMenu
                          items={[
                            { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing(rule()) },
                            {
                              label: "复制为新规则",
                              icon: <Copy aria-hidden="true" />,
                              onSelect: () => setEditing({ ...rule(), ".id": "", comment: `${rule().comment || "端口转发"} 副本` }),
                            },
                            { label: "删除", icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDeleting(rule()) },
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
        {(target) => <PortForwardForm rule={target === "new" ? undefined : target} onClose={() => setEditing(null)} />}
      </Show>
      <Show when={deleting()} keyed>
        {(rule) => (
          <ConfirmDialog
            title="删除端口转发？"
            message={`将删除“${rule.comment || describePorts(rule)}”，外网将无法再通过这个端口访问 ${rule["to-addresses"] || "内网设备"}。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除端口转发", () => ros.remove(NAT, rule[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
