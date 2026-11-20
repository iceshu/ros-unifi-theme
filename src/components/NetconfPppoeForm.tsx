import { createSignal } from "solid-js";
import { Field, FormPanel, SecretInput, SelectInput, TextInput, Toggle } from "./form";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { validateIfaceName } from "./NetconfValidators";

const MENU = "/rest/interface/pppoe-client";

export function PppoeForm(props: {
  entry?: RosRecord;
  interfaces: string[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const original = props.entry;
  const [name, setName] = createSignal(original?.name ?? "");
  const [iface, setIface] = createSignal(original?.interface ?? (props.interfaces[0] ?? ""));
  const [user, setUser] = createSignal(original?.user ?? "");
  const [password, setPassword] = createSignal("");
  const [addDefaultRoute, setAddDefaultRoute] = createSignal(original?.["add-default-route"] !== "false");
  const [usePeerDns, setUsePeerDns] = createSignal(original?.["use-peer-dns"] !== "false");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!original) {
      const nameErr = validateIfaceName(name());
      if (nameErr) errs.name = nameErr;
      if (!password()) errs.password = "创建时密码不能为空";
    }
    if (!user().trim()) errs.user = "用户名不能为空";
    if (!iface().trim()) errs.interface = "请选择接口";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = {
      interface: iface(),
      user: user().trim(),
      "add-default-route": addDefaultRoute() ? "true" : "false",
      "use-peer-dns": usePeerDns() ? "true" : "false",
      comment: comment(),
      disabled: disabled() ? "true" : "false",
    };
    if (!original) fields.name = name().trim();
    if (password()) fields.password = password();

    if (original) {
      return runWrite(dash, "已更新 PPPoE 拨号", () => ros.update(MENU, original[".id"], fields));
    }
    return runWrite(dash, "已创建 PPPoE 拨号", () => ros.create(MENU, fields));
  };

  const ifaceOptions = () => props.interfaces.map((n) => ({ value: n, label: n }));

  return (
    <FormPanel
      title={original ? "编辑 PPPoE 拨号" : "新建 PPPoE 拨号"}
      subtitle="/interface pppoe-client"
      onClose={props.onClose}
      onSubmit={submit}
    >
      {!original && (
        <Field label="名称" required error={errors().name}>
          <TextInput
            value={name()}
            onInput={setName}
            placeholder="pppoe-wan"
            mono
            invalid={!!errors().name}
          />
        </Field>
      )}
      <Field label="上行接口" required error={errors().interface}>
        <SelectInput value={iface()} onChange={setIface} options={ifaceOptions()} />
      </Field>
      <div class="form-row">
        <Field label="用户名" required error={errors().user}>
          <TextInput value={user()} onInput={setUser} placeholder="user@isp" mono invalid={!!errors().user} />
        </Field>
        <Field
          label="密码"
          required={!original}
          hint={original ? "留空保持不变" : undefined}
          error={errors().password}
        >
          <SecretInput value={password()} onInput={setPassword} placeholder={original ? "••••••••" : "密码"} invalid={!!errors().password} />
        </Field>
      </div>
      <div class="form-row">
        <Field label="添加默认路由">
          <Toggle checked={addDefaultRoute()} onChange={setAddDefaultRoute} label="自动添加默认路由" />
        </Field>
        <Field label="使用运营商 DNS">
          <Toggle checked={usePeerDns()} onChange={setUsePeerDns} label="使用对端 DNS" />
        </Field>
      </div>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此拨号" />
      </Field>
    </FormPanel>
  );
}
