import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { AddButton, ConfirmDialog, EnableSwitch, Field, FormPanel, RowMenu, TextInput } from "../components/form";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros, type RosFields } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { validateDuration, validateListAddress } from "../lib/network";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const MENU = "/rest/ip/firewall/address-list";

export function AddressListsPage() {
  const dash = useDashboard();
  const [list, setList] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const [editing, setEditing] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);
  const lists = createMemo(() => {
    const counts = new Map<string, number>();
    for (const row of dash.addressLists()) counts.set(row.list, (counts.get(row.list) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  });
  const rows = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return dash
      .addressLists()
      .filter((row) => !list() || row.list === list())
      .filter((row) => !needle || `${row.address} ${row.comment ?? ""} ${row.list}`.toLowerCase().includes(needle));
  });
  const clientName = (address: string) => dash.clients().find((client) => client.ip === address)?.title;

  return (
    <div>
      <PageHeader title="地址列表" subtitle="防火墙规则引用的地址集合；带超时的条目到期自动删除">
        <AddButton label="添加地址" onClick={() => setEditing("new")} />
      </PageHeader>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" class={list() === null ? "chip is-on" : "chip"} onClick={() => setList(null)}>
          全部 <span class="count">{dash.addressLists().length}</span>
        </button>
        <For each={lists()}>
          {([name, count]) => (
            <button type="button" class={list() === name ? "chip is-on" : "chip"} onClick={() => setList(list() === name ? null : name)}>
              {name} <span class="count">{count}</span>
            </button>
          )}
        </For>
        <div class="flex-1" />
        <input class="field" type="search" placeholder="搜索地址或备注" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
      </div>
      <Show when={rows().length > 0} fallback={<EmptyState title={dash.ready() ? "没有地址" : "正在读取"} />}>
        <section class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>地址</th>
                <th>列表</th>
                <th>超时</th>
                <th>备注</th>
                <th>启用</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody>
              <For each={rows()} keyed={(row) => row[".id"]}>
                {(row) => (
                  <tr class={flag(row().disabled) ? "is-dim" : ""}>
                    <td>
                      <div class="font-mono text-[12.5px]">{row().address}</div>
                      <Show when={clientName(row().address)}>
                        <div class="text-[11.5px] text-faint">{clientName(row().address)}</div>
                      </Show>
                    </td>
                    <td>
                      <Pill tone="accent">{row().list}</Pill>
                      {flag(row().dynamic) ? <span class="ml-1.5 pill pill-muted">动态</span> : null}
                    </td>
                    <td class="text-[12.5px] text-muted">{row().timeout && row().timeout !== "none-static" ? row().timeout : "永久"}</td>
                    <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                    <td>
                      <Show when={!flag(row().dynamic)}>
                        <EnableSwitch menu={MENU} row={row()} label={row().address} />
                      </Show>
                    </td>
                    <td>
                      <Show when={can("write") && !flag(row().dynamic)}>
                        <RowMenu
                          items={[
                            { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing(row()) },
                            { label: "删除", icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDeleting(row()) },
                          ]}
                        />
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </section>
      </Show>
      <Show when={editing()} keyed>
        {(current) => (
          <AddressForm
            entry={current === "new" ? undefined : current}
            defaultList={list() ?? ""}
            lists={lists().map(([name]) => name)}
            onClose={() => setEditing(null)}
          />
        )}
      </Show>
      <Show when={deleting()} keyed>
        {(row) => (
          <ConfirmDialog
            title="删除地址？"
            message={`将从列表 ${row.list} 中删除 ${row.address}。引用这个列表的防火墙规则会立即生效。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除地址", () => ros.remove(MENU, row[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}

function AddressForm(props: { entry?: RosRecord; defaultList: string; lists: string[]; onClose: () => void }) {
  const dash = useDashboard();
  const original = props.entry;
  const [listName, setListName] = createSignal(original?.list ?? props.defaultList);
  const [address, setAddress] = createSignal(original?.address ?? "");
  const [timeout, setTimeoutValue] = createSignal(original?.timeout && original.timeout !== "none-static" ? original.timeout : "");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!listName().trim()) next.list = "请输入列表名称";
    const addressError = validateListAddress(address());
    if (addressError) next.address = addressError;
    const timeoutError = validateDuration(timeout());
    if (timeoutError) next.timeout = timeoutError;
    setErrors(next);
    if (Object.keys(next).length) return false;
    const fields: RosFields = { list: listName().trim(), address: address().trim(), comment: comment().trim() };
    if (timeout().trim()) fields.timeout = timeout().trim();
    if (original) {
      for (const key of Object.keys(fields)) if (fields[key] === (original[key] ?? "")) delete fields[key];
      if (Object.keys(fields).length === 0) return true;
      return runWrite(dash, "已保存地址", () => ros.update(MENU, original[".id"], fields));
    }
    if (!fields.comment) delete fields.comment;
    return runWrite(dash, `已加入 ${fields.list}`, () => ros.create(MENU, fields));
  };

  return (
    <FormPanel title={original ? "编辑地址" : "添加地址"} subtitle="/ip firewall address-list" onClose={props.onClose} onSubmit={submit}>
      <datalist id="address-list-names">
        <For each={props.lists}>{(name) => <option value={name} />}</For>
      </datalist>
      <datalist id="address-list-ips">
        <For each={dash.clients().filter((client) => client.ip)}>{(client) => <option value={client.ip}>{client.title}</option>}</For>
      </datalist>
      <Field label="列表" required error={errors().list} hint="选择已有列表，或输入新名字创建列表">
        <TextInput value={listName()} onInput={setListName} list="address-list-names" invalid={!!errors().list} />
      </Field>
      <Field label="地址" required error={errors().address} hint="IP、网段（192.168.30.0/24）、范围（a-b）或域名">
        <TextInput value={address()} onInput={setAddress} mono list="address-list-ips" invalid={!!errors().address} />
      </Field>
      <div class="form-row">
        <Field label="超时" error={errors().timeout} hint={original ? "已有条目修改超时会重新计时" : "留空为永久，如 2h、1d"}>
          <TextInput value={timeout()} onInput={setTimeoutValue} placeholder="永久" invalid={!!errors().timeout} />
        </Field>
        <Field label="备注">
          <TextInput value={comment()} onInput={setComment} />
        </Field>
      </div>
    </FormPanel>
  );
}
