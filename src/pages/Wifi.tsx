import { Pencil, Wifi } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { EnableSwitch, Field, FormPanel, SecretInput, TextInput } from "../components/form";
import { EmptyState, PageHeader, Pill } from "../components/ui";
import { ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrites } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { sameMac } from "../lib/topology";

/** One radio, normalized across the `wifi` (RouterOS 7.13+) and legacy `wireless` packages. */
interface Radio {
  kind: "wifi" | "wireless";
  row: RosRecord;
  ssid: string;
  security: string;
  /** Named profile records the SSID / password live in, when the radio references them. */
  config?: RosRecord;
  secProfile?: RosRecord;
  sharedWith: number;
  clients: number;
}

export function WifiPage() {
  const dash = useDashboard();
  const [editing, setEditing] = createSignal<Radio | null>(null);
  const radios = createMemo<Radio[]>(() => {
    const registrations = [...dash.wifiRegistration(), ...dash.wirelessRegistration()];
    const count = (name: string) => registrations.filter((row) => row.interface === name).length;
    const modern = dash.wifi().map((row): Radio => {
      // An inline "configuration.ssid" overrides the named profile, so edit where the effective value lives.
      const profile = row.configuration ? dash.wifiConfig().find((item) => item.name === row.configuration) : undefined;
      const config = row["configuration.ssid"] ? undefined : profile;
      const profileSsid = profile?.ssid;
      const securityName = row.security || profile?.security;
      const secProfile = securityName ? dash.wifiSecurity().find((item) => item.name === securityName) : undefined;
      const sharedWith = config
        ? dash.wifi().filter((item) => item.configuration === config.name).length
        : secProfile
          ? dash.wifi().filter((item) => item.security === secProfile.name).length
          : 1;
      return {
        kind: "wifi",
        row,
        ssid: row["configuration.ssid"] || profileSsid || "",
        security: row["security.authentication-types"] || secProfile?.["authentication-types"] || "",
        config,
        secProfile,
        sharedWith,
        clients: count(row.name),
      };
    });
    const legacy = dash.wireless().map((row): Radio => {
      const secProfile = dash.wirelessSecurity().find((item) => item.name === row["security-profile"]);
      return {
        kind: "wireless",
        row,
        ssid: row.ssid || "",
        security: secProfile?.["authentication-types"] || (secProfile?.mode === "none" ? "开放" : ""),
        secProfile,
        sharedWith: dash.wireless().filter((item) => item["security-profile"] === row["security-profile"]).length,
        clients: count(row.name),
      };
    });
    return [...modern, ...legacy];
  });
  const stations = createMemo(() =>
    [...dash.wifiRegistration(), ...dash.wirelessRegistration()].map((row) => ({
      row,
      client: dash.clients().find((client) => sameMac(client.mac, row["mac-address"])),
    })),
  );

  return (
    <div>
      <PageHeader title="WiFi" subtitle="无线网络、密码与已连接的设备" />
      <Show
        when={radios().length > 0}
        fallback={<EmptyState title={dash.ready() ? "这台路由器没有无线接口" : "正在读取"} detail="没有安装 wifi 或 wireless 包，或这个账号看不到无线菜单。" />}
      >
        <div class="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <For each={radios()}>
            {(radio) => (
              <section class={`card p-4 ${flag(radio.row.disabled) ? "opacity-60" : ""}`}>
                <div class="flex items-start gap-3">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Wifi class="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[16px] font-semibold">{radio.ssid || "未设置 SSID"}</div>
                    <div class="truncate text-[12.5px] text-muted">
                      {radio.row.name}
                      {radio.row.comment ? ` · ${radio.row.comment}` : ""}
                      {radio.row.band ? ` · ${radio.row.band}` : ""}
                    </div>
                  </div>
                  <EnableSwitch menu={radio.kind === "wifi" ? "/rest/interface/wifi" : "/rest/interface/wireless"} row={radio.row} label={radio.ssid || radio.row.name} />
                </div>
                <div class="mt-4 grid grid-cols-3 gap-2 text-[12.5px]">
                  <div>
                    <div class="kicker">状态</div>
                    <div class="mt-1">
                      <Pill tone={flag(radio.row.disabled) ? "muted" : flag(radio.row.running) ? "good" : "warn"}>
                        {flag(radio.row.disabled) ? "已禁用" : flag(radio.row.running) ? "运行中" : "未运行"}
                      </Pill>
                    </div>
                  </div>
                  <div>
                    <div class="kicker">加密</div>
                    <div class="mt-1 truncate">{radio.security || "—"}</div>
                  </div>
                  <div>
                    <div class="kicker">已连接</div>
                    <div class="mt-1 num">{radio.clients} 台</div>
                  </div>
                </div>
                <Show when={can("write")}>
                  <button type="button" class="btn mt-4 w-full" onClick={() => setEditing(radio)}>
                    <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
                    修改名称和密码
                  </button>
                </Show>
              </section>
            )}
          </For>
        </div>
      </Show>

      <section class="card overflow-hidden">
        <div class="card-head">
          <h2 class="card-title">
            已连接设备 <span class="ml-1 text-[12px] font-normal text-faint">{stations().length} 台</span>
          </h2>
        </div>
        <Show when={stations().length > 0} fallback={<div class="p-4"><EmptyState title="没有已连接的无线设备" compact /></div>}>
          <div class="table-wrap border-t border-line">
            <table class="data-table">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>接口</th>
                  <th>信号</th>
                  <th>发送 / 接收速率</th>
                  <th>在线时长</th>
                </tr>
              </thead>
              <tbody>
                <For each={stations()}>
                  {(station) => (
                    <tr
                      class="is-clickable"
                      onClick={() => dash.setSelection({ type: "client", ip: station.client?.ip ?? "", mac: station.row["mac-address"] })}
                    >
                      <td>
                        <div class="font-medium">{station.client?.title || station.row["mac-address"]}</div>
                        <div class="font-mono text-[11.5px] text-faint">{station.client?.ip || station.row["mac-address"]}</div>
                      </td>
                      <td class="text-[12.5px]">{station.row.interface}</td>
                      <td class="text-[12.5px] num">{station.row["signal-strength"] || station.row.signal || "—"}</td>
                      <td class="text-[12.5px] num">
                        {station.row["tx-rate"] || "—"} / {station.row["rx-rate"] || "—"}
                      </td>
                      <td class="text-[12.5px] text-muted">{station.row.uptime || "—"}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      <Show when={editing()} keyed>
        {(radio) => <WifiForm radio={radio} onClose={() => setEditing(null)} />}
      </Show>
    </div>
  );
}

function WifiForm(props: { radio: Radio; onClose: () => void }) {
  const dash = useDashboard();
  const radio = props.radio;
  const [ssid, setSsid] = createSignal(radio.ssid);
  const [password, setPassword] = createSignal("");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!ssid().trim()) next.ssid = "请输入网络名称";
    else if (new TextEncoder().encode(ssid().trim()).length > 32) next.ssid = "SSID 最长 32 字节（约 10 个汉字）";
    if (password() && (password().length < 8 || password().length > 63)) next.password = "密码需 8–63 个字符";
    setErrors(next);
    if (Object.keys(next).length) return false;

    const ops: Array<() => Promise<unknown>> = [];
    const newSsid = ssid().trim();
    if (radio.kind === "wifi") {
      if (newSsid !== radio.ssid) {
        ops.push(
          radio.config
            ? () => ros.update("/rest/interface/wifi/configuration", radio.config![".id"], { ssid: newSsid })
            : () => ros.update("/rest/interface/wifi", radio.row[".id"], { "configuration.ssid": newSsid }),
        );
      }
      if (password()) {
        ops.push(
          radio.secProfile
            ? () => ros.update("/rest/interface/wifi/security", radio.secProfile![".id"], { passphrase: password() })
            : () => ros.update("/rest/interface/wifi", radio.row[".id"], { "security.passphrase": password() }),
        );
      }
    } else {
      if (newSsid !== radio.ssid) ops.push(() => ros.update("/rest/interface/wireless", radio.row[".id"], { ssid: newSsid }));
      if (password()) {
        if (!radio.secProfile) {
          setErrors({ password: "这个无线接口没有安全配置，无法设置密码" });
          return false;
        }
        ops.push(() => ros.update("/rest/interface/wireless/security-profiles", radio.secProfile![".id"], { "wpa2-pre-shared-key": password() }));
      }
    }
    if (ops.length === 0) return true;
    return runWrites(dash, "已更新 WiFi 设置，已连接的设备需要重新连接", ops);
  };

  return (
    <FormPanel title="修改 WiFi" subtitle={`${radio.row.name}${radio.kind === "wireless" ? " · wireless" : ""}`} onClose={props.onClose} onSubmit={submit}>
      <Field label="网络名称（SSID）" required error={errors().ssid}>
        <TextInput value={ssid()} onInput={setSsid} invalid={!!errors().ssid} />
      </Field>
      <Field label="密码" error={errors().password} hint="留空表示不修改。8–63 个字符。">
        <SecretInput value={password()} onInput={setPassword} placeholder="不修改" invalid={!!errors().password} />
      </Field>
      <Show when={radio.sharedWith > 1}>
        <p class="rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-[12.5px] text-[var(--pill-warn)]">
          名称或密码保存在共享配置 “{radio.config?.name || radio.secProfile?.name}” 中，同时用于 {radio.sharedWith} 个无线接口，修改会一起生效。
        </p>
      </Show>
      <p class="text-[12px] text-faint">保存后无线会短暂重启，已连接的设备需要用新密码重新连接；如果你正通过 WiFi 访问这个页面，连接会中断一下。</p>
    </FormPanel>
  );
}
