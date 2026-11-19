import { createMemo, createSignal, For } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { formatBytes } from "../lib/format";
import { actionLabel, actionTone, chainLabel, firewallMatchers, flag, num } from "../lib/model";
import { useDashboard } from "../lib/store";

export function FirewallPage() {
  const dash = useDashboard();
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
      <PageHeader
        title="防火墙"
        description="IPv4 filter 规则，只展示链、动作、注释和主要匹配条件。没有开关，代理也会拒绝任何写回。"
      />
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <input
          class="field"
          type="search"
          placeholder="搜索注释、动作或匹配条件"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <ChainChip label="全部" on={chain() === "all"} click={() => setChain("all")} />
        <For each={chains()}>
          {(name) => <ChainChip label={chainLabel(name)} on={chain() === name} click={() => setChain(name)} />}
        </For>
      </div>
      {rows().length === 0 ? (
        <EmptyState
          title={dash.ready() ? "没有可显示的规则" : "正在读取防火墙"}
          detail="来自 GET /rest/ip/firewall/filter。序号与路由器上的顺序一致，从 0 开始。"
        />
      ) : (
        <div class="card overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>链</th>
                <th>动作</th>
                <th>匹配</th>
                <th>流量</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()} keyed={(row) => row.rule[".id"] || String(row.index)}>
                {(item) => {
                  const rule = () => item().rule;
                  const matchers = () => firewallMatchers(rule());
                  return (
                    <tr class={flag(rule().disabled) ? "opacity-50" : ""}>
                      <td class="font-mono text-faint">{item().index}</td>
                      <td>{chainLabel(rule().chain)}</td>
                      <td>
                        <Pill tone={actionTone(rule().action)}>{actionLabel(rule().action)}</Pill>
                        {flag(rule().disabled) ? <div class="mt-1 text-xs text-faint">已禁用</div> : null}
                        {rule().comment ? <div class="mt-1 max-w-xs text-sm text-muted">{rule().comment}</div> : null}
                      </td>
                      <td>
                        <div class="flex max-w-xl flex-wrap gap-1.5">
                          {matchers().length === 0 ? <span class="text-faint">无额外条件</span> : null}
                          <For each={matchers()}>{(part) => <span class="pill pill-muted">{part}</span>}</For>
                        </div>
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
