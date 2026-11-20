import { createMemo, createSignal, For, Show } from "solid-js";
import { ros } from "../lib/api";
import { buildCreatePayload, buildEditPayload, validateCIDR, validatePortList } from "../lib/firewall";
import type { RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, SelectInput, Suggestions, TextInput, Toggle } from "./form";

const NAT = "/rest/ip/firewall/nat";

const ACTIONS = [
  { value: "masquerade", label: "masquerade · 伪装（出口 IP 自动）" },
  { value: "src-nat", label: "src-nat · 源地址转换" },
  { value: "dst-nat", label: "dst-nat · 目的地址转换" },
  { value: "redirect", label: "redirect · 重定向到本机" },
  { value: "netmap", label: "netmap · 一对一映射" },
  { value: "accept", label: "accept · 不做转换" },
] as const;

const PROTOCOLS = [
  { value: "", label: "任意" },
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
  { value: "icmp", label: "ICMP" },
] as const;

/** Generic NAT rule editor (srcnat / dstnat). Port forwards have their own friendlier form. */
export function NatRuleForm(props: { rule?: RosRecord; rules: RosRecord[]; onClose: () => void }) {
  const dash = useDashboard();
  const original = props.rule;
  const isEdit = !!original?.[".id"];
  const [fields, setFields] = createSignal<Record<string, string>>({
    chain: original?.chain ?? "srcnat",
    action: original?.action ?? "masquerade",
    protocol: original?.protocol ?? "",
    "src-address": original?.["src-address"] ?? "",
    "dst-address": original?.["dst-address"] ?? "",
    "dst-port": original?.["dst-port"] ?? "",
    "in-interface": original?.["in-interface"] ?? "",
    "in-interface-list": original?.["in-interface-list"] ?? "",
    "out-interface": original?.["out-interface"] ?? "",
    "out-interface-list": original?.["out-interface-list"] ?? "",
    "to-addresses": original?.["to-addresses"] ?? "",
    "to-ports": original?.["to-ports"] ?? "",
    comment: original?.comment ?? "",
  });
  const [enabled, setEnabled] = createSignal(original?.disabled !== "true");
  const [placeBefore, setPlaceBefore] = createSignal("");
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const set = (key: string) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const value = (key: string) => fields()[key] ?? "";

  const interfaces = createMemo(() => dash.interfaces().map((row) => row.name).filter(Boolean));
  const lists = createMemo(() => [...new Set(dash.listMembers().map((row) => row.list).filter(Boolean))]);
  const ips = createMemo(() => dash.clients().map((client) => client.ip).filter(Boolean));
  const needsTarget = () => ["src-nat", "dst-nat", "netmap"].includes(value("action"));

  const validate = () => {
    const next: Record<string, string> = {};
    for (const key of ["src-address", "dst-address"]) {
      const error = validateCIDR(value(key));
      if (error) next[key] = error;
    }
    for (const key of ["dst-port", "to-ports"]) {
      const error = validatePortList(value(key));
      if (error) next[key] = error;
    }
    if ((value("dst-port") || value("to-ports")) && !value("protocol")) next.protocol = "指定端口时必须选择 TCP 或 UDP";
    if (needsTarget() && !value("to-addresses")) next["to-addresses"] = "这个动作需要转换到的地址";
    else if (value("to-addresses") && !/^[\d./-]+$/.test(value("to-addresses"))) next["to-addresses"] = "无效的地址";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return false;
    const current = { ...fields(), disabled: enabled() ? "false" : "true" };
    if (isEdit && original) {
      const changed = buildEditPayload(original, current);
      if (Object.keys(changed).length === 0) return true;
      return runWrite(dash, "已保存 NAT 规则", () => ros.update(NAT, original[".id"], changed));
    }
    const payload = buildCreatePayload(current);
    if (placeBefore()) payload["place-before"] = placeBefore();
    return runWrite(dash, "已新建 NAT 规则", () => ros.create(NAT, payload));
  };

  return (
    <FormPanel title={isEdit ? "编辑 NAT 规则" : "新建 NAT 规则"} subtitle="/ip firewall nat" onClose={props.onClose} onSubmit={submit}>
      <Suggestions id="nat-ifaces" values={interfaces()} />
      <Suggestions id="nat-lists" values={lists()} />
      <Suggestions id="nat-ips" values={ips()} />
      <Field label="名称（备注）">
        <TextInput value={value("comment")} onInput={set("comment")} placeholder="例如 LAN 上网" />
      </Field>
      <div class="form-row">
        <Field label="链">
          <SelectInput
            value={value("chain")}
            onChange={set("chain")}
            options={[
              { value: "srcnat", label: "srcnat · 出站" },
              { value: "dstnat", label: "dstnat · 入站" },
            ]}
          />
        </Field>
        <Field label="动作">
          <SelectInput value={value("action")} onChange={set("action")} options={ACTIONS} />
        </Field>
      </div>
      <div class="form-section">匹配条件（留空表示不限）</div>
      <div class="form-row">
        <Field label="协议" error={errors().protocol}>
          <SelectInput value={value("protocol")} onChange={set("protocol")} options={PROTOCOLS} />
        </Field>
        <Field label="目的端口" error={errors()["dst-port"]}>
          <TextInput value={value("dst-port")} onInput={set("dst-port")} placeholder="80,443 或 8000-8100" mono invalid={!!errors()["dst-port"]} />
        </Field>
      </div>
      <div class="form-row">
        <Field label="源地址" error={errors()["src-address"]}>
          <TextInput value={value("src-address")} onInput={set("src-address")} placeholder="192.168.2.0/24" mono list="nat-ips" invalid={!!errors()["src-address"]} />
        </Field>
        <Field label="目的地址" error={errors()["dst-address"]}>
          <TextInput value={value("dst-address")} onInput={set("dst-address")} mono invalid={!!errors()["dst-address"]} />
        </Field>
      </div>
      <div class="form-row">
        <Field label={value("chain") === "srcnat" ? "出接口" : "入接口"}>
          <Show
            when={value("chain") === "srcnat"}
            fallback={<TextInput value={value("in-interface")} onInput={set("in-interface")} list="nat-ifaces" />}
          >
            <TextInput value={value("out-interface")} onInput={set("out-interface")} list="nat-ifaces" />
          </Show>
        </Field>
        <Field label={value("chain") === "srcnat" ? "出接口列表" : "入接口列表"}>
          <Show
            when={value("chain") === "srcnat"}
            fallback={<TextInput value={value("in-interface-list")} onInput={set("in-interface-list")} list="nat-lists" />}
          >
            <TextInput value={value("out-interface-list")} onInput={set("out-interface-list")} list="nat-lists" />
          </Show>
        </Field>
      </div>
      <Show when={value("action") !== "masquerade" && value("action") !== "accept"}>
        <div class="form-section">转换到</div>
        <div class="form-row">
          <Field label="地址" error={errors()["to-addresses"]} required={needsTarget()}>
            <TextInput value={value("to-addresses")} onInput={set("to-addresses")} mono list="nat-ips" invalid={!!errors()["to-addresses"]} />
          </Field>
          <Field label="端口" error={errors()["to-ports"]}>
            <TextInput value={value("to-ports")} onInput={set("to-ports")} mono invalid={!!errors()["to-ports"]} />
          </Field>
        </div>
      </Show>
      <Show when={!isEdit}>
        <Field label="位置" hint="NAT 规则按顺序匹配，第一条匹配的规则生效">
          <select class="input" value={placeBefore()} onChange={(event) => setPlaceBefore(event.currentTarget.value)}>
            <option value="">放在最后</option>
            <For each={props.rules}>
              {(rule, index) => (
                <option value={rule[".id"]}>
                  插入到 #{index()} 之前 · {rule.comment || `${rule.chain} ${rule.action}`}
                </option>
              )}
            </For>
          </select>
        </Field>
      </Show>
      <label class="flex items-center gap-2.5 text-[13px]">
        <Toggle checked={enabled()} onChange={setEnabled} label="启用" />
        启用这条规则
      </label>
    </FormPanel>
  );
}
