import { createMemo, createSignal, For, Show } from "solid-js";
import { buildCreatePayload, buildEditPayload, validateCIDR, validatePortList } from "../lib/firewall";
import { type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { ros } from "../lib/api";
import { useDashboard } from "../lib/store";
import { Field, FormPanel, SelectInput, Suggestions, TextInput, Toggle } from "./form";

const CHAIN_OPTS: Array<{ value: string; label: string }> = [
  { value: "input", label: "input · 入站" },
  { value: "forward", label: "forward · 转发" },
  { value: "output", label: "output · 出站" },
];

const ACTION_OPTS: Array<{ value: string; label: string }> = [
  { value: "accept", label: "accept · 放行" },
  { value: "drop", label: "drop · 丢弃" },
  { value: "reject", label: "reject · 拒绝" },
  { value: "jump", label: "jump · 跳转" },
  { value: "log", label: "log · 记录" },
  { value: "fasttrack-connection", label: "fasttrack-connection · 快速跟踪" },
  { value: "passthrough", label: "passthrough · 穿过" },
  { value: "return", label: "return · 返回" },
];

const PROTO_OPTS: Array<{ value: string; label: string }> = [
  { value: "", label: "任意协议" },
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
  { value: "icmp", label: "ICMP" },
];

const CONN_STATES = ["new", "established", "related", "invalid", "untracked"] as const;

const STANDARD_CHAINS: Record<string, true> = { input: true, forward: true, output: true };

export function FirewallRuleForm(props: {
  rule?: RosRecord;
  rules?: RosRecord[];
  onClose: () => void;
}) {
  const dash = useDashboard();
  const r = props.rule;
  const isEdit = !!r?.[".id"];

  const initChain = r?.chain ?? "forward";
  const initCustom = !STANDARD_CHAINS[initChain];

  const [comment, setComment] = createSignal(r?.comment ?? "");
  const [chain, setChain] = createSignal(initCustom ? "forward" : initChain);
  const [chainCustom, setChainCustom] = createSignal(initCustom ? initChain : "");
  const [useCustomChain, setUseCustomChain] = createSignal(initCustom);
  const [action, setAction] = createSignal(r?.action ?? "accept");
  const [protocol, setProtocol] = createSignal(r?.protocol ?? "");
  const [srcAddr, setSrcAddr] = createSignal(r?.["src-address"] ?? "");
  const [dstAddr, setDstAddr] = createSignal(r?.["dst-address"] ?? "");
  const [srcPort, setSrcPort] = createSignal(r?.["src-port"] ?? "");
  const [dstPort, setDstPort] = createSignal(r?.["dst-port"] ?? "");
  const [inIface, setInIface] = createSignal(r?.["in-interface"] ?? "");
  const [outIface, setOutIface] = createSignal(r?.["out-interface"] ?? "");
  const [inIfaceList, setInIfaceList] = createSignal(r?.["in-interface-list"] ?? "");
  const [outIfaceList, setOutIfaceList] = createSignal(r?.["out-interface-list"] ?? "");
  const [srcAddrList, setSrcAddrList] = createSignal(r?.["src-address-list"] ?? "");
  const [dstAddrList, setDstAddrList] = createSignal(r?.["dst-address-list"] ?? "");
  const [connState, setConnState] = createSignal<string[]>(
    r?.["connection-state"]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
  );
  const [logEnabled, setLogEnabled] = createSignal(r?.log === "yes" || r?.log === "true");
  const [logPrefix, setLogPrefix] = createSignal(r?.["log-prefix"] ?? "");
  const [jumpTarget, setJumpTarget] = createSignal(r?.["jump-target"] ?? "");
  const [disabled, setDisabled] = createSignal(r?.disabled === "true");
  const [placeBefore, setPlaceBefore] = createSignal("");

  const [srcAddrErr, setSrcAddrErr] = createSignal<string | undefined>();
  const [dstAddrErr, setDstAddrErr] = createSignal<string | undefined>();
  const [srcPortErr, setSrcPortErr] = createSignal<string | undefined>();
  const [dstPortErr, setDstPortErr] = createSignal<string | undefined>();

  const interfaceNames = createMemo(() =>
    dash.interfaces().map((i) => i.name).filter(Boolean).sort(),
  );
  const listNames = createMemo(() =>
    [...new Set(dash.listMembers().map((m) => m.list))].filter(Boolean).sort(),
  );
  const addrListNames = createMemo(() =>
    [...new Set(dash.addressLists().map((e) => e.list))].filter(Boolean).sort(),
  );
  const ruleOptions = createMemo(() =>
    (props.rules ?? []).map((rule, i) => ({
      value: rule[".id"] ?? "",
      label: `#${i} ${rule.comment || rule.action || ""}`.trim(),
    })),
  );

  function toggleConnState(state: string) {
    setConnState((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state],
    );
  }

  function validate(): boolean {
    const se = validateCIDR(srcAddr());
    setSrcAddrErr(se ?? undefined);
    const de = validateCIDR(dstAddr());
    setDstAddrErr(de ?? undefined);
    const spe = validatePortList(srcPort());
    setSrcPortErr(spe ?? undefined);
    const dpe = validatePortList(dstPort());
    setDstPortErr(dpe ?? undefined);
    return !se && !de && !spe && !dpe;
  }

  async function handleSubmit(): Promise<boolean> {
    if (!validate()) return false;

    const effectiveChain = useCustomChain() ? chainCustom() : chain();
    const current: Record<string, string> = {
      comment: comment(),
      chain: effectiveChain,
      action: action(),
      protocol: protocol(),
      "src-address": srcAddr(),
      "dst-address": dstAddr(),
      "src-port": srcPort(),
      "dst-port": dstPort(),
      "in-interface": inIface(),
      "out-interface": outIface(),
      "in-interface-list": inIfaceList(),
      "out-interface-list": outIfaceList(),
      "src-address-list": srcAddrList(),
      "dst-address-list": dstAddrList(),
      "connection-state": connState().join(","),
      log: logEnabled() ? "yes" : "no",
      "log-prefix": logEnabled() ? logPrefix() : "",
      "jump-target": action() === "jump" ? jumpTarget() : "",
      disabled: disabled() ? "true" : "false",
    };

    if (isEdit) {
      const payload = buildEditPayload(r!, current);
      if (Object.keys(payload).length === 0) return true;
      return runWrite(dash, "已保存防火墙规则", () =>
        ros.update("/rest/ip/firewall/filter", r![".id"], payload),
      );
    } else {
      const payload = buildCreatePayload(current);
      if (placeBefore()) payload["place-before"] = placeBefore();
      return runWrite(dash, "已创建防火墙规则", () =>
        ros.create("/rest/ip/firewall/filter", payload),
      );
    }
  }

  return (
    <FormPanel
      title={isEdit ? "编辑防火墙规则" : "新建防火墙规则"}
      onClose={props.onClose}
      onSubmit={handleSubmit}
    >
      <Field label="注释" hint="用于识别此规则（可选）">
        <TextInput
          value={comment()}
          onInput={(v) => setComment(v)}
          placeholder="例如：允许内网访问外网"
        />
      </Field>
      <div class="form-row">
        <Field label="链">
          <Show
            when={useCustomChain()}
            fallback={
              <SelectInput
                value={chain()}
                onChange={(v) => setChain(v)}
                options={CHAIN_OPTS}
              />
            }
          >
            <TextInput
              value={chainCustom()}
              onInput={(v) => setChainCustom(v)}
              placeholder="自定义链名"
            />
          </Show>
          <label class="mt-1 flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={useCustomChain()}
              onChange={() => setUseCustomChain(!useCustomChain())}
            />
            自定义链名
          </label>
        </Field>
        <Field label="动作">
          <SelectInput
            value={action()}
            onChange={(v) => setAction(v)}
            options={ACTION_OPTS}
          />
        </Field>
      </div>
      <Show when={action() === "jump"}>
        <Field label="跳转目标链">
          <TextInput
            value={jumpTarget()}
            onInput={(v) => setJumpTarget(v)}
            placeholder="链名"
          />
        </Field>
      </Show>
      <div class="form-row">
        <Field label="协议">
          <SelectInput
            value={protocol()}
            onChange={(v) => setProtocol(v)}
            options={PROTO_OPTS}
          />
        </Field>
      </div>
      <div class="form-section">地址匹配</div>
      <div class="form-row">
        <Field label="源地址" hint="IPv4 或 CIDR（如 192.168.1.0/24）" error={srcAddrErr()}>
          <TextInput
            value={srcAddr()}
            onInput={(v) => setSrcAddr(v)}
            placeholder="留空匹配全部"
            mono
            invalid={!!srcAddrErr()}
          />
        </Field>
        <Field label="目的地址" error={dstAddrErr()}>
          <TextInput
            value={dstAddr()}
            onInput={(v) => setDstAddr(v)}
            placeholder="留空匹配全部"
            mono
            invalid={!!dstAddrErr()}
          />
        </Field>
      </div>
      <div class="form-row">
        <Field label="源端口" hint="如 80 或 8000-8100" error={srcPortErr()}>
          <TextInput
            value={srcPort()}
            onInput={(v) => setSrcPort(v)}
            placeholder="留空匹配全部"
            mono
            invalid={!!srcPortErr()}
          />
        </Field>
        <Field label="目的端口" error={dstPortErr()}>
          <TextInput
            value={dstPort()}
            onInput={(v) => setDstPort(v)}
            placeholder="留空匹配全部"
            mono
            invalid={!!dstPortErr()}
          />
        </Field>
      </div>
      <div class="form-row">
        <Field label="源地址列表" hint="防火墙地址列表名称">
          <TextInput
            value={srcAddrList()}
            onInput={(v) => setSrcAddrList(v)}
            list="fw-src-addrlist"
          />
          <Suggestions id="fw-src-addrlist" values={addrListNames()} />
        </Field>
        <Field label="目的地址列表">
          <TextInput
            value={dstAddrList()}
            onInput={(v) => setDstAddrList(v)}
            list="fw-dst-addrlist"
          />
          <Suggestions id="fw-dst-addrlist" values={addrListNames()} />
        </Field>
      </div>
      <div class="form-section">接口匹配</div>
      <div class="form-row">
        <Field label="入接口">
          <TextInput
            value={inIface()}
            onInput={(v) => setInIface(v)}
            list="fw-in-iface"
            placeholder="留空匹配全部"
          />
          <Suggestions id="fw-in-iface" values={interfaceNames()} />
        </Field>
        <Field label="出接口">
          <TextInput
            value={outIface()}
            onInput={(v) => setOutIface(v)}
            list="fw-out-iface"
            placeholder="留空匹配全部"
          />
          <Suggestions id="fw-out-iface" values={interfaceNames()} />
        </Field>
      </div>
      <div class="form-row">
        <Field label="入接口列表">
          <TextInput
            value={inIfaceList()}
            onInput={(v) => setInIfaceList(v)}
            list="fw-in-ifacelist"
            placeholder="留空匹配全部"
          />
          <Suggestions id="fw-in-ifacelist" values={listNames()} />
        </Field>
        <Field label="出接口列表">
          <TextInput
            value={outIfaceList()}
            onInput={(v) => setOutIfaceList(v)}
            list="fw-out-ifacelist"
            placeholder="留空匹配全部"
          />
          <Suggestions id="fw-out-ifacelist" values={listNames()} />
        </Field>
      </div>
      <div class="form-section">连接状态</div>
      <div class="flex flex-wrap gap-3">
        <For each={[...CONN_STATES]}>
          {(state) => (
            <label class="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={connState().includes(state)}
                onChange={() => toggleConnState(state)}
              />
              {state}
            </label>
          )}
        </For>
      </div>
      <div class="form-section">日志与选项</div>
      <div class="form-row">
        <Field label="记录日志">
          <Toggle
            checked={logEnabled()}
            onChange={(v) => setLogEnabled(v)}
            label="启用日志记录"
          />
        </Field>
        <Show when={logEnabled()}>
          <Field label="日志前缀" hint="可选">
            <TextInput
              value={logPrefix()}
              onInput={(v) => setLogPrefix(v)}
              placeholder="可选前缀"
            />
          </Field>
        </Show>
      </div>
      <Show when={!isEdit}>
        <Field label="插入位置" hint="在现有规则之前插入，默认追加到末尾">
          <select
            class="input"
            value={placeBefore()}
            onChange={(e) => setPlaceBefore(e.currentTarget.value)}
          >
            <option value="">追加到末尾</option>
            <For each={ruleOptions()}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </Field>
      </Show>
      <Field label="启用规则">
        <Toggle
          checked={!disabled()}
          onChange={(v) => setDisabled(!v)}
          label={disabled() ? "规则已禁用" : "规则已启用"}
        />
      </Field>
    </FormPanel>
  );
}

