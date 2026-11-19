import { For } from "solid-js";
import { EmptyState } from "./ui";
import type { RosRecord } from "../lib/model";

export function AllFields(props: { row: RosRecord }) {
  return <dl class="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
    <For each={Object.entries(props.row).filter(([key]) => key !== ".id")}>
      {(entry) => <div class="min-w-0"><dt class="text-xs text-faint">{entry[0]}</dt><dd class="break-all font-mono text-xs">{String(entry[1])}</dd></div>}
    </For>
  </dl>;
}

export function ReadTable(props: { title?: string; rows: RosRecord[]; fields: string[] }) {
  return <section class="mb-4">
    {props.title ? <h2 class="mb-2 text-sm text-muted">{props.title}</h2> : null}
    {props.rows.length === 0 ? <EmptyState title="没有数据（菜单可能未安装或未配置）" /> :
      <div class="card overflow-x-auto"><table class="data-table">
        <thead><tr><For each={props.fields}>{(field) => <th>{field}</th>}</For></tr></thead>
        <tbody><For each={props.rows}>{(row) => <tr><For each={props.fields}>{(field) => <td class="break-words font-mono text-xs">{row[field] ?? "—"}</td>}</For></tr>}</For></tbody>
      </table></div>}
  </section>;
}
