import { createSignal, For } from "solid-js";
import { ros } from "../lib/api";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, TextInput } from "./form";

const ALL_POLICIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "local", label: "local（本地终端）" },
  { id: "telnet", label: "telnet" },
  { id: "ssh", label: "ssh" },
  { id: "ftp", label: "ftp" },
  { id: "reboot", label: "reboot（重启）" },
  { id: "read", label: "read（读取）" },
  { id: "write", label: "write（配置写入）" },
  { id: "policy", label: "policy（用户管理）" },
  { id: "test", label: "test（测试工具）" },
  { id: "winbox", label: "winbox" },
  { id: "password", label: "password（改密）" },
  { id: "web", label: "web" },
  { id: "sniff", label: "sniff（抓包）" },
  { id: "sensitive", label: "sensitive（敏感信息）" },
  { id: "api", label: "api" },
  { id: "romon", label: "romon" },
  { id: "rest-api", label: "rest-api" },
];

function parsePolicies(policy: string): Set<string> {
  const enabled = new Set<string>();
  for (const part of policy.split(",")) {
    const p = part.trim();
    if (p && !p.startsWith("!")) enabled.add(p);
  }
  return enabled;
}

function buildPolicies(enabled: Set<string>): string {
  return ALL_POLICIES.map(({ id }) => (enabled.has(id) ? id : `!${id}`)).join(",");
}

export function AdminGroupForm(props: { group?: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const initial = parsePolicies(props.group?.policy ?? "");
  const [name, setName] = createSignal(props.group?.name ?? "");
  const [comment, setComment] = createSignal(props.group?.comment ?? "");
  const [enabled, setEnabled] = createSignal<Set<string>>(initial);
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!name().trim()) errs.name = "请填写组名";
    setErrors(errs);
    if (Object.keys(errs).length) return false;

    const policy = buildPolicies(enabled());

    if (props.group) {
      const fields: Record<string, string> = {};
      if (name().trim() !== props.group.name) fields.name = name().trim();
      if (comment() !== props.group.comment) fields.comment = comment();
      if (policy !== props.group.policy) fields.policy = policy;
      if (!Object.keys(fields).length) return true;
      return runWrite(dash, "已保存用户组", () => ros.update("/rest/user/group", props.group![".id"], fields));
    }

    return runWrite(dash, "已新建用户组", () =>
      ros.create("/rest/user/group", { name: name().trim(), comment: comment().trim(), policy }),
    );
  };

  return (
    <FormPanel
      title={props.group ? "编辑用户组" : "新建用户组"}
      submitLabel={props.group ? "保存" : "新建"}
      onClose={props.onClose}
      onSubmit={submit}
    >
      <Field label="组名" required error={errors().name}>
        <TextInput value={name()} onInput={setName} invalid={!!errors().name} />
      </Field>
      <Field label="备注">
        <TextInput value={comment()} onInput={setComment} />
      </Field>
      <Field label="权限策略" hint="选中的策略将授予该组的所有用户">
        <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          <For each={ALL_POLICIES}>
            {(p) => (
              <label class="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 accent-[var(--color-accent)]"
                  checked={enabled().has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span class="font-mono text-[12px]">{p.label}</span>
              </label>
            )}
          </For>
        </div>
      </Field>
    </FormPanel>
  );
}
