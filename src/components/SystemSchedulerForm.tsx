import { createSignal } from "solid-js";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, TextInput, Toggle } from "./form";

export function SystemSchedulerForm(props: { entry?: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const isEdit = !!props.entry;

  const [name, setName] = createSignal(props.entry?.name ?? "");
  const [startDate, setStartDate] = createSignal(props.entry?.["start-date"] ?? "");
  const [startTime, setStartTime] = createSignal(props.entry?.["start-time"] ?? "00:00:00");
  const [interval, setInterval_] = createSignal(props.entry?.interval ?? "");
  const [onEvent, setOnEvent] = createSignal(props.entry?.["on-event"] ?? "");
  const [policy, setPolicy] = createSignal(props.entry?.policy ?? "read,write,test");
  const [comment, setComment] = createSignal(props.entry?.comment ?? "");
  const [enabled, setEnabled] = createSignal(props.entry?.disabled !== "true");
  const [nameError, setNameError] = createSignal("");

  const submit = async () => {
    if (!name().trim()) {
      setNameError("请输入名称");
      return false;
    }
    setNameError("");
    const fields: Record<string, string> = {
      name: name(),
      "start-date": startDate(),
      "start-time": startTime(),
      interval: interval(),
      "on-event": onEvent(),
      policy: policy(),
      comment: comment(),
      disabled: enabled() ? "false" : "true",
    };
    if (isEdit) {
      return runWrite(dash, "已保存计划任务", () => ros.update("/rest/system/scheduler", props.entry![".id"], fields));
    }
    return runWrite(dash, "已创建计划任务", () => ros.create("/rest/system/scheduler", fields));
  };

  return (
    <FormPanel
      title={isEdit ? "编辑计划任务" : "新建计划任务"}
      subtitle="/system scheduler"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Field label="名称" required error={nameError()}>
        <TextInput value={name()} onInput={setName} placeholder="auto-backup" />
      </Field>
      <div class="form-row">
        <Field label="开始日期" hint="如 jan/01/2026">
          <TextInput value={startDate()} onInput={setStartDate} placeholder="jan/01/2026" mono />
        </Field>
        <Field label="开始时间">
          <TextInput value={startTime()} onInput={setStartTime} placeholder="02:00:00" mono />
        </Field>
      </div>
      <Field label="执行间隔" hint="如 1d、1h30m 或 00:30:00">
        <TextInput value={interval()} onInput={setInterval_} placeholder="1d" mono />
      </Field>
      <Field label="策略" hint="如 read,write,test">
        <TextInput value={policy()} onInput={setPolicy} placeholder="read,write,test" mono />
      </Field>
      <Field label="脚本内容" hint="计划任务执行的 RouterOS 命令">
        <textarea
          class="input font-mono text-[13px]"
          rows={6}
          value={onEvent()}
          onInput={(e) => setOnEvent(e.currentTarget.value)}
          placeholder="/system backup save name=auto"
          style={{ resize: "vertical" }}
        />
      </Field>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} />
      </Field>
      <Field label="">
        <Toggle checked={enabled()} onChange={setEnabled} label="启用" />
      </Field>
    </FormPanel>
  );
}
