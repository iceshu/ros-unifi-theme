import { createSignal } from "solid-js";
import { Field, FormPanel, SelectInput, TextInput, Toggle } from "./form";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { validateIfaceName } from "./NetconfValidators";

const BRIDGE = "/rest/interface/bridge";
const BRIDGE_PORT = "/rest/interface/bridge/port";

const PROTOCOL_OPTIONS = [
  { value: "rstp", label: "RSTP（推荐）" },
  { value: "mstp", label: "MSTP" },
  { value: "stp", label: "STP" },
  { value: "none", label: "无生成树" },
];

export function BridgeForm(props: { entry?: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const original = props.entry;
  const [name, setName] = createSignal(original?.name ?? "");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [protocolMode, setProtocolMode] = createSignal(original?.["protocol-mode"] ?? "rstp");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!original) {
      const nameErr = validateIfaceName(name());
      if (nameErr) errs.name = nameErr;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = {
      comment: comment(),
      "protocol-mode": protocolMode(),
      disabled: disabled() ? "true" : "false",
    };
    if (!original) fields.name = name().trim();

    if (original) {
      return runWrite(dash, "已更新网桥", () => ros.update(BRIDGE, original[".id"], fields));
    }
    return runWrite(dash, "已创建网桥", () => ros.create(BRIDGE, fields));
  };

  return (
    <FormPanel
      title={original ? "编辑网桥" : "创建网桥"}
      subtitle="/interface bridge"
      onClose={props.onClose}
      onSubmit={submit}
    >
      {!original && (
        <Field label="名称" required error={errors().name}>
          <TextInput
            value={name()}
            onInput={setName}
            placeholder="bridge2"
            mono
            invalid={!!errors().name}
          />
        </Field>
      )}
      <Field label="生成树协议">
        <SelectInput value={protocolMode()} onChange={setProtocolMode} options={PROTOCOL_OPTIONS} />
      </Field>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此网桥" />
      </Field>
    </FormPanel>
  );
}

export function BridgePortForm(props: {
  entry?: RosRecord;
  bridges: string[];
  interfaces: string[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const original = props.entry;
  const [bridge, setBridge] = createSignal(original?.bridge ?? (props.bridges[0] ?? ""));
  const [iface, setIface] = createSignal(original?.interface ?? "");
  const [pvid, setPvid] = createSignal(original?.pvid ?? "1");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!bridge().trim()) errs.bridge = "请选择网桥";
    if (!iface().trim()) errs.interface = "请选择接口";
    const pvidNum = Number(pvid());
    if (!Number.isInteger(pvidNum) || pvidNum < 1 || pvidNum > 4094) errs.pvid = "PVID 应为 1–4094";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = {
      bridge: bridge(),
      interface: iface(),
      pvid: pvid(),
      comment: comment(),
      disabled: disabled() ? "true" : "false",
    };
    if (original) {
      return runWrite(dash, "已更新端口", () => ros.update(BRIDGE_PORT, original[".id"], fields));
    }
    return runWrite(dash, "已添加端口", () => ros.create(BRIDGE_PORT, fields));
  };

  const bridgeOptions = () => props.bridges.map((b) => ({ value: b, label: b }));
  const ifaceOptions = () => props.interfaces.map((n) => ({ value: n, label: n }));

  return (
    <FormPanel
      title={original ? "编辑端口" : "添加端口"}
      subtitle="/interface bridge port"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <div class="form-row">
        <Field label="网桥" required error={errors().bridge}>
          <SelectInput value={bridge()} onChange={setBridge} options={bridgeOptions()} />
        </Field>
        <Field label="接口" required error={errors().interface}>
          <SelectInput value={iface()} onChange={setIface} options={ifaceOptions()} />
        </Field>
      </div>
      <div class="form-row">
        <Field label="PVID" error={errors().pvid}>
          <TextInput value={pvid()} onInput={setPvid} placeholder="1" mono invalid={!!errors().pvid} />
        </Field>
        <Field label="备注">
          <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
        </Field>
      </div>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此端口" />
      </Field>
    </FormPanel>
  );
}
