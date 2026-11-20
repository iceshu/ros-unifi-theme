import { Copy, Download } from "@lucide/solid";
import { renderSVG } from "uqr";
import { createMemo, createSignal, Show } from "solid-js";
import { ros, wireguardKeypair, type RosFields } from "../lib/api";
import { addressesOn, shortKey, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { nextFreeAddress, validateAllowedAddress, validatePort, validateWgKey } from "../lib/network";
import { useDashboard } from "../lib/store";
import { copyText } from "./CopyText";
import { ConfirmDialog, Field, FormPanel, SelectInput, TextInput } from "./form";

const PEERS = "/rest/interface/wireguard/peers";

/**
 * Add or edit a WireGuard peer. "为新设备生成" creates the key pair on the server,
 * stores only the public key on the router and shows the client config once.
 */
export function WireGuardPeerForm(props: { peer?: RosRecord; interfaceName?: string; onClose: () => void }) {
  const dash = useDashboard();
  const original = props.peer;
  const tunnels = createMemo(() => dash.wireguard() ?? []);
  const [iface, setIface] = createSignal(original?.interface ?? props.interfaceName ?? tunnels()[0]?.name ?? "");
  const [mode, setMode] = createSignal<"generate" | "existing">(original ? "existing" : "generate");
  const [name, setName] = createSignal(original?.comment ?? "");
  const [publicKey, setPublicKey] = createSignal(original?.["public-key"] ?? "");
  const tunnelAddress = createMemo(() => addressesOn(dash.addresses(), iface())[0] ?? "");
  const suggested = createMemo(() => {
    const used = (dash.wireguardPeers() ?? []).map((peer) => peer["allowed-address"] || "");
    const free = nextFreeAddress(tunnelAddress(), used);
    return free ? `${free}/32` : "";
  });
  const [allowed, setAllowed] = createSignal(original?.["allowed-address"] ?? "");
  const [endpoint, setEndpoint] = createSignal(original?.["endpoint-address"] ?? "");
  const [endpointPort, setEndpointPort] = createSignal(original?.["endpoint-port"] ?? "");
  const [keepalive, setKeepalive] = createSignal(original?.["persistent-keepalive"] ?? "");
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [config, setConfig] = createSignal<string | null>(null);

  const allowedValue = () => allowed().trim() || (original ? "" : suggested());

  const clientConfig = (privateKey: string, address: string) => {
    const tunnel = tunnels().find((row) => row.name === iface());
    const wanIp = (addressesOn(dash.addresses(), dash.primaryWan() || "")[0] || "<公网地址>").split("/")[0];
    const dns = tunnelAddress().split("/")[0];
    return [
      "[Interface]",
      `PrivateKey = ${privateKey}`,
      `Address = ${address}`,
      dns ? `DNS = ${dns}` : "",
      "",
      "[Peer]",
      `PublicKey = ${tunnel?.["public-key"] ?? "<路由器公钥>"}`,
      `Endpoint = ${wanIp}:${tunnel?.["listen-port"] ?? "51820"}`,
      "AllowedIPs = 0.0.0.0/0",
      "PersistentKeepalive = 25",
      "",
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n");
  };

  const submit = async () => {
    if (config()) return true;
    const next: Record<string, string> = {};
    if (!iface()) next.iface = "没有 WireGuard 接口";
    // Editing other fields must not be blocked by the key already stored on the router.
    if (mode() === "existing" && (!original || publicKey().trim() !== original["public-key"])) {
      const keyError = validateWgKey(publicKey());
      if (keyError) next.publicKey = keyError;
    }
    const allowedError = validateAllowedAddress(allowedValue());
    if (allowedError) next.allowed = allowedError;
    const portError = validatePort(endpointPort());
    if (portError) next.endpointPort = portError;
    if (keepalive().trim() && !/^\d+s?$/.test(keepalive().trim())) next.keepalive = "单位为秒，如 25";
    setErrors(next);
    if (Object.keys(next).length) return false;

    const fields: RosFields = {
      comment: name().trim(),
      "allowed-address": allowedValue(),
      "endpoint-address": endpoint().trim(),
      "endpoint-port": endpointPort().trim(),
      "persistent-keepalive": keepalive().trim(),
    };
    if (original) {
      if (publicKey().trim() !== original["public-key"]) fields["public-key"] = publicKey().trim();
      for (const key of Object.keys(fields)) if (fields[key] === (original[key] ?? "")) delete fields[key];
      if (Object.keys(fields).length === 0) return true;
      return runWrite(dash, "已保存对端", () => ros.update(PEERS, original[".id"], fields));
    }
    for (const key of Object.keys(fields)) if (!fields[key]) delete fields[key];
    if (mode() === "existing") {
      return runWrite(dash, "已添加对端", () => ros.create(PEERS, { ...fields, interface: iface(), "public-key": publicKey().trim() }));
    }
    let keys: { privateKey: string; publicKey: string };
    try {
      keys = await wireguardKeypair();
    } catch {
      setErrors({ publicKey: "生成密钥失败，请重试" });
      return false;
    }
    const ok = await runWrite(dash, "已添加对端，请把配置导入新设备", () =>
      ros.create(PEERS, { ...fields, interface: iface(), "public-key": keys.publicKey }),
    );
    if (ok) setConfig(clientConfig(keys.privateKey, allowedValue()));
    // Keep the panel open to show the one-time client config.
    return false;
  };

  const download = () => {
    const text = config();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(name().trim() || "wireguard").replace(/[^\w.-]+/g, "_")}.conf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <FormPanel
      title={original ? "编辑对端" : "添加 WireGuard 对端"}
      subtitle={iface() ? `接口 ${iface()}` : undefined}
      submitLabel={config() ? "完成" : original ? "保存" : "添加"}
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Show
        when={!config()}
        fallback={
          <div class="flex flex-col gap-3">
            <p class="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-[13px] text-[var(--pill-good)]">对端已添加。把下面的配置导入手机或电脑上的 WireGuard 客户端。</p>
            <div class="flex flex-wrap items-start gap-4">
              <pre class="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-panel-2 p-3 font-mono text-[12px] leading-relaxed select-all">{config()}</pre>
              <div
                class="h-40 w-40 shrink-0 overflow-hidden rounded-lg border border-line bg-white p-1"
                title="扫描二维码导入 WireGuard 配置"
                innerHTML={renderSVG(config() ?? "")}
              />
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn" onClick={() => void copyText(config() ?? "")}>
                <Copy class="h-3.5 w-3.5" aria-hidden="true" />
                复制配置
              </button>
              <button type="button" class="btn" onClick={download}>
                <Download class="h-3.5 w-3.5" aria-hidden="true" />
                下载 .conf
              </button>
            </div>
            <p class="text-[12px] text-warn">私钥只在这里显示一次，仪表和路由器都不保存它。关闭后无法再次查看，丢失时请删除这个对端重新添加。</p>
          </div>
        }
      >
        <Show when={!original && tunnels().length > 1}>
          <Field label="WireGuard 接口" error={errors().iface}>
            <SelectInput value={iface()} onChange={setIface} options={tunnels().map((row) => ({ value: row.name, label: row.name }))} />
          </Field>
        </Show>
        <Field label="名称" hint="例如 我的手机">
          <TextInput value={name()} onInput={setName} />
        </Field>
        <Show when={!original}>
          <div class="seg self-start" role="group" aria-label="密钥来源">
            <button type="button" aria-pressed={mode() === "generate" ? "true" : "false"} onClick={() => setMode("generate")}>
              为新设备生成
            </button>
            <button type="button" aria-pressed={mode() === "existing" ? "true" : "false"} onClick={() => setMode("existing")}>
              已有公钥
            </button>
          </div>
        </Show>
        <Show when={mode() === "existing"}>
          <Field label="对端公钥" required error={errors().publicKey}>
            <TextInput value={publicKey()} onInput={setPublicKey} mono placeholder="44 位 Base64" invalid={!!errors().publicKey} />
          </Field>
        </Show>
        <Show when={mode() === "generate" && errors().publicKey}>
          <p class="form-error">{errors().publicKey}</p>
        </Show>
        <Field label="允许地址（allowed-address）" required={!!original} error={errors().allowed} hint={original ? undefined : `留空自动分配 ${suggested() || "（接口没有 IPv4 地址，需手动填写）"}`}>
          <TextInput value={allowed()} onInput={setAllowed} mono placeholder={suggested()} invalid={!!errors().allowed} />
        </Field>
        <div class="form-row">
          <Field label="对端地址" hint="对端有固定公网地址时填写">
            <TextInput value={endpoint()} onInput={setEndpoint} mono />
          </Field>
          <Field label="对端端口" error={errors().endpointPort}>
            <TextInput value={endpointPort()} onInput={setEndpointPort} mono invalid={!!errors().endpointPort} />
          </Field>
        </div>
        <Field label="保活间隔" hint="秒；对端在 NAT 后面时建议 25" error={errors().keepalive}>
          <TextInput value={keepalive()} onInput={setKeepalive} placeholder="25s" invalid={!!errors().keepalive} />
        </Field>
      </Show>
    </FormPanel>
  );
}

export function DeletePeerDialog(props: { peer: RosRecord; onClose: () => void; onDeleted?: () => void }) {
  const dash = useDashboard();
  return (
    <ConfirmDialog
      title="删除对端？"
      message={`“${props.peer.comment || shortKey(props.peer["public-key"])}”将无法再连接这个 WireGuard 隧道。`}
      confirmLabel="删除"
      danger
      onClose={props.onClose}
      onConfirm={async () => {
        const ok = await runWrite(dash, "已删除对端", () => ros.remove(PEERS, props.peer[".id"]));
        if (ok) props.onDeleted?.();
        return ok;
      }}
    />
  );
}
