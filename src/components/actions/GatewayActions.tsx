import { Pencil, Power } from "@lucide/solid";
import { createSignal, Show } from "solid-js";
import { ros } from "../../lib/api";
import { runWrite } from "../../lib/mutate";
import { can } from "../../lib/session";
import { useDashboard } from "../../lib/store";
import { showToast } from "../../lib/toast";
import { ConfirmDialog, Field, FormPanel, TextInput } from "../form";

/** Router actions in the detail drawer: rename (write) and reboot (reboot policy). */
export function GatewayActions() {
  const dash = useDashboard();
  const [renaming, setRenaming] = createSignal(false);
  const [rebooting, setRebooting] = createSignal(false);
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal("");
  const identity = () => dash.identity()?.name || "";

  return (
    <Show when={can("write") || can("reboot")}>
      <div class="drawer-actions">
        <Show when={can("write")}>
          <button
            type="button"
            class="btn"
            onClick={() => {
              setName(identity());
              setError("");
              setRenaming(true);
            }}
          >
            <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
            重命名
          </button>
        </Show>
        <Show when={can("reboot")}>
          <button type="button" class="btn" onClick={() => setRebooting(true)}>
            <Power class="h-3.5 w-3.5 text-bad" aria-hidden="true" />
            重启路由器
          </button>
        </Show>
      </div>
      <Show when={renaming()}>
        <FormPanel
          title="重命名路由器"
          subtitle="/system identity"
          onClose={() => setRenaming(false)}
          onSubmit={async () => {
            const next = name().trim();
            if (!next || next.length > 64) {
              setError("名称为 1–64 个字符");
              return false;
            }
            if (next === identity()) return true;
            return runWrite(dash, `路由器已改名为 ${next}`, () => ros.command("/rest/system/identity", "set", { name: next }));
          }}
        >
          <Field label="名称" required error={error()} hint="显示在侧栏、浏览器标题和 WinBox 里">
            <TextInput value={name()} onInput={setName} invalid={!!error()} />
          </Field>
        </FormPanel>
      </Show>
      <Show when={rebooting()}>
        <ConfirmDialog
          title="重启路由器？"
          message="重启大约需要一分钟，期间整个网络（包括上网、WiFi 和这个页面）都会中断。仪表会在路由器恢复后自动重新连接。"
          confirmLabel="重启"
          danger
          typeToConfirm={identity() || "reboot"}
          onClose={() => setRebooting(false)}
          onConfirm={async () => {
            const ok = await runWrite(dash, "已发送重启命令", () => ros.command("/rest/system", "reboot", {}));
            if (ok) showToast("路由器正在重启，恢复后页面会自动重新连接。", "info");
            return ok;
          }}
        />
      </Show>
    </Show>
  );
}
