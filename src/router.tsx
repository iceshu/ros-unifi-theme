import { createRouter } from "@solidjs/router";
import { ConnectionPage } from "./pages/Connection";
import { DevicesPage } from "./pages/Devices";
import { FirewallPage } from "./pages/Firewall";
import { InterfacesPage } from "./pages/Interfaces";
import { NotFoundPage } from "./pages/NotFound";
import { OverviewPage } from "./pages/Overview";
import { RoutesPage } from "./pages/Routes";
import { WireGuardPage } from "./pages/WireGuard";

export const Router = createRouter({
  routes: [
    { path: "/", component: OverviewPage },
    { path: "/devices", component: DevicesPage },
    { path: "/interfaces", component: InterfacesPage },
    { path: "/firewall", component: FirewallPage },
    { path: "/routes", component: RoutesPage },
    { path: "/wireguard", component: WireGuardPage },
    { path: "/connection", component: ConnectionPage },
    { path: "*404", component: NotFoundPage },
  ],
});
