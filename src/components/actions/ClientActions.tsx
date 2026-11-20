import { Ban, Lock, Network, Pencil, Zap } from "@lucide/solid";
import { createMemo, createSignal, Show } from "solid-js";
import { ros } from "../../lib/api";
import { flag } from "../../lib/model";
import { runWrites } from "../../lib/mutate";
import { can } from "../../lib/session";
import { useDashboard } from "../../lib/store";
import { sameMac } from "../../lib/topology";
import { ClientFixedIPForm } from "../ClientFixedIPForm";
import { ClientRenameForm } from "../ClientRenameForm";
import { ClientSpeedForm } from "../ClientSpeedForm";
import { ConfirmDialog } from "../form";

type Panel = "rename" | "fixedip" | "speed" | null;

/** Client actions rendered at the top of the detail drawer. */
export function ClientActions(props: { ip: string; mac: string }) {
  const dash = useDashboard();
  const [panel, setPanel] = createSignal<Panel>(null);
  const [showBlock, setShowBlock] = createSignal(false);
  const [showUnblock, setShowUnblock] = createSignal(false);

  const client = createMemo(() =>
    dash.clients().find((c) => (props.ip && c.ip === props.ip) || sameMac(c.mac, props.mac)),
  );
  const lease = createMemo(() =>
    dash.leases().find((l) => sameMac(l["mac-address"], props.mac) || (!!props.ip && l.address === props.ip)),
  );
  const isStatic = createMemo(() => !!lease() && !flag(lease()!.dynamic));
  const queue = createMemo(() => dash.queues().find((q) => q.target === `${props.ip}/32`));
  const blockedEntry = createMemo(() => dash.addressLists().find((e) => e.list === "rut-blocked" && e.address === props.ip));

  const clientTitle = () => client()?.title || props.ip || "该设备";

  const ensureBlockRule = async () => {
    const existing = dash.firewall().find(
      (r) => r.chain === "forward" && r.action === "drop" && r["src-address-list"] === "rut-blocked",
    );
    if (existing) return;
    const firstForward = dash.firewall().find((r) => r.chain === "forward");
    const fields: Record<string, string> = {
      chain: "forward",
      action: "drop",
      "src-address-list": "rut-blocked",
      comment: "rut: block clients",
    };
    if (firstForward) fields["place-before"] = firstForward[".id"];
    await ros.create("/rest/ip/firewall/filter", fields);
  };

  const doBlock = async () => {
    return runWrites(dash, "已阻止上网", [
      ensureBlockRule,
      () => ros.create("/rest/ip/firewall/address-list", { list: "rut-blocked", address: props.ip, comment: clientTitle() }),
    ]);
  };

  const doUnblock = async () => {
    const entry = blockedEntry();
    if (!entry) return true;
    return runWrites(dash, "已解除阻止", [() => ros.remove("/rest/ip/firewall/address-list", entry[".id"])]);
  };

  return (
    <Show when={can("write")}>
      <div class="drawer-actions">
        <Show when={blockedEntry()}>
          <span class="pill pill-bad">已阻止</span>
        </Show>
        <button type="button" class="btn btn-ghost" onClick={() => setPanel("rename")}>
          <Pencil class="h-4 w-4" aria-hidden="true" />
          重命名
        </button>
        <Show
          when={props.ip}
          fallback={
            <button type="button" class="btn btn-ghost" disabled>
              <Lock class="h-4 w-4" aria-hidden="true" />
              固定 IP
            </button>
          }
        >
          <button type="button" class="btn btn-ghost" onClick={() => setPanel("fixedip")}>
            <Lock class="h-4 w-4" aria-hidden="true" />
            {isStatic() ? "编辑固定 IP" : "固定 IP"}
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => setPanel("speed")}>
            <Zap class="h-4 w-4" aria-hidden="true" />
            {queue() ? "编辑限速" : "限速"}
          </button>
          <Show
            when={blockedEntry()}
            fallback={
              <button type="button" class="btn btn-ghost" onClick={() => setShowBlock(true)}>
                <Ban class="h-4 w-4" aria-hidden="true" />
                阻止上网
              </button>
            }
          >
            <button type="button" class="btn btn-ghost" onClick={() => setShowUnblock(true)}>
              <Network class="h-4 w-4" aria-hidden="true" />
              解除阻止
            </button>
          </Show>
        </Show>
      </div>

      <Show when={panel() === "rename"}>
        <ClientRenameForm ip={props.ip} mac={props.mac} currentName={client()?.title ?? ""} onClose={() => setPanel(null)} />
      </Show>
      <Show when={panel() === "fixedip" && props.ip}>
        <ClientFixedIPForm ip={props.ip} mac={props.mac} onClose={() => setPanel(null)} />
      </Show>
      <Show when={panel() === "speed" && props.ip}>
        <ClientSpeedForm ip={props.ip} defaultName={clientTitle()} onClose={() => setPanel(null)} />
      </Show>

      <Show when={showBlock()}>
        <ConfirmDialog
          title="阻止上网"
          message={
            <>
              <p>将把 <strong>{props.ip}</strong> 加入地址列表 <code>rut-blocked</code>，并确保防火墙 forward 链存在一条丢弃该列表流量的规则。</p>
              <Show when={!isStatic()}>
                <p class="mt-2 text-[13px] text-warn">该设备的 IP 是动态分配的，续约后可能变化，届时阻止将失效。建议先设置固定 IP。</p>
              </Show>
            </>
          }
          confirmLabel="确认阻止"
          danger
          onClose={() => setShowBlock(false)}
          onConfirm={async () => {
            const ok = await doBlock();
            if (ok) setShowBlock(false);
            return ok;
          }}
        />
      </Show>
      <Show when={showUnblock()}>
        <ConfirmDialog
          title="解除阻止"
          message={<p>将从 <code>rut-blocked</code> 移除 <strong>{props.ip}</strong>，该设备恢复上网（防火墙规则保留）。</p>}
          confirmLabel="确认解除"
          onClose={() => setShowUnblock(false)}
          onConfirm={async () => {
            const ok = await doUnblock();
            if (ok) setShowUnblock(false);
            return ok;
          }}
        />
      </Show>
    </Show>
  );
}
