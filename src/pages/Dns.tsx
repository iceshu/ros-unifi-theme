import { Pencil, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { AddButton, ConfirmDialog, EnableSwitch, Field, FormPanel, RowMenu, SelectInput, TextInput, Toggle } from "../components/form";
import { Card, EmptyState, PageHeader, Pill } from "../components/ui";
import { ros, type RosFields } from "../lib/api";
import { flag, num, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { isIPv4, isIPv6, validateDnsServers, validateDuration, validateHostname } from "../lib/network";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

const STATIC = "/rest/ip/dns/static";

function Fact(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="min-w-0">
      <div class="kicker">{props.label}</div>
      <div class={`mt-1 truncate text-[13.5px] ${props.mono ? "font-mono" : ""}`}>{props.value}</div>
    </div>
  );
}

export function DnsPage() {
  const dash = useDashboard();
  const [editingResolver, setEditingResolver] = createSignal(false);
  const [record, setRecord] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);
  const dns = () => dash.dns();
  const cache = () => {
    const used = num(dns()?.["cache-used"]);
    const size = num(dns()?.["cache-size"]);
    return used != null && size ? `${used} / ${size} KiB（${Math.round((used / size) * 100)}%）` : "—";
  };

  return (
    <div>
      <PageHeader title="DNS" subtitle="路由器的 DNS 解析器与本地静态记录" />
      <Card
        title="解析器"
        class="mb-4"
        actions={
          <Show when={can("write") && dns()}>
            <button type="button" class="btn" onClick={() => setEditingResolver(true)}>
              <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
              编辑
            </button>
          </Show>
        }
      >
        <Show when={dns()} fallback={<div class="px-4 pb-4"><EmptyState title="没有 DNS 配置" compact /></div>}>
          <div class="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="上游服务器" value={dns()?.servers || "未设置"} mono />
            <Fact label="动态服务器（PPPoE / DHCP 下发）" value={dns()?.["dynamic-servers"] || "无"} mono />
            <Fact label="局域网设备可用本机解析" value={flag(dns()?.["allow-remote-requests"]) ? "是" : "否"} />
            <Fact label="缓存使用" value={cache()} />
          </div>
        </Show>
      </Card>

      <section class="card overflow-hidden">
        <div class="card-head">
          <h2 class="card-title">
            静态记录 <span class="ml-1 text-[12px] font-normal text-faint">{dash.dnsStatic().length} 条</span>
          </h2>
          <AddButton label="新建记录" onClick={() => setRecord("new")} />
        </div>
        <Show
          when={dash.dnsStatic().length > 0}
          fallback={<div class="p-4"><EmptyState title="没有静态记录" detail="静态记录可以让局域网设备用名字访问内网服务，例如 nas.home.arpa → 192.168.2.24。" compact /></div>}
        >
          <div class="table-wrap border-t border-line">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>指向</th>
                  <th>TTL</th>
                  <th>备注</th>
                  <th>启用</th>
                  <th class="w-10" />
                </tr>
              </thead>
              <tbody>
                <For each={dash.dnsStatic()} keyed={(row) => row[".id"]}>
                  {(row) => (
                    <tr class={flag(row().disabled) ? "is-dim" : ""}>
                      <td class="font-mono text-[12.5px]">{row().name || row().regexp || "—"}</td>
                      <td><Pill tone="accent">{row().type || "A"}</Pill></td>
                      <td class="font-mono text-[12.5px]">{row().address || row().cname || row()["forward-to"] || "—"}</td>
                      <td class="text-[12.5px] text-muted">{row().ttl || "默认"}</td>
                      <td class="text-[12.5px] text-muted">{row().comment || ""}</td>
                      <td><EnableSwitch menu={STATIC} row={row()} label={row().name || "记录"} /></td>
                      <td>
                        <Show when={can("write") && !flag(row().dynamic)}>
                          <RowMenu
                            items={[
                              { label: "编辑", icon: <Pencil aria-hidden="true" />, onSelect: () => setRecord(row()) },
                              { label: "删除", icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDeleting(row()) },
                            ]}
                          />
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      <Show when={editingResolver() && dns()}>
        <ResolverForm dns={dns()!} onClose={() => setEditingResolver(false)} />
      </Show>
      <Show when={record()} keyed>
        {(current) => <StaticRecordForm record={current === "new" ? undefined : current} onClose={() => setRecord(null)} />}
      </Show>
      <Show when={deleting()} keyed>
        {(row) => (
          <ConfirmDialog
            title="删除 DNS 记录？"
            message={`将删除 ${row.name} → ${row.address || row.cname || ""}。`}
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() => runWrite(dash, "已删除记录", () => ros.remove(STATIC, row[".id"]))}
          />
        )}
      </Show>
    </div>
  );
}

function ResolverForm(props: { dns: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const [servers, setServers] = createSignal(props.dns.servers ?? "");
  const [remote, setRemote] = createSignal(flag(props.dns["allow-remote-requests"]));
  const [error, setError] = createSignal("");
  return (
    <FormPanel
      title="编辑 DNS 解析器"
      subtitle="/ip dns"
      onClose={props.onClose}
      onSubmit={async () => {
        const problem = validateDnsServers(servers());
        setError(problem ?? "");
        if (problem) return false;
        const normalized = servers().split(",").map((part) => part.trim()).filter(Boolean).join(",");
        return runWrite(dash, "已更新 DNS 设置", () =>
          ros.command("/rest/ip/dns", "set", { servers: normalized, "allow-remote-requests": remote() ? "yes" : "no" }),
        );
      }}
    >
      <Field label="上游 DNS 服务器" hint="多个用逗号分隔，例如 223.5.5.5,119.29.29.29。留空则只用 PPPoE / DHCP 下发的服务器。" error={error()}>
        <TextInput value={servers()} onInput={setServers} mono placeholder="223.5.5.5,119.29.29.29" invalid={!!error()} />
      </Field>
      <label class="flex items-start gap-3 text-[13px]">
        <Toggle checked={remote()} onChange={setRemote} label="允许局域网设备使用本机解析" />
        <span>
          允许局域网设备使用本机解析
          <span class="block text-[11.5px] text-faint">开启后路由器作为局域网的 DNS 服务器。务必确保防火墙已阻止来自外网的 53 端口访问。</span>
        </span>
      </label>
    </FormPanel>
  );
}

function StaticRecordForm(props: { record?: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const original = props.record;
  const [name, setName] = createSignal(original?.name ?? "");
  const [type, setType] = createSignal<"A" | "AAAA" | "CNAME">((original?.type as "A" | "AAAA" | "CNAME") || "A");
  const [address, setAddress] = createSignal(original?.address ?? original?.cname ?? "");
  const [ttl, setTtl] = createSignal(original?.ttl ?? "");
  const [comment, setComment] = createSignal(original?.comment ?? "");
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const clientIps = () => dash.clients().map((client) => client.ip).filter(Boolean);

  const submit = async () => {
    const next: Record<string, string> = {};
    const nameError = validateHostname(name());
    if (nameError) next.name = nameError;
    if (type() === "A" && !isIPv4(address())) next.address = "请输入 IPv4 地址";
    if (type() === "AAAA" && !isIPv6(address())) next.address = "请输入 IPv6 地址";
    if (type() === "CNAME" && validateHostname(address())) next.address = "请输入目标域名";
    const ttlError = validateDuration(ttl());
    if (ttlError) next.ttl = ttlError;
    setErrors(next);
    if (Object.keys(next).length) return false;
    const fields: RosFields = { name: name().trim(), type: type(), comment: comment().trim(), ttl: ttl().trim() };
    if (type() === "CNAME") fields.cname = address().trim();
    else fields.address = address().trim();
    if (original) {
      // Switching type must clear the field the old type used.
      if (type() === "CNAME" && original.address) fields.address = "";
      if (type() !== "CNAME" && original.cname) fields.cname = "";
      if (!fields.ttl) delete fields.ttl;
      for (const key of Object.keys(fields)) if (fields[key] === (original[key] ?? "")) delete fields[key];
      if (Object.keys(fields).length === 0) return true;
      return runWrite(dash, "已保存记录", () => ros.update(STATIC, original[".id"], fields));
    }
    for (const key of ["comment", "ttl"]) if (!fields[key]) delete fields[key];
    return runWrite(dash, "已新建记录", () => ros.create(STATIC, fields));
  };

  return (
    <FormPanel title={original ? "编辑 DNS 记录" : "新建 DNS 记录"} subtitle="/ip dns static" onClose={props.onClose} onSubmit={submit}>
      <datalist id="dns-client-ips">
        <For each={clientIps()}>{(ip) => <option value={ip} />}</For>
      </datalist>
      <Field label="名称" required error={errors().name} hint="例如 nas.home.arpa">
        <TextInput value={name()} onInput={setName} mono invalid={!!errors().name} />
      </Field>
      <Field label="类型">
        <SelectInput
          value={type()}
          onChange={setType}
          options={[
            { value: "A", label: "A · IPv4 地址" },
            { value: "AAAA", label: "AAAA · IPv6 地址" },
            { value: "CNAME", label: "CNAME · 别名" },
          ]}
        />
      </Field>
      <Field label={type() === "CNAME" ? "指向的域名" : "地址"} required error={errors().address}>
        <TextInput value={address()} onInput={setAddress} mono list={type() === "A" ? "dns-client-ips" : undefined} invalid={!!errors().address} />
      </Field>
      <div class="form-row">
        <Field label="TTL" hint="留空用默认值（1d）" error={errors().ttl}>
          <TextInput value={ttl()} onInput={setTtl} placeholder="1d" invalid={!!errors().ttl} />
        </Field>
        <Field label="备注">
          <TextInput value={comment()} onInput={setComment} />
        </Field>
      </div>
    </FormPanel>
  );
}
