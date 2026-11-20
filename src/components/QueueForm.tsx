import { createMemo, createSignal, Show } from "solid-js";
import { ros } from "../lib/api";
import { formatRosRate, parseRosRate, validateIPv4 } from "../lib/clients";
import { runWrites } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { ConfirmDialog, Field, FormPanel, Suggestions, TextInput } from "./form";
import type { RosRecord } from "../lib/model";

export function QueueForm(props: {
  queue?: RosRecord;
  onClose: () => void;
}) {
  const dash = useDashboard();
  const isEdit = !!props.queue;

  const initRate = isEdit ? parseRosRate(props.queue!["max-limit"]) : { upload: 0, download: 0 };

  const [name, setName] = createSignal(props.queue?.name ?? "");
  const [target, setTarget] = createSignal(props.queue?.target ?? "");
  const [uploadMbps, setUploadMbps] = createSignal(initRate.upload ? String(initRate.upload) : "");
  const [downloadMbps, setDownloadMbps] = createSignal(initRate.download ? String(initRate.download) : "");
  const [showDelete, setShowDelete] = createSignal(false);

  const nameError = createMemo(() => (!name().trim() ? "请输入队列名称" : ""));

  const targetError = createMemo(() => {
    const v = target().trim();
    if (!v) return "请输入目标 IP 或 CIDR";
    const bare = v.endsWith("/32") ? v.slice(0, -3) : v.includes("/") ? "" : v;
    if (bare && !validateIPv4(bare)) return "目标格式不正确（如 192.168.1.10 或 192.168.1.10/32）";
    return "";
  });

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

  const clientSuggestions = createMemo(() =>
    dash.clients().filter((c) => c.ip).map((c) => `${c.ip}/32`),
  );

  const submit = async () => {
    if (nameError() || targetError() || uploadError() || downloadError()) return false;
    const up = uploadMbps().trim() ? Number(uploadMbps()) : 0;
    const down = downloadMbps().trim() ? Number(downloadMbps()) : 0;
    const fields: Record<string, string> = {
      name: name().trim(),
      target: target().trim(),
      "max-limit": formatRosRate(up, down),
    };
    if (isEdit) {
      return runWrites(dash, "已保存限速", [() => ros.update("/rest/queue/simple", props.queue![".id"], fields)]);
    }
    return runWrites(dash, "已创建限速", [() => ros.create("/rest/queue/simple", fields)]);
  };

  const doDelete = async () => {
    if (!props.queue) return false;
    return runWrites(dash, "已删除", [() => ros.remove("/rest/queue/simple", props.queue![".id"])]);
  };

  return (
    <>
      <FormPanel
        title={isEdit ? "编辑限速" : "新建限速"}
        subtitle="简单队列（Simple Queue）"
        onClose={props.onClose}
        onSubmit={submit}
        footer={
          <Show when={isEdit}>
            <button type="button" class="btn btn-danger" onClick={() => setShowDelete(true)}>
              删除
            </button>
          </Show>
        }
      >
        <Field label="队列名称" required error={nameError()}>
          <TextInput value={name()} onInput={setName} placeholder="限速-192.168.1.100" invalid={!!nameError()} />
        </Field>
        <Field label="目标" required error={targetError()} hint="IP 地址或 CIDR，如 192.168.1.10/32">
          <Suggestions id="queue-target-sugg" values={clientSuggestions()} />
          <TextInput value={target()} onInput={setTarget} mono placeholder="192.168.1.10/32" invalid={!!targetError()} list="queue-target-sugg" />
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
      <Show when={showDelete()}>
        <ConfirmDialog
          title="删除限速"
          message={<p>将删除队列 <strong>{props.queue?.name}</strong>，恢复该目标的无限速访问。</p>}
          confirmLabel="确认删除"
          danger
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            const ok = await doDelete();
            if (ok) props.onClose();
            return ok;
          }}
        />
      </Show>
    </>
  );
}
