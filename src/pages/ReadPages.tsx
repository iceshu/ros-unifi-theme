import { createMemo, createSignal } from "solid-js";
import { ReadTable } from "../components/ReadData";
import { useTableKeyboard } from "../components/TableSort";
import { PageHeader } from "../components/ui";
import { useDashboard } from "../lib/store";

export function NeighborsPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="邻居" subtitle="LLDP / CDP / MNDP 发现的相邻设备" />
      <ReadTable title="发现的设备" rows={dash.neighbors()} fields={["interface", "identity", "address", "mac-address", "platform", "version", "interface-name"]} />
    </div>
  );
}

export function LogPage() {
  const dash = useDashboard();
  let search: HTMLInputElement | undefined;
  useTableKeyboard(() => search);
  const [query, setQuery] = createSignal("");
  const rows = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return dash
      .logEntries()
      .slice(-200)
      .reverse()
      .filter((row) => [row.time, row.topics, row.message].join(" ").toLowerCase().includes(needle));
  });
  return (
    <div>
      <PageHeader title="日志" subtitle="最近 200 条，最新在前；按 / 搜索">
        <input ref={search} class="field" type="search" aria-label="搜索日志" placeholder="搜索日志" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
      </PageHeader>
      <ReadTable rows={rows()} fields={["time", "topics", "message"]} searchable={false} title="日志" />
    </div>
  );
}
