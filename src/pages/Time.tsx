import { createSignal, Show } from "solid-js";
import { ros } from "../lib/api";
import { Field, FormPanel, Suggestions, TextInput, Toggle } from "../components/form";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";

const IANA_ZONES = [
  "UTC",
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Tokyo", "Asia/Seoul",
  "Asia/Singapore", "Asia/Bangkok", "Asia/Jakarta", "Asia/Kolkata", "Asia/Dubai",
  "Asia/Karachi", "Asia/Dhaka", "Asia/Almaty", "Asia/Novosibirsk", "Asia/Irkutsk",
  "Asia/Vladivostok", "Asia/Yakutsk", "Asia/Magadan", "Asia/Kamchatka",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin",
  "Europe/Amsterdam", "Europe/Rome", "Europe/Madrid", "Europe/Stockholm",
  "Europe/Helsinki", "Europe/Athens", "Europe/Moscow", "Europe/Istanbul",
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "America/Honolulu", "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires", "America/Lima", "America/Bogota", "America/Mexico_City",
  "Pacific/Auckland", "Pacific/Fiji", "Australia/Sydney", "Australia/Melbourne",
  "Australia/Brisbane", "Australia/Perth",
];

function Fact(props: { label: string; value: string }) {
  return (
    <div class="flex gap-4 py-2 border-b border-line last:border-0">
      <span class="w-32 text-[13px] text-muted shrink-0">{props.label}</span>
      <span class="font-mono text-[13px]">{props.value || "—"}</span>
    </div>
  );
}

function ClockForm(props: { clock: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const [tz, setTz] = createSignal(props.clock["time-zone-name"] ?? "Asia/Shanghai");
  const [autodetect, setAutodetect] = createSignal(flag(props.clock["time-zone-autodetect"]));

  const submit = () =>
    runWrite(dash, "已保存时区设置", () =>
      ros.command("/rest/system/clock", "set", {
        "time-zone-name": tz(),
        "time-zone-autodetect": autodetect() ? "true" : "false",
      }),
    );

  return (
    <FormPanel title="设置时区" subtitle="/system clock" onClose={props.onClose} onSubmit={submit}>
      <Field label="时区" hint="输入或选择 IANA 时区名">
        <TextInput value={tz()} onInput={setTz} placeholder="Asia/Shanghai" list="tz-list" />
        <Suggestions id="tz-list" values={IANA_ZONES} />
      </Field>
      <Field label="">
        <Toggle checked={autodetect()} onChange={setAutodetect} label="自动检测时区" />
      </Field>
    </FormPanel>
  );
}

function NtpForm(props: { ntp: RosRecord; onClose: () => void }) {
  const dash = useDashboard();
  const hasServers = "servers" in props.ntp;
  const [enabled, setEnabled] = createSignal(flag(props.ntp.enabled));
  const [servers, setServers] = createSignal(props.ntp.servers ?? "");
  const [primary, setPrimary] = createSignal(props.ntp["primary-ntp"] ?? "");
  const [secondary, setSecondary] = createSignal(props.ntp["secondary-ntp"] ?? "");

  const submit = () => {
    const fields: Record<string, string> = { enabled: enabled() ? "true" : "false" };
    if (hasServers) {
      fields.servers = servers();
    } else {
      fields["primary-ntp"] = primary();
      fields["secondary-ntp"] = secondary();
    }
    return runWrite(dash, "已保存 NTP 设置", () => ros.command("/rest/system/ntp/client", "set", fields));
  };

  return (
    <FormPanel title="NTP 客户端设置" subtitle="/system ntp client" onClose={props.onClose} onSubmit={submit}>
      <Field label="">
        <Toggle checked={enabled()} onChange={setEnabled} label="启用 NTP 同步" />
      </Field>
      <Show when={hasServers}>
        <Field label="NTP 服务器" hint="逗号分隔多个服务器地址">
          <TextInput value={servers()} onInput={setServers} placeholder="ntp.aliyun.com,ntp.tencent.com" mono />
        </Field>
      </Show>
      <Show when={!hasServers}>
        <Field label="主 NTP 服务器">
          <TextInput value={primary()} onInput={setPrimary} placeholder="203.107.6.88" mono />
        </Field>
        <Field label="备 NTP 服务器">
          <TextInput value={secondary()} onInput={setSecondary} placeholder="120.25.115.20" mono />
        </Field>
      </Show>
    </FormPanel>
  );
}

export function TimePage() {
  const clockData = useRos("/rest/system/clock");
  const ntpData = useRos("/rest/system/ntp/client");
  const clock = () => clockData.rows()[0] as RosRecord | undefined;
  const ntp = () => ntpData.rows()[0] as RosRecord | undefined;
  const [editClock, setEditClock] = createSignal(false);
  const [editNtp, setEditNtp] = createSignal(false);

  return (
    <div>
      <PageHeader title="时间" subtitle="系统时钟与 NTP 同步" />

      <div class="grid gap-4 lg:grid-cols-2">
        <Card
          title="系统时钟"
          actions={
            <Show when={can("write")}>
              <button type="button" class="btn btn-ghost text-[13px]" onClick={() => setEditClock(true)}>
                设置时区
              </button>
            </Show>
          }
        >
          <Show when={clock()} fallback={<EmptyState title={clockData.loaded() ? "无数据" : "正在读取"} compact />}>
            {(c) => (
              <div class="px-4 py-2">
                <Fact label="日期" value={c().date} />
                <Fact label="时间" value={c().time} />
                <Fact label="时区" value={c()["time-zone-name"]} />
                <Fact label="自动检测时区" value={flag(c()["time-zone-autodetect"]) ? "已启用" : "已禁用"} />
              </div>
            )}
          </Show>
        </Card>

        <Card
          title="NTP 客户端"
          actions={
            <Show when={can("write")}>
              <button type="button" class="btn btn-ghost text-[13px]" onClick={() => setEditNtp(true)}>
                编辑
              </button>
            </Show>
          }
        >
          <Show when={ntp()} fallback={<EmptyState title={ntpData.loaded() ? "无数据" : "正在读取"} compact />}>
            {(n) => (
              <div class="px-4 py-2">
                <Fact label="状态" value={flag(n().enabled) ? "已启用" : "已禁用"} />
                <Show when={n().servers}>
                  <Fact label="服务器" value={n().servers} />
                </Show>
                <Show when={n()["primary-ntp"]}>
                  <Fact label="主 NTP" value={n()["primary-ntp"]} />
                </Show>
                <Show when={n()["secondary-ntp"]}>
                  <Fact label="备 NTP" value={n()["secondary-ntp"]} />
                </Show>
                <Show when={n()["last-update-from"]}>
                  <Fact label="最后同步来源" value={n()["last-update-from"]} />
                </Show>
                <Show when={n()["last-update-before"]}>
                  <Fact label="上次同步" value={`${n()["last-update-before"]} 前`} />
                </Show>
                <Show when={n()["last-adjustment"]}>
                  <Fact label="最后调整" value={n()["last-adjustment"]} />
                </Show>
              </div>
            )}
          </Show>
        </Card>
      </div>

      <Show when={editClock() && clock()}>
        <ClockForm clock={clock()!} onClose={() => setEditClock(false)} />
      </Show>

      <Show when={editNtp() && ntp()}>
        <NtpForm ntp={ntp()!} onClose={() => setEditNtp(false)} />
      </Show>
    </div>
  );
}
