import { createRouter } from "@solidjs/router";
import { AddressListsPage } from "./pages/AddressLists";
import { ConnectionPage } from "./pages/Connection";
import { DevicesPage } from "./pages/Devices";
import { DhcpPage } from "./pages/Dhcp";
import { DnsPage } from "./pages/Dns";
import { FirewallPage } from "./pages/Firewall";
import { InterfacesPage } from "./pages/Interfaces";
import { NatPage } from "./pages/Nat";
import { NotFoundPage } from "./pages/NotFound";
import { OverviewPage } from "./pages/Overview";
import { PortForwardPage } from "./pages/PortForward";
import { QueuesPage } from "./pages/Queues";
import { LogPage, NeighborsPage } from "./pages/ReadPages";
import { RoutesPage } from "./pages/Routes";
import { TopologyPage } from "./pages/Topology";
import { WifiPage } from "./pages/Wifi";
import { WireGuardPage } from "./pages/WireGuard";

export const Router = createRouter({
  routes: [
    { path: "/", component: OverviewPage },
    { path: "/topology", component: TopologyPage },
    { path: "/devices", component: DevicesPage },
    { path: "/interfaces", component: InterfacesPage },
    { path: "/firewall", component: FirewallPage },
    { path: "/port-forwarding", component: PortForwardPage },
    { path: "/nat", component: NatPage },
    { path: "/address-lists", component: AddressListsPage },
    { path: "/routes", component: RoutesPage },
    { path: "/wireguard", component: WireGuardPage },
    { path: "/connection", component: ConnectionPage },
    { path: "/dhcp", component: DhcpPage },
    { path: "/dns", component: DnsPage },
    { path: "/neighbors", component: NeighborsPage },
    { path: "/queues", component: QueuesPage },
    { path: "/wifi", component: WifiPage },
    { path: "/log", component: LogPage },
    { path: "*404", component: NotFoundPage },
  ],
});
