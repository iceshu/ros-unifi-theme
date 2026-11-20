import { WriteToggle } from "../components/WriteToggle";
import { For, Show } from "solid-js";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { formatBytes, formatLastSeen } from "../lib/format";
import { flag, handshakeTone, linkState, num, shortKey } from "../lib/model";
import { useDashboard } from "../lib/store";

export function WireGuardPage() {
  const dash = useDashboard();
  const missing = () => dash.wireguardLoaded() && dash.wireguard() === null;

  return (
    <div>
      <PageHeader title="WireGuard" />
      <Show
        when={dash.wireguardLoaded()}
        fallback={<EmptyState title={dash.error() ? "读不到 WireGuard" : "正在读取"} />}
      >
        {missing() ? (
          <EmptyState title="没有 WireGuard" />
        ) : (dash.wireguard()?.length ?? 0) === 0 ? (
          <EmptyState title="没有 WireGuard" />
        ) : (
          <div class="space-y-4">
            <For each={dash.wireguard() ?? []}>
              {(iface) => (
                <section class="card p-5">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 class="text-xl font-semibold">{iface.name}</h2>
                      <p class="mt-1 text-sm text-muted">
                        监听 {iface["listen-port"] || "—"}
                        {iface.comment ? ` · ${iface.comment}` : ""}
                      </p>
                      <p class="mt-1 font-mono text-xs text-faint" title={iface["public-key"] || ""}>
                        公钥 {shortKey(iface["public-key"])}
                      </p>
                    </div>
                    <Pill tone={linkState(iface).tone}>{linkState(iface).label}</Pill>
                  </div>
                  <div class="mt-4 space-y-3">
                    <For each={(dash.wireguardPeers() ?? []).filter((peer) => peer.interface === iface.name)}>
                      {(peer) => (
                        <article
                          class="cursor-pointer rounded-xl border border-line bg-panel-2 p-4 transition-colors hover:border-line-strong"
                          onClick={() => dash.setSelection({ type: "peer", id: peer[".id"] || "" })}
                        >
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <h3 class="font-medium">{peer.comment || shortKey(peer["public-key"])}</h3>
                            <Pill tone={handshakeTone(peer["last-handshake"])}>
                              {peer["last-handshake"] && peer["last-handshake"] !== "never"
                                ? `握手 ${formatLastSeen(peer["last-handshake"])}`
                                : "从未握手"}
                            </Pill>
                          </div>
                          <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <Info label="允许地址" value={peer["allowed-address"] || "—"} />
                            <Info
                              label="当前端点"
                              value={
                                peer["current-endpoint-address"]
                                  ? `${peer["current-endpoint-address"]}:${peer["current-endpoint-port"] || ""}`
                                  : peer["endpoint-address"]
                                    ? `${peer["endpoint-address"]}:${peer["endpoint-port"] || ""}`
                                    : "—"
                              }
                            />
                            <Info label="接收" value={formatBytes(num(peer.rx) ?? 0)} />
                            <Info label="发送" value={formatBytes(num(peer.tx) ?? 0)} />
                          </dl>
                          <WriteToggle path="/rest/interface/wireguard/peers" row={peer} />
                          {flag(peer.disabled) ? <p class="mt-2 text-xs text-warn">这个 peer 在路由器上是禁用的。</p> : null}
                        </article>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div>
      <dt class="text-faint">{props.label}</dt>
      <dd class="font-mono">{props.value}</dd>
    </div>
  );
}
