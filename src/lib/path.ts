/** Connection path ("how does this node reach the Internet") and facts for the detail panel. */
import { formatUptime } from "./format";
import {
  addressesOn,
  defaultRoute,
  dhcpStatusLabel,
  flag,
  handshakeTone,
  ifaceRole,
  linkState,
  typeLabel,
  type RosRecord,
  type Tone,
} from "./model";
import type { DashboardApi, Selection } from "./store";
import { routeUsesInterface, sameMac } from "./topology";

export interface Hop {
  name: string;
  label: string;
  status: string;
  tone: Tone;
  selection?: Selection;
}

export type Fact = [label: string, value: string];

export interface PathInfo {
  hops: Hop[];
  facts: Fact[];
}

const joined = (values: Array<string | undefined>) => values.filter(Boolean).join("\n") || "无记录";

export function connectionPath(dash: DashboardApi, sel: Selection): PathInfo {
  const wanName = dash.primaryWan() || "";
  const carrierName = dash.carrierName();
  const findIface = (name: string): RosRecord | undefined =>
    dash.interfaces().find((row) => row.name === name) ?? (dash.wireguard() ?? []).find((row) => row.name === name);
  const ifaceHop = (name: string, label: string): Hop => {
    if (!name) return { name: "未定位", label, status: "无记录", tone: "muted" };
    const state = linkState(findIface(name));
    return { name, label, status: state.label, tone: state.tone, selection: { type: "iface", name } };
  };
  const bridgeFor = (name: string) =>
    dash.bridgePorts().find((row) => row.interface === name && !flag(row.disabled))?.bridge || "";
  const gateway: Hop = {
    name: dash.identity()?.name || "网关",
    label: "网关",
    status: dash.resource() ? "在线" : "未知",
    tone: dash.resource() ? "good" : "muted",
    selection: { type: "gateway" },
  };
  const internet: Hop = {
    name: "互联网",
    label: "出口",
    status: !dash.wanRow() ? "未知" : dash.wanUp() ? "已连接" : "未连接",
    tone: !dash.wanRow() ? "muted" : dash.wanUp() ? "good" : "bad",
    selection: { type: "internet" },
  };
  const wanHops = [
    ...(carrierName && carrierName !== wanName ? [ifaceHop(carrierName, "物理口")] : []),
    ifaceHop(wanName, "广域网"),
    internet,
  ];
  const upstream = [gateway, ...wanHops];
  const route = defaultRoute(dash.routes());
  const routeText = route
    ? `${route.gateway || route["immediate-gw"] || "未知"}${flag(route.active) ? "" : "（非活动）"}`
    : "无默认路由";

  if (sel.type === "client") {
    const matches = (row: RosRecord) => sameMac(row["mac-address"], sel.mac) || (!!sel.ip && row.address === sel.ip);
    const client = dash.clients().find((item) => sameMac(item.mac, sel.mac) || (!!sel.ip && item.ip === sel.ip));
    const lease = client?.lease ?? dash.leases().find(matches);
    const arp = client?.arp ?? dash.arp().find(matches);
    const port = client?.port || "";
    const host = (dash.bridgeHosts() ?? []).find((row) => sameMac(row["mac-address"], sel.mac) && !flag(row.local));
    const bridge =
      bridgeFor(port) || host?.bridge || (dash.bridgeNames().has(arp?.interface || "") ? arp?.interface : "") || "";
    const online = client?.online ?? false;
    const access = ifaceHop(port, client?.wireless ? "无线" : "接入端口");
    const hops: Hop[] = [
      { name: client?.title || sel.ip || "客户端", label: "客户端", status: online ? "在线" : "离线", tone: online ? "good" : "muted", selection: sel },
      access,
      ...(bridge && bridge !== port ? [ifaceHop(bridge, "桥")] : []),
      ...upstream,
    ];
    const facts: Fact[] = [
      ["连接方式", client?.wireless ? `无线 · ${client.ssid || port}` : port ? `有线 · ${port}` : "未定位"],
      ...(client?.wireless ? ([["信号", client.signal || "未提供"]] as Fact[]) : []),
      ["IP 地址", sel.ip || lease?.address || arp?.address || "—"],
      ["MAC 地址", sel.mac || "—"],
      ["厂商", client?.vendor || "未知"],
      ["DHCP 租约", lease ? `${dhcpStatusLabel(lease.status)}${lease["expires-after"] ? ` · 剩余 ${lease["expires-after"]}` : ""}` : "无租约（静态或仅 ARP）"],
      ["所属网段", joined(addressesOn(dash.addresses(), bridge || arp?.interface || port))],
      ["出口", `${wanName || "未知"} · 网关 ${routeText}`],
    ];
    return { hops, facts };
  }

  if (sel.type === "iface") {
    const row = findIface(sel.name);
    const role = row ? ifaceRole(row, dash.wanNames(), dash.lanNames(), dash.listMembers(), dash.bridgePorts()) : "other";
    const isWan = sel.name === wanName || sel.name === carrierName || role === "wan";
    const bridge = bridgeFor(sel.name);
    const hops: Hop[] = isWan
      ? [gateway, ...wanHops]
      : [ifaceHop(sel.name, "端口"), ...(bridge ? [ifaceHop(bridge, "桥")] : []), ...upstream];
    const speed = dash.ethernet().find((item) => item.name === sel.name)?.speed;
    const facts: Fact[] = [
      ["类型", typeLabel(row?.type)],
      ["状态", linkState(row).label],
      ...(speed ? ([["协商速率", speed]] as Fact[]) : []),
      ["MAC 地址", row?.["mac-address"] || "—"],
      ["MTU", row?.["actual-mtu"] || row?.mtu || "—"],
      ["IP 地址", joined(addressesOn(dash.addresses(), sel.name))],
      ["VLAN", joined(dash.vlans().filter((v) => v.interface === sel.name).map((v) => `${v.name} · VLAN ${v["vlan-id"]}`))],
      ["接口列表", joined(dash.listMembers().filter((v) => v.interface === sel.name).map((v) => `${v.list}${flag(v.disabled) ? "（已禁用）" : ""}`))],
      ["邻居", joined(dash.neighbors().filter((v) => (v.interface || "").split(",").includes(sel.name)).map((v) => `${v.identity || v["mac-address"] || "未知"} · ${v.address || "地址未知"}`))],
      ["路由", joined(dash.routes().filter((v) => routeUsesInterface(v, sel.name)).map((v) => `${v["dst-address"]} → ${v.gateway || v["immediate-gw"] || "未知"}`))],
      ["最近连通", row?.["last-link-up-time"] || "—"],
      ["错误 / 丢包", `收 ${row?.["rx-error"] ?? 0} / 发 ${row?.["tx-error"] ?? 0} · 丢 ${row?.["rx-drop"] ?? 0} / ${row?.["tx-drop"] ?? 0}`],
    ];
    if (sel.name === wanName) {
      const ppp = dash.pppoe().find((item) => item.name === wanName);
      facts.push(["PPPoE 账号", ppp?.user || "—"], ["物理口", carrierName || "—"], ["默认路由", routeText]);
    }
    return { hops, facts };
  }

  if (sel.type === "peer") {
    const peer = (dash.wireguardPeers() ?? []).find((row) => row[".id"] === sel.id);
    const disabled = flag(peer?.disabled);
    const hops: Hop[] = [
      {
        name: peer?.comment || "对端",
        label: "WireGuard 对端",
        status: disabled ? "已禁用" : peer?.["last-handshake"] || "从未握手",
        tone: disabled ? "muted" : handshakeTone(peer?.["last-handshake"]),
        selection: sel,
      },
      ifaceHop(peer?.interface || "", "隧道"),
      ...upstream,
    ];
    const facts: Fact[] = [
      ["允许地址", peer?.["allowed-address"] || "—"],
      [
        "端点",
        peer?.["current-endpoint-address"]
          ? `${peer["current-endpoint-address"]}:${peer["current-endpoint-port"] || ""}`
          : peer?.["endpoint-address"]
            ? `${peer["endpoint-address"]}:${peer["endpoint-port"] || ""}`
            : "—",
      ],
      ["最后握手", peer?.["last-handshake"] || "从未"],
      ["保活", peer?.["persistent-keepalive"] || "—"],
    ];
    return { hops, facts };
  }

  if (sel.type === "gateway") {
    const resource = dash.resource();
    const temp = dash.temperature();
    const lanList = dash
      .interfaces()
      .filter((row) => ifaceRole(row, dash.wanNames(), dash.lanNames(), dash.listMembers(), dash.bridgePorts()) === "lan")
      .map((row) => `${row.name} · ${linkState(row).label}`);
    const facts: Fact[] = [
      ["版本", resource?.version || "—"],
      ["运行时间", formatUptime(resource?.uptime)],
      ["CPU", `${resource?.["cpu-load"] ?? "—"}% · ${resource?.["cpu-count"] ?? "?"} 核`],
      ["温度", temp ? `${Math.round(temp.value)}${temp.unit}` : "未报告"],
      ["默认路由", routeText],
      ["局域网接口", joined(lanList)],
    ];
    return { hops: upstream, facts };
  }

  const ppp = dash.pppoe().find((item) => item.name === wanName);
  const facts: Fact[] = [
    ["出口接口", wanName || "—"],
    ["公网地址", joined(addressesOn(dash.addresses(), wanName))],
    ["PPPoE 账号", ppp?.user || "—"],
    ["物理口", carrierName ? `${carrierName} · ${linkState(findIface(carrierName)).label}` : "—"],
    ["默认路由", routeText],
    ["最近连通", dash.wanRow()?.["last-link-up-time"] || "—"],
    ["说明", "出口状态来自接口数据，不做外网连通性探测。"],
  ];
  return { hops: upstream, facts };
}
