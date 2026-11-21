export type Severity = "info" | "warn" | "critical";
export type ChannelType = "feishu" | "dingtalk" | "wecom" | "telegram" | "bark" | "ntfy" | "webhook";

export interface AlertEvent {
  id: number;
  t: number;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  resolved_t: number | null;
  acked: number;
}

export interface AlertChannel {
  type: ChannelType;
  name: string;
  enabled: boolean;
  minSeverity?: Severity;
  kinds?: string[];
  webhook?: string;
  signSecret?: string;
  botToken?: string;
  chatId?: string;
  serverUrl?: string;
  key?: string;
  topicUrl?: string;
  _lastSend?: { ok: boolean; t: number; error: string | null } | null;
}

export interface AlertRules {
  wanInterfaces: string[];
  monitorInterfaces: string[];
  wgStaleMins: number;
  cpuPercent: number;
  cpuDurationMins: number;
  memPercent: number;
  enableWan: boolean;
  enableIface: boolean;
  enableWg: boolean;
  enableCpu: boolean;
  enableMem: boolean;
  enableNewDevice: boolean;
  enableUpdate: boolean;
}

export interface AlertSettingsResponse {
  channels: AlertChannel[];
  rules: AlertRules;
}

export const KIND_LABELS: Record<string, string> = {
  wan: "WAN",
  iface: "接口",
  wg: "WireGuard",
  cpu: "CPU",
  mem: "内存",
  new_device: "新设备",
  update: "系统更新",
  backup: "备份",
  system: "系统",
  test: "测试",
};

export const SEV_LABELS: Record<Severity, string> = {
  info: "信息",
  warn: "警告",
  critical: "紧急",
};

export const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  feishu: "飞书",
  dingtalk: "钉钉",
  wecom: "企业微信群机器人",
  telegram: "Telegram",
  bark: "Bark",
  ntfy: "ntfy",
  webhook: "通用 Webhook",
};

export const ALL_KINDS = Object.keys(KIND_LABELS).filter((k) => k !== "test");

export const DEFAULT_RULES: AlertRules = {
  wanInterfaces: ["liantong", "ether0"],
  monitorInterfaces: [],
  wgStaleMins: 10,
  cpuPercent: 90,
  cpuDurationMins: 5,
  memPercent: 85,
  enableWan: true,
  enableIface: true,
  enableWg: true,
  enableCpu: true,
  enableMem: true,
  enableNewDevice: true,
  enableUpdate: true,
};
