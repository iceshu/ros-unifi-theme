import { Plus, Trash2, Send } from "@lucide/solid";
import { createSignal, For, onSettled, Show } from "solid-js";
import { api, toApiError } from "../lib/api";
import {
  ALL_KINDS,
  CHANNEL_TYPE_LABELS,
  DEFAULT_RULES,
  KIND_LABELS,
  SEV_LABELS,
  type AlertChannel,
  type AlertRules,
  type AlertSettingsResponse,
  type ChannelType,
  type Severity,
} from "../lib/events";
import { can } from "../lib/session";
import { showToast } from "../lib/toast";
import { FormPanel, Field, TextInput, SecretInput, SelectInput, Toggle } from "../components/form";
import { EmptyState, PageHeader, Segmented } from "../components/ui";

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = (
  Object.entries(CHANNEL_TYPE_LABELS) as [ChannelType, string][]
).map(([value, label]) => ({ value, label }));

const SEV_OPTIONS = ([
  { value: "info" as Severity, label: SEV_LABELS.info },
  { value: "warn" as Severity, label: SEV_LABELS.warn },
  { value: "critical" as Severity, label: SEV_LABELS.critical },
]);

function emptyChannel(): AlertChannel {
  return { type: "webhook", name: "", enabled: true, minSeverity: "info", kinds: [] };
}

export function SettingsPage() {
  const [tab, setTab] = createSignal<"channels" | "rules">("channels");
  const [channels, setChannels] = createSignal<AlertChannel[]>([]);
  const [rules, setRules] = createSignal<AlertRules>({ ...DEFAULT_RULES });
  const [loading, setLoading] = createSignal(true);
  const [editing, setEditing] = createSignal<{ ch: AlertChannel; index: number } | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);

  onSettled(() => {
    void (async () => {
      try {
        const res = (await api.get("/api/alerts/settings")) as AlertSettingsResponse;
        setChannels(res.channels);
        setRules({ ...DEFAULT_RULES, ...res.rules });
      } catch (e) {
        showToast("加载设置失败", "err");
      } finally {
        setLoading(false);
      }
    })();
    return undefined;
  });

  async function saveAll(chs: AlertChannel[], rs: AlertRules): Promise<boolean> {
    setSaving(true);
    try {
      await api.put("/api/alerts/settings", { channels: chs, rules: rs });
      return true;
    } catch (e) {
      showToast(toApiError(e).message, "err");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openNew() {
    setEditing({ ch: emptyChannel(), index: -1 });
  }

  function openEdit(ch: AlertChannel, index: number) {
    setEditing({ ch: { ...ch }, index });
  }

  async function deleteChannel(index: number) {
    const updated = channels().filter((_, i) => i !== index);
    setChannels(updated);
    await saveAll(updated, rules());
  }

  async function testChannel(index: number) {
    if (testing()) return;
    setTesting(true);
    try {
      await api.post("/api/alerts/test", { channelIndex: index });
      showToast("测试消息已发送", "ok");
    } catch (e) {
      showToast(toApiError(e).message, "err");
    } finally {
      setTesting(false);
    }
  }

  async function submitChannel(ch: AlertChannel, index: number): Promise<boolean> {
    const updated = [...channels()];
    if (index < 0) updated.push(ch);
    else updated[index] = ch;
    setChannels(updated);
    const ok = await saveAll(updated, rules());
    if (ok) showToast("通知渠道已保存", "ok");
    return ok;
  }

  async function saveRules(): Promise<boolean> {
    const ok = await saveAll(channels(), rules());
    if (ok) showToast("告警规则已保存", "ok");
    return ok;
  }

  return (
    <div>
      <PageHeader title="仪表设置" />

      <div class="mb-4">
        <Segmented
          value={tab()}
          options={[
            { value: "channels", label: "通知渠道" },
            { value: "rules", label: "告警规则" },
          ]}
          onChange={setTab}
          label="设置分类"
        />
      </div>

      <Show when={tab() === "channels"}>
        <ChannelsTab
          channels={channels()}
          loading={loading()}
          onNew={openNew}
          onEdit={openEdit}
          onDelete={deleteChannel}
          onTest={testChannel}
          testing={testing()}
        />
      </Show>

      <Show when={tab() === "rules"}>
        <RulesTab rules={rules()} setRules={setRules} onSave={saveRules} saving={saving()} />
      </Show>

      <Show when={editing() !== null}>
        <ChannelFormPanel
          ch={editing()!.ch}
          index={editing()!.index}
          onClose={() => setEditing(null)}
          onSubmit={(ch) => submitChannel(ch, editing()!.index)}
          onTest={(index) => testChannel(index)}
          savedCount={channels().length}
        />
      </Show>
    </div>
  );
}

function ChannelsTab(props: {
  channels: AlertChannel[];
  loading: boolean;
  onNew: () => void;
  onEdit: (ch: AlertChannel, index: number) => void;
  onDelete: (index: number) => void;
  onTest: (index: number) => void;
  testing: boolean;
}) {
  return (
    <div>
      <div class="mb-3 flex items-center justify-between">
        <p class="text-sm text-muted">配置告警消息的推送渠道，支持飞书、钉钉、企业微信等。</p>
        <Show when={can("write")}>
          <button type="button" class="btn btn-primary flex items-center gap-1.5 text-sm" onClick={props.onNew}>
            <Plus class="h-4 w-4" />
            新建渠道
          </button>
        </Show>
      </div>

      <Show when={props.loading}>
        <div class="text-sm text-muted">加载中…</div>
      </Show>

      <Show when={!props.loading && props.channels.length === 0}>
        <EmptyState title="暂无通知渠道" detail="添加飞书、钉钉、Telegram 等推送渠道，当告警触发时自动通知。" />
      </Show>

      <Show when={!props.loading && props.channels.length > 0}>
        <div class="card divide-y divide-line overflow-hidden">
          <For each={props.channels}>
            {(ch, idx) => (
              <div class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{ch.name || "(未命名)"}</span>
                    <span class="pill pill-muted">{CHANNEL_TYPE_LABELS[ch.type] ?? ch.type}</span>
                    <Show when={!ch.enabled}>
                      <span class="pill pill-muted">已禁用</span>
                    </Show>
                    <Show when={ch._lastSend}>
                      {(st) => (
                        <span class={`pill ${st().ok ? "pill-good" : "pill-bad"}`}>
                          {st().ok ? "发送成功" : "发送失败"}
                        </span>
                      )}
                    </Show>
                  </div>
                  <p class="mt-0.5 text-[12px] text-faint">
                    {ch.minSeverity ? `最低: ${SEV_LABELS[ch.minSeverity as Severity]}` : "全部级别"}
                    {ch.kinds?.length ? `  · ${ch.kinds.map((k) => KIND_LABELS[k] ?? k).join("、")}` : "  · 全部类型"}
                  </p>
                </div>
                <Show when={can("write")}>
                  <button
                    type="button"
                    class="btn btn-ghost text-sm"
                    disabled={props.testing}
                    onClick={() => props.onTest(idx())}
                    title="发送测试消息"
                  >
                    <Send class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost text-sm"
                    onClick={() => props.onEdit(ch, idx())}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost text-sm text-bad"
                    onClick={() => props.onDelete(idx())}
                    title="删除渠道"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ChannelFormPanel(props: {
  ch: AlertChannel;
  index: number;
  savedCount: number;
  onClose: () => void;
  onSubmit: (ch: AlertChannel) => Promise<boolean>;
  onTest: (index: number) => void;
}) {
  const [form, setForm] = createSignal<AlertChannel>({ ...props.ch });
  const up = (patch: Partial<AlertChannel>) => setForm((f) => ({ ...f, ...patch }));

  const toggleKind = (k: string) => {
    const ks = form().kinds ?? [];
    if (ks.includes(k)) up({ kinds: ks.filter((x) => x !== k) });
    else up({ kinds: [...ks, k] });
  };

  const isNew = () => props.index < 0;

  return (
    <FormPanel
      title={isNew() ? "新建通知渠道" : "编辑通知渠道"}
      submitLabel="保存"
      onClose={props.onClose}
      onSubmit={() => props.onSubmit(form())}
      footer={
        <Show when={!isNew() && can("write")}>
          <button
            type="button"
            class="btn btn-ghost text-sm"
            onClick={() => props.onTest(props.index)}
          >
            <Send class="mr-1.5 h-4 w-4" />
            发送测试
          </button>
        </Show>
      }
    >
      <Field label="渠道类型" required>
        <SelectInput
          value={form().type}
          onChange={(v) => up({ type: v as ChannelType })}
          options={CHANNEL_TYPES}
        />
      </Field>
      <Field label="渠道名称" required>
        <TextInput value={form().name} onInput={(v) => up({ name: v })} placeholder="例：运维飞书群" />
      </Field>
      <Field label="启用">
        <Toggle checked={form().enabled} onChange={(v) => up({ enabled: v })} label="启用此渠道" />
      </Field>
      <Field label="最低告警级别">
        <SelectInput
          value={form().minSeverity ?? "info"}
          onChange={(v) => up({ minSeverity: v as Severity })}
          options={SEV_OPTIONS}
        />
      </Field>

      {/* Type-specific fields */}
      <Show when={form().type === "feishu" || form().type === "dingtalk" || form().type === "wecom" || form().type === "webhook"}>
        <Field label="Webhook URL" required>
          <TextInput value={form().webhook ?? ""} onInput={(v) => up({ webhook: v })} placeholder="https://" mono />
        </Field>
      </Show>
      <Show when={form().type === "feishu" || form().type === "dingtalk"}>
        <Field label="签名密钥 (可选)" hint="留空=不签名；已保存的密钥显示为 ••••xxxx，空白提交保留原值">
          <SecretInput value={form().signSecret ?? ""} onInput={(v) => up({ signSecret: v })} placeholder="密钥" />
        </Field>
      </Show>
      <Show when={form().type === "telegram"}>
        <Field label="Bot Token" required>
          <SecretInput value={form().botToken ?? ""} onInput={(v) => up({ botToken: v })} placeholder="123456789:ABC…" />
        </Field>
        <Field label="Chat ID" required>
          <TextInput value={form().chatId ?? ""} onInput={(v) => up({ chatId: v })} placeholder="-100123456789" mono />
        </Field>
      </Show>
      <Show when={form().type === "bark"}>
        <Field label="服务器地址" required>
          <TextInput value={form().serverUrl ?? ""} onInput={(v) => up({ serverUrl: v })} placeholder="https://api.day.app" mono />
        </Field>
        <Field label="设备 Key" required>
          <SecretInput value={form().key ?? ""} onInput={(v) => up({ key: v })} placeholder="YourDeviceKey" />
        </Field>
      </Show>
      <Show when={form().type === "ntfy"}>
        <Field label="Topic URL" required>
          <TextInput value={form().topicUrl ?? ""} onInput={(v) => up({ topicUrl: v })} placeholder="https://ntfy.sh/my-topic" mono />
        </Field>
      </Show>

      {/* Event kind filter */}
      <Field label="事件类型过滤" hint="不选表示接收全部类型">
        <div class="flex flex-wrap gap-2 pt-1">
          <For each={ALL_KINDS}>
            {(k) => (
              <button
                type="button"
                class={`pill cursor-pointer ${(form().kinds ?? []).includes(k) ? "pill-accent" : "pill-muted"}`}
                onClick={() => toggleKind(k)}
              >
                {KIND_LABELS[k] ?? k}
              </button>
            )}
          </For>
        </div>
      </Field>
    </FormPanel>
  );
}

function RulesTab(props: {
  rules: AlertRules;
  setRules: (r: AlertRules) => void;
  onSave: () => Promise<boolean>;
  saving: boolean;
}) {
  const up = (patch: Partial<AlertRules>) => props.setRules({ ...props.rules, ...patch });

  return (
    <div class="space-y-4">
      <div class="card p-5">
        <h2 class="card-title mb-4">WAN 与接口</h2>
        <div class="space-y-3">
          <div class="form-row items-center">
            <label class="text-sm">监控 WAN 断线</label>
            <Toggle checked={props.rules.enableWan} onChange={(v) => up({ enableWan: v })} />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">WAN 接口名称（逗号分隔）</label>
            <TextInput
              value={props.rules.wanInterfaces.join(", ")}
              onInput={(v) => up({ wanInterfaces: v.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="liantong, ether0"
            />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">监控接口状态变化</label>
            <Toggle checked={props.rules.enableIface} onChange={(v) => up({ enableIface: v })} />
          </div>
          <div class="form-row items-start">
            <label class="text-sm">额外监控接口（逗号分隔，空=自动）</label>
            <TextInput
              value={props.rules.monitorInterfaces.join(", ")}
              onInput={(v) => up({ monitorInterfaces: v.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="留空 = WAN + 有备注的 ether"
            />
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title mb-4">WireGuard</h2>
        <div class="space-y-3">
          <div class="form-row items-center">
            <label class="text-sm">监控对端握手超时</label>
            <Toggle checked={props.rules.enableWg} onChange={(v) => up({ enableWg: v })} />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">握手超时（分钟）</label>
            <TextInput
              type="text"
              value={String(props.rules.wgStaleMins)}
              onInput={(v) => { const n = Number(v); if (n > 0) up({ wgStaleMins: n }); }}
            />
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title mb-4">系统资源</h2>
        <div class="space-y-3">
          <div class="form-row items-center">
            <label class="text-sm">监控 CPU 过高</label>
            <Toggle checked={props.rules.enableCpu} onChange={(v) => up({ enableCpu: v })} />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">CPU 阈值（%）</label>
            <TextInput
              type="text"
              value={String(props.rules.cpuPercent)}
              onInput={(v) => { const n = Number(v); if (n > 0 && n <= 100) up({ cpuPercent: n }); }}
            />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">CPU 持续时间（分钟）</label>
            <TextInput
              type="text"
              value={String(props.rules.cpuDurationMins)}
              onInput={(v) => { const n = Number(v); if (n > 0) up({ cpuDurationMins: n }); }}
            />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">监控内存过高</label>
            <Toggle checked={props.rules.enableMem} onChange={(v) => up({ enableMem: v })} />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">内存阈值（%）</label>
            <TextInput
              type="text"
              value={String(props.rules.memPercent)}
              onInput={(v) => { const n = Number(v); if (n > 0 && n <= 100) up({ memPercent: n }); }}
            />
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title mb-4">其他</h2>
        <div class="space-y-3">
          <div class="form-row items-center">
            <label class="text-sm">监控新设备上线</label>
            <Toggle checked={props.rules.enableNewDevice} onChange={(v) => up({ enableNewDevice: v })} />
          </div>
          <div class="form-row items-center">
            <label class="text-sm">监控 RouterOS 更新</label>
            <Toggle checked={props.rules.enableUpdate} onChange={(v) => up({ enableUpdate: v })} />
          </div>
        </div>
      </div>

      <Show when={can("write")}>
        <div class="flex justify-end">
          <button
            type="button"
            class="btn btn-primary text-sm"
            disabled={props.saving}
            onClick={props.onSave}
          >
            {props.saving ? "保存中…" : "保存规则"}
          </button>
        </div>
      </Show>
    </div>
  );
}
