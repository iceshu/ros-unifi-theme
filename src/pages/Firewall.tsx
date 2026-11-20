import { ArrowDown, ArrowRight, ArrowUp, Copy, Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { FirewallRuleForm } from "../components/FirewallRuleForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { ReadTable } from "../components/ReadData";
import { createTableSort, SortHeader } from "../components/TableSort";
import { EmptyState, PageHeader, Pill, Segmented } from "../components/ui";
import { ros } from "../lib/api";
import { moveRule } from "../lib/firewall";
import { formatBytes } from "../lib/format";
import { actionLabel, actionTone, chainLabel, firewallMatchers, flag, num, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const FILTER = "/rest/ip/firewall/filter";

export function FirewallPage() {
  const dash = useDashboard();
  const sorting = createTableSort<{ rule: RosRecord; index: number }>();
  const [tab, setTab] = createSignal<"filter" | "mangle">("filter");
  const [chain, setChain] = createSignal("all");
  const [query, setQuery] = createSignal("");
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<{ rule: RosRecord; index: number } | null>(null);
  const move = (rule: RosRecord, direction: "up" | "down") => {
    const op = moveRule(FILTER, dash.firewall(), rule[".id"], direction);
    if (op) void runWrite(dash, direction === "up" ? "已上移规则" : "已下移规则", op);
  };
  const chains = createMemo(() => {
    const seen = new Set<string>();
    for (const rule of dash.firewall()) if (rule.chain) seen.add(rule.chain);
    const preferred = ["input", "forward", "output"].filter((name) => seen.has(name));
    return [...preferred, ...[...seen].filter((name) => !preferred.includes(name)).sort()];
  });
  const rows = createMemo(() =>
    dash.firewall().flatMap((rule, index) => {
      if (chain() !== "all" && rule.chain !== chain()) return [];
      const blob = [rule.chain, rule.action, rule.comment, ...firewallMatchers(rule)].join(" ").toLowerCase();
      if (query().trim() && !blob.includes(query().trim().toLowerCase())) return [];
      return [{ rule, index }];
    }),
  );
  const sorted = () => sorting.rows(rows(), (item, key) => (key === "bytes" || key === "packets" ? num(item.rule[key]) : item.rule[key]));
  const maxBytes = createMemo(() => Math.max(1, ...dash.firewall().map((rule) => num(rule.bytes) ?? 0)));

  return (
    <div>
      <PageHeader title="防火墙" subtitle={`${dash.firewall().length} 条 filter 规则 · ${dash.firewall().filter((rule) => flag(rule.disabled)).length} 条已禁用`}>
        <div class="flex flex-wrap items-center gap-2">
          <Segmented
            label="规则表"
            value={tab()}
            onChange={setTab}
            options={[
              { value: "filter", label: "过滤 filter" },
              { value: "mangle", label: "标记 mangle" },
            ]}
          />
          <a class="chip" href="/nat">
            NAT <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <Show when={tab() === "filter"}>
            <AddButton label="新建规则" onClick={() => setEditing("new")} />
          </Show>
        </div>
      </PageHeader>
      <Show
        when={tab() === "filter"}
        fallback={<ReadTable title="mangle" rows={dash.mangle()} fields={["chain", "action", "src-address", "dst-address", "new-routing-mark", "new-packet-mark", "passthrough", "comment", "disabled", "bytes", "packets"]} />}
      >
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" class={chain() === "all" ? "chip is-on" : "chip"} onClick={() => setChain("all")}>
            全部 <span class="count">{dash.firewall().length}</span>
          </button>
          <For each={chains()}>
            {(name) => (
              <button type="button" class={chain() === name ? "chip is-on" : "chip"} aria-pressed={chain() === name ? "true" : "false"} onClick={() => setChain(name)}>
                {chainLabel(name)} <span class="count">{dash.firewall().filter((rule) => rule.chain === name).length}</span>
              </button>
            )}
          </For>
          <div class="flex-1" />
          <input class="field" type="search" placeholder="搜索规则" aria-label="搜索规则" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
        </div>
        <Show when={rows().length > 0} fallback={<EmptyState title={dash.ready() ? "没有规则" : "正在读取"} />}>
          <section class="card table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="w-12">#</th>
                  <SortHeader column="chain" state={sorting.sort()} toggle={sorting.toggle}>规则</SortHeader>
                  <SortHeader column="action" state={sorting.sort()} toggle={sorting.toggle}>动作</SortHeader>
                  <SortHeader column="bytes" state={sorting.sort()} toggle={sorting.toggle}>命中流量</SortHeader>
                  <SortHeader column="packets" state={sorting.sort()} toggle={sorting.toggle}>包数</SortHeader>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={sorted()} keyed={(row) => row.rule[".id"] || String(row.index)}>
                  {(item) => {
                    const rule = () => item().rule;
                    const matchers = () => firewallMatchers(rule());
                    return (
                      <tr class={flag(rule().disabled) ? "is-dim" : ""}>
                        <td class="font-mono text-[12px] text-faint">{item().index}</td>
                        <td>
                          <div class="font-medium">{rule().comment || matchers()[0] || "全部流量"}</div>
                          <div class="mt-1 flex max-w-2xl flex-wrap items-center gap-1 text-[11.5px] text-faint">
                            <span class="pill pill-accent">{chainLabel(rule().chain)}</span>
                            <For each={rule().comment ? matchers() : matchers().slice(1)}>{(part) => <span class="pill pill-muted">{part}</span>}</For>
                          </div>
                        </td>
                        <td class="whitespace-nowrap">
                          <Pill tone={actionTone(rule().action)}>{actionLabel(rule().action)}</Pill>
                          {flag(rule().disabled) ? <span class="ml-2 text-[11.5px] text-faint">已禁用</span> : null}
                          <Show when={!flag(rule().dynamic)}>
                            <span class="ml-2 align-middle">
                              <EnableSwitch
                                menu={FILTER}
                                row={rule()}
                                label={rule().comment || `规则 ${item().index}`}
                                confirm={rule().chain === "input" ? "禁用 input 链规则可能影响你访问路由器本身（包括这个页面）。" : undefined}
                              />
                            </span>
                          </Show>
                        </td>
                        <td class="w-48">
                          <div class="num text-[12.5px]">{formatBytes(num(rule().bytes) ?? 0)}</div>
                          <div class="meter mt-1">
                            <i style={{ width: `${Math.sqrt((num(rule().bytes) ?? 0) / maxBytes()) * 100}%` }} />
                          </div>
                        </td>
                        <td class="num text-[12.5px] text-muted">{(num(rule().packets) ?? 0).toLocaleString("zh-CN")}</td>
                        <td>
                          <Show when={can("write") && !flag(rule().dynamic)}>
                            <RowMenu
                              items={[
                                { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing(rule()) },
                                { label: "复制为新规则", icon: <Copy aria-hidden="true" />, onSelect: () => setEditing({ ...rule(), ".id": "" }) },
                                { label: "上移", icon: <ArrowUp aria-hidden="true" />, disabled: item().index === 0, onSelect: () => move(rule(), "up") },
                                {
                                  label: "下移",
                                  icon: <ArrowDown aria-hidden="true" />,
                                  disabled: item().index === dash.firewall().length - 1,
                                  onSelect: () => move(rule(), "down"),
                                },
                                { label: "删除", icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDeleting(item()) },
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
      </Show>
      <Show when={editing()} keyed>
        {(current) => <FirewallRuleForm rule={current === "new" ? undefined : current} rules={dash.firewall()} onClose={() => setEditing(null)} />}
      </Show>
      <Show when={deleting()} keyed>
        {(target) => (
          <ConfirmDialog
            title="删除防火墙规则？"
            message={`将删除 #${target.index}“${target.rule.comment || firewallMatchers(target.rule)[0] || `${target.rule.chain} ${target.rule.action}`}”。删除 input 链的放行规则可能让你无法访问路由器。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除规则", () => ros.remove(FILTER, target.rule[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
