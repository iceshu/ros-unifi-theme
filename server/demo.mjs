/** Clearly fake counters for local UI work. The banner in the SPA says so. */

export const DEMO_BOOT_MS = Date.UTC(2026, 10, 7, 2, 15, 0);
export const DEMO_ORIGIN_MS = DEMO_BOOT_MS;

const TRAFFIC = {
  liantong: {
    rx: { base: 4.2e11, baseBps: 160e6, amp: 45e6, period: 50, phase: 0.4 },
    tx: { base: 8.1e10, baseBps: 28e6, amp: 10e6, period: 70, phase: 1.2 },
  },
  ether0: {
    rx: { base: 4.4e11, baseBps: 168e6, amp: 46e6, period: 50, phase: 0.4 },
    tx: { base: 8.4e10, baseBps: 30e6, amp: 10e6, period: 70, phase: 1.2 },
  },
  ether1: {
    rx: { base: 1.2e11, baseBps: 72e6, amp: 20e6, period: 40, phase: 0.2 },
    tx: { base: 9e10, baseBps: 18e6, amp: 6e6, period: 55, phase: 2 },
  },
  ether2: {
    rx: { base: 6e10, baseBps: 24e6, amp: 8e6, period: 36, phase: 1 },
    tx: { base: 4e10, baseBps: 12e6, amp: 4e6, period: 48, phase: 0.5 },
  },
  ether3: {
    rx: { base: 3e10, baseBps: 16e6, amp: 5e6, period: 44, phase: 2.2 },
    tx: { base: 2.2e10, baseBps: 8e6, amp: 3e6, period: 60, phase: 0.8 },
  },
  ether4: {
    rx: { base: 2e9, baseBps: 0, amp: 0, period: 60, phase: 0 },
    tx: { base: 1e9, baseBps: 0, amp: 0, period: 60, phase: 0 },
  },
  bridge1: {
    rx: { base: 5.2e11, baseBps: 190e6, amp: 40e6, period: 46, phase: 0.6 },
    tx: { base: 2.4e11, baseBps: 70e6, amp: 18e6, period: 58, phase: 1.4 },
  },
  wg0: {
    rx: { base: 8e9, baseBps: 2.2e6, amp: 0.8e6, period: 30, phase: 0.3 },
    tx: { base: 4e9, baseBps: 1.1e6, amp: 0.4e6, period: 34, phase: 1.1 },
  },
};

export function instantBps(nowMs, spec) {
  const t = Math.max(0, (nowMs - DEMO_ORIGIN_MS) / 1000);
  const w = (2 * Math.PI) / spec.period;
  return spec.baseBps + spec.amp * Math.sin(w * t + spec.phase);
}

export function integratedBytes(nowMs, spec) {
  const t = Math.max(0, (nowMs - DEMO_ORIGIN_MS) / 1000);
  const w = (2 * Math.PI) / spec.period;
  const integralBits = spec.baseBps * t + (spec.amp / w) * (Math.cos(spec.phase) - Math.cos(w * t + spec.phase));
  return Math.round(spec.base + integralBits / 8);
}

function rosUptime(nowMs) {
  let s = Math.max(0, Math.floor((nowMs - DEMO_BOOT_MS) / 1000));
  const w = Math.floor(s / 604800);
  s %= 604800;
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;
  return `${w ? `${w}w` : ""}${d ? `${d}d` : ""}${h}h${m}m${s}s`;
}

function wave(nowMs, center, amp, period) {
  const t = nowMs / 1000;
  return center + amp * Math.sin((t / period) * Math.PI * 2);
}

function iface(nowMs, row) {
  const spec = TRAFFIC[row.name];
  const rx = spec ? integratedBytes(nowMs, spec.rx) : 0;
  const tx = spec ? integratedBytes(nowMs, spec.tx) : 0;
  return {
    ".id": row.id,
    name: row.name,
    type: row.type,
    running: row.running,
    disabled: row.disabled ?? "false",
    "mac-address": row.mac,
    mtu: row.mtu ?? "1500",
    "actual-mtu": row.mtu ?? "1500",
    comment: row.comment ?? "",
    "rx-byte": String(rx),
    "tx-byte": String(tx),
    "rx-packet": String(Math.floor(rx / 1400)),
    "tx-packet": String(Math.floor(tx / 1400)),
    "rx-error": row.rxError ?? "0",
    "tx-error": row.txError ?? "0",
    "rx-drop": "0",
    "tx-drop": "0",
    "last-link-up-time": row.linkUp ?? "2026-11-07 10:15:00",
    "link-downs": row.linkDowns ?? "1",
  };
}

function interfaces(nowMs) {
  return [
    iface(nowMs, {
      id: "*1",
      name: "ether0",
      type: "ether",
      running: "true",
      mac: "02:00:5E:00:00:10",
      comment: "光猫",
    }),
    iface(nowMs, {
      id: "*2",
      name: "ether1",
      type: "ether",
      running: "true",
      mac: "02:00:5E:00:00:11",
      comment: "客厅",
    }),
    iface(nowMs, {
      id: "*3",
      name: "ether2",
      type: "ether",
      running: "true",
      mac: "02:00:5E:00:00:12",
      comment: "书房",
    }),
    iface(nowMs, {
      id: "*4",
      name: "ether3",
      type: "ether",
      running: "true",
      mac: "02:00:5E:00:00:13",
      comment: "无线 AP",
    }),
    iface(nowMs, {
      id: "*5",
      name: "ether4",
      type: "ether",
      running: "false",
      mac: "02:00:5E:00:00:14",
      comment: "备用",
      linkDowns: "4",
      txError: "3",
    }),
    iface(nowMs, {
      id: "*A",
      name: "bridge1",
      type: "bridge",
      running: "true",
      mac: "02:00:5E:00:00:11",
      comment: "局域网",
      mtu: "1500",
    }),
    iface(nowMs, {
      id: "*B",
      name: "liantong",
      type: "pppoe-out",
      running: "true",
      mac: "",
      comment: "联通拨号",
      mtu: "1480",
    }),
    iface(nowMs, {
      id: "*C",
      name: "wg0",
      type: "wg",
      running: "true",
      mac: "",
      comment: "远程",
      mtu: "1420",
    }),
  ];
}

function clock(nowMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(nowMs)
      .map((part) => [part.type, part.value]),
  );
  return [
    {
      time: `${parts.hour}:${parts.minute}:${parts.second}`,
      date: `${parts.year}-${parts.month}-${parts.day}`,
      "time-zone-name": "Asia/Shanghai",
      "gmt-offset": "+08:00",
    },
  ];
}

export function demoBody(pathname, nowMs = Date.now()) {
  switch (pathname) {
    case "/rest/ip/firewall/nat":
      return [{ ".id": "*1", chain: "srcnat", action: "masquerade", "src-address": "192.168.2.0/24", "dst-address": "0.0.0.0/0", "to-addresses": "", comment: "LAN internet", disabled: "false", bytes: String(integratedBytes(nowMs, TRAFFIC.liantong.tx)), packets: String(Math.floor(integratedBytes(nowMs, TRAFFIC.liantong.tx) / 1200)) }];
    case "/rest/ip/firewall/mangle":
      return [{ ".id": "*1", chain: "prerouting", action: "mark-packet", "src-address": "192.168.2.0/24", "new-packet-mark": "lan", passthrough: "true", comment: "LAN accounting", disabled: "false", bytes: String(integratedBytes(nowMs, TRAFFIC.bridge1.rx)), packets: String(Math.floor(integratedBytes(nowMs, TRAFFIC.bridge1.rx) / 1200)) }];
    case "/rest/ip/firewall/address-list":
      return [{ ".id": "*1", list: "trusted", address: "192.168.2.0/24", timeout: "none-static", dynamic: "false", disabled: "false", comment: "Home LAN" }];
    case "/rest/ip/dhcp-server":
      return [{ ".id": "*1", name: "dhcp-lan", interface: "bridge1", "address-pool": "lan-pool", "lease-time": "1d", disabled: "false" }];
    case "/rest/ip/dhcp-server/network":
      return [{ ".id": "*1", address: "192.168.2.0/24", gateway: "192.168.2.1", "dns-server": "192.168.2.1", comment: "Home LAN" }];
    case "/rest/ip/pool":
      return [{ ".id": "*1", name: "lan-pool", ranges: "192.168.2.100-192.168.2.250", "next-pool": "none" }];
    case "/rest/ip/dns":
      return { servers: "1.1.1.1,9.9.9.9", "dynamic-servers": "", "cache-size": "2048", "cache-used": String(Math.round(wave(nowMs, 320, 20, 60))), "allow-remote-requests": "true", "verify-doh-cert": "true" };
    case "/rest/ip/dns/static":
      return [{ ".id": "*1", name: "gateway.home.arpa", address: "192.168.2.1", type: "A", disabled: "false" }];
    case "/rest/ip/neighbor":
      return [{ ".id": "*1", interface: "ether1", "mac-address": "02:DE:AD:BE:EF:01", address: "192.168.2.2", identity: "home-switch", platform: "MikroTik", version: "7.20.4", "interface-name": "ether1" }];
    case "/rest/queue/simple":
      return [{ ".id": "*1", name: "Guest", target: "192.168.30.0/24", "max-limit": "20M/100M", bytes: `${integratedBytes(nowMs, TRAFFIC.ether2.tx)}/${integratedBytes(nowMs, TRAFFIC.ether2.rx)}`, packets: "4200/18600", disabled: "false" }];
    case "/rest/interface/vlan":
      return [{ ".id": "*1", name: "vlan-guest", interface: "bridge1", "vlan-id": "30", mtu: "1500", running: "true", disabled: "false" }];
    case "/rest/interface/wifi":
      return [{ ".id": "*1", name: "wifi1", running: "true", disabled: "false", comment: "Home 5 GHz", "configuration.ssid": "Home" }];
    case "/rest/interface/wifi/configuration":
      return [{ ".id": "*1", name: "home-5g", ssid: "Home", country: "China", mode: "ap" }];
    case "/rest/interface/wifi/registration-table":
      return [{ ".id": "*1", interface: "wifi1", "mac-address": "02:CA:FE:12:34:56", "signal-strength": String(Math.round(wave(nowMs, -54, 3, 30))), "tx-rate": "866.7Mbps", "rx-rate": "780Mbps", uptime: rosUptime(nowMs) }];
    case "/rest/ppp/active":
      return [{ ".id": "*1", name: "home-vpn", service: "l2tp", "caller-id": "198.51.100.20", address: "192.168.90.10", uptime: rosUptime(nowMs) }];
    case "/rest/system/package":
      return [{ ".id": "*1", name: "routeros", version: "7.20.4", disabled: "false" }, { ".id": "*2", name: "wifi-qcom", version: "7.20.4", disabled: "false" }];
    case "/rest/log":
      return [{ time: new Date(nowMs - 60000).toISOString(), topics: "dhcp,info", message: "dhcp-lan assigned 192.168.2.100 to 02:CA:FE:12:34:56" }, { time: new Date(nowMs).toISOString(), topics: "system,info", message: "Demo dashboard: read-only connection active" }];
    case "/rest/system/resource": {
      const total = 1024 * 1024 * 1024;
      const usedRatio = 0.41 + 0.04 * Math.sin(nowMs / 20000);
      return [
        {
          uptime: rosUptime(nowMs),
          version: "7.16.2 (stable)",
          "build-time": "Sep/20/2024 13:00:00",
          "free-memory": String(Math.round(total * (1 - usedRatio))),
          "total-memory": String(total),
          cpu: "Intel(R)",
          "cpu-count": "2",
          "cpu-frequency": "1400",
          "cpu-load": String(Math.round(Math.min(96, Math.max(4, wave(nowMs, 16, 8, 25))))),
          "free-hdd-space": String(980 * 1024 * 1024),
          "total-hdd-space": String(1024 * 1024 * 1024),
          "architecture-name": "x86_64",
          "board-name": "x86 Default string Default string",
          platform: "MikroTik",
        },
      ];
    }
    case "/rest/system/identity":
      return [{ name: "x86" }];
    case "/rest/system/clock":
      return clock(nowMs);
    case "/rest/system/health":
      return [];
    case "/rest/system/routerboard":
      return [
        {
          routerboard: "true",
          model: "Default string",
          "board-name": "Default string",
          "current-firmware": "7.16.2",
        },
      ];
    case "/rest/interface":
      return interfaces(nowMs);
    case "/rest/interface/ethernet":
      return [
        { ".id": "*1", name: "ether0", speed: "1Gbps", "full-duplex": "true", disabled: "false" },
        { ".id": "*2", name: "ether1", speed: "1Gbps", "full-duplex": "true", disabled: "false" },
        { ".id": "*3", name: "ether2", speed: "1Gbps", "full-duplex": "true", disabled: "false" },
        { ".id": "*4", name: "ether3", speed: "1Gbps", "full-duplex": "true", disabled: "false" },
        { ".id": "*5", name: "ether4", speed: "1Gbps", "full-duplex": "true", disabled: "false" },
      ];
    case "/rest/interface/bridge":
      return [{ ".id": "*A", name: "bridge1", running: "true", disabled: "false", comment: "局域网" }];
    case "/rest/interface/bridge/port":
      return [
        { ".id": "*1", bridge: "bridge1", interface: "ether1", disabled: "false" },
        { ".id": "*2", bridge: "bridge1", interface: "ether2", disabled: "false" },
        { ".id": "*3", bridge: "bridge1", interface: "ether3", disabled: "false" },
        { ".id": "*4", bridge: "bridge1", interface: "ether4", disabled: "false" },
      ];
    case "/rest/interface/list":
      return [
        { ".id": "*1", name: "WAN" },
        { ".id": "*2", name: "LAN" },
      ];
    case "/rest/interface/list/member":
      return [
        { ".id": "*1", list: "WAN", interface: "liantong", dynamic: "false", disabled: "false" },
        { ".id": "*2", list: "WAN", interface: "ether0", dynamic: "false", disabled: "false" },
        { ".id": "*3", list: "LAN", interface: "bridge1", dynamic: "false", disabled: "false" },
      ];
    case "/rest/interface/pppoe-client":
      return [
        {
          ".id": "*1",
          name: "liantong",
          interface: "ether0",
          user: "demo@liantong",
          password: "demo-should-not-leak",
          "add-default-route": "true",
          running: "true",
          disabled: "false",
          comment: "联通",
        },
      ];
    case "/rest/interface/wireguard":
      return [
        {
          ".id": "*C",
          name: "wg0",
          "listen-port": "51820",
          "public-key": "demoPublicKey0123456789abcdef",
          "private-key": "demo-private-key-should-not-leak",
          mtu: "1420",
          running: "true",
          disabled: "false",
          comment: "远程",
        },
      ];
    case "/rest/interface/wireguard/peers":
      return [
        {
          ".id": "*1",
          interface: "wg0",
          comment: "手机",
          "public-key": "peerPhoneKey0123456789abcdefAAA",
          "preshared-key": "demo-preshared-should-not-leak",
          "endpoint-address": "203.0.113.20",
          "endpoint-port": "51820",
          "current-endpoint-address": "203.0.113.20",
          "current-endpoint-port": "51820",
          "allowed-address": "10.8.0.2/32",
          "last-handshake": "42s",
          rx: "18200331",
          tx: "8022110",
          disabled: "false",
        },
        {
          ".id": "*2",
          interface: "wg0",
          comment: "办公室",
          "public-key": "peerOfficeKey0123456789abcdefBBB",
          "allowed-address": "10.8.0.3/32",
          "last-handshake": "2d3h",
          "endpoint-address": "203.0.113.30",
          "endpoint-port": "51820",
          rx: "99122",
          tx: "44120",
          disabled: "false",
        },
      ];
    case "/rest/ip/address":
      return [
        {
          ".id": "*1",
          address: "203.0.113.10/32",
          network: "203.0.113.10",
          interface: "liantong",
          dynamic: "true",
          disabled: "false",
          invalid: "false",
        },
        {
          ".id": "*2",
          address: "192.168.2.1/24",
          network: "192.168.2.0",
          interface: "bridge1",
          dynamic: "false",
          disabled: "false",
          invalid: "false",
          comment: "局域网",
        },
        {
          ".id": "*3",
          address: "10.8.0.1/24",
          network: "10.8.0.0",
          interface: "wg0",
          dynamic: "false",
          disabled: "false",
          invalid: "false",
        },
      ];
    case "/rest/ip/arp":
      return [
        { ".id": "*1", address: "192.168.2.21", "mac-address": "02:00:5E:10:00:21", interface: "bridge1", status: "reachable", dynamic: "true" },
        { ".id": "*2", address: "192.168.2.22", "mac-address": "02:00:5E:10:00:22", interface: "bridge1", status: "reachable", dynamic: "true" },
        { ".id": "*3", address: "192.168.2.30", "mac-address": "02:00:5E:10:00:30", interface: "bridge1", status: "stale", dynamic: "true" },
        { ".id": "*4", address: "192.168.2.40", "mac-address": "02:00:5E:10:00:40", interface: "bridge1", status: "reachable", dynamic: "true" },
        { ".id": "*5", address: "192.168.2.51", "mac-address": "02:00:5E:10:00:51", interface: "bridge1", status: "failed", dynamic: "true" },
      ];
    case "/rest/ip/dhcp-server/lease":
      return [
        lease("*1", "192.168.2.21", "02:00:5E:10:00:21", "客厅电视", "bound", "8s", "18h22m"),
        lease("*2", "192.168.2.22", "02:00:5E:10:00:22", "书房电脑", "bound", "21s", "9h4m"),
        lease("*3", "192.168.2.23", "02:00:5E:10:00:23", "iPhone", "bound", "1m12s", "5h40m"),
        lease("*4", "192.168.2.24", "02:00:5E:10:00:24", "nas", "bound", "4m", "22h10m", "存储"),
        lease("*5", "192.168.2.25", "02:00:5E:10:00:25", "客厅摄像头", "bound", "33s", "11h"),
        lease("*6", "192.168.2.26", "02:00:5E:10:00:26", "打印机", "waiting", "never", ""),
        lease("*7", "192.168.2.30", "02:00:5E:10:00:30", "客房平板", "bound", "2h", "1h12m"),
        lease("*8", "192.168.2.51", "02:00:5E:10:00:51", "旧笔记本", "waiting", "3d", ""),
      ];
    case "/rest/ip/firewall/filter":
      return [
        rule("*1", "input", "accept", "放行已建立、相关和未跟踪的连接", { "connection-state": "established,related,untracked" }, "8122331", "19021"),
        rule("*2", "input", "drop", "丢弃无效连接", { "connection-state": "invalid" }, "1201", "40"),
        rule("*3", "input", "accept", "允许局域网管理", { "in-interface-list": "LAN" }, "220031", "8800"),
        rule("*4", "input", "drop", "丢弃其它入站", {}, "44012", "2100"),
        rule("*5", "forward", "fasttrack-connection", "快速跟踪已建立和相关连接", { "connection-state": "established,related", "hw-offload": "true" }, "991200331", "420044"),
        rule("*6", "forward", "accept", "放行已建立和相关连接", { "connection-state": "established,related" }, "120044", "833"),
        rule("*7", "forward", "drop", "丢弃无效转发", { "connection-state": "invalid" }, "88", "12"),
        rule("*8", "forward", "drop", "外网未经目的转换的新连接丢弃", { "connection-state": "new", "connection-nat-state": "!dstnat", "in-interface-list": "WAN" }, "66210", "5400"),
        rule("*9", "forward", "accept", "允许局域网向外", { "in-interface-list": "LAN" }, "330012", "12040"),
        rule("*A", "forward", "drop", "丢弃其它转发", {}, "12", "4"),
        rule("*B", "output", "accept", "本机发出的流量", {}, "10220", "880", true),
      ];
    case "/rest/ip/route":
      return [
        {
          ".id": "*1",
          "dst-address": "0.0.0.0/0",
          gateway: "liantong",
          distance: "1",
          scope: "30",
          "target-scope": "10",
          "routing-table": "main",
          active: "true",
          dynamic: "true",
          static: "false",
          connect: "false",
          disabled: "false",
          comment: "PPPoE 默认路由",
        },
        {
          ".id": "*2",
          "dst-address": "192.168.2.0/24",
          gateway: "bridge1",
          distance: "0",
          "routing-table": "main",
          active: "true",
          dynamic: "true",
          static: "false",
          connect: "true",
          disabled: "false",
        },
        {
          ".id": "*3",
          "dst-address": "203.0.113.10/32",
          gateway: "liantong",
          distance: "0",
          "routing-table": "main",
          active: "true",
          dynamic: "true",
          connect: "true",
          static: "false",
          disabled: "false",
        },
        {
          ".id": "*4",
          "dst-address": "10.8.0.0/24",
          gateway: "wg0",
          distance: "0",
          "routing-table": "main",
          active: "true",
          connect: "true",
          dynamic: "true",
          static: "false",
          disabled: "false",
        },
        {
          ".id": "*5",
          "dst-address": "198.51.100.0/24",
          gateway: "192.0.2.1",
          distance: "20",
          "routing-table": "main",
          active: "false",
          dynamic: "false",
          static: "true",
          connect: "false",
          disabled: "true",
          comment: "备用，已禁用",
        },
      ];
    default:
      return null;
  }
}

function lease(id, address, mac, host, status, lastSeen, expires, comment = "") {
  const bound = status === "bound";
  return {
    ".id": id,
    address,
    "mac-address": mac,
    "host-name": host,
    server: "dhcp1",
    status,
    "expires-after": expires,
    "last-seen": lastSeen,
    "active-address": bound ? address : "",
    "active-mac-address": bound ? mac : "",
    comment,
    disabled: "false",
    dynamic: host === "打印机" ? "false" : "true",
    blocked: "false",
  };
}

function rule(id, chain, action, comment, extra, bytes, packets, disabled = false) {
  return {
    ".id": id,
    chain,
    action,
    comment,
    disabled: disabled ? "true" : "false",
    invalid: "false",
    dynamic: "false",
    bytes,
    packets,
    ...extra,
  };
}
