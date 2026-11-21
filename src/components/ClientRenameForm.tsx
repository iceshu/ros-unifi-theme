import { createSignal } from "solid-js";
import { ros } from "../lib/api";
import { runWrites } from "../lib/mutate";
import { useDashboard } from "../lib/store";
import { sameMac } from "../lib/topology";
import { Field, FormPanel, TextInput } from "./form";

/**
 * Sets the DHCP lease comment (shown as the device name).
 * If the client has no lease, creates a static lease with its IP+MAC.
 */
export function ClientRenameForm(props: {
  ip: string;
  mac: string;
  currentName: string;
  onClose: () => void;
}) {
  const dash = useDashboard();
  const [name, setName] = createSignal(props.currentName);

  const lease = () => dash.leases().find((l) => sameMac(l["mac-address"], props.mac) || (!!props.ip && l.address === props.ip));

  const submit = async () => {
    const existing = lease();
    if (existing) {
      return runWrites(dash, "已重命名", [() => ros.update("/rest/ip/dhcp-server/lease", existing[".id"], { comment: name() })]);
    }
    // No lease — create static lease. Find server whose interface matches or pick first.
    const servers = dash.dhcpServers();
    const arpEntry = dash.arp().find((a) => a.address === props.ip);
    const iface = arpEntry?.interface || "";
    const server = servers.find((s) => s.interface === iface) ?? servers[0];
    if (!server) {
      return runWrites(dash, "已重命名", [
        () => ros.create("/rest/ip/dhcp-server/lease", {
          address: props.ip,
          "mac-address": props.mac,
          comment: name(),
        }),
      ]);
    }
    return runWrites(dash, "已重命名", [
      () => ros.create("/rest/ip/dhcp-server/lease", {
        address: props.ip,
        "mac-address": props.mac,
        server: server.name,
        comment: name(),
      }),
    ]);
  };

  return (
    <FormPanel title="重命名设备" subtitle="修改 DHCP 注释，作为设备显示名称" onClose={props.onClose} onSubmit={submit}>
      <Field label="设备名称" required>
        <TextInput value={name()} onInput={setName} placeholder="我的电脑" />
      </Field>
    </FormPanel>
  );
}
