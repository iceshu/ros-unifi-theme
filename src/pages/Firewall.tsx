import { createTableSort, SortHeader } from "../components/TableSort";
import type { RosRecord } from "../lib/model";
import { WriteToggle } from "../components/WriteToggle";
import { createMemo, createSignal, For } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { formatBytes } from "../lib/format";
import { actionLabel, actionTone, chainLabel, firewallMatchers, flag, num } from "../lib/model";
import { ReadTable } from "../components/ReadData";
import { useDashboard } from "../lib/store";

export function FirewallPage() {
  const dash = useDashboard();
  const sorting = createTableSort<{ rule: RosRecord; index: number }>();
  const sorted = () => sorting.rows(rows(), (item, key) => key === "bytes" || key === "packets" ? num(item.rule[key]) : item.rule[key]);
  const [tab, setTab] = createSignal("filter");
  const [chain, setChain] = createSignal("all");
  const [query, setQuery] = createSignal("");
  const chains = createMemo(() => {
    const seen = new Set<string>();
    for (const rule of dash.firewall()) if (rule.chain) seen.add(rule.chain);
    const preferred = ["input", "forward", "output"].filter((name) => seen.has(name));
    const rest = [...seen].filter((name) => !preferred.includes(name)).sort();
    return [...preferred, ...rest];
  });
  const rows = createMemo(() =>
    dash.firewall().flatMap((rule, index) => {
      if (chain() !== "all" && rule.chain !== chain()) return [];
      const blob = [rule.chain, rule.action, rule.comment, ...firewallMatchers(rule)].join(" ").toLowerCase();
      if (query().trim() && !blob.includes(query().trim().toLowerCase())) return [];
      return [{ rule, index }];
    }),
  );

  return (
    <div>
      <PageHeader title="防火墙" />
      <div class="mb-4 flex gap-2">
        <ChainChip label="filter" on={tab() === "filter"} click={() => setTab("filter")} />
        <a class="chip" href="/nat">NAT →</a>
        <ChainChip label="mangle" on={tab() === "mangle"} click={() => setTab("mangle")} />
      </div>
      {tab() === "mangle" ? <ReadTable rows={dash.mangle()} fields={["chain", "action", "src-address", "dst-address", "new-routing-mark", "new-packet-mark", "passthrough", "comment", "disabled", "bytes", "packets"]} /> : <>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <input
          class="field"
          type="search"
          placeholder="搜索"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <ChainChip label="全部" on={chain() === "all"} click={() => setChain("all")} />
        <For each={chains()}>
          {(name) => <ChainChip label={chainLabel(name)} on={chain() === name} click={() => setChain(name)} />}
        </For>
      </div>
      {rows().length === 0 ? (
        <EmptyState title={dash.ready() ? "没有规则" : "正在读取"} />
      ) : (
        <div class="card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>序号</th>
                <SortHeader column="chain" state={sorting.sort()} toggle={sorting.toggle}>规则</SortHeader>
                <SortHeader column="action" state={sorting.sort()} toggle={sorting.toggle}>动作</SortHeader>
                <th>
                  <button type="button" aria-pressed={sorting.sort()?.key === "bytes" ? "true" : "false"} onClick={() => sorting.toggle("bytes")}>流量 <span aria-hidden="true">{sorting.sort()?.key === "bytes" ? (sorting.sort()?.desc ? "↓" : "↑") : "↕"}</span></button>
                  {" / "}
                  <button type="button" aria-pressed={sorting.sort()?.key === "packets" ? "true" : "false"} onClick={() => sorting.toggle("packets")}>包 <span aria-hidden="true">{sorting.sort()?.key === "packets" ? (sorting.sort()?.desc ? "↓" : "↑") : "↕"}</span></button>
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={sorted()} keyed={(row) => row.rule[".id"] || String(row.index)}>
                {(item) => {
                  const rule = () => item().rule;
                  const matchers = () => firewallMatchers(rule());
                  return (
                    <tr class={flag(rule().disabled) ? "opacity-45" : ""}>
                      <td class="font-mono text-xs text-faint">{item().index}</td>
                      <td>
                        <div class="font-medium">{rule().comment || matchers()[0] || "—"}</div>
                        <div class="mt-1 flex max-w-xl flex-wrap items-center gap-1 text-[11px] text-faint">
                          <span>{chainLabel(rule().chain)}</span>
                          <For each={rule().comment ? matchers() : matchers().slice(1)}>
                            {(part) => <span class="pill pill-muted">{part}</span>}
                          </For>
                        </div>
                      </td>
                      <td>
                        <Pill tone={actionTone(rule().action)}>{actionLabel(rule().action)}</Pill>
                        {flag(rule().disabled) ? <span class="ml-2 text-[11px] text-faint">禁用</span> : null}
                        <WriteToggle path="/rest/ip/firewall/filter" row={rule()} />
                      </td>
                      <td class="whitespace-nowrap text-sm text-muted">
                        <div>{formatBytes(num(rule().bytes) ?? 0)}</div>
                        <div>{rule().packets || "0"} 包</div>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      )}
      </>}
    </div>
  );
}

function ChainChip(props: { label: string; on: boolean; click: () => void }) {
  return (
    <button type="button" class={props.on ? "chip is-on" : "chip"} aria-pressed={props.on ? "true" : "false"} onClick={() => props.click()}>
      {props.label}
    </button>
  );
}
