import {
  createContext,
  createMemo,
  createSignal,
  onSettled,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import { ApiError, getMeta, getRest, toApiError, type Meta } from "./api";
import {
  asRecords,
  parseHealth,
  pickTemperature,
  pickWanName,
  type RosRecord,
} from "./model";
import { ratesFromDeltas, summarizeConnections } from "./traffic";

export interface Rate {
  rxBps: number;
  txBps: number;
}

export interface HistoryPoint {
  t: number;
  rxBps: number;
  txBps: number;
}

export interface ClientPeer {
  ip: string;
  bytes: number;
  count: number;
}

export interface ClientTraffic {
  rxBps: number | null;
  txBps: number | null;
  upBytes: number;
  downBytes: number;
  connections: number;
  peers: ClientPeer[];
}

export type Selection =
  | { type: "client"; ip: string; mac: string }
  | { type: "iface"; name: string }
  | { type: "peer"; id: string }
  | { type: "gateway" };

interface Counter {
  t: number;
  rx: number;
  tx: number;
}

export interface DashboardApi {
  meta: Accessor<Meta | null>;
  error: Accessor<ApiError | null>;
  ready: Accessor<boolean>;
  updatedAt: Accessor<number | null>;
  now: Accessor<number>;
  resource: Accessor<RosRecord | null>;
  identity: Accessor<RosRecord | null>;
  clock: Accessor<RosRecord | null>;
  health: Accessor<RosRecord[]>;
  routerboard: Accessor<RosRecord | null>;
  interfaces: Accessor<RosRecord[]>;
  ethernet: Accessor<RosRecord[]>;
  pppoe: Accessor<RosRecord[]>;
  addresses: Accessor<RosRecord[]>;
  leases: Accessor<RosRecord[]>;
  arp: Accessor<RosRecord[]>;
  firewall: Accessor<RosRecord[]>;
  nat: Accessor<RosRecord[]>;
  mangle: Accessor<RosRecord[]>;
  addressLists: Accessor<RosRecord[]>;
  dhcpServers: Accessor<RosRecord[]>;
  dhcpNetworks: Accessor<RosRecord[]>;
  pools: Accessor<RosRecord[]>;
  dns: Accessor<RosRecord | null>;
  dnsStatic: Accessor<RosRecord[]>;
  neighbors: Accessor<RosRecord[]>;
  queues: Accessor<RosRecord[]>;
  vlans: Accessor<RosRecord[]>;
  wifi: Accessor<RosRecord[]>;
  wifiConfig: Accessor<RosRecord[]>;
  wifiRegistration: Accessor<RosRecord[]>;
  pppActive: Accessor<RosRecord[]>;
  packages: Accessor<RosRecord[]>;
  logEntries: Accessor<RosRecord[]>;
  routes: Accessor<RosRecord[]>;
  listMembers: Accessor<RosRecord[]>;
  bridgePorts: Accessor<RosRecord[]>;
  wireguard: Accessor<RosRecord[] | null>;
  wireguardPeers: Accessor<RosRecord[] | null>;
  wireguardLoaded: Accessor<boolean>;
  bridgeHosts: Accessor<RosRecord[] | null>;
  connections: Accessor<RosRecord[] | null>;
  connectionsLoaded: Accessor<boolean>;
  clientTraffic: Accessor<Record<string, ClientTraffic>>;
  clientHistory: Accessor<Record<string, HistoryPoint[]>>;
  peerRates: Accessor<Record<string, Rate>>;
  selection: Accessor<Selection | null>;
  setSelection: (value: Selection | null) => void;
  rates: Accessor<Record<string, Rate>>;
  history: Accessor<Record<string, HistoryPoint[]>>;
  temperature: Accessor<{ name: string; value: number; unit: string } | null>;
  primaryWan: Accessor<string | null>;
  wanNames: Accessor<string[]>;
  lanNames: Accessor<string[]>;
  retry: () => void;
}

const DashboardContext = createContext<DashboardApi>();

export const HISTORY_WINDOW_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = 180;

async function runPool<T>(jobs: Array<() => Promise<T>>, limit: number): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= jobs.length) return;
      try {
        results[index] = { status: "fulfilled", value: await jobs[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  const width = Math.min(limit, jobs.length);
  if (width > 0) await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}

export function createDashboard(): DashboardApi {
  const [meta, setMeta] = createSignal<Meta | null>(null);
  const [error, setError] = createSignal<ApiError | null>(null);
  const [ready, setReady] = createSignal(false);
  const [updatedAt, setUpdatedAt] = createSignal<number | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const [resource, setResource] = createSignal<RosRecord | null>(null);
  const [identity, setIdentity] = createSignal<RosRecord | null>(null);
  const [clock, setClock] = createSignal<RosRecord | null>(null);
  const [health, setHealth] = createSignal<RosRecord[]>([]);
  const [routerboard, setRouterboard] = createSignal<RosRecord | null>(null);
  const [interfaces, setInterfaces] = createSignal<RosRecord[]>([]);
  const [ethernet, setEthernet] = createSignal<RosRecord[]>([]);
  const [pppoe, setPppoe] = createSignal<RosRecord[]>([]);
  const [addresses, setAddresses] = createSignal<RosRecord[]>([]);
  const [leases, setLeases] = createSignal<RosRecord[]>([]);
  const [arp, setArp] = createSignal<RosRecord[]>([]);
  const [firewall, setFirewall] = createSignal<RosRecord[]>([]);
  const [routes, setRoutes] = createSignal<RosRecord[]>([]);
  const [listMembers, setListMembers] = createSignal<RosRecord[]>([]);
  const [bridgePorts, setBridgePorts] = createSignal<RosRecord[]>([]);
  const [wireguard, setWireguard] = createSignal<RosRecord[] | null>(null);
  const [wireguardPeers, setWireguardPeers] = createSignal<RosRecord[] | null>(null);
  const [wireguardLoaded, setWireguardLoaded] = createSignal(false);
  const [bridgeHosts, setBridgeHosts] = createSignal<RosRecord[] | null>(null);
  const [connections, setConnections] = createSignal<RosRecord[] | null>(null);
  const [connectionsLoaded, setConnectionsLoaded] = createSignal(false);
  const [clientTraffic, setClientTraffic] = createSignal<Record<string, ClientTraffic>>({});
  const [clientHistory, setClientHistory] = createSignal<Record<string, HistoryPoint[]>>({});
  const [peerRates, setPeerRates] = createSignal<Record<string, Rate>>({});
  const [selection, setSelection] = createSignal<Selection | null>(null);
  const [rates, setRates] = createSignal<Record<string, Rate>>({});
  const [history, setHistory] = createSignal<Record<string, HistoryPoint[]>>({});

  const [nat, setNat] = createSignal<RosRecord[]>([]);
  const [mangle, setMangle] = createSignal<RosRecord[]>([]);
  const [addressLists, setAddressLists] = createSignal<RosRecord[]>([]);
  const [dhcpServers, setDhcpServers] = createSignal<RosRecord[]>([]);
  const [dhcpNetworks, setDhcpNetworks] = createSignal<RosRecord[]>([]);
  const [pools, setPools] = createSignal<RosRecord[]>([]);
  const [dns, setDns] = createSignal<RosRecord | null>(null);
  const [dnsStatic, setDnsStatic] = createSignal<RosRecord[]>([]);
  const [neighbors, setNeighbors] = createSignal<RosRecord[]>([]);
  const [queues, setQueues] = createSignal<RosRecord[]>([]);
  const [vlans, setVlans] = createSignal<RosRecord[]>([]);
  const [wifi, setWifi] = createSignal<RosRecord[]>([]);
  const [wifiConfig, setWifiConfig] = createSignal<RosRecord[]>([]);
  const [wifiRegistration, setWifiRegistration] = createSignal<RosRecord[]>([]);
  const [pppActive, setPppActive] = createSignal<RosRecord[]>([]);
  const [packages, setPackages] = createSignal<RosRecord[]>([]);
  const [logEntries, setLogEntries] = createSignal<RosRecord[]>([]);
  const extraLists: Record<string, (rows: RosRecord[]) => unknown> = {
    "/rest/ip/firewall/nat": setNat,
    "/rest/ip/firewall/mangle": setMangle,
    "/rest/ip/firewall/address-list": setAddressLists,
    "/rest/ip/dhcp-server": setDhcpServers,
    "/rest/ip/dhcp-server/network": setDhcpNetworks,
    "/rest/ip/pool": setPools,
    "/rest/ip/dns": (rows) => setDns(rows[0] ?? null),
    "/rest/ip/dns/static": setDnsStatic,
    "/rest/ip/neighbor": setNeighbors,
    "/rest/queue/simple": setQueues,
    "/rest/interface/vlan": setVlans,
    "/rest/interface/wifi": setWifi,
    "/rest/interface/wifi/configuration": setWifiConfig,
    "/rest/interface/wifi/registration-table": setWifiRegistration,
    "/rest/ppp/active": setPppActive,
    "/rest/system/package": setPackages,
    "/rest/log": (rows) => setLogEntries(rows.slice(-200)),
  };

  const lastCounters = new Map<string, Counter>();
  const lastPeerBytes = new Map<string, Counter>();
  let lastClientBytes: { t: number; totals: Record<string, { up: number; down: number }> } | null = null;
  let wake = () => {};
  let hurry = false;

  const wanNames = createMemo(() => meta()?.wanInterfaces ?? ["liantong", "ether0"]);
  const lanNames = createMemo(() => meta()?.lanInterfaces ?? ["bridge1"]);
  const temperature = createMemo(() => pickTemperature(health()));
  const primaryWan = createMemo(() => pickWanName(interfaces(), wanNames()));

  async function loadMeta(): Promise<ApiError | null> {
    try {
      setMeta(await getMeta());
      return null;
    } catch (cause) {
      return toApiError(cause);
    }
  }

  async function pollInterfaces(): Promise<ApiError | null> {
    try {
      const rows = asRecords(await getRest("/rest/interface"));
      const at = Date.now();
      const nextRates = { ...rates() };
      const nextHistory = { ...history() };
      for (const row of rows) {
        const name = row.name;
        if (!name) continue;
        const rx = Number(row["rx-byte"]);
        const tx = Number(row["tx-byte"]);
        if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
        const previous = lastCounters.get(name);
        lastCounters.set(name, { t: at, rx, tx });
        if (!previous) continue;
        const dt = (at - previous.t) / 1000;
        if (dt < 0.4 || dt > 30) continue;
        if (rx < previous.rx || tx < previous.tx) continue;
        const sample = {
          t: at,
          rxBps: ((rx - previous.rx) * 8) / dt,
          txBps: ((tx - previous.tx) * 8) / dt,
        };
        nextRates[name] = { rxBps: sample.rxBps, txBps: sample.txBps };
        const series = (nextHistory[name] ?? []).concat(sample);
        nextHistory[name] = series.length > HISTORY_LIMIT ? series.slice(-HISTORY_LIMIT) : series;
      }
      setInterfaces(rows);
      setRates(nextRates);
      setHistory(nextHistory);
      setUpdatedAt(at);
      return null;
    } catch (cause) {
      return toApiError(cause);
    }
  }

  async function readRest(path: string): Promise<{ rows: RosRecord[] | null; missing: boolean; error: ApiError | null; raw: unknown }> {
    try {
      const raw = await getRest(path === "/rest/log" ? `${path}?.proplist=time,topics,message` : path);
      return { rows: asRecords(raw), missing: false, error: null, raw };
    } catch (cause) {
      const api = toApiError(cause);
      if (api.status === 404 || api.code === "not_found") {
        return { rows: null, missing: true, error: null, raw: null };
      }
      return { rows: null, missing: false, error: api, raw: null };
    }
  }

  async function pollSlow(): Promise<ApiError | null> {
    const jobs: Array<() => Promise<{ path: string; result: Awaited<ReturnType<typeof readRest>> }>> = [
      "/rest/system/resource",
      "/rest/system/identity",
      "/rest/system/clock",
      "/rest/system/health",
      "/rest/system/routerboard",
      "/rest/interface/ethernet",
      "/rest/interface/pppoe-client",
      "/rest/interface/list/member",
      "/rest/interface/bridge/port",
      "/rest/interface/bridge/host",
      "/rest/ip/address",
      "/rest/ip/dhcp-server/lease",
      "/rest/ip/arp",
      "/rest/ip/firewall/filter",
      "/rest/ip/firewall/connection",
      "/rest/ip/route",
      "/rest/interface/wireguard",
      "/rest/interface/wireguard/peers",
      ...Object.keys(extraLists),
    ].map((path) => async () => ({ path, result: await readRest(path) }));

    const settled = await runPool(jobs, 3);
    let failure: ApiError | null = null;
    let leaseRows = leases();
    let arpRows = arp();
    let connectionRows: RosRecord[] | null = connections();
    let sawConnections = false;
    for (const item of settled) {
      if (item.status === "rejected") {
        failure ??= toApiError(item.reason);
        continue;
      }
      const { path, result } = item.value;
      if (result.error && !failure) failure = result.error;
      const rows = result.rows ?? [];
      if (extraLists[path] && !result.error) extraLists[path](rows);
      if (path === "/rest/system/resource") {
        if (result.missing) {
          failure ??= new ApiError(
            404,
            "not_found",
            "路由器没有返回系统信息。请确认是 RouterOS 7，并且 www 或 www-ssl 已启用。",
          );
        } else if (!result.error) setResource(rows[0] ?? null);
      } else if (path === "/rest/system/identity" && !result.error) setIdentity(result.missing ? null : rows[0] ?? null);
      else if (path === "/rest/system/clock" && !result.error) setClock(result.missing ? null : rows[0] ?? null);
      else if (path === "/rest/system/health" && !result.error) setHealth(result.missing ? [] : parseHealth(result.raw));
      else if (path === "/rest/system/routerboard" && !result.error) setRouterboard(result.missing ? null : rows[0] ?? null);
      else if (path === "/rest/interface/ethernet" && !result.error) setEthernet(result.missing ? [] : rows);
      else if (path === "/rest/interface/pppoe-client" && !result.error) setPppoe(result.missing ? [] : rows);
      else if (path === "/rest/interface/list/member" && !result.error) setListMembers(result.missing ? [] : rows);
      else if (path === "/rest/interface/bridge/port" && !result.error) setBridgePorts(result.missing ? [] : rows);
      else if (path === "/rest/ip/address" && !result.error) setAddresses(result.missing ? [] : rows);
      else if (path === "/rest/ip/dhcp-server/lease" && !result.error) {
        leaseRows = result.missing ? [] : rows;
        setLeases(leaseRows);
      } else if (path === "/rest/ip/arp" && !result.error) {
        arpRows = result.missing ? [] : rows;
        setArp(arpRows);
      } else if (path === "/rest/interface/bridge/host" && !result.error) {
        setBridgeHosts(result.missing ? null : rows);
      } else if (path === "/rest/ip/firewall/filter" && !result.error) setFirewall(result.missing ? [] : rows);
      else if (path === "/rest/ip/firewall/connection" && !result.error) {
        sawConnections = true;
        connectionRows = result.missing ? null : rows;
        setConnectionsLoaded(true);
        setConnections(connectionRows);
      }
      else if (path === "/rest/ip/route" && !result.error) setRoutes(result.missing ? [] : rows);
      else if (path === "/rest/interface/wireguard" && !result.error) {
        setWireguardLoaded(true);
        setWireguard(result.missing ? null : rows);
      } else if (path === "/rest/interface/wireguard/peers" && !result.error) {
        const peers = result.missing ? null : rows;
        setWireguardPeers(peers);
        if (peers) setPeerRates(updatePeerRates(peers));
      }
    }
    if (sawConnections) applyClientTraffic(connectionRows ?? [], leaseRows, arpRows);
    return failure;
  }

  function updatePeerRates(peers: RosRecord[]): Record<string, Rate> {
    const at = Date.now();
    const next = { ...peerRates() };
    for (const peer of peers) {
      const id = peer[".id"];
      if (!id) continue;
      const rx = Number(peer.rx);
      const tx = Number(peer.tx);
      if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
      const previous = lastPeerBytes.get(id);
      lastPeerBytes.set(id, { t: at, rx, tx });
      if (!previous) continue;
      const dt = (at - previous.t) / 1000;
      if (dt < 0.4 || dt > 40) continue;
      if (rx < previous.rx || tx < previous.tx) continue;
      next[id] = { rxBps: ((rx - previous.rx) * 8) / dt, txBps: ((tx - previous.tx) * 8) / dt };
    }
    return next;
  }

  function applyClientTraffic(rows: RosRecord[], leaseRows: RosRecord[], arpRows: RosRecord[]) {
    const ips = [
      ...leaseRows.map((lease) => lease.address),
      ...arpRows.map((row) => row.address),
    ].filter((ip) => !!ip && ip !== "0.0.0.0");
    const summary = summarizeConnections(rows, ips);
    const at = Date.now();
    const dt = lastClientBytes ? (at - lastClientBytes.t) / 1000 : 0;
    const deltas = ratesFromDeltas(lastClientBytes?.totals, summary.totals, dt);
    lastClientBytes = { t: at, totals: summary.totals };
    const next: Record<string, ClientTraffic> = {};
    const nextHistory = { ...clientHistory() };
    const seen = new Set<string>([...Object.keys(summary.totals), ...Object.keys(summary.reportedRates)]);
    for (const ip of seen) {
      const reported = summary.reportedRates[ip];
      const delta = deltas[ip];
      const rxBps = reported?.rxBps ?? delta?.rxBps ?? null;
      const txBps = reported?.txBps ?? delta?.txBps ?? null;
      next[ip] = {
        rxBps,
        txBps,
        upBytes: summary.totals[ip]?.up ?? 0,
        downBytes: summary.totals[ip]?.down ?? 0,
        connections: summary.counts[ip] ?? 0,
        peers: summary.peers[ip] ?? [],
      };
      if (rxBps != null && txBps != null) {
        const series = (nextHistory[ip] ?? []).concat({ t: at, rxBps, txBps });
        nextHistory[ip] = series.length > 40 ? series.slice(-40) : series;
      }
    }
    setClientTraffic(next);
    setClientHistory(nextHistory);
  }

  function retry() {
    hurry = true;
    wake();
  }

  onSettled(() => {
    let stopped = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);

    const loop = async () => {
      let lastSlow = 0;
      while (!stopped) {
        const began = Date.now();
        const metaError = meta() ? null : await loadMeta();
        let fastError: ApiError | null = null;
        let slowError: ApiError | null = null;
        if (!metaError) {
          fastError = await pollInterfaces();
          if (!fastError && (lastSlow === 0 || Date.now() - lastSlow >= 8000)) {
            slowError = await pollSlow();
            lastSlow = Date.now();
          }
        }
        const next = metaError ?? fastError ?? slowError;
        setError(next ?? null);
        setReady(true);
        if (stopped) break;
        const current = next;
        let delay = document.hidden ? 10_000 : 2_000;
        if (current && (current.code === "auth" || current.code === "not_configured")) delay = 30_000;
        else if (current) delay = document.hidden ? 20_000 : 8_000;
        const wait = hurry ? 0 : Math.max(300, delay - (Date.now() - began));
        hurry = false;
        await sleep(wait);
      }
    };

    void loop();
    return () => {
      stopped = true;
      wake();
      clearInterval(clockTimer);
    };
  });

  return {
    meta,
    error,
    ready,
    updatedAt,
    now,
    resource,
    identity,
    clock,
    health,
    routerboard,
    interfaces,
    ethernet,
    pppoe,
    addresses,
    leases,
    arp,
    firewall,
    nat, mangle, addressLists, dhcpServers, dhcpNetworks, pools, dns, dnsStatic,
    neighbors, queues, vlans, wifi, wifiConfig, wifiRegistration, pppActive, packages, logEntries,
    routes,
    listMembers,
    bridgePorts,
    wireguard,
    wireguardPeers,
    wireguardLoaded,
    bridgeHosts,
    connections,
    connectionsLoaded,
    clientTraffic,
    clientHistory,
    peerRates,
    selection,
    setSelection,
    rates,
    history,
    temperature,
    primaryWan,
    wanNames,
    lanNames,
    retry,
  };
}

export function DashboardProvider(props: ParentProps) {
  const api = createDashboard();
  return <DashboardContext value={api}>{props.children}</DashboardContext>;
}

export function useDashboard(): DashboardApi {
  const api = useContext(DashboardContext);
  if (!api) throw new Error("仪表数据还没有准备好");
  return api;
}
