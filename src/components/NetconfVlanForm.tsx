import { createSignal } from "solid-js";
import { Field, FormPanel, SelectInput, TextInput, Toggle } from "./form";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { validateIfaceName, validateMtu, validateVlanId } from "./NetconfValidators";

const MENU = "/rest/interface/vlan";

export function VlanForm(props: {
  entry?: RosRecord;
  interfaces: string[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const original = props.entry;
  const [name, setName] = createSignal(original?.name ?? "");
  const [vlanId, setVlanId] = createSignal(original?.["vlan-id"] ?? "");
  const [iface, setIface] = createSignal(original?.interface ?? (props.interfaces[0] ?? ""));
  const [mtu, setMtu] = createSignal(original?.mtu ?? "1500");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    const nameErr = validateIfaceName(name());
    if (nameErr) errs.name = nameErr;
    const vlanErr = validateVlanId(vlanId());
    if (vlanErr) errs.vlanId = vlanErr;
    if (!iface().trim()) errs.interface = "请选择接口";
    const mtuErr = validateMtu(mtu());
    if (mtuErr) errs.mtu = mtuErr;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = {
      name: name().trim(),
      "vlan-id": vlanId().trim(),
      interface: iface(),
      mtu: mtu().trim() || "1500",
      comment: comment(),
      disabled: disabled() ? "true" : "false",
    };
    if (original) {
      return runWrite(dash, "已更新 VLAN", () => ros.update(MENU, original[".id"], fields));
    }
    return runWrite(dash, "已创建 VLAN", () => ros.create(MENU, fields));
  };

  const ifaceOptions = () => props.interfaces.map((n) => ({ value: n, label: n }));

  return (
    <FormPanel
      title={original ? "编辑 VLAN" : "创建 VLAN"}
      subtitle="/interface vlan"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <div class="form-row">
        <Field label="接口名称" required error={errors().name}>
          <TextInput
            value={name()}
            onInput={setName}
            placeholder="vlan-guest"
            mono
            invalid={!!errors().name}
          />
        </Field>
        <Field label="VLAN ID" required error={errors().vlanId}>
          <TextInput
            value={vlanId()}
            onInput={setVlanId}
            placeholder="30"
            mono
            invalid={!!errors().vlanId}
          />
        </Field>
      </div>
      <div class="form-row">
        <Field label="父接口" required error={errors().interface}>
          <SelectInput value={iface()} onChange={setIface} options={ifaceOptions()} />
        </Field>
        <Field label="MTU" error={errors().mtu}>
          <TextInput value={mtu()} onInput={setMtu} placeholder="1500" mono invalid={!!errors().mtu} />
        </Field>
      </div>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此 VLAN" />
      </Field>
    </FormPanel>
  );
}
