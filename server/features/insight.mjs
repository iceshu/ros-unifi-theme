import { buildIpAppMap, classifyDomain, classifyPort, isPrivateIp } from "../../shared/apps.mjs";
import { registerDemo } from "../demo.mjs";

/* ───────── Demo data ───────── */

// Security-related menus (services, users and package update demo data come from their owning features)
registerDemo("/rest/tool/mac-server", () => [{ ".id": "*1", "allowed-interface-list": "all" }]);
registerDemo("/rest/tool/mac-server/mac-winbox", () => [{ ".id": "*1", "allowed-interface-list": "all" }]);
registerDemo("/rest/ip/neighbor/discovery-settings", () => [{ ".id": "*1", "discover-interface-list": "all" }]);
registerDemo("/rest/tool/bandwidth-server", () => [{ ".id": "*1", enabled: "false", authenticate: "true" }]);
registerDemo("/rest/ip/upnp", () => [{ ".id": "*1", enabled: "false" }]);
registerDemo("/rest/snmp", () => [{ ".id": "*1", enabled: "true", contact: "", location: "" }]);
registerDemo("/rest/snmp/community", () => [
  { ".id": "*1", name: "public", addresses: "0.0.0.0/0", security: "none", "read-access": "true", "write-access": "false" },
]);
registerDemo("/rest/ip/proxy", () => [{ ".id": "*1", enabled: "false" }]);
registerDemo("/rest/ip/socks", () => [{ ".id": "*1", enabled: "false" }]);

// DNS cache entries mapping demo connection IPs to known app domains
registerDemo("/rest/ip/dns/cache", () => [
  { ".id": "*DC1", name: "cdn.bilibili.com", type: "A", address: "203.0.113.50", ttl: "300" },
  { ".id": "*DC2", name: "weixin.qq.com", type: "A", address: "203.0.113.51", ttl: "300" },
  { ".id": "*DC3", name: "dl.steam.clngaa.com", type: "CNAME", address: "steampowered.com", ttl: "300" },
  { ".id": "*DC4", name: "steampowered.com", type: "A", address: "203.0.113.60", ttl: "300" },
  { ".id": "*DC5", name: "api.weixin.qq.com", type: "CNAME", address: "weixin.qq.com", ttl: "300" },
  { ".id": "*DC6", name: "play.google.com", type: "A", address: "203.0.113.70", ttl: "300" },
  { ".id": "*DC7", name: "dns.quad9.net", type: "A", address: "9.9.9.9", ttl: "300" },
]);

/* ───────── Helpers ───────── */

const ADDR_RE = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]+|(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,})$/i;
const IFACE_RE = /^[a-z0-9][-a-z0-9]{0,19}$/i;

function validateAddress(value) {
  if (typeof value !== "string" || !value.trim()) return "地址不能为空";
  if (!ADDR_RE.test(value.trim())) return "地址格式不正确（需要 IPv4、IPv6 或主机名）";
  return null;
}

function validateInterface(value) {
  if (typeof value !== "string" || !value.trim()) return "接口不能为空";
  if (!IFACE_RE.test(value.trim())) return "接口名称格式不正确";
  return null;
}

async function safeGet(ctx, path) {
  try {
    return await ctx.router("GET", path);
  } catch {
    return null;
  }
}

function toRecord(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function str(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

/* ───────── Ping demo synthesis ───────── */

function demoPingResults(address, count) {
  const n = Math.min(10, Math.max(1, Number(count) || 4));
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    host: address,
    size: 64,
    time: `${(Math.round(10 + Math.random() * 20))}ms`,
    ttl: 55,
    status: "success",
  }));
}

function demoTracerouteResults(address) {
  return [
    { hop: 1, host: "192.168.2.1", time: "1ms" },
    { hop: 2, host: "10.0.0.1", time: "5ms" },
    { hop: 3, host: "119.98.1.1", time: "12ms" },
    { hop: 4, host: "202.97.0.1", time: "20ms" },
    { hop: 5, host: address, time: "35ms" },
  ];
}

function demoTorchResults(iface) {
  return [
    { src: "192.168.2.21", dst: "203.0.113.50", protocol: "tcp", "tx-rate": "2400000", "rx-rate": "18000000" },
    { src: "192.168.2.22", dst: "9.9.9.9", protocol: "udp", "tx-rate": "80000", "rx-rate": "90000" },
    { src: "192.168.2.24", dst: "203.0.113.60", protocol: "tcp", "tx-rate": "8000000", "rx-rate": "40000000" },
  ];
}

/* ───────── Apps aggregation ───────── */

function extractPort(addrWithPort) {
  const m = addrWithPort.match(/:(\d+)$/);
  return m ? Number(m[1]) : null;
}

function extractIp(addrWithPort) {
  if (!addrWithPort) return "";
  const colonIdx = addrWithPort.lastIndexOf(":");
  if (colonIdx < 0) return addrWithPort;
  const candidate = addrWithPort.slice(0, colonIdx);
  // avoid stripping from bare IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(addrWithPort)) return addrWithPort;
  return candidate || addrWithPort;
}

function computeApps(connections, dnsCache, leases) {
  const ipAppMap = buildIpAppMap(dnsCache);

  // Build IP → client name from leases
  const clientName = new Map();
  for (const lease of leases) {
    const ip = lease["active-address"] || lease.address;
    const name = lease["host-name"] || ip;
    if (ip) clientName.set(ip, name);
  }

  // cap at 5000
  const conns = connections.slice(0, 5000);

  // appName → { rate, bytes, clients: Map<clientIp, {rate,bytes}> }
  const apps = new Map();

  function getApp(name) {
    if (!apps.has(name)) apps.set(name, { rate: 0, bytes: 0, clients: new Map() });
    return apps.get(name);
  }

  function addToClient(app, clientIp, rate, bytes) {
    const existing = app.clients.get(clientIp);
    if (existing) {
      existing.rate += rate;
      existing.bytes += bytes;
    } else {
      app.clients.set(clientIp, { ip: clientIp, name: clientName.get(clientIp) || clientIp, rate, bytes });
    }
  }

  for (const conn of conns) {
    const srcFull = conn["src-address"] || "";
    const dstFull = conn["dst-address"] || "";
    const srcIp = extractIp(srcFull);
    const dstIp = extractIp(dstFull);
    const srcPort = extractPort(srcFull);
    const dstPort = extractPort(dstFull);

    // The LAN device is the private IP
    const clientIp = isPrivateIp(srcIp) ? srcIp : (isPrivateIp(dstIp) ? dstIp : srcIp);
    // The external IP to classify
    const externalIp = isPrivateIp(srcIp) ? dstIp : srcIp;
    const externalPort = isPrivateIp(srcIp) ? dstPort : srcPort;

    // Rate and bytes
    const origRate = Number(conn["orig-rate"] || 0);
    const replRate = Number(conn["repl-rate"] || 0);
    const rate = origRate + replRate;
    const origBytes = Number(conn["orig-bytes"] || 0);
    const replBytes = Number(conn["repl-bytes"] || 0);
    const bytes = origBytes + replBytes;

    // Classify
    let appName = ipAppMap.get(externalIp);
    if (!appName) appName = classifyPort(externalPort) ?? "其他";

    const app = getApp(appName);
    app.rate += rate;
    app.bytes += bytes;
    addToClient(app, clientIp, rate, bytes);
  }

  // Sort by rate desc, return array
  return [...apps.entries()]
    .sort((a, b) => b[1].rate - a[1].rate)
    .map(([name, data]) => ({
      name,
      rate: data.rate,
      bytes: data.bytes,
      clients: [...data.clients.values()].sort((a, b) => b.rate - a.rate),
    }));
}

/* ───────── Security checks ───────── */

function computeSecurity(services, users, filterRules, dns, macServer, macWinbox, neighborSettings, bwServer, upnp, snmp, snmpCommunities, updateInfo, proxy, socks) {
  const findings = [];

  // Services
  for (const svc of toArray(services)) {
    const name = str(svc.name);
    const disabled = svc.disabled === "true";
    const address = str(svc.address);
    if (disabled) continue;
    if (name === "telnet") {
      findings.push({
        id: "svc-telnet",
        severity: "critical",
        title: "Telnet 服务已启用",
        description: "Telnet 以明文传输凭据，存在严重安全风险。",
        fix: "/ip service disable telnet",
        link: "/services",
      });
    } else if (name === "ftp") {
      findings.push({
        id: "svc-ftp",
        severity: "critical",
        title: "FTP 服务已启用",
        description: "FTP 以明文传输凭据，存在严重安全风险。",
        fix: "/ip service disable ftp",
        link: "/services",
      });
    } else if ((name === "www" || name === "api") && !address) {
      findings.push({
        id: `svc-${name}-open`,
        severity: "warn",
        title: `${name === "www" ? "HTTP Web 界面" : "API（非 SSL）"}未限制访问地址`,
        description: `服务 "${name}" 已启用但未设置 address 限制，所有 IP 均可访问。`,
        fix: `/ip service set ${name} address=192.168.2.0/24`,
        link: "/services",
      });
    } else if (name === "winbox" && !address) {
      findings.push({
        id: "svc-winbox-open",
        severity: "warn",
        title: "Winbox 未限制访问地址",
        description: "Winbox 服务未设置 address 限制，所有 IP 均可访问。",
        fix: "/ip service set winbox address=192.168.2.0/24",
        link: "/services",
      });
    }
  }

  // Admin user
  for (const user of toArray(users)) {
    if (str(user.name) === "admin" && user.disabled !== "true") {
      findings.push({
        id: "user-admin",
        severity: "warn",
        title: "默认 admin 账号仍在使用",
        description: "默认 admin 账号是攻击者首选目标，建议改名或停用。",
        fix: "/user set admin name=myadmin   # 或 /user disable admin",
        link: "/users",
      });
    }
  }

  // Firewall: check for final input drop
  const inputRules = toArray(filterRules).filter((r) => r.chain === "input" && r.disabled !== "true");
  const hasInputDrop = inputRules.some((r) => r.action === "drop" && !r["in-interface"] && !r["in-interface-list"]);
  if (!hasInputDrop) {
    findings.push({
      id: "fw-no-input-drop",
      severity: "warn",
      title: "input 链缺少最终丢弃规则",
      description: "未发现能覆盖 WAN 入站的 drop 规则，外部流量可能进入路由器。",
      fix: "/ip firewall filter add chain=input action=drop comment=\"丢弃其它入站\"",
      link: "/firewall",
    });
  }

  // DNS remote requests
  const dnsRec = toRecord(dns);
  if (dnsRec && dnsRec["allow-remote-requests"] === "true") {
    // Check if there's a port-53 specific drop from WAN
    const hasPort53Drop = inputRules.some((r) => r.action === "drop" && (r.protocol === "udp" || r.protocol === "tcp") && (r.port === "53" || r["dst-port"] === "53") && (r["in-interface-list"] === "WAN" || r["in-interface-list"] === "!LAN"));
    if (!hasPort53Drop) {
      findings.push({
        id: "dns-remote",
        severity: "warn",
        title: "DNS 允许来自任意地址的查询",
        description: "allow-remote-requests 已开启，建议在 input 链中丢弃来自 WAN 的 UDP/TCP 53 端口请求。",
        fix: "/ip firewall filter add chain=input protocol=udp dst-port=53 in-interface-list=WAN action=drop",
        link: "/firewall",
      });
    }
  }

  // MAC server
  const macRec = toRecord(macServer);
  if (macRec && str(macRec["allowed-interface-list"]).toLowerCase() === "all") {
    findings.push({
      id: "mac-server-all",
      severity: "warn",
      title: "MAC Server 在所有接口开放",
      description: "MAC Server 允许通过 MAC 地址管理路由器，建议限制为 LAN。",
      fix: "/tool mac-server set allowed-interface-list=LAN",
    });
  }

  const macWinboxRec = toRecord(macWinbox);
  if (macWinboxRec && str(macWinboxRec["allowed-interface-list"]).toLowerCase() === "all") {
    findings.push({
      id: "mac-winbox-all",
      severity: "warn",
      title: "MAC Winbox 在所有接口开放",
      description: "MAC Winbox 在所有接口可用，建议限制为 LAN。",
      fix: "/tool mac-server mac-winbox set allowed-interface-list=LAN",
    });
  }

  // Neighbor discovery
  const neighborRec = toRecord(neighborSettings);
  if (neighborRec && str(neighborRec["discover-interface-list"]).toLowerCase() === "all") {
    findings.push({
      id: "neighbor-all",
      severity: "warn",
      title: "邻居发现协议（CDP/LLDP）在所有接口运行",
      description: "邻居发现可能向 WAN 侧泄露设备信息，建议限制为 LAN。",
      fix: "/ip neighbor discovery-settings set discover-interface-list=LAN",
    });
  }

  // Bandwidth server
  const bwRec = toRecord(bwServer);
  if (bwRec && bwRec.enabled === "true") {
    findings.push({
      id: "bw-server",
      severity: "warn",
      title: "带宽测试服务器已启用",
      description: "带宽测试服务器可被滥用进行带宽压测，建议关闭。",
      fix: "/tool bandwidth-server set enabled=no",
    });
  }

  // UPnP
  const upnpRec = toRecord(upnp);
  if (upnpRec && upnpRec.enabled === "true") {
    findings.push({
      id: "upnp",
      severity: "warn",
      title: "UPnP 已启用",
      description: "UPnP 允许局域网设备自动开放端口，可能被恶意软件利用。",
      fix: "/ip upnp set enabled=no",
    });
  }

  // SNMP
  const snmpRec = toRecord(snmp);
  if (snmpRec && snmpRec.enabled === "true") {
    const hasPublicCommunity = toArray(snmpCommunities).some((c) => str(c.name).toLowerCase() === "public");
    if (hasPublicCommunity) {
      findings.push({
        id: "snmp-public",
        severity: "critical",
        title: "SNMP 使用默认 public 团体字符串",
        description: "SNMP community 名为 'public' 时，任何人都可以读取路由器配置，存在严重安全风险。",
        fix: "/snmp community set public name=mysecret",
      });
    } else {
      findings.push({
        id: "snmp-enabled",
        severity: "info",
        title: "SNMP 已启用",
        description: "SNMP 已启用，请确认团体字符串已更改并限制访问地址。",
        fix: "/snmp set enabled=no   # 若不需要可关闭",
      });
    }
  }

  // Update available
  const updateRec = toRecord(updateInfo);
  if (updateRec && updateRec["latest-version"] && updateRec["installed-version"] !== updateRec["latest-version"]) {
    findings.push({
      id: "update-available",
      severity: "info",
      title: `RouterOS 有新版本可用（${updateRec["latest-version"]}）`,
      description: `当前版本 ${updateRec["installed-version"]}，最新版 ${updateRec["latest-version"]}，建议升级以获取安全补丁。`,
      fix: "/system package update install",
      link: "/updates",
    });
  }

  // Proxy
  const proxyRec = toRecord(proxy);
  if (proxyRec && proxyRec.enabled === "true") {
    findings.push({
      id: "proxy",
      severity: "warn",
      title: "HTTP 代理已启用",
      description: "RouterOS HTTP 代理若无身份验证，可被内外网设备滥用。",
      fix: "/ip proxy set enabled=no",
    });
  }

  // SOCKS
  const socksRec = toRecord(socks);
  if (socksRec && socksRec.enabled === "true") {
    findings.push({
      id: "socks",
      severity: "warn",
      title: "SOCKS 代理已启用",
      description: "SOCKS 代理若无身份验证，可被滥用作为跳板。",
      fix: "/ip socks set enabled=no",
    });
  }

  // Score: start at 100, deduct per severity
  const deduction = findings.reduce((sum, f) => {
    if (f.severity === "critical") return sum + 15;
    if (f.severity === "warn") return sum + 7;
    return sum + 3;
  }, 0);
  const score = Math.max(0, 100 - deduction);

  return { findings, score };
}

/* ───────── Feature module ───────── */

export function create() {
  return {
    reads: [
      "/rest/ip/service",
      "/rest/user",
      "/rest/tool/mac-server",
      "/rest/tool/mac-server/mac-winbox",
      "/rest/ip/neighbor/discovery-settings",
      "/rest/tool/bandwidth-server",
      "/rest/ip/upnp",
      "/rest/snmp",
      "/rest/snmp/community",
      "/rest/system/package/update",
      "/rest/ip/proxy",
      "/rest/ip/socks",
      "/rest/ip/dns/cache",
    ],

    routes: [
      /* ── Ping ── */
      {
        method: "POST",
        path: "/api/tools/ping",
        policy: "test",
        async handle(ctx) {
          const { address, count = 4, size, interface: iface } = ctx.body;
          const addrErr = validateAddress(address);
          if (addrErr) { ctx.send(400, { code: "bad_input", message: addrErr }); return; }
          const n = Number(count);
          if (!Number.isInteger(n) || n < 1 || n > 10) { ctx.send(400, { code: "bad_input", message: "count 必须在 1–10 之间" }); return; }
          if (size !== undefined) {
            const s = Number(size);
            if (!Number.isInteger(s) || s < 1 || s > 65507) { ctx.send(400, { code: "bad_input", message: "size 必须在 1–65507 之间" }); return; }
          }
          if (iface !== undefined && validateInterface(iface)) { ctx.send(400, { code: "bad_input", message: "接口名称格式不正确" }); return; }

          if (ctx.demo) {
            ctx.send(200, { results: demoPingResults(address.trim(), n) });
            return;
          }
          try {
            const body = { address: address.trim(), count: String(n) };
            if (size !== undefined) body.size = String(size);
            if (iface) body.interface = iface;
            const raw = await ctx.router("POST", "/rest/ping", body);
            ctx.send(200, { results: toArray(raw) });
          } catch (err) {
            if (/permission|not enough|not allowed/i.test(err.message)) {
              ctx.send(403, { code: "forbidden", message: "当前账号缺少 test 权限，无法执行 ping。" });
            } else {
              ctx.send(err.status || 500, { code: err.code || "router_error", message: err.message });
            }
          }
        },
      },

      /* ── Traceroute ── */
      {
        method: "POST",
        path: "/api/tools/traceroute",
        policy: "test",
        async handle(ctx) {
          const { address } = ctx.body;
          const addrErr = validateAddress(address);
          if (addrErr) { ctx.send(400, { code: "bad_input", message: addrErr }); return; }

          if (ctx.demo) {
            ctx.send(200, { hops: demoTracerouteResults(address.trim()) });
            return;
          }
          try {
            const raw = await ctx.router("POST", "/rest/tool/traceroute", { address: address.trim(), count: "1" });
            ctx.send(200, { hops: toArray(raw) });
          } catch (err) {
            if (/permission|not enough|not allowed/i.test(err.message)) {
              ctx.send(403, { code: "forbidden", message: "当前账号缺少 test 权限，无法执行 traceroute。" });
            } else {
              ctx.send(err.status || 500, { code: err.code || "router_error", message: err.message });
            }
          }
        },
      },

      /* ── Torch ── */
      {
        method: "POST",
        path: "/api/tools/torch",
        policy: "test",
        async handle(ctx) {
          const { interface: iface, duration = 3 } = ctx.body;
          const ifaceErr = validateInterface(iface);
          if (ifaceErr) { ctx.send(400, { code: "bad_input", message: ifaceErr }); return; }
          const dur = Math.min(10, Math.max(1, Number(duration) || 3));

          if (ctx.demo) {
            ctx.send(200, { flows: demoTorchResults(iface) });
            return;
          }
          try {
            const raw = await ctx.router("POST", "/rest/tool/torch", { interface: iface, duration: `${dur}s`, "ip-protocol": "any" });
            ctx.send(200, { flows: toArray(raw) });
          } catch (err) {
            if (/permission|not enough|not allowed/i.test(err.message)) {
              ctx.send(403, { code: "forbidden", message: "当前账号缺少 test 权限，无法执行 torch。" });
            } else {
              ctx.send(err.status || 500, { code: err.code || "router_error", message: err.message });
            }
          }
        },
      },

      /* ── Apps ── */
      {
        method: "GET",
        path: "/api/apps",
        async handle(ctx) {
          const [connections, dnsCache, leases] = await Promise.all([
            safeGet(ctx, "/rest/ip/firewall/connection"),
            safeGet(ctx, "/rest/ip/dns/cache"),
            safeGet(ctx, "/rest/ip/dhcp-server/lease"),
          ]);
          const apps = computeApps(toArray(connections), toArray(dnsCache), toArray(leases));
          ctx.send(200, { apps });
        },
      },

      /* ── Security ── */
      {
        method: "GET",
        path: "/api/security",
        async handle(ctx) {
          const [services, users, filterRules, dns, macServer, macWinbox, neighborSettings, bwServer, upnp, snmp, snmpCommunities, updateInfo, proxy, socks] = await Promise.all([
            safeGet(ctx, "/rest/ip/service"),
            safeGet(ctx, "/rest/user"),
            safeGet(ctx, "/rest/ip/firewall/filter"),
            safeGet(ctx, "/rest/ip/dns"),
            safeGet(ctx, "/rest/tool/mac-server"),
            safeGet(ctx, "/rest/tool/mac-server/mac-winbox"),
            safeGet(ctx, "/rest/ip/neighbor/discovery-settings"),
            safeGet(ctx, "/rest/tool/bandwidth-server"),
            safeGet(ctx, "/rest/ip/upnp"),
            safeGet(ctx, "/rest/snmp"),
            safeGet(ctx, "/rest/snmp/community"),
            safeGet(ctx, "/rest/system/package/update"),
            safeGet(ctx, "/rest/ip/proxy"),
            safeGet(ctx, "/rest/ip/socks"),
          ]);
          const result = computeSecurity(services, users, filterRules, dns, macServer, macWinbox, neighborSettings, bwServer, upnp, snmp, snmpCommunities, updateInfo, proxy, socks);
          ctx.send(200, result);
        },
      },
    ],
  };
}
