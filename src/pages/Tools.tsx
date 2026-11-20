import { LoaderCircle } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { api } from "../lib/api";
import { formatBps } from "../lib/format";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { Card, EmptyState, PageHeader, Segmented } from "../components/ui";

type Tab = "ping" | "traceroute" | "torch";

const ADDR_RE = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]+|(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,})$/i;
const IFACE_RE = /^[a-z0-9][-a-z0-9]{0,19}$/i;

function validateAddr(v: string): string | null {
  if (!v.trim()) return "地址不能为空";
  return ADDR_RE.test(v.trim()) ? null : "地址格式不正确（需要 IPv4、IPv6 或主机名）";
}

function validateIface(v: string): string | null {
  if (!v.trim()) return "接口不能为空";
  return IFACE_RE.test(v.trim()) ? null : "接口名称格式不正确";
}

interface PingResult {
  seq: number;
  host: string;
  size: number;
  time: string;
  ttl: number;
  status: string;
}

interface HopResult {
  hop: number;
  host: string;
  time: string;
}

interface TorchFlow {
  src: string;
  dst: string;
  protocol: string;
  "tx-rate": string;
  "rx-rate": string;
  [key: string]: string | number;
}

export function ToolsPage() {
  const dash = useDashboard();
  const [tab, setTab] = createSignal<Tab>("ping");

  /* ── Ping state ── */
  const [pingAddr, setPingAddr] = createSignal("");
  const [pingCount, setPingCount] = createSignal("4");
  const [pingBusy, setPingBusy] = createSignal(false);
  const [pingResults, setPingResults] = createSignal<PingResult[]>([]);
  const [pingError, setPingError] = createSignal("");
  const [pingAddrErr, setPingAddrErr] = createSignal("");

  async function runPing() {
    const err = validateAddr(pingAddr());
    setPingAddrErr(err ?? "");
    if (err) return;
    const n = Number(pingCount());
    if (!Number.isInteger(n) || n < 1 || n > 10) return;
    setPingBusy(true);
    setPingError("");
    setPingResults([]);
    try {
      const res = (await api.post("/api/tools/ping", { address: pingAddr().trim(), count: n })) as { results: PingResult[] };
      setPingResults(res.results ?? []);
    } catch (e: unknown) {
      setPingError((e as { message?: string }).message ?? "执行失败");
    } finally {
      setPingBusy(false);
    }
  }

  /* ── Traceroute state ── */
  const [trAddr, setTrAddr] = createSignal("");
  const [trBusy, setTrBusy] = createSignal(false);
  const [trHops, setTrHops] = createSignal<HopResult[]>([]);
  const [trError, setTrError] = createSignal("");
  const [trAddrErr, setTrAddrErr] = createSignal("");

  async function runTraceroute() {
    const err = validateAddr(trAddr());
    setTrAddrErr(err ?? "");
    if (err) return;
    setTrBusy(true);
    setTrError("");
    setTrHops([]);
    try {
      const res = (await api.post("/api/tools/traceroute", { address: trAddr().trim() })) as { hops: HopResult[] };
      setTrHops(res.hops ?? []);
    } catch (e: unknown) {
      setTrError((e as { message?: string }).message ?? "执行失败");
    } finally {
      setTrBusy(false);
    }
  }

  /* ── Torch state ── */
  const interfaces = () => dash.interfaces().map((i) => i.name).filter(Boolean);
  const [torchIface, setTorchIface] = createSignal("");
  const [torchFlows, setTorchFlows] = createSignal<TorchFlow[]>([]);
  const [torchBusy, setTorchBusy] = createSignal(false);
  const [torchError, setTorchError] = createSignal("");
  const [torchIfaceErr, setTorchIfaceErr] = createSignal("");
  let torchStopped = false;
  let torchTimer: number | undefined;

  async function runTorch() {
    const err = validateIface(torchIface());
    setTorchIfaceErr(err ?? "");
    if (err) return;
    torchStopped = false;
    setTorchBusy(true);
    setTorchError("");
    setTorchFlows([]);
    const loop = async () => {
      if (torchStopped) return;
      try {
        const res = (await api.post("/api/tools/torch", { interface: torchIface().trim(), duration: 3 })) as { flows: TorchFlow[] };
        if (!torchStopped) setTorchFlows(res.flows ?? []);
      } catch (e: unknown) {
        setTorchError((e as { message?: string }).message ?? "执行失败");
        torchStopped = true;
        setTorchBusy(false);
        return;
      }
      if (!torchStopped) torchTimer = window.setTimeout(loop, 500);
    };
    void loop();
  }

  function stopTorch() {
    torchStopped = true;
    window.clearTimeout(torchTimer);
    setTorchBusy(false);
  }

  return (
    <div>
      <PageHeader title="诊断工具" subtitle="Ping · 路由追踪 · 流量抓包（需要 test 权限）" />

      <Show when={!can("test")}>
        <div class="card mb-4 p-4 text-[13px] text-warn">当前账号缺少 test 策略，无法执行诊断工具。</div>
      </Show>

      <div class="mb-4">
        <Segmented
          label="工具"
          value={tab()}
          onChange={setTab}
          options={[
            { value: "ping", label: "Ping" },
            { value: "traceroute", label: "Traceroute" },
            { value: "torch", label: "Torch" },
          ]}
        />
      </div>

      {/* ── Ping ── */}
      <Show when={tab() === "ping"}>
        <Card title="Ping">
          <div class="p-4">
            <div class="flex flex-wrap gap-3">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-[12px] text-muted mb-1">目标地址</label>
                <input
                  class={`input w-full ${pingAddrErr() ? "border-bad" : ""}`}
                  placeholder="IP 地址或主机名"
                  value={pingAddr()}
                  onInput={(e) => { setPingAddr(e.currentTarget.value); setPingAddrErr(""); }}
                />
                <Show when={pingAddrErr()}><p class="mt-1 text-[12px] text-bad">{pingAddrErr()}</p></Show>
              </div>
              <div class="w-24">
                <label class="block text-[12px] text-muted mb-1">次数（1–10）</label>
                <input
                  class="input w-full"
                  type="number"
                  min="1"
                  max="10"
                  value={pingCount()}
                  onInput={(e) => setPingCount(e.currentTarget.value)}
                />
              </div>
              <div class="flex items-end">
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={pingBusy()}
                  onClick={runPing}
                >
                  {pingBusy() ? <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  执行
                </button>
              </div>
            </div>

            <Show when={pingError()}>
              <div class="mt-3 rounded-lg bg-bad/10 p-3 text-[13px] text-bad">{pingError()}</div>
            </Show>

            <Show when={pingResults().length > 0}>
              <div class="mt-4 table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>主机</th>
                      <th>大小</th>
                      <th>延迟</th>
                      <th>TTL</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={pingResults()}>
                      {(row) => (
                        <tr>
                          <td class="text-muted">{row.seq}</td>
                          <td class="font-mono text-[13px]">{row.host}</td>
                          <td>{row.size}</td>
                          <td class="font-mono">{row.time}</td>
                          <td>{row.ttl}</td>
                          <td>
                            <span class={`pill ${row.status === "success" ? "pill-good" : "pill-bad"}`}>
                              {row.status === "success" ? "成功" : row.status}
                            </span>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
            <Show when={pingResults().length === 0 && !pingBusy() && !pingError()}>
              <EmptyState title="输入目标地址并点击执行" compact />
            </Show>
          </div>
        </Card>
      </Show>

      {/* ── Traceroute ── */}
      <Show when={tab() === "traceroute"}>
        <Card title="路由追踪（Traceroute）">
          <div class="p-4">
            <div class="flex flex-wrap gap-3">
              <div class="flex-1 min-w-[200px]">
                <label class="block text-[12px] text-muted mb-1">目标地址</label>
                <input
                  class={`input w-full ${trAddrErr() ? "border-bad" : ""}`}
                  placeholder="IP 地址或主机名"
                  value={trAddr()}
                  onInput={(e) => { setTrAddr(e.currentTarget.value); setTrAddrErr(""); }}
                />
                <Show when={trAddrErr()}><p class="mt-1 text-[12px] text-bad">{trAddrErr()}</p></Show>
              </div>
              <div class="flex items-end">
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={trBusy()}
                  onClick={runTraceroute}
                >
                  {trBusy() ? <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  追踪
                </button>
              </div>
            </div>

            <Show when={trError()}>
              <div class="mt-3 rounded-lg bg-bad/10 p-3 text-[13px] text-bad">{trError()}</div>
            </Show>

            <Show when={trHops().length > 0}>
              <div class="mt-4 table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>跳数</th>
                      <th>主机 / IP</th>
                      <th>延迟</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={trHops()}>
                      {(hop) => (
                        <tr>
                          <td class="text-muted">{hop.hop}</td>
                          <td class="font-mono text-[13px]">{hop.host || "*"}</td>
                          <td class="font-mono">{hop.time || "*"}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
            <Show when={trHops().length === 0 && !trBusy() && !trError()}>
              <EmptyState title="输入目标地址并点击追踪" compact />
            </Show>
          </div>
        </Card>
      </Show>

      {/* ── Torch ── */}
      <Show when={tab() === "torch"}>
        <Card title="实时流量抓包（Torch）">
          <div class="p-4">
            <div class="flex flex-wrap gap-3">
              <div class="w-48">
                <label class="block text-[12px] text-muted mb-1">接口</label>
                <input
                  class={`input w-full ${torchIfaceErr() ? "border-bad" : ""}`}
                  placeholder="如 ether1 / bridge1"
                  list="torch-iface-list"
                  value={torchIface()}
                  onInput={(e) => { setTorchIface(e.currentTarget.value); setTorchIfaceErr(""); }}
                />
                <datalist id="torch-iface-list">
                  <For each={interfaces()}>{(name) => <option value={name} />}</For>
                </datalist>
                <Show when={torchIfaceErr()}><p class="mt-1 text-[12px] text-bad">{torchIfaceErr()}</p></Show>
              </div>
              <div class="flex items-end gap-2">
                <Show when={!torchBusy()}>
                  <button type="button" class="btn btn-primary" onClick={runTorch}>启动</button>
                </Show>
                <Show when={torchBusy()}>
                  <button type="button" class="btn btn-danger" onClick={stopTorch}>停止</button>
                </Show>
              </div>
            </div>

            <Show when={torchError()}>
              <div class="mt-3 rounded-lg bg-bad/10 p-3 text-[13px] text-bad">{torchError()}</div>
            </Show>

            <Show when={torchFlows().length > 0}>
              <div class="mt-4 table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>源地址</th>
                      <th>目标地址</th>
                      <th>协议</th>
                      <th>上传</th>
                      <th>下载</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={torchFlows()}>
                      {(flow) => (
                        <tr>
                          <td class="font-mono text-[13px]">{flow.src}</td>
                          <td class="font-mono text-[13px]">{flow.dst}</td>
                          <td><span class="pill pill-muted">{flow.protocol}</span></td>
                          <td>
                            <span class="rate-up">↑</span>{" "}
                            {formatBps(Number(flow["tx-rate"]))?.value ?? "—"}{" "}
                            <span class="text-[11px] text-faint">{formatBps(Number(flow["tx-rate"]))?.unit ?? ""}</span>
                          </td>
                          <td>
                            <span class="rate-down">↓</span>{" "}
                            {formatBps(Number(flow["rx-rate"]))?.value ?? "—"}{" "}
                            <span class="text-[11px] text-faint">{formatBps(Number(flow["rx-rate"]))?.unit ?? ""}</span>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
            <Show when={torchFlows().length === 0 && !torchBusy() && !torchError()}>
              <EmptyState title="选择接口并点击启动，实时显示流量来源" compact />
            </Show>
          </div>
        </Card>
      </Show>
    </div>
  );
}
