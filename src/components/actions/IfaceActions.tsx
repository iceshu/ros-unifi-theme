import { Pencil } from "@lucide/solid";
import { createMemo, createSignal, Show } from "solid-js";
import { ros } from "../../lib/api";
import { runWrite } from "../../lib/mutate";
import { can } from "../../lib/session";
import { useDashboard } from "../../lib/store";
import { EnableSwitch, Field, FormPanel, TextInput } from "../form";

/** Interface actions in the detail drawer: enable/disable and the comment shown as the port label. */
export function IfaceActions(props: { name: string }) {
  const dash = useDashboard();
  const row = createMemo(() => dash.interfaces().find((item) => item.name === props.name));
  const [editing, setEditing] = createSignal(false);
  const [comment, setComment] = createSignal("");
  return (
    <Show when={can("write") && row()}>
      <div class="drawer-actions">
        <span class="mr-2 inline-flex items-center gap-2 text-[13px]">
          <EnableSwitch
            menu="/rest/interface"
            row={row()}
            label={props.name}
            confirm="禁用接口会立即断开经过它的连接。如果你正通过这个口访问路由器，页面会失联。"
          />
          启用
        </span>
        <button
          type="button"
          class="btn"
          onClick={() => {
            setComment(row()?.comment ?? "");
            setEditing(true);
          }}
        >
          <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
          编辑备注
        </button>
      </div>
      <Show when={editing()}>
        <FormPanel
          title={`编辑 ${props.name}`}
          subtitle="备注会显示在端口面板和拓扑上"
          onClose={() => setEditing(false)}
          onSubmit={() => {
            const current = row();
            if (!current || comment().trim() === (current.comment ?? "")) return Promise.resolve(true);
            return runWrite(dash, "已更新备注", () => ros.update("/rest/interface", current[".id"], { comment: comment().trim() }));
          }}
        >
          <Field label="备注" hint="例如 客厅、书房、光猫">
            <TextInput value={comment()} onInput={setComment} />
          </Field>
        </FormPanel>
      </Show>
    </Show>
  );
}
