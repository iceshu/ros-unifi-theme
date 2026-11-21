import { createMemo, createSignal, For, Show } from "solid-js";
import { buildCreatePayload, buildEditPayload, validateCIDR, validatePortList } from "../lib/firewall";
import { type RosRecord } from "../lib/model";
import { runWrite, runWrites } from "../lib/mutate";
import { ros } from "../lib/api";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, SelectInput, Suggestions, TextInput, Toggle } from "./form";

const PROTO_OPTS: Array<{ value: string; label: string }> = [
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
];

const PROTO_OPTS_CREATE: Array<{ value: string; label: string }> = [
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
  { value: "tcp+udp", label: "TCP + UDP（创建两条规则）" },
];

export function PortForwardForm(props: {
  rule?: RosRecord;
  onClose: () => void;
}) {
  const dash = useDashboard();
  const r = props.rule;
  const isEdit = !!r?.[".id"];

  const hasWanList = dash.listMembers().some((m) => m.list === "WAN");
  const initIfaceType: "iface" | "list" =
    r?.["in-interface-list"] ? "list" : r?.["in-interface"] ? "iface" : hasWanList ? "list" : "iface";
  const initIfaceValue =
    r?.["in-interface-list"] ?? r?.["in-interface"] ?? (hasWanList ? "WAN" : (dash.primaryWan() ?? ""));

  const [comment, setComment] = createSignal(r?.comment ?? "");
  const [protocol, setProtocol] = createSignal(r?.protocol ?? "tcp");
  const [dstPort, setDstPort] = createSignal(r?.["dst-port"] ?? "");
  const [toAddr, setToAddr] = createSignal(r?.["to-addresses"] ?? "");
  const [toPorts, setToPorts] = createSignal(r?.["to-ports"] ?? "");
  const [srcAddr, setSrcAddr] = createSignal(r?.["src-address"] ?? "");
  const [ifaceType, setIfaceType] = createSignal<"iface" | "list">(initIfaceType);
  const [ifaceValue, setIfaceValue] = createSignal(initIfaceValue);
  const [disabled, setDisabled] = createSignal(r?.disabled === "true");

  const [dstPortErr, setDstPortErr] = createSignal<string | undefined>();
  const [toAddrErr, setToAddrErr] = createSignal<string | undefined>();
  const [toPortErr, setToPortErr] = createSignal<string | undefined>();
  const [srcAddrErr, setSrcAddrErr] = createSignal<string | undefined>();

  const interfaceNames = createMemo(() =>
    dash.interfaces().map((i) => i.name).filter(Boolean).sort(),
  );
  const listNames = createMemo(() =>
    [...new Set(dash.listMembers().map((m) => m.list))].filter(Boolean).sort(),
  );
  const clientSuggestions = createMemo(() =>
    dash.clients().map((c) => c.ip).filter(Boolean),
  );

  function validate(): boolean {
    const dpe = !dstPort().trim() ? "外部端口不能为空" : (validatePortList(dstPort()) ?? undefined);
    setDstPortErr(dpe);
    const tae = !toAddr().trim() ? "转发目标地址不能为空" : (validateCIDR(toAddr()) ?? undefined);
    setToAddrErr(tae);
    const tpe = validatePortList(toPorts()) ?? undefined;
    setToPortErr(tpe);
    const sae = validateCIDR(srcAddr()) ?? undefined;
    setSrcAddrErr(sae);
    return !dpe && !tae && !tpe && !sae;
  }

  async function handleSubmit(): Promise<boolean> {
    if (!validate()) return false;

    if (isEdit) {
      const current: Record<string, string> = {
        comment: comment(),
        protocol: protocol(),
        "dst-port": dstPort(),
        "to-addresses": toAddr(),
        "to-ports": toPorts(),
        "src-address": srcAddr(),
        "in-interface": ifaceType() === "iface" ? ifaceValue() : "",
        "in-interface-list": ifaceType() === "list" ? ifaceValue() : "",
        disabled: disabled() ? "true" : "false",
      };
      const payload = buildEditPayload(r!, current);
      if (Object.keys(payload).length === 0) return true;
      return runWrite(dash, "已保存端口转发", () =>
        ros.update("/rest/ip/firewall/nat", r![".id"], payload),
      );
    } else {
      const base: Record<string, string> = {
        chain: "dstnat",
        action: "dst-nat",
        comment: comment(),
        "dst-port": dstPort(),
        "to-addresses": toAddr(),
        disabled: disabled() ? "true" : "false",
      };
      if (toPorts()) base["to-ports"] = toPorts();
      if (srcAddr()) base["src-address"] = srcAddr();
      if (ifaceValue()) {
        if (ifaceType() === "list") {
          base["in-interface-list"] = ifaceValue();
        } else {
          base["in-interface"] = ifaceValue();
        }
      }

      const proto = protocol();
      if (proto === "tcp+udp") {
        return runWrites(dash, "已创建端口转发（TCP + UDP）", [
          () => ros.create("/rest/ip/firewall/nat", buildCreatePayload({ ...base, protocol: "tcp" })),
          () => ros.create("/rest/ip/firewall/nat", buildCreatePayload({ ...base, protocol: "udp" })),
        ]);
      }
      return runWrite(dash, "已创建端口转发", () =>
        ros.create("/rest/ip/firewall/nat", buildCreatePayload({ ...base, protocol: proto })),
      );
    }
  }

  return (
    <FormPanel
      title={isEdit ? "编辑端口转发" : "新建端口转发"}
      onClose={props.onClose}
      onSubmit={handleSubmit}
    >
      <Field label="名称" hint="用于识别此规则（可选）">
        <TextInput
          value={comment()}
          onInput={(v) => setComment(v)}
          placeholder="例如：Minecraft 服务器"
        />
      </Field>
      <div class="form-row">
        <Field label="协议" required>
          <SelectInput
            value={protocol()}
            onChange={(v) => setProtocol(v)}
            options={isEdit ? PROTO_OPTS : PROTO_OPTS_CREATE}
          />
        </Field>
        <Field label="外部端口" hint="如 25565 或 8000-8100" error={dstPortErr()} required>
          <TextInput
            value={dstPort()}
            onInput={(v) => setDstPort(v)}
            placeholder="如 25565"
            mono
            invalid={!!dstPortErr()}
          />
        </Field>
      </div>
      <Field label="转发到设备" hint="内网目标 IP 地址" error={toAddrErr()} required>
        <TextInput
          value={toAddr()}
          onInput={(v) => setToAddr(v)}
          placeholder="如 192.168.1.100"
          mono
          list="pf-to-addr"
          invalid={!!toAddrErr()}
        />
        <datalist id="pf-to-addr">
          <For each={dash.clients()}>
            {(c) => (
              <option value={c.ip} label={`${c.title} (${c.ip})`} />
            )}
          </For>
          <For each={clientSuggestions().filter((ip) => !dash.clients().find((c) => c.ip === ip))}>
            {(ip) => <option value={ip} />}
          </For>
        </datalist>
      </Field>
      <Field label="内部端口" hint="留空则与外部端口相同" error={toPortErr()}>
        <TextInput
          value={toPorts()}
          onInput={(v) => setToPorts(v)}
          placeholder="留空则与外部端口相同"
          mono
          invalid={!!toPortErr()}
        />
      </Field>
      <Field label="来源限制" hint="限制来源 IP 或 CIDR，留空不限制" error={srcAddrErr()}>
        <TextInput
          value={srcAddr()}
          onInput={(v) => setSrcAddr(v)}
          placeholder="任意来源"
          mono
          invalid={!!srcAddrErr()}
        />
      </Field>
      <Field label="入口" hint="接收外部连接的接口或接口列表">
        <div class="flex gap-2">
          <select
            class="input w-36 shrink-0"
            value={ifaceType()}
            onChange={(e) => setIfaceType(e.currentTarget.value as "iface" | "list")}
          >
            <option value="iface">接口</option>
            <option value="list">接口列表</option>
          </select>
          <div class="flex-1">
            <Show when={ifaceType() === "iface"}>
              <TextInput
                value={ifaceValue()}
                onInput={(v) => setIfaceValue(v)}
                list="pf-iface"
                placeholder="接口名称"
              />
              <Suggestions id="pf-iface" values={interfaceNames()} />
            </Show>
            <Show when={ifaceType() === "list"}>
              <TextInput
                value={ifaceValue()}
                onInput={(v) => setIfaceValue(v)}
                list="pf-ifacelist"
                placeholder="接口列表名称"
              />
              <Suggestions id="pf-ifacelist" values={listNames()} />
            </Show>
          </div>
        </div>
      </Field>
      <Field label="启用规则">
        <Toggle
          checked={!disabled()}
          onChange={(v) => setDisabled(!v)}
          label={disabled() ? "规则已禁用" : "规则已启用"}
        />
      </Field>
    </FormPanel>
  );
}
