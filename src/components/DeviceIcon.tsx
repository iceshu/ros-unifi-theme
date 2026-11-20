import {
  CircleHelp,
  Gamepad2,
  HardDrive,
  Laptop,
  Printer,
  Server,
  Smartphone,
  Speaker,
  Tv,
  Video,
  Wifi,
} from "@lucide/solid";
import type { DeviceKind } from "../lib/model";

export function DeviceIcon(props: { kind: DeviceKind }) {
  return (
    <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-muted">
      {props.kind === "phone" ? (
        <Smartphone class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "laptop" ? (
        <Laptop class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "server" ? (
        <Server class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "nas" ? (
        <HardDrive class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "ap" ? (
        <Wifi class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "camera" ? (
        <Video class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "tv" ? (
        <Tv class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "console" ? (
        <Gamepad2 class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "speaker" ? (
        <Speaker class="h-4 w-4" aria-hidden="true" />
      ) : props.kind === "printer" ? (
        <Printer class="h-4 w-4" aria-hidden="true" />
      ) : (
        <CircleHelp class="h-4 w-4" aria-hidden="true" />
      )}
    </span>
  );
}
