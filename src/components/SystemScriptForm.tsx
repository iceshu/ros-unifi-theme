import { createSignal } from "solid-js";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, TextInput, Toggle } from "./form";

export function SystemScriptForm(props: { script?: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const isEdit = !!props.script;

  const [name, setName] = createSignal(props.script?.name ?? "");
  const [source, setSource] = createSignal(props.script?.source ?? "");
  const [policy, setPolicy] = createSignal(props.script?.policy ?? "read,write,test");
  const [comment, setComment] = createSignal(props.script?.comment ?? "");
  const [dontRequirePerms, setDontRequirePerms] = createSignal(props.script?.["dont-require-permissions"] === "true");
  const [enabled, setEnabled] = createSignal(props.script?.disabled !== "true");
  const [nameError, setNameError] = createSignal("");

  const submit = async () => {
    if (!name().trim()) {
      setNameError("请输入脚本名称");
      return false;
    }
    setNameError("");
    const fields: Record<string, string> = {
      name: name(),
      source: source(),
      policy: policy(),
      comment: comment(),
      "dont-require-permissions": dontRequirePerms() ? "true" : "false",
      disabled: enabled() ? "false" : "true",
    };
    if (isEdit) {
      return runWrite(dash, "已保存脚本", () => ros.update("/rest/system/script", props.script![".id"], fields));
    }
    return runWrite(dash, "已创建脚本", () => ros.create("/rest/system/script", fields));
  };

  return (
    <FormPanel
      title={isEdit ? "编辑脚本" : "新建脚本"}
      subtitle="/system script"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Field label="名称" required error={nameError()}>
        <TextInput value={name()} onInput={setName} placeholder="ping-test" />
      </Field>
      <Field label="策略" hint="如 read,write,test">
        <TextInput value={policy()} onInput={setPolicy} placeholder="read,write,test" mono />
      </Field>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} />
      </Field>
      <Field label="脚本内容" hint="RouterOS 脚本代码">
        <textarea
          class="input font-mono text-[12px] leading-relaxed"
          rows={12}
          value={source()}
          onInput={(e) => setSource(e.currentTarget.value)}
          placeholder={"/ping 8.8.8.8 count=4"}
          style={{ resize: "vertical", "min-height": "180px" }}
        />
      </Field>
      <Field label="">
        <Toggle checked={!dontRequirePerms()} onChange={(v) => setDontRequirePerms(!v)} label="需要权限验证" />
      </Field>
      <Field label="">
        <Toggle checked={enabled()} onChange={setEnabled} label="启用" />
      </Field>
    </FormPanel>
  );
}
