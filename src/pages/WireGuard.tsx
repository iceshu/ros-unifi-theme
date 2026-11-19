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
      <PageHeader
        title="WireGuard"
        description="只看接口和 peer 是否在线、最近一次握手以及收发字节。私钥和预共享密钥不会显示，代理也会把它们从响应里去掉。"
      />
      <Show
        when={dash.wireguardLoaded()}
        fallback={<EmptyState title="正在读取 WireGuard" detail="如果路由器没有这个功能，读完后会说明。" />}
      >
        {missing() ? (
          <EmptyState
            title="没有 WireGuard 数据"
            detail="路由器未启用 WireGuard，或当前账号看不到 /interface/wireguard。这不影响其它页面。"
          />
        ) : (dash.wireguard()?.length ?? 0) === 0 ? (
          <EmptyState title="没有 WireGuard 接口" detail="菜单存在，但里面是空的。" />
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
                        <article class="rounded-2xl border border-line bg-canvas/40 p-4">
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
