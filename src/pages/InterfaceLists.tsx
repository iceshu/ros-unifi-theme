import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { InterfaceListForm, ListMemberForm } from "../components/NetconfListForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { Card, EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";

const LIST_MENU = "/rest/interface/list";
const MEMBER_MENU = "/rest/interface/list/member";

const BUILTIN_LISTS: Record<string, true> = { all: true, none: true, dynamic: true, static: true };

export function InterfaceListsPage() {
  const dash = useDashboard();
  const listsData = useRos(LIST_MENU);
  const [selectedList, setSelectedList] = createSignal<string | null>(null);
  const [editingList, setEditingList] = createSignal<RosRecord | "new" | null>(null);
  const [deletingList, setDeletingList] = createSignal<RosRecord | null>(null);
  const [editingMember, setEditingMember] = createSignal<RosRecord | "new" | null>(null);
  const [deletingMember, setDeletingMember] = createSignal<RosRecord | null>(null);

  const allListNames = createMemo(() => listsData.rows().map((r) => r.name));

  const visibleMembers = createMemo(() => {
    const sel = selectedList();
    return sel ? dash.listMembers().filter((m) => m.list === sel) : dash.listMembers();
  });

  const interfaces = createMemo(() =>
    dash.interfaces().map((r) => r.name).filter(Boolean),
  );

  return (
    <div>
      <PageHeader title="接口列表" subtitle="用于防火墙规则的接口分组；内置列表（all/none/dynamic/static）只读" />

      <div class="space-y-4">
        <Card
          title="接口列表"
          actions={<AddButton label="创建列表" onClick={() => setEditingList("new")} />}
        >
          <Show
            when={listsData.rows().length > 0}
            fallback={<EmptyState title={listsData.loaded() ? "没有接口列表" : "正在读取"} compact />}
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>备注</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={listsData.rows()} keyed={(row) => row[".id"]}>
                  {(row) => {
                    const isBuiltin = () => !!BUILTIN_LISTS[row().name];
                    return (
                      <tr
                        class={`${selectedList() === row().name ? "is-selected" : ""} is-clickable`}
                        onClick={() => setSelectedList(selectedList() === row().name ? null : row().name)}
                      >
                        <td class="font-mono text-[12.5px]">{row().name}</td>
                        <td>
                          {isBuiltin() ? (
                            <Pill tone="muted">内置</Pill>
                          ) : (
                            <Pill tone="accent">自定义</Pill>
                          )}
                        </td>
                        <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                        <td>
                          <Show when={can("write") && !isBuiltin()}>
                            <RowMenu
                              items={[
                                {
                                  label: "编辑",
                                  icon: <Pencil aria-hidden="true" />,
                                  onSelect: () => setEditingList(row()),
                                },
                                {
                                  label: "删除",
                                  icon: <Trash2 aria-hidden="true" />,
                                  danger: true,
                                  onSelect: () => setDeletingList(row()),
                                },
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
        </Card>

        <Card
          title={selectedList() ? `成员：${selectedList()}` : "接口成员（全部）"}
          actions={
            <AddButton
              label="添加成员"
              onClick={() => setEditingMember("new")}
            />
          }
        >
          <Show
            when={visibleMembers().length > 0}
            fallback={
              <EmptyState
                title={dash.ready() ? "没有成员" : "正在读取"}
                detail="点击上方列表名称可筛选，然后添加接口到该列表。"
                compact
              />
            }
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>列表</th>
                  <th>接口</th>
                  <th>备注</th>
                  <th>启用</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={visibleMembers()} keyed={(row) => row[".id"]}>
                  {(row) => {
                    const isDynamic = () => flag(row().dynamic);
                    return (
                      <tr class={flag(row().disabled) ? "is-dim" : ""}>
                        <td>
                          <span class="pill pill-muted">{row().list}</span>
                        </td>
                        <td class="font-mono text-[12.5px]">{row().interface}</td>
                        <td class="text-[12.5px] text-muted">
                          {row().comment || ""}
                          {isDynamic() ? <span class="ml-1.5 pill pill-muted">动态</span> : null}
                        </td>
                        <td>
                          <Show when={!isDynamic()}>
                            <EnableSwitch menu={MEMBER_MENU} row={row()} label={`${row().interface} → ${row().list}`} />
                          </Show>
                        </td>
                        <td>
                          <Show when={can("write") && !isDynamic()}>
                            <RowMenu
                              items={[
                                {
                                  label: "编辑",
                                  icon: <Pencil aria-hidden="true" />,
                                  onSelect: () => setEditingMember(row()),
                                },
                                {
                                  label: "移除",
                                  icon: <Trash2 aria-hidden="true" />,
                                  danger: true,
                                  onSelect: () => setDeletingMember(row()),
                                },
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
        </Card>
      </div>

      <Show when={editingList()} keyed>
        {(current) => (
          <InterfaceListForm
            entry={current === "new" ? undefined : current}
            onClose={() => setEditingList(null)}
          />
        )}
      </Show>
      <Show when={deletingList()} keyed>
        {(list) => (
          <ConfirmDialog
            title="删除接口列表？"
            message={`将删除列表 ${list.name}。引用此列表的防火墙规则需手动更新。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeletingList(null)}
            onConfirm={() => runWrite(dash, "已删除列表", () => ros.remove(LIST_MENU, list[".id"]))}
          />
        )}
      </Show>

      <Show when={editingMember()} keyed>
        {(current) => (
          <ListMemberForm
            entry={current === "new" ? undefined : current}
            lists={allListNames()}
            interfaces={interfaces()}
            defaultList={selectedList() ?? undefined}
            onClose={() => setEditingMember(null)}
          />
        )}
      </Show>
      <Show when={deletingMember()} keyed>
        {(member) => (
          <ConfirmDialog
            title="移除成员？"
            message={`将把 ${member.interface} 从列表 ${member.list} 中移除。`}
            confirmLabel="移除"
            danger
            onClose={() => setDeletingMember(null)}
            onConfirm={() => runWrite(dash, "已移除成员", () => ros.remove(MEMBER_MENU, member[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}
