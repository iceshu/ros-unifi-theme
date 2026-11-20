import { createMemo, For, onSettled } from "solid-js";
import { formatUptime } from "../lib/format";
import { addressesOn, defaultRoute, dhcpStatusLabel, flag, handshakeTone, ifaceRole, leaseIdentity, linkState, type RosRecord, type Tone } from "../lib/model";
import { useDashboard, type Selection } from "../lib/store";
import { clientOnline, learnedPort, routeUsesInterface, sameMac } from "../lib/topology";
import { rateText } from "./TopologyFlow";

export type TopologySelection = Selection | { type: "internet" } | { type: "unknown"; label: string };
interface Hop { name: string; label: string; status: string; tone: Tone; selection: TopologySelection; rate?: string }
type Detail = [string, string];
const joined = (values: Array<string | undefined>) => values.filter(Boolean).join("\n") || "无记录";
const up = (row: RosRecord | undefined) => !!row && flag(row.running) && !flag(row.disabled);

export function TopologyNodePanel(props: { selection: TopologySelection; onSelect: (value: TopologySelection) => void; onClose: () => void }) {
  const dash = useDashboard();
  onSettled(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });
  const content = createMemo(() => {
    const sel = props.selection;
    const wanName = dash.primaryWan() || "";
    const wanRow = dash.interfaces().find((row) => row.name === wanName);
    const ppp = dash.pppoe().find((row) => row.name === wanName);
    const carrierName = ppp?.interface || dash.wanNames().find((name) => name !== wanName) || "";
    const rate = (name: string) => {
      const value = dash.rates()[name];
      return value ? `↓ ${rateText(value.rxBps)} ↑ ${rateText(value.txBps)}` : "尚无速率采样";
    };
    const unknown = (label: string): Hop => ({ name: "未知/未定位", label, status: "无记录", tone: "muted", selection: { type: "unknown", label } });
    const iface = (name: string, label: string): Hop => {
      if (!name) return unknown(label);
      const row = dash.interfaces().find((item) => item.name === name) || (dash.wireguard() ?? []).find((item) => item.name === name);
      const state = linkState(row);
      return { name, label, status: state.label, tone: state.tone, selection: { type: "iface", name }, rate: rate(name) };
    };
    const gateway: Hop = { name: dash.identity()?.name || "未知网关", label: "网关", status: dash.resource() ? "在线" : "未知", tone: dash.resource() ? "good" : "muted", selection: { type: "gateway" } };
    const internet: Hop = { name: "互联网", label: "外网出口", status: wanRow ? up(wanRow) ? "出口已连接" : "出口未连接" : "未知", tone: wanRow ? up(wanRow) ? "good" : "bad" : "muted", selection: { type: "internet" } };
    const tail = [gateway, iface(wanName, "广域网"), internet];
    const route = defaultRoute(dash.routes());
    const routeText = route ? `${route["dst-address"]} → ${route.gateway || route["immediate-gw"] || "未知"} · ${flag(route.active) ? "活动" : "非活动"}` : "无默认路由";
    const bridgeFor = (name: string) => dash.bridgePorts().find((row) => row.interface === name && !flag(row.disabled))?.bridge || "";
    let title = "连接信息";
    let hops: Hop[] = tail;
    let details: Detail[] = [];
    if (sel.type === "client") {
      const matches = (row: RosRecord) => sameMac(row["mac-address"], sel.mac) || (!!sel.ip && row.address === sel.ip);
      const lease = dash.leases().find(matches);
      const arp = dash.arp().find(matches);
      const mac = sel.mac || lease?.["mac-address"] || arp?.["mac-address"] || "";
      const wifi = dash.wifiRegistration().find((row) => sameMac(row["mac-address"], mac));
      const bridges = new Set(dash.interfaces().filter((row) => row.type === "bridge").map((row) => row.name));
      const port = wifi?.interface || learnedPort(mac, dash.bridgeHosts() ?? [], bridges);
      const host = (dash.bridgeHosts() ?? []).find((row) => sameMac(row["mac-address"], mac) && !flag(row.local));
      const bridge = bridgeFor(port) || host?.bridge || (bridges.has(arp?.interface || "") ? arp?.interface : "") || "";
      title = lease ? leaseIdentity(lease).title : sel.ip || "客户端";
      const online = !!wifi || clientOnline(lease, arp);
      const access = iface(port, wifi ? `无线接入${wifi.ssid ? ` · ${wifi.ssid}` : ""}` : "接入端口");
      if (wifi) {
        access.status = `已连接 · ${wifi.signal || wifi["signal-strength"] || "信号未知"}`;
        access.tone = "good";
      }
      hops = [{ name: title, label: "客户端", status: online ? "在线" : "离线", tone: online ? "good" : "muted", selection: sel }, access, iface(bridge, "桥"), ...tail];
      details = [["IP", sel.ip || lease?.address || arp?.address || "未知"], ["MAC", mac || "未知"], ["在线状态", online ? "在线" : "离线"], ["DHCP 租约状态", dhcpStatusLabel(lease?.status)], ["所属网段（接口地址）", joined(addressesOn(dash.addresses(), port).concat(addressesOn(dash.addresses(), bridge || arp?.interface || "")))], ["默认路由 via WAN", `${wanName || "未知出口"} · ${routeText}`]];
      if (wifi) details.push(["无线 SSID", wifi.ssid || "未提供"], ["信号强度", wifi.signal || wifi["signal-strength"] || "未提供"]);
    } else if (sel.type === "iface") {
      title = sel.name || "未知接口";
      const row = dash.interfaces().find((item) => item.name === sel.name);
      const wan = sel.name === wanName || sel.name === carrierName || dash.wanNames().includes(sel.name);
      hops = wan ? [iface(sel.name, sel.name === carrierName ? "物理口" : "广域网"), ...(sel.name === carrierName && wanName !== carrierName ? [iface(wanName, "广域网")] : []), internet] : [iface(sel.name, "端口"), ...(row?.type === "bridge" ? [] : [iface(bridgeFor(sel.name), "桥")]), ...tail];
      details = [["链路状态", linkState(row).label], ["速率 ↓/↑（接口接收/发送）", rate(sel.name)], ["该口上的 VLAN", joined(dash.vlans().filter((v) => v.interface === sel.name).map((v) => `${v.name} · VLAN ${v["vlan-id"]}`))], ["interface-list 成员", joined(dash.listMembers().filter((v) => v.interface === sel.name).map((v) => `${v.list}${flag(v.disabled) ? "（已禁用）" : ""}`))], ["发现的邻居", joined(dash.neighbors().filter((v) => (v.interface || "").split(",").includes(sel.name)).map((v) => `${v.identity || v["mac-address"] || "未知"} · ${v.address || "地址未知"}`))], ["IP 地址", joined(addressesOn(dash.addresses(), sel.name))], ["经过该口的路由", joined(dash.routes().filter((v) => routeUsesInterface(v, sel.name)).map((v) => `${v["dst-address"]} → ${v.gateway || v["immediate-gw"] || "未知"}`))]];
      if (row?.["rx-error"] !== undefined || row?.["tx-error"] !== undefined) details.push(["错误计数（接收/发送）", `${row?.["rx-error"] ?? "未提供"} / ${row?.["tx-error"] ?? "未提供"}`]);
      if (wan) {
        if (sel.name === wanName && carrierName && carrierName !== wanName) hops.splice(1, 0, iface(carrierName, "物理口"));
        details.push(["PPPoE 状态", ppp ? `${ppp.name} · ${linkState(dash.interfaces().find((v) => v.name === ppp.name) || ppp).label}` : "无 PPPoE 记录"], ["物理口", carrierName || "未知/未定位"], ["拨号地址", joined(addressesOn(dash.addresses(), wanName))]);
      }
    } else if (sel.type === "gateway") {
      title = gateway.name;
      details = [["默认路由", routeText], ["运行时间", formatUptime(dash.resource()?.uptime)], ["版本", dash.resource()?.version || "未知"]];
      for (const role of ["lan", "wan"] as const) details.push([role === "lan" ? "LAN 接口" : "WAN 接口", joined(dash.interfaces().filter((row) => ifaceRole(row, dash.wanNames(), dash.lanNames(), dash.listMembers(), dash.bridgePorts()) === role).map((row) => `${row.name} · ${linkState(row).label} · ${rate(row.name)}`))]);
    } else if (sel.type === "peer") {
      const peer = (dash.wireguardPeers() ?? []).find((row) => row[".id"] === sel.id);
      title = peer?.comment || "WireGuard 对端";
      const tunnel = iface(peer?.interface || "", "隧道接口");
      hops = [{ name: title, label: "WireGuard 对端", status: flag(peer?.disabled) ? "已禁用" : peer?.["last-handshake"] || "未知", tone: flag(peer?.disabled) ? "muted" : handshakeTone(peer?.["last-handshake"]), selection: sel }, tunnel, gateway];
      details = [["最后握手时间", peer?.["last-handshake"] || "未握手/未知"], ["允许地址（allowed-ips）", peer?.["allowed-address"] || "未知"], ["对端地址", `${peer?.["current-endpoint-address"] || peer?.["endpoint-address"] || "未知"} : ${peer?.["current-endpoint-port"] || peer?.["endpoint-port"] || "未知"}`], ["隧道接口状态", `${tunnel.name} · ${tunnel.status}`]];
    } else if (sel.type === "internet") {
      title = "互联网";
      hops = [iface(wanName, "广域网"), internet];
      details = [["出口状态", internet.status], ["出口速率", rate(wanName)], ["默认路由", routeText], ["说明", "出口状态来自接口数据，不代表互联网连通性探测。"]];
    } else {
      title = sel.label;
      hops = [unknown(sel.label)];
      details = [["定位状态", "未知/未定位：现有数据没有该跳记录。"]];
    }
    return { title, hops, details };
  });
  return (
    <div class="topology-panel" role="region" aria-label="节点连接路径">
      <div class="flex items-center justify-between gap-3"><h3 class="text-sm font-medium">{content().title}</h3><button type="button" class="chip" onClick={props.onClose}>关闭</button></div>
      <h4 class="kicker mt-3">连接路径</h4>
      <div class="topology-hops">
        <For each={content().hops}>{(hop, index) => <>
          {index() > 0 ? <span class="text-faint" aria-hidden="true">→</span> : null}
          <button type="button" class="topo-chip" aria-pressed={JSON.stringify(hop.selection) === JSON.stringify(props.selection) ? "true" : "false"} onClick={() => props.onSelect(hop.selection)}>
            <i class={`led led-${hop.tone}`} /><span><span class="kicker block">{hop.label}</span><span class="block text-sm">{hop.name}</span><span class="block text-[11px] text-faint">{hop.status}</span>{hop.rate ? <span class="block text-[11px] font-mono">{hop.rate}</span> : null}</span>
          </button>
        </>}</For>
      </div>
      <h4 class="kicker mb-3">连接详情</h4>
      <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"><For each={content().details}>{(detail) => <div class="min-w-0"><dt class="kicker">{detail[0]}</dt><dd class="mt-1 text-xs">{detail[1]}</dd></div>}</For></dl>
    </div>
  );
}
