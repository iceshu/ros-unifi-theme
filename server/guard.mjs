import os from "node:os";

/**
 * Lockout guards: before a write is forwarded, refuse changes that would cut
 * this dashboard off from the router (the address/interface/service/account it
 * uses), and ask for confirmation for changes that may cut other access.
 *
 * Returns { block } (refused outright, 409 lockout), { confirm } (409
 * confirm_required until the client resends with X-Rut-Confirm: 1) or null.
 */

const truthy = (value) => value === "true" || value === "yes";
const hostOf = (cidr) => String(cidr || "").split("/")[0];
const macKey = (mac) => String(mac || "").replace(/[^0-9a-f]/gi, "").toLowerCase();

function localAddresses() {
  const out = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) if (item.family === "IPv4" && !item.internal) out.add(item.address);
  }
  return out;
}

/**
 * @param {{ env: Record<string, string | undefined>, read: (session: object, path: string) => Promise<unknown> }} deps
 */
export function createGuard({ env, read }) {
  let routerHost = "192.168.2.1";
  let scheme = "http:";
  try {
    const url = new URL(/^https?:\/\//i.test(env.ROUTEROS_HOST || "") ? env.ROUTEROS_HOST : `http://${env.ROUTEROS_HOST || "192.168.2.1"}`);
    routerHost = url.hostname;
    scheme = url.protocol;
  } catch {
    /* normalizeRouterHost reports bad hosts elsewhere */
  }
  const list = async (session, path) => {
    try {
      const value = await read(session, path);
      return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    } catch {
      return [];
    }
  };

  /** Interfaces this dashboard depends on: the one holding ROUTEROS_HOST and the port our host is learned on. */
  async function managementPath(session) {
    const [addresses, ports, hosts, arp] = await Promise.all([
      list(session, "/rest/ip/address"),
      list(session, "/rest/interface/bridge/port"),
      list(session, "/rest/interface/bridge/host"),
      list(session, "/rest/ip/arp"),
    ]);
    const mgmtAddress = addresses.find((row) => hostOf(row.address) === routerHost);
    const mgmtInterface = mgmtAddress?.interface || "";
    const mine = localAddresses();
    const myMacs = new Set(arp.filter((row) => mine.has(row.address)).map((row) => macKey(row["mac-address"])));
    const myPorts = new Set(
      hosts.filter((row) => myMacs.has(macKey(row["mac-address"])) && row.local !== "true").map((row) => row["on-interface"]).filter(Boolean),
    );
    // The bridge the management address sits on carries us through its member ports.
    const bridgeOfMgmt = ports.some((row) => row.bridge === mgmtInterface) ? mgmtInterface : "";
    return { mgmtAddress, mgmtInterface, myPorts, bridgeOfMgmt, ports };
  }

  const findById = (rows, id) => rows.find((row) => row[".id"] === id);
  const idOf = (pathname) => pathname.slice(pathname.lastIndexOf("/") + 1);

  return async function guard({ session, method, pathname, menu, op, fields }) {
    const removing = method === "DELETE";
    const disabling = truthy(fields?.disabled);

    if (menu === "/rest/interface" && (disabling || removing)) {
      const iface = findById(await list(session, "/rest/interface"), idOf(pathname));
      if (!iface) return null;
      const path = await managementPath(session);
      if (iface.name === path.mgmtInterface) {
        return { block: `${iface.name} 上有仪表连接路由器用的地址 ${routerHost}，禁用后页面会立刻失联，已拒绝。请在 WinBox 或串口里操作。` };
      }
      if (path.myPorts.has(iface.name)) {
        return { block: `运行仪表的这台主机通过 ${iface.name} 连接路由器，禁用后页面会立刻失联，已拒绝。` };
      }
      return null;
    }

    if (menu === "/rest/ip/address" && (removing || disabling || fields?.address !== undefined || fields?.interface !== undefined)) {
      const row = findById(await list(session, "/rest/ip/address"), idOf(pathname));
      if (row && hostOf(row.address) === routerHost) {
        return { block: `${row.address} 是仪表连接路由器用的地址，删除、禁用或修改后页面会立刻失联，已拒绝。` };
      }
      return null;
    }

    if (menu === "/rest/interface/bridge/port" && (removing || disabling || fields?.bridge !== undefined || fields?.interface !== undefined)) {
      const path = await managementPath(session);
      const row = findById(path.ports, idOf(pathname));
      if (row && path.myPorts.has(row.interface) && row.bridge === path.bridgeOfMgmt) {
        return { block: `运行仪表的主机通过 ${row.interface} 接入 ${row.bridge}，移出或禁用这个桥端口会让页面失联，已拒绝。` };
      }
      return null;
    }

    if ((menu === "/rest/interface/bridge" || menu === "/rest/interface/vlan") && (removing || disabling)) {
      const rows = await list(session, menu);
      const row = findById(rows, idOf(pathname));
      const path = await managementPath(session);
      if (row && row.name === path.mgmtInterface) {
        return { block: `${row.name} 承载着仪表连接路由器用的地址 ${routerHost}，已拒绝。` };
      }
      return null;
    }

    if (menu === "/rest/ip/service" && op === "update") {
      const row = findById(await list(session, "/rest/ip/service"), idOf(pathname));
      const ours = scheme === "https:" ? "www-ssl" : "www";
      if (row?.name === ours && (disabling || fields?.port !== undefined)) {
        return { block: `仪表正通过 ${ours} 服务访问路由器，禁用它或改端口会让页面失联，已拒绝。` };
      }
      if (row?.name === ours && fields?.address !== undefined) {
        return { confirm: `你在修改 ${ours} 的允许访问地址。如果不包含运行仪表的这台主机，页面会失联。确定继续？` };
      }
      return null;
    }

    if (menu === "/rest/ip/firewall/filter") {
      if (op === "create" && fields?.chain === "input" && ["drop", "reject", "tarpit"].includes(fields?.action)) {
        return { confirm: "新增 input 链的丢弃规则可能挡住你自己对路由器的访问（包括这个页面）。确定继续？" };
      }
      if (removing || disabling) {
        const row = findById(await list(session, "/rest/ip/firewall/filter"), idOf(pathname));
        if (row?.chain === "input" && row.action === "accept") {
          return { confirm: `这条 input 链放行规则（${row.comment || "未命名"}）可能正是你访问路由器的通道，删除或禁用后可能失联。确定继续？` };
        }
      }
      return null;
    }

    if (menu === "/rest/ip/route" && (removing || disabling)) {
      const row = findById(await list(session, "/rest/ip/route"), idOf(pathname));
      if (row?.["dst-address"] === "0.0.0.0/0") return { confirm: "这是默认路由，删除或禁用后局域网将无法上网。确定继续？" };
      return null;
    }

    if (menu === "/rest/user") {
      const row = findById(await list(session, "/rest/user"), idOf(pathname));
      if (row?.name === session.user && (removing || disabling || fields?.group !== undefined || fields?.name !== undefined || fields?.address !== undefined)) {
        return { block: "不能删除、禁用或修改当前登录的账号（包括它的组和允许地址），否则会被立刻登出。请换一个账号操作。" };
      }
      return null;
    }

    if (menu === "/rest/user/group" && (removing || fields?.policy !== undefined || fields?.name !== undefined)) {
      const row = findById(await list(session, "/rest/user/group"), idOf(pathname));
      if (row && row.name === session.group) {
        return { block: `当前登录的账号属于组 ${row.name}，修改或删除它可能让你失去权限，已拒绝。请换一个账号操作。` };
      }
      return null;
    }

    return null;
  };
}
