import { createMemo, createSignal, Show } from "solid-js";
import { ros } from "../lib/api";
import { validateIPv4, validateMAC, isInPool, isInNetwork } from "../lib/clients";
import { flag } from "../lib/model";
import { runWrites } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { ConfirmDialog, Field, FormPanel, SelectInput, Suggestions, TextInput } from "./form";
import type { RosRecord } from "../lib/model";

export function LeaseForm(props: {
  lease?: RosRecord;
  onClose: () => void;
}) {
  const dash = useDashboard();
  const isEdit = !!props.lease && !flag(props.lease.dynamic);

  const [address, setAddress] = createSignal(props.lease?.address ?? "");
  const [mac, setMac] = createSignal(props.lease?.["mac-address"] ?? "");
  const [comment, setComment] = createSignal(props.lease?.comment ?? "");
  const [server, setServer] = createSignal(props.lease?.server ?? (dash.dhcpServers()[0]?.name ?? ""));
  const [showDelete, setShowDelete] = createSignal(false);

  const ipError = createMemo(() => {
    const v = address().trim();
    if (!v) return "请输入 IPv4 地址";
    if (!validateIPv4(v)) return "IPv4 格式不正确";
    if (!isInNetwork(v, dash.dhcpNetworks())) return "地址不在任何 DHCP 网络范围内";
    return "";
  });

  const ipWarning = createMemo(() => {
    const v = address().trim();
    if (!ipError() && isInPool(v, dash.pools())) return "该地址在地址池范围内，可能与动态分配冲突";
    return "";
  });

  const macError = createMemo(() => {
    const v = mac().trim();
    if (!v) return "请输入 MAC 地址";
    if (!validateMAC(v)) return "MAC 格式不正确 (例: AA:BB:CC:DD:EE:FF)";
    return "";
  });

  const serverOptions = createMemo(() =>
    dash.dhcpServers().map((s) => ({ value: s.name, label: `${s.name} (${s.interface})` })),
  );

  const submit = async () => {
    if (ipError() || macError()) return false;
    const fields: Record<string, string> = {
      address: address().trim(),
      "mac-address": mac().trim(),
      comment: comment().trim(),
    };
    if (server()) fields.server = server();
    if (isEdit) {
      return runWrites(dash, "已保存", [() => ros.update("/rest/ip/dhcp-server/lease", props.lease![".id"], fields)]);
    }
    return runWrites(dash, "已创建固定分配", [() => ros.create("/rest/ip/dhcp-server/lease", fields)]);
  };

  const doDelete = async () => {
    if (!props.lease) return false;
    return runWrites(dash, "已删除", [() => ros.remove("/rest/ip/dhcp-server/lease", props.lease![".id"])]);
  };

  const macSuggestions = createMemo(() =>
    dash.arp().map((a) => a["mac-address"]).filter(Boolean),
  );

  return (
    <>
      <FormPanel
        title={isEdit ? "编辑固定分配" : "新建固定分配"}
        subtitle="DHCP 静态地址保留"
        onClose={props.onClose}
        onSubmit={submit}
        footer={
          <Show when={isEdit}>
            <button type="button" class="btn btn-danger" onClick={() => setShowDelete(true)}>
              删除
            </button>
          </Show>
        }
      >
        <Field label="IP 地址" required error={ipError()} hint={ipWarning()}>
          <TextInput value={address()} onInput={setAddress} mono placeholder="192.168.1.100" invalid={!!ipError()} />
        </Field>
        <Field label="MAC 地址" required error={macError()}>
          <Suggestions id="lease-mac-sugg" values={macSuggestions()} />
          <TextInput value={mac()} onInput={setMac} mono placeholder="AA:BB:CC:DD:EE:FF" invalid={!!macError()} list="lease-mac-sugg" />
        </Field>
        <Field label="DHCP 服务器">
          <Show when={serverOptions().length > 1} fallback={<span class="text-[13px] text-muted">{server() || "—"}</span>}>
            <SelectInput value={server()} onChange={setServer} options={serverOptions()} />
          </Show>
        </Field>
        <Field label="备注（显示名称）">
          <TextInput value={comment()} onInput={setComment} placeholder="我的电脑" />
        </Field>
      </FormPanel>
      <Show when={showDelete()}>
        <ConfirmDialog
          title="删除固定分配"
          message={
            <>
              <p>将删除 <strong>{address()}</strong> 的静态租约。</p>
              <p class="mt-2 text-[13px] text-muted">下次续约时设备将从地址池重新动态获取 IP。</p>
            </>
          }
          confirmLabel="确认删除"
          danger
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            const ok = await doDelete();
            if (ok) props.onClose();
            return ok;
          }}
        />
      </Show>
    </>
  );
}
