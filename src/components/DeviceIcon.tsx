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
import { dynamic } from "@solidjs/web";
import type { DeviceKind } from "../lib/model";

const ICONS: Record<DeviceKind, typeof Wifi> = {
  phone: Smartphone,
  laptop: Laptop,
  server: Server,
  nas: HardDrive,
  ap: Wifi,
  camera: Video,
  tv: Tv,
  console: Gamepad2,
  speaker: Speaker,
  printer: Printer,
  generic: CircleHelp,
};

export const KIND_LABELS: Record<DeviceKind, string> = {
  phone: "手机 / 平板",
  laptop: "笔记本",
  server: "服务器",
  nas: "网络存储",
  ap: "无线接入点",
  camera: "摄像头",
  tv: "电视",
  console: "游戏主机",
  speaker: "音箱",
  printer: "打印机",
  generic: "其他设备",
};

/** Bare glyph, for places that supply their own frame (topology nodes). */
export function DeviceGlyph(props: { kind: DeviceKind }) {
  const Icon = dynamic(() => ICONS[props.kind] ?? CircleHelp);
  return <Icon aria-hidden="true" />;
}

export function DeviceIcon(props: { kind: DeviceKind; online?: boolean }) {
  return (
    <span class="dev-icon">
      <DeviceGlyph kind={props.kind} />
      {props.online !== undefined ? <i class={`led ${props.online ? "led-good" : "led-muted"}`} /> : null}
    </span>
  );
}
