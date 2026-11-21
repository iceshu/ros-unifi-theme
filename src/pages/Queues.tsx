import { Pencil, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { QueueForm } from "../components/QueueForm";
import { EmptyState, PageHeader } from "../components/ui";
import { parseRosRate } from "../lib/clients";
import { formatBytes } from "../lib/format";
import { type RosRecord } from "../lib/model";
import { ros } from "../lib/api";
import { runWrites } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

export function QueuesPage() {
  const dash = useDashboard();
  const [form, setForm] = createSignal<RosRecord | "new" | null>(null);
  const [deleteQueue, setDeleteQueue] = createSignal<RosRecord | null>(null);

  const clientName = (ip: string) => {
    const bare = ip.endsWith("/32") ? ip.slice(0, -3) : ip;
    return dash.clients().find((c) => c.ip === bare)?.title ?? null;
  };

  const doDelete = (queue: RosRecord) =>
    runWrites(dash, "已删除", [() => ros.remove("/rest/queue/simple", queue[".id"])]);

  return (
    <div>
      <PageHeader title="队列" subtitle="简单队列（限速）">
        <AddButton label="新建限速" onClick={() => setForm("new")} />
      </PageHeader>

      <section class="card table-wrap">
        <div class="card-head">
          <h2 class="card-title">简单队列</h2>
          <span class="text-[12.5px] text-muted">{dash.queues().length} 条</span>
        </div>
        <Show when={dash.queues().length > 0} fallback={<EmptyState title={dash.ready() ? "暂无队列" : "正在读取"} compact />}>
          <table class="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>目标</th>
                <th>上传上限</th>
                <th>下载上限</th>
                <th>用量</th>
                <th>启用</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={dash.queues()}>
                {(queue) => {
                  const rate = parseRosRate(queue["max-limit"]);
                  const name = clientName(queue.target || "");
                  // RouterOS reports "upload/download" byte counters.
                  const bytes = (queue.bytes || "").split("/").reduce((sum, part) => sum + (Number(part) || 0), 0);
                  return (
                    <tr>
                      <td class="font-medium">{queue.name}</td>
                      <td>
                        <div class="font-mono text-[12.5px]">{queue.target || "—"}</div>
                        <Show when={name}>
                          <div class="text-[11.5px] text-muted">{name}</div>
                        </Show>
                      </td>
                      <td>
                        <Show when={rate.upload} fallback={<span class="text-faint">不限</span>}>
                          <span class="num">{rate.upload}</span>{" "}
                          <span class="text-[11px] text-faint">Mbps</span>
                        </Show>
                      </td>
                      <td>
                        <Show when={rate.download} fallback={<span class="text-faint">不限</span>}>
                          <span class="num">{rate.download}</span>{" "}
                          <span class="text-[11px] text-faint">Mbps</span>
                        </Show>
                      </td>
                      <td class="text-muted text-[12.5px] num">{bytes ? formatBytes(bytes) : "—"}</td>
                      <td>
                        <EnableSwitch menu="/rest/queue/simple" row={queue} label={queue.name} />
                      </td>
                      <td>
                        <Show when={can("write")}>
                          <RowMenu
                            items={[
                              { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setForm(queue) },
                              { label: "删除", icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDeleteQueue(queue) },
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
        </Show>
      </section>

      <Show when={form() !== null}>
        <QueueForm queue={form() === "new" ? undefined : (form() as RosRecord)} onClose={() => setForm(null)} />
      </Show>

      <Show when={deleteQueue()}>
        {(queue) => (
          <ConfirmDialog
            title="删除限速"
            message={<p>将删除队列 <strong>{queue().name}</strong>，恢复该目标的无限速访问。</p>}
            confirmLabel="确认删除"
            danger
            onClose={() => setDeleteQueue(null)}
            onConfirm={async () => {
              const ok = await doDelete(queue());
              if (ok) setDeleteQueue(null);
              return ok;
            }}
          />
        )}
      </Show>
    </div>
  );
}
