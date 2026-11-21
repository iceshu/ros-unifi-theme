import { createSignal, Show } from "solid-js";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, TextInput } from "./form";

function validatePort(value: string): string {
  const n = Number(value.trim());
  if (!value.trim()) return "请输入端口号";
  if (!Number.isInteger(n) || n < 1 || n > 65535) return "端口号应在 1–65535 之间";
  return "";
}

function validateAddress(value: string): string {
  if (!value.trim()) return "";
  for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(part)) return `无效地址：${part}`;
  }
  return "";
}

export function SystemServiceForm(props: { service: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const [port, setPort] = createSignal(props.service.port ?? "");
  const [address, setAddress] = createSignal(props.service.address ?? "");
  const [certificate, setCertificate] = createSignal(props.service.certificate ?? "");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const hasSslCert = () => ["www-ssl", "api-ssl"].includes(props.service.name);

  const submit = async () => {
    const portErr = validatePort(port());
    const addrErr = validateAddress(address());
    if (portErr || addrErr) {
      setErrors({ port: portErr, address: addrErr });
      return false;
    }
    setErrors({});
    const fields: Record<string, string> = { port: port(), address: address() };
    if (hasSslCert()) fields.certificate = certificate();
    return runWrite(dash, "已保存", () => ros.update("/rest/ip/service", props.service[".id"], fields));
  };

  return (
    <FormPanel
      title={`编辑服务：${props.service.name}`}
      subtitle="/ip service"
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Field label="端口" required error={errors().port}>
        <TextInput value={port()} onInput={setPort} placeholder="80" mono />
      </Field>
      <Field label="允许访问地址" hint="留空允许所有地址；逗号分隔多个 CIDR" error={errors().address}>
        <TextInput value={address()} onInput={setAddress} placeholder="192.168.1.0/24" />
      </Field>
      <Show when={hasSslCert()}>
        <Field label="证书" hint="证书名称或 none">
          <TextInput value={certificate()} onInput={setCertificate} placeholder="none" />
        </Field>
      </Show>
    </FormPanel>
  );
}
