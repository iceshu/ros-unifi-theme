import { createSignal } from "solid-js";
import { Field, FormPanel, Suggestions, TextInput, Toggle } from "./form";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { validateCidr, validateDistance, validateGateway } from "./NetconfValidators";

const MENU = "/rest/ip/route";

export function RouteForm(props: {
  entry?: RosRecord;
  interfaces: string[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const original = props.entry;
  const [dst, setDst] = createSignal(original?.["dst-address"] ?? "");
  const [gateway, setGateway] = createSignal(original?.gateway ?? "");
  const [distance, setDistance] = createSignal(original?.distance ?? "1");
  const [table, setTable] = createSignal(original?.["routing-table"] ?? "main");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    const dstErr = validateCidr(dst());
    if (dstErr) errs.dst = dstErr;
    const gwErr = validateGateway(gateway());
    if (gwErr) errs.gateway = gwErr;
    const distErr = validateDistance(distance());
    if (distErr) errs.distance = distErr;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = {
      "dst-address": dst().trim(),
      gateway: gateway().trim(),
      distance: distance().trim() || "1",
      "routing-table": table().trim() || "main",
      comment: comment(),
      disabled: disabled() ? "true" : "false",
    };
    if (original) {
      return runWrite(dash, "已更新路由", () => ros.update(MENU, original[".id"], fields));
    }
    return runWrite(dash, "已添加路由", () => ros.create(MENU, fields));
  };

  return (
    <FormPanel
      title={original ? "编辑静态路由" : "添加静态路由"}
      subtitle="/ip route"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <div class="form-row">
        <Field label="目的网络" required error={errors().dst}>
          <TextInput
            value={dst()}
            onInput={setDst}
            placeholder="0.0.0.0/0"
            mono
            invalid={!!errors().dst}
          />
        </Field>
        <Field label="网关" required error={errors().gateway}>
          <TextInput
            value={gateway()}
            onInput={setGateway}
            placeholder="192.168.1.1 或接口名"
            mono
            invalid={!!errors().gateway}
            list="route-iface-list"
          />
          <Suggestions id="route-iface-list" values={props.interfaces} />
        </Field>
      </div>
      <div class="form-row">
        <Field label="距离" error={errors().distance}>
          <TextInput value={distance()} onInput={setDistance} placeholder="1" mono invalid={!!errors().distance} />
        </Field>
        <Field label="路由表">
          <TextInput value={table()} onInput={setTable} placeholder="main" mono />
        </Field>
      </div>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此路由" />
      </Field>
    </FormPanel>
  );
}
