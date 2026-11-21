import { createSignal, For, Show } from "solid-js";
import { api, ros, toApiError } from "../lib/api";
import { can } from "../lib/session";
import { showToast } from "../lib/toast";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";
import { runWrite } from "../lib/mutate";
import { ConfirmDialog, Field, SelectInput } from "../components/form";
import { Card, EmptyState, PageHeader, Pill } from "../components/ui";

const CHANNELS = [
  { value: "stable", label: "稳定版 (stable)" },
  { value: "long-term", label: "长期支持版 (long-term)" },
  { value: "testing", label: "测试版 (testing)" },
  { value: "development", label: "开发版 (development)" },
];

function statusTone(status: string | undefined): "good" | "warn" | "accent" | "muted" {
  if (!status) return "muted";
  const s = status.toLowerCase();
  if (s.includes("up to date")) return "good";
  if (s.includes("available") || s.includes("downloaded")) return "warn";
  return "accent";
}

export function UpdatesPage() {
  const dash = useDashboard();
  const { rows: updateRows, reload: reloadUpdate } = useRos(() => "/rest/system/package/update", 30_000);
  const { rows: packages } = useRos(() => "/rest/system/package", 60_000);

  const updateStatus = () => updateRows()[0] ?? null;
  const rb = () => dash.routerboard();

  const [checking, setChecking] = createSignal(false);
  const [checkErr, setCheckErr] = createSignal("");
  const [showInstall, setShowInstall] = createSignal(false);
  const [showUpgrade, setShowUpgrade] = createSignal(false);

  const identity = () => dash.identity()?.name ?? "";

  const handleCheck = async () => {
    setChecking(true);
    setCheckErr("");
    try {
      await api.post("/api/updates/check");
      reloadUpdate();
      showToast("更新检查完成", "ok");
    } catch (e) {
      const msg = toApiError(e).message;
      setCheckErr(msg);
      showToast(msg, "err");
    } finally {
      setChecking(false);
    }
  };

  const handleChannelChange = async (val: string) => {
    await runWrite(dash, "频道已更改", () =>
      ros.command("/rest/system/package/update", "set", { channel: val }),
    );
    reloadUpdate();
  };

  const handleInstall = async (): Promise<boolean> => {
    const ok = await runWrite(dash, "正在安装，路由器即将重启…", () =>
      ros.command("/rest/system/package/update", "install", {}),
    );
    if (ok) setShowInstall(false);
    return ok;
  };

  const handleUpgrade = async (): Promise<boolean> => {
    const ok = await runWrite(dash, "升级指令已发送，请在完成后手动重启", () =>
      ros.command("/rest/system/routerboard", "upgrade", {}),
    );
    if (ok) setShowUpgrade(false);
    return ok;
  };

  const hasUpdate = () => {
    const st = updateStatus()?.status ?? "";
    return st.toLowerCase().includes("available") || st.toLowerCase().includes("downloaded");
  };

  return (
    <div>
      <PageHeader title="系统更新" subtitle="RouterOS 软件包升级与固件管理" />

      <div class="space-y-4">
        <Card title="更新状态">
          <Show when={updateStatus()} fallback={<EmptyState title="暂无更新信息" detail="点击检查更新获取最新状态" compact />}>
            {(st) => (
              <div class="space-y-4 p-4">
                <div class="form-row">
                  <div>
                    <div class="kicker">已安装版本</div>
                    <div class="num mt-1 text-[15px] font-semibold">{st()["installed-version"] ?? "—"}</div>
                  </div>
                  <div>
                    <div class="kicker">最新版本</div>
                    <div class="num mt-1 text-[15px] font-semibold">{st()["latest-version"] ?? "—"}</div>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <Pill tone={statusTone(st().status)}>{st().status ?? "未知"}</Pill>
                </div>
                <Show when={checkErr()}>
                  <p class="text-[13px] text-bad">{checkErr()}</p>
                </Show>
                <div class="flex flex-wrap items-end gap-3">
                  <div class="min-w-[160px]">
                    <Field label="更新频道">
                      <SelectInput
                        value={(st().channel ?? "stable") as string}
                        onChange={handleChannelChange}
                        options={CHANNELS}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    disabled={checking()}
                    onClick={handleCheck}
                  >
                    {checking() ? "正在检查…" : "检查更新"}
                  </button>
                  <Show when={hasUpdate() && can("reboot")}>
                    <button
                      type="button"
                      class="btn btn-primary"
                      onClick={() => setShowInstall(true)}
                    >
                      下载并安装
                    </button>
                  </Show>
                </div>
              </div>
            )}
          </Show>
          <Show when={!updateStatus()}>
            <div class="p-4">
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="btn btn-ghost"
                  disabled={checking()}
                  onClick={handleCheck}
                >
                  {checking() ? "正在检查…" : "检查更新"}
                </button>
              </div>
              <Show when={checkErr()}>
                <p class="mt-2 text-[13px] text-bad">{checkErr()}</p>
              </Show>
            </div>
          </Show>
        </Card>

        <Card title="已安装软件包">
          <Show
            when={packages().length > 0}
            fallback={<EmptyState title="无软件包信息" compact />}
          >
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>版本</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={packages()}>
                    {(pkg) => (
                      <tr class={pkg.disabled === "true" ? "is-dim" : ""}>
                        <td class="font-medium">{pkg.name}</td>
                        <td class="num text-[13px]">{pkg.version}</td>
                        <td>
                          <Pill tone={pkg.disabled === "true" ? "muted" : "good"}>
                            {pkg.disabled === "true" ? "已禁用" : "运行中"}
                          </Pill>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Card>

        <Show when={rb()?.routerboard === "true"}>
          <Card title="RouterBOARD 固件">
            <div class="space-y-3 p-4">
              <div class="form-row">
                <div>
                  <div class="kicker">当前固件</div>
                  <div class="num mt-1 font-semibold">{rb()?.["current-firmware"] ?? "—"}</div>
                </div>
                <div>
                  <div class="kicker">可升级固件</div>
                  <div class="num mt-1 font-semibold">{rb()?.["upgrade-firmware"] ?? "—"}</div>
                </div>
              </div>
              <Show when={rb()?.["upgrade-firmware"] && rb()?.["upgrade-firmware"] !== rb()?.["current-firmware"] && can("reboot")}>
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick={() => setShowUpgrade(true)}
                >
                  升级固件
                </button>
              </Show>
              <p class="text-[12.5px] text-faint">升级固件后需要手动重启路由器以使新固件生效。</p>
            </div>
          </Card>
        </Show>
      </div>

      <Show when={showInstall()}>
        <ConfirmDialog
          title="确认安装更新"
          danger
          typeToConfirm={identity()}
          message={
            <span>
              安装将立即下载并重启路由器，期间网络将中断。
              <br />
              请确保无关键业务正在进行。
              <br />
              <span class="text-muted">当前版本 {updateStatus()?.["installed-version"]} → {updateStatus()?.["latest-version"]}</span>
            </span>
          }
          confirmLabel="安装并重启"
          onClose={() => setShowInstall(false)}
          onConfirm={handleInstall}
        />
      </Show>

      <Show when={showUpgrade()}>
        <ConfirmDialog
          title="升级 RouterBOARD 固件"
          danger
          typeToConfirm={identity()}
          message={
            <span>
              固件升级完成后需要手动重启路由器。
              <br />
              <span class="text-muted">{rb()?.["current-firmware"]} → {rb()?.["upgrade-firmware"]}</span>
            </span>
          }
          confirmLabel="升级固件"
          onClose={() => setShowUpgrade(false)}
          onConfirm={handleUpgrade}
        />
      </Show>
    </div>
  );
}
