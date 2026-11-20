import { createMemo, createSignal, Show } from "solid-js";
import { ros } from "../lib/api";
import { validateIPv4, isInPool, isInNetwork } from "../lib/clients";
import { flag } from "../lib/model";
import { runWrites } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { sameMac } from "../lib/topology";
import { ConfirmDialog, Field, FormPanel, TextInput } from "./form";

export function ClientFixedIPForm(props: {
  ip: string;
  mac: string;
  onClose: () => void;
}) {
  const dash = useDashboard();

  const lease = createMemo(() =>
    dash.leases().find((l) => sameMac(l["mac-address"], props.mac) || (!!props.ip && l.address === props.ip)),
  );
  const isDynamic = createMemo(() => !lease() || flag(lease()!.dynamic));

  const [address, setAddress] = createSignal(props.ip || "");
  const [showUnfixConfirm, setShowUnfixConfirm] = createSignal(false);

  const ipError = createMemo(() => {
    const v = address().trim();
    if (!v) return "请输入 IPv4 地址";
    if (!validateIPv4(v)) return "IPv4 格式不正确";
    if (!isInNetwork(v, dash.dhcpNetworks())) return "地址不在任何 DHCP 网络范围内";
    return "";
  });

  const ipWarning = createMemo(() => {
    const v = address().trim();
    if (!ipError() && isInPool(v, dash.pools())) return "该地址在地址池范围内，可能与动态分配产生冲突";
    return "";
  });

  const submit = async () => {
    if (ipError()) return false;
    const existing = lease();
    if (!existing) return false;
    const ops: Array<() => Promise<unknown>> = [];
    if (isDynamic()) {
      ops.push(() => ros.command("/rest/ip/dhcp-server/lease", "make-static", { ".id": existing[".id"] }));
    }
    if (address().trim() !== existing.address) {
      ops.push(() => ros.update("/rest/ip/dhcp-server/lease", existing[".id"], { address: address().trim() }));
    }
    return runWrites(dash, "已设置固定 IP", ops.length ? ops : [() => Promise.resolve()]);
  };

  const unfix = async () => {
    const existing = lease();
    if (!existing) return false;
    return runWrites(dash, "已取消固定 IP", [() => ros.remove("/rest/ip/dhcp-server/lease", existing[".id"])]);
  };

  const title = isDynamic() ? "固定 IP" : "编辑固定 IP";
  const subtitle = isDynamic()
    ? "将动态租约转为静态，设备始终获得同一 IP"
    : "修改静态 IP 保留地址";

  return (
    <>
      <FormPanel
        title={title}
        subtitle={subtitle}
        submitLabel="保存"
        onClose={props.onClose}
        onSubmit={submit}
        footer={
          <Show when={!isDynamic()}>
            <button type="button" class="btn btn-danger" onClick={() => setShowUnfixConfirm(true)}>
              取消固定
            </button>
          </Show>
        }
      >
        <Field label="IP 地址" required error={ipError()} hint={ipWarning()}>
          <TextInput value={address()} onInput={setAddress} mono placeholder="192.168.1.100" invalid={!!ipError()} />
        </Field>
      </FormPanel>
      <Show when={showUnfixConfirm()}>
        <ConfirmDialog
          title="取消固定 IP"
          message={
            <>
              <p>将删除该设备的静态租约。</p>
              <p class="mt-2 text-[13px] text-muted">下次续约时设备将从地址池重新动态获取 IP，可能与现有 IP 不同。</p>
            </>
          }
          confirmLabel="确认取消"
          danger
          onClose={() => setShowUnfixConfirm(false)}
          onConfirm={async () => {
            const ok = await unfix();
            if (ok) props.onClose();
            return ok;
          }}
        />
      </Show>
    </>
  );
}
