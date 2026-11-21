import { KeyRound, Pencil, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { CopyText } from "../components/CopyText";
import { AddButton, EnableSwitch, RowMenu } from "../components/form";
import { EmptyState, PageHeader, Pill, RateText } from "../components/ui";
import { DeletePeerDialog, WireGuardPeerForm } from "../components/WireGuardPeerForm";
import { formatBytes, formatLastSeen } from "../lib/format";
import { addressesOn, flag, handshakeTone, linkState, num, shortKey, type RosRecord } from "../lib/model";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const PEERS = "/rest/interface/wireguard/peers";

export function WireGuardPage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<{ peer?: RosRecord; iface?: string } | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);

  return (
    <div>
      <PageHeader title="WireGuard" subtitle="VPN 隧道与远程设备；为新设备添加对端时可直接生成客户端配置">
        <Show when={(dash.wireguard() ?? []).length > 0}>
          <AddButton label="添加对端" onClick={() => setEditing({})} />
        </Show>
      </PageHeader>
      <Show when={dash.wireguardLoaded()} fallback={<EmptyState title={dash.error() ? "读不到 WireGuard" : "正在读取"} />}>
        <Show when={(dash.wireguard() ?? []).length > 0} fallback={<EmptyState title="没有 WireGuard 接口" detail="先在路由器上创建 WireGuard 接口并分配地址，再回来添加对端。" />}>
          <div class="space-y-4">
            <For each={dash.wireguard() ?? []}>
              {(tunnel) => {
                const peers = () => (dash.wireguardPeers() ?? []).filter((peer) => peer.interface === tunnel.name);
                return (
                  <section class="card overflow-hidden">
                    <div class="flex flex-wrap items-center gap-4 p-4">
                      <span class="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                        <KeyRound class="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <h2 class="text-[16px] font-semibold">{tunnel.name}</h2>
                          <Pill tone={linkState(tunnel).tone}>{linkState(tunnel).label}</Pill>
                        </div>
                        <div class="mt-0.5 flex flex-wrap gap-x-4 text-[12.5px] text-muted">
                          <span>监听端口 {tunnel["listen-port"] || "—"}</span>
                          <span>地址 {addressesOn(dash.addresses(), tunnel.name).join("、") || "未分配"}</span>
                          {tunnel.comment ? <span>{tunnel.comment}</span> : null}
                        </div>
                        <div class="mt-1 text-[12px] text-faint">
                          公钥 <CopyText class="font-mono" value={tunnel["public-key"] || ""}>{shortKey(tunnel["public-key"])}</CopyText>
                        </div>
                      </div>
                      <div class="text-right text-[12.5px]">
                        <RateText bps={dash.rates()[tunnel.name]?.rxBps} dir="down" />
                        <RateText bps={dash.rates()[tunnel.name]?.txBps} dir="up" class="ml-3" />
                      </div>
                    </div>
                    <Show when={peers().length > 0} fallback={<div class="border-t border-line p-4"><EmptyState title="还没有对端" compact /></div>}>
                      <div class="table-wrap border-t border-line">
                        <table class="data-table">
                          <thead>
                            <tr>
                              <th>对端</th>
                              <th>允许地址</th>
                              <th>端点</th>
                              <th>最后握手</th>
                              <th>收 / 发</th>
                              <th>启用</th>
                              <th class="w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            <For each={peers()} keyed={(peer) => peer[".id"]}>
                              {(peer) => (
                                <tr class={`is-clickable ${flag(peer().disabled) ? "is-dim" : ""}`} onClick={() => dash.setSelection({ type: "peer", id: peer()[".id"] })}>
                                  <td>
                                    <div class="font-medium">{peer().comment || peer().name || "未命名"}</div>
                                    <div class="font-mono text-[11.5px] text-faint">{shortKey(peer()["public-key"])}</div>
                                  </td>
                                  <td class="font-mono text-[12.5px]">{peer()["allowed-address"] || "—"}</td>
                                  <td class="font-mono text-[12.5px]">
                                    {peer()["current-endpoint-address"]
                                      ? `${peer()["current-endpoint-address"]}:${peer()["current-endpoint-port"] || ""}`
                                      : peer()["endpoint-address"]
                                        ? `${peer()["endpoint-address"]}:${peer()["endpoint-port"] || ""}`
                                        : "—"}
                                  </td>
                                  <td>
                                    <Pill tone={handshakeTone(peer()["last-handshake"])}>
                                      {peer()["last-handshake"] && peer()["last-handshake"] !== "never" ? formatLastSeen(peer()["last-handshake"]) : "从未握手"}
                                    </Pill>
                                  </td>
                                  <td class="num text-[12.5px] text-muted">
                                    {formatBytes(num(peer().rx) ?? 0)} / {formatBytes(num(peer().tx) ?? 0)}
                                  </td>
                                  <td onClick={(event) => event.stopPropagation()}>
                                    <EnableSwitch menu={PEERS} row={peer()} label={peer().comment || "对端"} />
                                  </td>
                                  <td>
                                    <Show when={can("write")}>
                                      <RowMenu
                                        items={[
                                          { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setEditing({ peer: peer() }) },
                                          { label: "删除", icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDeleting(peer()) },
                                        ]}
                                      />
                                    </Show>
                                  </td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </Show>
                    <Show when={can("write")}>
                      <div class="border-t border-line px-4 py-2.5">
                        <button type="button" class="btn btn-ghost" onClick={() => setEditing({ iface: tunnel.name })}>
                          + 为 {tunnel.name} 添加对端
                        </button>
                      </div>
                    </Show>
                  </section>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={editing()} keyed>
        {(target) => <WireGuardPeerForm peer={target.peer} interfaceName={target.iface} onClose={() => setEditing(null)} />}
      </Show>
      <Show when={deleting()} keyed>
        {(peer) => <DeletePeerDialog peer={peer} onClose={() => setDeleting(null)} />}
      </Show>
    </div>
  );
}
