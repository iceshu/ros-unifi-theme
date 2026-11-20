import { createSignal } from "solid-js";
import { Field, FormPanel, SelectInput, TextInput, Toggle } from "./form";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { validateCidr } from "./NetconfValidators";

const MENU = "/rest/ip/address";

export function AddressForm(props: {
  entry?: RosRecord;
  interfaces: string[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const original = props.entry;
  const [address, setAddress] = createSignal(original?.address ?? "");
  const [iface, setIface] = createSignal(original?.interface ?? (props.interfaces[0] ?? ""));
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    const cidrErr = validateCidr(address());
    if (cidrErr) errs.address = cidrErr;
    if (!iface().trim()) errs.interface = "请选择接口";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields = {
      address: address().trim(),
      interface: iface(),
      comment: comment(),
      disabled: disabled() ? "true" : "false",
    };
    if (original) {
      return runWrite(dash, "已更新 IP 地址", () => ros.update(MENU, original[".id"], fields));
    }
    return runWrite(dash, "已添加 IP 地址", () => ros.create(MENU, fields));
  };

  const ifaceOptions = () => props.interfaces.map((name) => ({ value: name, label: name }));

  return (
    <FormPanel
      title={original ? "编辑 IP 地址" : "添加 IP 地址"}
      subtitle="/ip address"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <div class="form-row">
        <Field label="地址/前缀" required error={errors().address}>
          <TextInput
            value={address()}
            onInput={setAddress}
            placeholder="192.168.1.1/24"
            mono
            invalid={!!errors().address}
          />
        </Field>
        <Field label="接口" required error={errors().interface}>
          <SelectInput value={iface()} onChange={setIface} options={ifaceOptions()} />
        </Field>
      </div>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此地址" />
      </Field>
    </FormPanel>
  );
}
