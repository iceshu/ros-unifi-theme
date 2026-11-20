import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { NatRuleForm } from "../components/NatRuleForm";
import { PortForwardForm } from "../components/PortForwardForm";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { moveRule } from "../lib/firewall";
import { formatBytes } from "../lib/format";
import { firewallMatchers, flag, num, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const NAT = "/rest/ip/firewall/nat";

function target(rule: RosRecord): string {
  if (rule.action === "masquerade") return "出口地址";
  if (rule.action === "redirect") return `本机${rule["to-ports"] ? `:${rule["to-ports"]}` : ""}`;
  if (!rule["to-addresses"] && !rule["to-ports"]) return "—";
  return `${rule["to-addresses"] || "原地址"}${rule["to-ports"] ? `:${rule["to-ports"]}` : ""}`;
}

export function NatPage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);
  const move = (rule: RosRecord, direction: "up" | "down") => {
    const op = moveRule(NAT, dash.nat(), rule[".id"], direction);
    if (op) void runWrite(dash, direction === "up" ? "已上移" : "已下移", op);
  };
  /** Port forwards open the friendlier form; everything else the generic NAT form. */
  const isPortForward = (rule: RosRecord) => rule.chain === "dstnat" && rule.action === "dst-nat" && !!rule["dst-port"];

  return (
    <div>
      <PageHeader title="NAT" subtitle="源地址转换（上网）与目的地址转换（端口转发），按顺序匹配">
        <AddButton label="新建 NAT 规则" onClick={() => setEditing("new")} />
      </PageHeader>
      <Show when={dash.nat().length > 0} fallback={<EmptyState title={dash.ready() ? "没有 NAT 规则" : "正在读取"} />}>
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-12">#</th>
                <th>规则</th>
                <th>动作</th>
                <th>转换到</th>
                <th>命中流量</th>
                <th>启用</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={dash.nat()} keyed={(rule) => rule[".id"]}>
                {(rule, index) => (
                  <tr class={flag(rule().disabled) ? "is-dim" : ""}>
                    <td class="font-mono text-[12px] text-faint">{index()}</td>
                    <td>
                      <div class="font-medium">{rule().comment || firewallMatchers(rule())[0] || "全部流量"}</div>
                      <div class="mt-1 flex max-w-2xl flex-wrap items-center gap-1 text-[11.5px]">
                        <span class="pill pill-accent">{rule().chain}</span>
                        <For each={rule().comment ? firewallMatchers(rule()) : firewallMatchers(rule()).slice(1)}>
                          {(part) => <span class="pill pill-muted">{part}</span>}
                        </For>
                        {flag(rule().dynamic) ? <span class="pill pill-muted">动态</span> : null}
                      </div>
                    </td>
                    <td>
                      <Pill tone={rule().action === "masquerade" || rule().action === "src-nat" ? "good" : "accent"}>{rule().action}</Pill>
                    </td>
                    <td class="font-mono text-[12.5px]">{target(rule())}</td>
                    <td class="num text-[12.5px] text-muted">{formatBytes(num(rule().bytes) ?? 0)}</td>
                    <td>
                      <Show when={!flag(rule().dynamic)}>
                        <EnableSwitch
                          menu={NAT}
                          row={rule()}
                          label={rule().comment || `NAT 规则 ${index()}`}
                          confirm={rule().action === "masquerade" ? "禁用伪装规则后，局域网设备可能无法上网。" : undefined}
                        />
                      </Show>
                    </td>
                    <td>
                      <Show when={can("write") && !flag(rule().dynamic)}>
                        <RowMenu
                          items={[
                            { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing(rule()) },
                            { label: "复制为新规则", icon: <Copy aria-hidden="true" />, onSelect: () => setEditing({ ...rule(), ".id": "" }) },
                            { label: "上移", icon: <ArrowUp aria-hidden="true" />, disabled: index() === 0, onSelect: () => move(rule(), "up") },
                            { label: "下移", icon: <ArrowDown aria-hidden="true" />, disabled: index() === dash.nat().length - 1, onSelect: () => move(rule(), "down") },
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
        {(current) =>
          current !== "new" && isPortForward(current) ? (
            <PortForwardForm rule={current} onClose={() => setEditing(null)} />
          ) : (
            <NatRuleForm rule={current === "new" ? undefined : current} rules={dash.nat()} onClose={() => setEditing(null)} />
          )
        }
      </Show>
      <Show when={deleting()} keyed>
        {(rule) => (
          <ConfirmDialog
            title="删除 NAT 规则？"
            message={
              rule.action === "masquerade"
                ? "这是一条伪装（上网）规则，删除后局域网设备可能无法访问互联网。"
                : `将删除“${rule.comment || `${rule.chain} ${rule.action}`}”。`
            }
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除 NAT 规则", () => ros.remove(NAT, rule[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
