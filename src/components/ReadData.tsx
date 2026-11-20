import { ChevronRight } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { formatBytes } from "../lib/format";
import type { RosRecord } from "../lib/model";
import { CopyText } from "./CopyText";
import { createTableSort, SortHeader } from "./TableSort";
import { EmptyState } from "./ui";

/** Chinese headers for RouterOS keys shown in generic tables. Unknown keys fall back to the raw key. */
const LABELS: Record<string, string> = {
  name: "名称",
  chain: "链",
  action: "动作",
  "src-address": "源地址",
  "dst-address": "目的地址",
  "src-port": "源端口",
  "dst-port": "目的端口",
  "to-addresses": "转换到地址",
  "to-ports": "转换到端口",
  protocol: "协议",
  "in-interface": "入接口",
  "out-interface": "出接口",
  "in-interface-list": "入接口列表",
  "out-interface-list": "出接口列表",
  comment: "备注",
  disabled: "状态",
  bytes: "流量",
  packets: "包数",
  list: "列表",
  address: "地址",
  timeout: "超时",
  dynamic: "动态",
  interface: "接口",
  "address-pool": "地址池",
  "lease-time": "租期",
  gateway: "网关",
  "dns-server": "DNS 服务器",
  ranges: "范围",
  "next-pool": "下一个池",
  type: "类型",
  "mac-address": "MAC 地址",
  identity: "标识",
  platform: "平台",
  version: "版本",
  "interface-name": "对端接口",
  target: "目标",
  "max-limit": "上限（上/下）",
  running: "运行",
  ssid: "SSID",
  country: "国家",
  mode: "模式",
  "signal-strength": "信号",
  "tx-rate": "发送速率",
  "rx-rate": "接收速率",
  uptime: "在线时长",
  service: "服务",
  "caller-id": "来电标识",
  "vlan-id": "VLAN ID",
  mtu: "MTU",
  time: "时间",
  topics: "主题",
  message: "消息",
  "new-routing-mark": "新路由标记",
  "new-packet-mark": "新包标记",
  passthrough: "继续匹配",
};

export function fieldLabel(key: string): string {
  return LABELS[key] ?? key;
}

const BOOL = /^(true|false|yes|no)$/;

function Value(props: { field: string; value: string | undefined }) {
  const value = () => props.value ?? "";
  return (
    <>
      {value() === "" ? (
        <span class="text-faint">—</span>
      ) : props.field === "disabled" && BOOL.test(value()) ? (
        value() === "true" || value() === "yes" ? <span class="pill pill-muted">已禁用</span> : <span class="pill pill-good">启用</span>
      ) : BOOL.test(value()) ? (
        value() === "true" || value() === "yes" ? <span class="text-good">是</span> : <span class="text-faint">否</span>
      ) : props.field === "bytes" && /^\d+$/.test(value()) ? (
        <span class="num">{formatBytes(Number(value()))}</span>
      ) : props.field === "packets" && /^\d+$/.test(value()) ? (
        <span class="num">{Number(value()).toLocaleString("zh-CN")}</span>
      ) : props.field === "action" ? (
        <span class="pill pill-accent">{value()}</span>
      ) : /address|mac/.test(props.field) ? (
        <CopyText class="font-mono text-[12.5px]" value={value()} />
      ) : (
        <span class="break-words">{value()}</span>
      )}
    </>
  );
}

export function AllFields(props: { row: RosRecord; copy?: boolean }) {
  return (
    <dl class="mt-1 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      <For each={Object.entries(props.row).filter(([key]) => key !== ".id")}>
        {(entry) => (
          <div class="min-w-0">
            <dt class="text-[11px] text-faint">{entry[0]}</dt>
            <dd class="break-all font-mono text-[12px]">
              {props.copy && /address|host-name/.test(entry[0]) ? <CopyText value={String(entry[1])} /> : String(entry[1])}
            </dd>
          </div>
        )}
      </For>
    </dl>
  );
}

/**
 * Generic RouterOS list: Chinese headers, typed cells, search, sort, and a
 * click-to-expand row showing every field the router returned.
 */
export function ReadTable(props: { title?: string; rows: RosRecord[]; fields: string[]; searchable?: boolean; empty?: string }) {
  const sorting = createTableSort<RosRecord>();
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal<string | null>(null);
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase();
    if (!needle) return props.rows;
    return props.rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  });
  const rows = () =>
    sorting.rows(filtered(), (row, field) => {
      const value = row[field];
      return value != null && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value;
    });
  const keyOf = (row: RosRecord, index: number) => row[".id"] || `${index}`;
  return (
    <section class="card mb-4 overflow-hidden">
      <Show when={props.title || props.searchable !== false}>
        <div class="card-head">
          <h2 class="card-title">
            {props.title}
            <span class="ml-2 text-[12px] font-normal text-faint">{filtered().length} 条</span>
          </h2>
          <Show when={props.searchable !== false && props.rows.length > 5}>
            <input class="field" type="search" placeholder="筛选" aria-label="筛选" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
          </Show>
        </div>
      </Show>
      {props.rows.length === 0 ? (
        <div class="p-4">
          <EmptyState title={props.empty ?? "没有数据"} detail="菜单可能未安装、未配置，或这个账号看不到。" compact />
        </div>
      ) : (
        <div class="table-wrap border-t border-line">
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-8" aria-label="展开" />
                <For each={props.fields}>
                  {(field) => (
                    <SortHeader column={field} state={sorting.sort()} toggle={sorting.toggle}>
                      {fieldLabel(field)}
                    </SortHeader>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row, index) => {
                  const key = () => keyOf(row, index());
                  const expanded = () => open() === key();
                  return (
                    <>
                      <tr
                        class={`is-clickable ${row.disabled === "true" || row.disabled === "yes" ? "is-dim" : ""}`}
                        tabindex={0}
                        aria-expanded={expanded() ? "true" : "false"}
                        onClick={() => setOpen(expanded() ? null : key())}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            setOpen(expanded() ? null : key());
                          }
                        }}
                      >
                        <td class="text-faint">
                          <ChevronRight class="h-4 w-4 transition-transform" style={{ transform: expanded() ? "rotate(90deg)" : "none" }} aria-hidden="true" />
                        </td>
                        <For each={props.fields}>
                          {(field) => (
                            <td class="text-[13px]">
                              <Value field={field} value={row[field]} />
                            </td>
                          )}
                        </For>
                      </tr>
                      {expanded() ? (
                        <tr class="row-detail">
                          <td colspan={props.fields.length + 1} class="px-4 py-3">
                            <AllFields row={row} copy />
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
