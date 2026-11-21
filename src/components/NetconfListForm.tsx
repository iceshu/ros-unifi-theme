import { createSignal } from "solid-js";
import { Field, FormPanel, SelectInput, TextInput, Toggle } from "./form";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";

const LIST_MENU = "/rest/interface/list";
const MEMBER_MENU = "/rest/interface/list/member";

export function InterfaceListForm(props: { entry?: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const original = props.entry;
  const [name, setName] = createSignal(original?.name ?? "");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!name().trim()) errs.name = "名称不能为空";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = { name: name().trim(), comment: comment() };
    if (original) {
      return runWrite(dash, "已更新接口列表", () => ros.update(LIST_MENU, original[".id"], fields));
    }
    return runWrite(dash, "已创建接口列表", () => ros.create(LIST_MENU, fields));
  };

  return (
    <FormPanel
      title={original ? "编辑接口列表" : "创建接口列表"}
      subtitle="/interface list"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Field label="名称" required error={errors().name}>
        <TextInput
          value={name()}
          onInput={setName}
          placeholder="MyList"
          mono
          invalid={!!errors().name}
        />
      </Field>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
    </FormPanel>
  );
}

export function ListMemberForm(props: {
  entry?: RosRecord;
  lists: string[];
  interfaces: string[];
  defaultList?: string;
  onClose: () => void;
}) {
  const dash = useDashboard();
  const original = props.entry;
  const [list, setList] = createSignal(original?.list ?? (props.defaultList ?? (props.lists[0] ?? "")));
  const [iface, setIface] = createSignal(original?.interface ?? "");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [disabled, setDisabled] = createSignal(original?.disabled === "true");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!list().trim()) errs.list = "请选择列表";
    if (!iface().trim()) errs.interface = "请选择接口";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    const fields: Record<string, string> = {
      list: list(),
      interface: iface(),
      comment: comment(),
      disabled: disabled() ? "true" : "false",
    };
    if (original) {
      return runWrite(dash, "已更新成员", () => ros.update(MEMBER_MENU, original[".id"], fields));
    }
    return runWrite(dash, "已添加成员", () => ros.create(MEMBER_MENU, fields));
  };

  const listOptions = () => props.lists.map((l) => ({ value: l, label: l }));
  const ifaceOptions = () => props.interfaces.map((n) => ({ value: n, label: n }));

  return (
    <FormPanel
      title={original ? "编辑成员" : "添加成员"}
      subtitle="/interface list member"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <div class="form-row">
        <Field label="列表" required error={errors().list}>
          <SelectInput value={list()} onChange={setList} options={listOptions()} />
        </Field>
        <Field label="接口" required error={errors().interface}>
          <SelectInput value={iface()} onChange={setIface} options={ifaceOptions()} />
        </Field>
      </div>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} placeholder="可选备注" />
      </Field>
      <Field label="启用">
        <Toggle checked={!disabled()} onChange={(v) => setDisabled(!v)} label="启用此成员" />
      </Field>
    </FormPanel>
  );
}
