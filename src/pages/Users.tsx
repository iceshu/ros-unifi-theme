import { Pencil, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can, session } from "../lib/session";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";
import { AdminGroupForm } from "../components/AdminGroupForm";
import { AdminUserForm } from "../components/AdminUserForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { Card, EmptyState, PageHeader } from "../components/ui";

export function UsersPage() {
  const dash = useDashboard();
  const { rows: users } = useRos("/rest/user");
  const { rows: groups } = useRos("/rest/user/group");
  const { rows: active } = useRos("/rest/user/active", 15000);

  const [userForm, setUserForm] = createSignal<RosRecord | "new" | null>(null);
  const [groupForm, setGroupForm] = createSignal<RosRecord | "new" | null>(null);
  const [delUser, setDelUser] = createSignal<RosRecord | null>(null);
  const [delGroup, setDelGroup] = createSignal<RosRecord | null>(null);

  const myUser = () => session()?.user ?? "";
  const myGroup = () => session()?.group ?? "";

  const isOwnUser = (row: RosRecord) => row.name === myUser();
  const isOwnGroup = (row: RosRecord) => row.name === myGroup();

  const policyCount = (policy: string) =>
    policy.split(",").filter((p) => p.trim() && !p.trim().startsWith("!")).length;

  return (
    <div class="flex flex-col gap-4">
      <PageHeader title="RouterOS 用户" subtitle="管理路由器本地用户账号和用户组" />

      <Show when={!can("policy")}>
        <div class="rounded-lg border border-line bg-panel-2 px-4 py-3 text-[13px] text-muted">
          当前账号没有 <code class="font-mono">policy</code> 权限，只能查看用户列表，无法新建、编辑或删除。
        </div>
      </Show>

      {/* Users table */}
      <section class="card overflow-hidden">
        <div class="card-head">
          <h2 class="card-title">
            用户 <span class="ml-1 text-[12px] font-normal text-faint">{users().length} 个</span>
          </h2>
          <AddButton label="新建用户" onClick={() => setUserForm("new")} policy="policy" />
        </div>
        <Show
          when={users().length > 0}
          fallback={<div class="p-4"><EmptyState title="没有用户" compact /></div>}
        >
          <div class="table-wrap border-t border-line">
            <table class="data-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>用户组</th>
                  <th>允许地址</th>
                  <th>备注</th>
                  <th>上次登录</th>
                  <th>启用</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={users()}>
                  {(row) => (
                    <tr class={flag(row.disabled) ? "is-dim" : ""}>
                      <td class="font-mono font-medium">
                        {row.name}
                        <Show when={isOwnUser(row)}>
                          <span class="ml-2 text-[11px] text-faint">（当前账号）</span>
                        </Show>
                      </td>
                      <td>{row.group}</td>
                      <td class="font-mono text-faint">{row.address || "不限制"}</td>
                      <td class="text-faint">{row.comment}</td>
                      <td class="text-faint">{row["last-logged-in"] || "从未"}</td>
                      <td>
                        <Show
                          when={!isOwnUser(row)}
                          fallback={<span class="text-[12px] text-faint">—</span>}
                        >
                          <EnableSwitch menu="/rest/user" row={row} label="启用" />
                        </Show>
                      </td>
                      <td>
                        <Show when={can("policy") && !isOwnUser(row)}>
                          <RowMenu
                            items={[
                              {
                                label: "编辑",
                                icon: <Pencil class="h-3.5 w-3.5" aria-hidden="true" />,
                                onSelect: () => setUserForm(row),
                              },
                              {
                                label: "删除",
                                icon: <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />,
                                danger: true,
                                onSelect: () => setDelUser(row),
                              },
                            ]}
                          />
                        </Show>
                        <Show when={isOwnUser(row)}>
                          <span class="text-[11px] text-faint px-2" title="不能修改当前登录的账号">—</span>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      {/* Groups table */}
      <section class="card overflow-hidden">
        <div class="card-head">
          <h2 class="card-title">
            用户组 <span class="ml-1 text-[12px] font-normal text-faint">{groups().length} 个</span>
          </h2>
          <AddButton label="新建用户组" onClick={() => setGroupForm("new")} policy="policy" />
        </div>
        <Show
          when={groups().length > 0}
          fallback={<div class="p-4"><EmptyState title="没有用户组" compact /></div>}
        >
          <div class="table-wrap border-t border-line">
            <table class="data-table">
              <thead>
                <tr>
                  <th>组名</th>
                  <th>权限数</th>
                  <th>备注</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={groups()}>
                  {(row) => (
                    <tr>
                      <td class="font-mono font-medium">
                        {row.name}
                        <Show when={isOwnGroup(row)}>
                          <span class="ml-2 text-[11px] text-faint">（当前用户组）</span>
                        </Show>
                      </td>
                      <td>{policyCount(row.policy ?? "")} / 17</td>
                      <td class="text-faint">{row.comment}</td>
                      <td>
                        <Show when={can("policy") && !isOwnGroup(row)}>
                          <RowMenu
                            items={[
                              {
                                label: "编辑",
                                icon: <Pencil class="h-3.5 w-3.5" aria-hidden="true" />,
                                onSelect: () => setGroupForm(row),
                              },
                              {
                                label: "删除",
                                icon: <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />,
                                danger: true,
                                onSelect: () => setDelGroup(row),
                              },
                            ]}
                          />
                        </Show>
                        <Show when={isOwnGroup(row)}>
                          <span class="text-[11px] text-faint px-2" title="不能修改当前账号的用户组">—</span>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      {/* Active sessions */}
      <Show when={active().length > 0}>
        <Card title="当前活跃会话">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>IP 地址</th>
                  <th>登录方式</th>
                  <th>登录时间</th>
                </tr>
              </thead>
              <tbody>
                <For each={active()}>
                  {(row) => (
                    <tr>
                      <td class="font-mono font-medium">{row.user}</td>
                      <td class="font-mono">{row.address}</td>
                      <td>{row.via}</td>
                      <td class="text-faint">{row.when || "—"}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Card>
      </Show>

      {/* User form panel */}
      <Show when={userForm() !== null}>
        <Show
          when={userForm() !== "new"}
          fallback={<AdminUserForm groups={groups()} onClose={() => setUserForm(null)} />}
        >
          <AdminUserForm user={userForm() as RosRecord} groups={groups()} onClose={() => setUserForm(null)} />
        </Show>
      </Show>

      {/* Group form panel */}
      <Show when={groupForm() !== null}>
        <Show
          when={groupForm() !== "new"}
          fallback={<AdminGroupForm onClose={() => setGroupForm(null)} />}
        >
          <AdminGroupForm group={groupForm() as RosRecord} onClose={() => setGroupForm(null)} />
        </Show>
      </Show>

      {/* Delete user confirm */}
      <Show when={delUser()}>
        {(row) => (
          <ConfirmDialog
            title="删除用户？"
            message={`将删除用户 "${row().name}"，该账号将无法再登录路由器。`}
            confirmLabel="删除"
            danger
            typeToConfirm={row().name}
            onClose={() => setDelUser(null)}
            onConfirm={async () => {
              const ok = await runWrite(dash, "已删除用户", () => ros.remove("/rest/user", row()[".id"]));
              if (ok) setDelUser(null);
              return ok;
            }}
          />
        )}
      </Show>

      {/* Delete group confirm */}
      <Show when={delGroup()}>
        {(row) => (
          <ConfirmDialog
            title="删除用户组？"
            message={`将删除用户组 "${row().name}"。请确认没有用户正在使用此组。`}
            confirmLabel="删除"
            danger
            typeToConfirm={row().name}
            onClose={() => setDelGroup(null)}
            onConfirm={async () => {
              const ok = await runWrite(dash, "已删除用户组", () => ros.remove("/rest/user/group", row()[".id"]));
              if (ok) setDelGroup(null);
              return ok;
            }}
          />
        )}
      </Show>
    </div>
  );
}
