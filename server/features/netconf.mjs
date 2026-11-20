/** Network configuration feature: IP addresses, routes, VLANs, bridges, interface lists, PPPoE. */
export function create() {
  return {
    writes: {
      "/rest/ip/address": {
        create: ["address", "interface", "comment", "disabled"],
        update: ["address", "interface", "comment", "disabled"],
        remove: true,
      },
      "/rest/ip/route": {
        create: ["dst-address", "gateway", "distance", "routing-table", "comment", "disabled"],
        update: ["dst-address", "gateway", "distance", "routing-table", "comment", "disabled"],
        remove: true,
      },
      "/rest/interface/vlan": {
        create: ["name", "vlan-id", "interface", "mtu", "comment", "disabled"],
        update: ["name", "vlan-id", "interface", "mtu", "comment", "disabled"],
        remove: true,
      },
      "/rest/interface/bridge": {
        create: ["name", "comment", "protocol-mode", "disabled"],
        update: ["name", "comment", "protocol-mode", "disabled"],
        remove: true,
      },
      "/rest/interface/bridge/port": {
        create: ["bridge", "interface", "pvid", "comment", "disabled"],
        update: ["bridge", "interface", "pvid", "comment", "disabled"],
        remove: true,
      },
      "/rest/interface/list": {
        create: ["name", "comment"],
        update: ["name", "comment"],
        remove: true,
      },
      "/rest/interface/list/member": {
        create: ["list", "interface", "comment", "disabled"],
        update: ["list", "interface", "comment", "disabled"],
        remove: true,
      },
      "/rest/interface/pppoe-client": {
        create: ["name", "interface", "user", "password", "add-default-route", "use-peer-dns", "comment", "disabled"],
        update: ["name", "interface", "user", "password", "add-default-route", "use-peer-dns", "comment", "disabled"],
        remove: true,
      },
    },
  };
}
