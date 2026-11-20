/** Feature module: system services, scheduler, scripts, clock, NTP. */
import { registerDemo } from "../demo.mjs";

const DEMO_SERVICES = [
  { ".id": "*1", name: "telnet", port: "23", address: "", disabled: "true" },
  { ".id": "*2", name: "ftp", port: "21", address: "", disabled: "true" },
  { ".id": "*3", name: "www", port: "80", address: "", disabled: "false" },
  { ".id": "*4", name: "www-ssl", port: "443", address: "", certificate: "none", disabled: "false" },
  { ".id": "*5", name: "ssh", port: "22", address: "", disabled: "false" },
  { ".id": "*6", name: "api", port: "8728", address: "", disabled: "false" },
  { ".id": "*7", name: "api-ssl", port: "8729", address: "", certificate: "none", disabled: "false" },
  { ".id": "*8", name: "winbox", port: "8291", address: "", disabled: "false" },
];

registerDemo("/rest/ip/service", () => structuredClone(DEMO_SERVICES), {
  kind: "table",
  defaults: { disabled: "false", address: "", certificate: "none" },
});

registerDemo(
  "/rest/system/scheduler",
  () => [
    {
      ".id": "*1",
      name: "auto-backup",
      "start-date": "jan/01/2026",
      "start-time": "02:00:00",
      interval: "1d",
      "on-event": "/system backup save name=auto",
      policy: "read,write,test",
      comment: "每天自动备份",
      disabled: "false",
      "next-run": "jan/21/2026 02:00:00",
      "run-count": "14",
    },
    {
      ".id": "*2",
      name: "log-clear",
      "start-date": "jan/01/2026",
      "start-time": "00:00:00",
      interval: "1w",
      "on-event": "/log print\n/ip firewall connection remove [find]",
      policy: "read,write",
      comment: "每周清理连接表",
      disabled: "false",
      "next-run": "jan/27/2026 00:00:00",
      "run-count": "2",
    },
  ],
  {
    kind: "table",
    defaults: { disabled: "false", policy: "read,write", comment: "", "run-count": "0", "next-run": "" },
  },
);

registerDemo(
  "/rest/system/script",
  () => [
    {
      ".id": "*1",
      name: "ping-test",
      source: "/ping 8.8.8.8 count=4",
      policy: "read,write,test",
      comment: "",
      "dont-require-permissions": "false",
      disabled: "false",
      "run-count": "3",
      "last-started": "nov/19/2026 12:00:00",
    },
    {
      ".id": "*2",
      name: "reboot-schedule",
      source: "# 重启路由器\n/system reboot",
      policy: "read,write,reboot",
      comment: "计划重启",
      "dont-require-permissions": "false",
      disabled: "false",
      "run-count": "1",
      "last-started": "nov/18/2026 00:00:00",
    },
  ],
  {
    kind: "table",
    defaults: { disabled: "false", policy: "read,write", comment: "", "dont-require-permissions": "false", "run-count": "0", "last-started": "" },
  },
);

registerDemo(
  "/rest/system/clock",
  () => ({ date: "nov/20/2026", time: "08:30:00", "time-zone-name": "Asia/Shanghai", "time-zone-autodetect": "false" }),
  { kind: "singleton" },
);

registerDemo(
  "/rest/system/ntp/client",
  () => ({
    enabled: "true",
    servers: "ntp.aliyun.com,ntp.tencent.com",
    "last-update-from": "ntp.aliyun.com",
    "last-update-before": "2m30s",
    "last-adjustment": "+12345us",
  }),
  { kind: "singleton" },
);

export function create(app) {
  return {
    reads: ["/rest/ip/service", "/rest/system/scheduler", "/rest/system/script", "/rest/system/ntp/client"],
    writes: {
      "/rest/ip/service": {
        update: ["disabled", "port", "address", "certificate"],
      },
      "/rest/system/scheduler": {
        create: ["name", "start-date", "start-time", "interval", "on-event", "policy", "comment", "disabled"],
        update: ["name", "start-date", "start-time", "interval", "on-event", "policy", "comment", "disabled"],
        remove: true,
        multiline: ["on-event"],
        maxValue: 65536,
      },
      "/rest/system/script": {
        create: ["name", "source", "policy", "comment", "dont-require-permissions", "disabled"],
        update: ["name", "source", "policy", "comment", "dont-require-permissions", "disabled"],
        remove: true,
        multiline: ["source"],
        maxValue: 65536,
      },
      "/rest/system/clock": {
        commands: { set: ["time-zone-name", "time-zone-autodetect"] },
      },
      "/rest/system/ntp/client": {
        commands: { set: ["enabled", "servers", "primary-ntp", "secondary-ntp"] },
      },
    },
    routes: [
      {
        method: "POST",
        path: "/api/system/script/run",
        policy: "write",
        async handle(ctx) {
          const id = ctx.body?.[".id"];
          if (typeof id !== "string" || !/^\*[0-9A-F]+$/i.test(id)) {
            throw Object.assign(new Error("脚本 .id 格式不对"), { status: 400, code: "bad_body" });
          }
          const result = ctx.demo ? [] : await ctx.router("POST", "/rest/system/script/run", { ".id": id });
          ctx.audit({ action: "script-run", target: `/rest/system/script/${id}`, status: 200, outcome: "ok" });
          ctx.send(200, result ?? []);
        },
      },
    ],
  };
}
