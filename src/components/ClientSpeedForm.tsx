import { createMemo, createSignal } from "solid-js";
import { ros } from "../lib/api";
import { formatRosRate, parseRosRate } from "../lib/clients";
import { runWrites } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, TextInput } from "./form";

export function ClientSpeedForm(props: {
  ip: string;
  defaultName: string;
  onClose: () => void;
}) {
  const dash = useDashboard();

  const existing = createMemo(() => dash.queues().find((q) => q.target === `${props.ip}/32`));

  // Read existing values once at construction time for form initialization
  const initQ = existing();
  const initRate = parseRosRate(initQ?.["max-limit"]);

  const [name, setName] = createSignal(initQ?.name || props.defaultName);
  const [uploadMbps, setUploadMbps] = createSignal(initRate.upload ? String(initRate.upload) : "");
  const [downloadMbps, setDownloadMbps] = createSignal(initRate.download ? String(initRate.download) : "");

  const uploadError = createMemo(() => {
    const v = uploadMbps().trim();
    if (!v) return "";
    const n = Number(v);
    if (isNaN(n) || n < 0) return "请输入非负数";
    return "";
  });

  const downloadError = createMemo(() => {
    const v = downloadMbps().trim();
    if (!v) return "";
    const n = Number(v);
    if (isNaN(n) || n < 0) return "请输入非负数";
    return "";
  });

  const submit = async () => {
    if (uploadError() || downloadError()) return false;
    const up = uploadMbps().trim() ? Number(uploadMbps()) : 0;
    const down = downloadMbps().trim() ? Number(downloadMbps()) : 0;
    const maxLimit = formatRosRate(up, down);
    const queueName = name().trim() || props.defaultName;

    const q = existing();
    if (!up && !down) {
      if (q) return runWrites(dash, "已移除限速", [() => ros.remove("/rest/queue/simple", q[".id"])]);
      return true;
    }
    if (q) {
      return runWrites(dash, "已保存限速", [() => ros.update("/rest/queue/simple", q[".id"], { name: queueName, "max-limit": maxLimit })]);
    }
    return runWrites(dash, "已保存限速", [
      () => ros.create("/rest/queue/simple", { name: queueName, target: `${props.ip}/32`, "max-limit": maxLimit }),
    ]);
  };

  return (
    <FormPanel title={existing() ? "编辑限速" : "限速"} subtitle={`针对 ${props.ip} 的简单队列`} onClose={props.onClose} onSubmit={submit}>
      <Field label="队列名称">
        <TextInput value={name()} onInput={setName} placeholder={props.defaultName} />
      </Field>
      <div class="form-row">
        <Field label="上传上限 (Mbps)" hint="空=不限" error={uploadError()}>
          <TextInput value={uploadMbps()} onInput={setUploadMbps} placeholder="不限" invalid={!!uploadError()} />
        </Field>
        <Field label="下载上限 (Mbps)" hint="空=不限" error={downloadError()}>
          <TextInput value={downloadMbps()} onInput={setDownloadMbps} placeholder="不限" invalid={!!downloadError()} />
        </Field>
      </div>
    </FormPanel>
  );
}
