import { Pencil, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { SystemSchedulerForm } from "../components/SystemSchedulerForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { flag, type RosRecord } from "../lib/model";
import { ros } from "../lib/api";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useRos } from "../lib/useRos";
import { useDashboard } from "../lib/store";

export function SchedulerPage() {
  const dash = useDashboard();
  const { rows, loaded } = useRos("/rest/system/scheduler");
  const [form, setForm] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);

  return (
    <div>
      <PageHeader title="计划任务" subtitle="定时执行 RouterOS 脚本">
        <AddButton label="新建任务" onClick={() => setForm("new")} />
      </PageHeader>

      <Card>
        <Show
          when={rows().length > 0}
          fallback={<EmptyState title={loaded() ? "暂无计划任务" : "正在读取"} detail="需要 write 权限才能创建计划任务" compact />}
        >
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>间隔</th>
                  <th>下次运行</th>
                  <th>执行次数</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr
                      class={`is-clickable${flag(row.disabled) ? " is-dim" : ""}`}
                      onClick={() => can("write") && setForm(row)}
                    >
                      <td>
                        <div class="font-medium">{row.name}</div>
                        <Show when={row.comment}>
                          <div class="text-[12px] text-muted">{row.comment}</div>
                        </Show>
                      </td>
                      <td class="font-mono text-[13px]">{row.interval || <span class="text-faint">一次性</span>}</td>
                      <td class="text-[13px] text-muted">{row["next-run"] || <span class="text-faint">—</span>}</td>
                      <td class="font-mono">{row["run-count"] ?? "0"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <EnableSwitch menu="/rest/system/scheduler" row={row} label={row.name} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          items={[
                            {
                              label: "编辑",
                              icon: <Pencil size={14} />,
                              onSelect: () => setForm(row),
                            },
                            {
                              label: "删除",
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onSelect: () => setDeleting(row),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Card>

      <Show when={form() !== null}>
        <SystemSchedulerForm
          entry={form() === "new" ? undefined : (form() as RosRecord)}
          onClose={() => setForm(null)}
        />
      </Show>

      <Show when={deleting()}>
        {(row) => (
          <ConfirmDialog
            title={`删除计划任务 "${row().name}"？`}
            message="此操作不可撤销。"
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除", () => ros.remove("/rest/system/scheduler", row()[".id"])).then((ok) => { if (ok) setDeleting(null); return ok; })}
          />
        )}
      </Show>
    </div>
  );
}
