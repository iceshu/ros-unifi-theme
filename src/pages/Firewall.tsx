import { ArrowRight } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ReadTable } from "../components/ReadData";
import { createTableSort, SortHeader } from "../components/TableSort";
import { EmptyState, PageHeader, Pill, Segmented } from "../components/ui";
import { WriteToggle } from "../components/WriteToggle";
import { formatBytes } from "../lib/format";
import { actionLabel, actionTone, chainLabel, firewallMatchers, flag, num, type RosRecord } from "../lib/model";
import { useDashboard } from "../lib/store";

export function FirewallPage() {
  const dash = useDashboard();
  const sorting = createTableSort<{ rule: RosRecord; index: number }>();
  const [tab, setTab] = createSignal<"filter" | "mangle">("filter");
  const [chain, setChain] = createSignal("all");
  const [query, setQuery] = createSignal("");
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
        <div class="flex items-center gap-2">
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
                          <WriteToggle path="/rest/ip/firewall/filter" row={rule()} />
                        </td>
                        <td class="w-48">
                          <div class="num text-[12.5px]">{formatBytes(num(rule().bytes) ?? 0)}</div>
                          <div class="meter mt-1">
                            <i style={{ width: `${Math.sqrt((num(rule().bytes) ?? 0) / maxBytes()) * 100}%` }} />
                          </div>
                        </td>
                        <td class="num text-[12.5px] text-muted">{(num(rule().packets) ?? 0).toLocaleString("zh-CN")}</td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </section>
        </Show>
      </Show>
    </div>
  );
}
