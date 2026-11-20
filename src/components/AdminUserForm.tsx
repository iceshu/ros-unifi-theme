import { createSignal, Show } from "solid-js";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, SecretInput, SelectInput, TextInput, Toggle } from "./form";

export function AdminUserForm(props: {
  user?: RosRecord;
  groups: RosRecord[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const [name, setName] = createSignal(props.user?.name ?? "");
  const [group, setGroup] = createSignal(props.user?.group ?? props.groups[0]?.name ?? "");
  const [password, setPassword] = createSignal("");
  const [resetPwd, setResetPwd] = createSignal(false);
  const [address, setAddress] = createSignal(props.user?.address ?? "");
  const [comment, setComment] = createSignal(props.user?.comment ?? "");
  const [disabled, setDisabled] = createSignal(props.user?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!props.user && !name().trim()) errs.name = "请填写用户名";
    if (!props.user && password().length < 8) errs.password = "密码至少 8 位";
    if (resetPwd() && password().length < 8) errs.password = "密码至少 8 位";
    setErrors(errs);
    if (Object.keys(errs).length) return false;

    if (props.user) {
      const fields: Record<string, string> = {};
      if (group() !== props.user.group) fields.group = group();
      if (address() !== props.user.address) fields.address = address();
      if (comment() !== props.user.comment) fields.comment = comment();
      if (String(disabled()) !== props.user.disabled) fields.disabled = String(disabled());
      if (resetPwd() && password()) fields.password = password();
      if (!Object.keys(fields).length) return true;
      return runWrite(dash, "已保存用户", () => ros.update("/rest/user", props.user![".id"], fields));
    }

    return runWrite(dash, "已新建用户", () =>
      ros.create("/rest/user", {
        name: name().trim(),
        group: group(),
        password: password(),
        address: address().trim(),
        comment: comment().trim(),
        disabled: String(disabled()),
      }),
    );
  };

  const groupOpts = () => props.groups.map((g) => ({ value: g.name, label: g.name }));

  return (
    <FormPanel
      title={props.user ? "编辑用户" : "新建用户"}
      submitLabel={props.user ? "保存" : "新建"}
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Show when={!props.user}>
        <Field label="用户名" required error={errors().name}>
          <TextInput value={name()} onInput={setName} invalid={!!errors().name} />
        </Field>
      </Show>
      <Field label="用户组">
        <SelectInput value={group()} onChange={setGroup} options={groupOpts()} />
      </Field>
      <Show when={!props.user}>
        <Field label="密码" required error={errors().password} hint="至少 8 位">
          <SecretInput value={password()} onInput={setPassword} invalid={!!errors().password} />
        </Field>
      </Show>
      <Show when={props.user}>
        <div class="flex items-center gap-3">
          <Toggle checked={resetPwd()} onChange={setResetPwd} label="重置密码" />
        </div>
        <Show when={resetPwd()}>
          <Field label="新密码" required error={errors().password} hint="至少 8 位">
            <SecretInput value={password()} onInput={setPassword} invalid={!!errors().password} />
          </Field>
        </Show>
      </Show>
      <Field label="允许地址" hint="留空不限制，支持 CIDR（如 192.168.88.0/24）">
        <TextInput value={address()} onInput={setAddress} mono />
      </Field>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} />
      </Field>
      <Toggle checked={disabled()} onChange={setDisabled} label="禁用账号" />
    </FormPanel>
  );
}
