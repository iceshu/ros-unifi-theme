import { createRouter } from "@solidjs/router";
import { ConnectionPage } from "./pages/Connection";
import { DevicesPage } from "./pages/Devices";
import { FirewallPage } from "./pages/Firewall";
import { InterfacesPage } from "./pages/Interfaces";
import { NotFoundPage } from "./pages/NotFound";
import { OverviewPage } from "./pages/Overview";
import { RoutesPage } from "./pages/Routes";
import { TopologyPage } from "./pages/Topology";
import { WireGuardPage } from "./pages/WireGuard";

import { NatPage, AddressListsPage, DhcpPage, DnsPage, NeighborsPage, QueuesPage, WifiPage, LogPage } from "./pages/ReadPages";

export const Router = createRouter({
  routes: [
    { path: "/", component: OverviewPage },
    { path: "/topology", component: TopologyPage },
    { path: "/devices", component: DevicesPage },
    { path: "/interfaces", component: InterfacesPage },
    { path: "/firewall", component: FirewallPage },
    { path: "/routes", component: RoutesPage },
    { path: "/wireguard", component: WireGuardPage },
    { path: "/connection", component: ConnectionPage },
    { path: "/nat", component: NatPage },
    { path: "/address-lists", component: AddressListsPage },
    { path: "/dhcp", component: DhcpPage },
    { path: "/dns", component: DnsPage },
    { path: "/neighbors", component: NeighborsPage },
    { path: "/queues", component: QueuesPage },
    { path: "/wifi", component: WifiPage },
    { path: "/log", component: LogPage },
    { path: "*404", component: NotFoundPage },
  ],
});
