import { Pencil, Trash2 } from "@lucide/solid";
import { createMemo, createSignal, Show } from "solid-js";
import { DeletePeerDialog, WireGuardPeerForm } from "../WireGuardPeerForm";
import { can } from "../../lib/session";
import { useDashboard } from "../../lib/store";
import { EnableSwitch } from "../form";

/** WireGuard peer actions in the detail drawer. */
export function PeerActions(props: { id: string }) {
  const dash = useDashboard();
  const peer = createMemo(() => (dash.wireguardPeers() ?? []).find((row) => row[".id"] === props.id));
  const [editing, setEditing] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  return (
    <Show when={can("write") && peer()}>
      <div class="drawer-actions">
        <span class="mr-2 inline-flex items-center gap-2 text-[13px]">
          <EnableSwitch menu="/rest/interface/wireguard/peers" row={peer()} label={peer()?.comment || "对端"} />
          启用
        </span>
        <button type="button" class="btn" onClick={() => setEditing(true)}>
          <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
          编辑
        </button>
        <button type="button" class="btn" onClick={() => setDeleting(true)}>
          <Trash2 class="h-3.5 w-3.5 text-bad" aria-hidden="true" />
          删除
        </button>
      </div>
      <Show when={editing()}>
        <WireGuardPeerForm peer={peer()} onClose={() => setEditing(false)} />
      </Show>
      <Show when={deleting() && peer()}>
        <DeletePeerDialog peer={peer()!} onClose={() => setDeleting(false)} onDeleted={() => dash.setSelection(null)} />
      </Show>
    </Show>
  );
}
