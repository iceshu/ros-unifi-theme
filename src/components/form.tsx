import { Ellipsis, Eye, EyeOff, LoaderCircle, TriangleAlert, X } from "@lucide/solid";
import { Portal, type JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, type ParentProps } from "solid-js";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { pendingConfirm } from "../lib/confirm";
import { ros } from "../lib/api";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";

/* ───────── Overlays ───────── */

/**
 * UniFi-style right-hand form panel. Renders above the detail drawer.
 * `onSubmit` returns true to close; while it runs the save button spins.
 */
export function FormPanel(
  props: ParentProps<{
    title: string;
    subtitle?: string;
    submitLabel?: string;
    danger?: boolean;
    onClose: () => void;
    onSubmit: () => Promise<boolean>;
    footer?: JSX.Element;
  }>,
) {
  const [busy, setBusy] = createSignal(false);
  const [shown, setShown] = createSignal(false);
  let panel!: HTMLFormElement;
  onSettled(() => {
    requestAnimationFrame(() => setShown(true));
    panel.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy()) {
        event.stopPropagation();
        props.onClose();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  });
  return (
    <Portal>
      <div class={`drawer-backdrop form-layer ${shown() ? "is-open" : ""}`} onClick={() => !busy() && props.onClose()} />
      <form
        ref={panel}
        class={`drawer form-layer ${shown() ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy()) return;
          setBusy(true);
          try {
            if (await props.onSubmit()) props.onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <div class="drawer-head">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-[16px] font-semibold">{props.title}</h2>
            {props.subtitle ? <p class="mt-0.5 truncate text-[12.5px] text-muted">{props.subtitle}</p> : null}
          </div>
          <button type="button" class="icon-btn" aria-label="关闭" onClick={() => !busy() && props.onClose()}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div class="drawer-body form-body">{props.children}</div>
        <div class="form-foot">
          {props.footer}
          <div class="flex-1" />
          <button type="button" class="btn" disabled={busy()} onClick={props.onClose}>
            取消
          </button>
          <button type="submit" class={`btn ${props.danger ? "btn-danger" : "btn-primary"}`} disabled={busy()}>
            {busy() ? <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {props.submitLabel ?? "保存"}
          </button>
        </div>
      </form>
    </Portal>
  );
}

/** Centered confirmation for destructive or disruptive actions. */
export function ConfirmDialog(props: {
  title: string;
  message: JSX.Element;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text to enable the confirm button (reboot, delete critical rules). */
  typeToConfirm?: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  /** Set only by GlobalConfirm: the server-requested confirmation shown on top of a page dialog. */
  serverLayer?: boolean;
}) {
  const [busy, setBusy] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  // A page dialog whose action triggered a server confirmation steps aside until it is answered.
  const covered = () => !props.serverLayer && pendingConfirm() !== null;
  let confirmButton!: HTMLButtonElement;
  onSettled(() => {
    if (!props.typeToConfirm) confirmButton.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy() && !covered()) {
        event.stopPropagation();
        props.onClose();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  });
  const ready = () => !props.typeToConfirm || typed().trim() === props.typeToConfirm;
  return (
    <Portal>
    <div class="palette-backdrop modal-layer" style={covered() ? { display: "none" } : undefined} onClick={() => !busy() && props.onClose()}>
      <div class="confirm" role="alertdialog" aria-modal="true" aria-label={props.title} onClick={(event) => event.stopPropagation()}>
        <div class="flex gap-3">
          <span class={`confirm-icon ${props.danger ? "is-danger" : ""}`}>
            <TriangleAlert class="h-5 w-5" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-[15px] font-semibold">{props.title}</h2>
            <div class="mt-1.5 text-[13px] leading-relaxed text-muted">{props.message}</div>
            <Show when={props.typeToConfirm}>
              <label class="mt-3 block text-[12.5px] text-muted">
                输入 <b class="font-mono text-ink">{props.typeToConfirm}</b> 确认
                <input class="field mt-1.5 w-full" style={{ width: "100%" }} value={typed()} onInput={(event) => setTyped(event.currentTarget.value)} autofocus />
              </label>
            </Show>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="btn" disabled={busy()} onClick={props.onClose}>
            取消
          </button>
          <button
            ref={confirmButton}
            type="button"
            class={`btn ${props.danger ? "btn-danger" : "btn-primary"}`}
            disabled={busy() || !ready()}
            onClick={async () => {
              setBusy(true);
              try {
                if (await props.onConfirm()) props.onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy() ? <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {props.confirmLabel ?? "确认"}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/** Renders confirmations requested imperatively via askConfirm() (e.g. the server's lockout guard). */
export function GlobalConfirm() {
  return (
    <Show when={pendingConfirm()} keyed>
      {(pending) => (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel="仍然继续"
          danger
          serverLayer
          onClose={() => pending.resolve(false)}
          onConfirm={async () => {
            pending.resolve(true);
            return true;
          }}
        />
      )}
    </Show>
  );
}

/* ───────── Fields ───────── */

export function Field(props: ParentProps<{ label: string; hint?: string; error?: string; required?: boolean; class?: string }>) {
  return (
    <label class={`form-field ${props.class ?? ""}`}>
      <span class="form-label">
        {props.label}
        {props.required ? <span class="text-bad"> *</span> : null}
      </span>
      {props.children}
      {props.error ? <span class="form-error">{props.error}</span> : props.hint ? <span class="form-hint">{props.hint}</span> : null}
    </label>
  );
}

export function TextInput(props: {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: "text" | "number";
  list?: string;
  invalid?: boolean;
  autocomplete?: string;
}) {
  return (
    <input
      class={`input ${props.mono ? "font-mono" : ""} ${props.invalid ? "is-invalid" : ""}`}
      type={props.type ?? "text"}
      value={props.value}
      placeholder={props.placeholder}
      list={props.list}
      autocomplete={props.autocomplete ?? "off"}
      spellcheck={false}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
  );
}

/** Password with show/hide; blank means "unchanged" in edit forms. */
export function SecretInput(props: { value: string; onInput: (value: string) => void; placeholder?: string; invalid?: boolean }) {
  const [visible, setVisible] = createSignal(false);
  return (
    <span class="relative block">
      <input
        class={`input pr-9 font-mono ${props.invalid ? "is-invalid" : ""}`}
        type={visible() ? "text" : "password"}
        value={props.value}
        placeholder={props.placeholder}
        autocomplete="new-password"
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
      <button type="button" class="absolute top-1/2 right-2 -translate-y-1/2 text-faint hover:text-ink" aria-label={visible() ? "隐藏" : "显示"} onClick={() => setVisible(!visible())}>
        {visible() ? <EyeOff class="h-4 w-4" aria-hidden="true" /> : <Eye class="h-4 w-4" aria-hidden="true" />}
      </button>
    </span>
  );
}

export function SelectInput<T extends string>(props: { value: T; onChange: (value: T) => void; options: ReadonlyArray<{ value: T; label: string }> }) {
  return (
    <select class="input" value={props.value} onChange={(event) => props.onChange(event.currentTarget.value as T)}>
      <For each={props.options}>{(option) => <option value={option.value} selected={option.value === props.value}>{option.label}</option>}</For>
    </select>
  );
}

export function Toggle(props: { checked: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked ? "true" : "false"}
      aria-label={props.label}
      class={`switch ${props.checked ? "is-on" : ""} ${props.busy ? "is-busy" : ""}`}
      disabled={props.disabled || props.busy}
      onClick={(event) => {
        event.stopPropagation();
        props.onChange(!props.checked);
      }}
    >
      <i />
    </button>
  );
}

/** Options for a <datalist>: suggestions without restricting free text (IPs, interface names). */
export function Suggestions(props: { id: string; values: string[] }) {
  return (
    <datalist id={props.id}>
      <For each={props.values}>{(value) => <option value={value} />}</For>
    </datalist>
  );
}

/* ───────── Row controls ───────── */

/**
 * Enable/disable switch for any RouterOS record with a `disabled` field.
 * Hidden without the write policy. `confirm` asks first (interfaces, management rules).
 */
export function EnableSwitch(props: { menu: string; row: RosRecord | undefined; label: string; confirm?: string }) {
  const dash = useDashboard();
  const [busy, setBusy] = createSignal(false);
  const [asking, setAsking] = createSignal(false);
  const enabled = () => !flag(props.row?.disabled);
  const apply = async () => {
    const row = props.row;
    if (!row?.[".id"]) return false;
    const next = enabled() ? "true" : "false";
    setBusy(true);
    try {
      return await runWrite(dash, `已${next === "true" ? "禁用" : "启用"} ${props.label}`, () => ros.update(props.menu, row[".id"], { disabled: next }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Show when={can("write") && props.row?.[".id"]}>
      <Toggle
        checked={enabled()}
        busy={busy()}
        label={`${enabled() ? "禁用" : "启用"} ${props.label}`}
        onChange={() => {
          if (props.confirm && enabled()) setAsking(true);
          else void apply();
        }}
      />
      <Show when={asking()}>
        <ConfirmDialog title={`禁用 ${props.label}？`} message={props.confirm} confirmLabel="禁用" danger onClose={() => setAsking(false)} onConfirm={apply} />
      </Show>
    </Show>
  );
}

export interface MenuItem {
  label: string;
  icon?: JSX.Element;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** "⋯" row menu. Clicks inside never reach the row's own click handler. */
export function RowMenu(props: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLSpanElement;
  onSettled(() => {
    const outside = (event: MouseEvent) => {
      if (!root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  });
  return (
    <span ref={root} class="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button type="button" class="icon-btn" aria-haspopup="menu" aria-expanded={open() ? "true" : "false"} aria-label={props.label ?? "更多操作"} onClick={() => setOpen(!open())}>
        <Ellipsis aria-hidden="true" />
      </button>
      <Show when={open()}>
        <div class="menu" role="menu">
          <For each={props.items}>
            {(item) => (
              <button
                type="button"
                role="menuitem"
                class={item.danger ? "is-danger" : ""}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </span>
  );
}

/** Primary "+ 新建" style button, shown only with the write policy. */
export function AddButton(props: { label: string; onClick: () => void; policy?: string }) {
  return (
    <Show when={can(props.policy ?? "write")}>
      <button type="button" class="btn btn-primary" onClick={() => props.onClick()}>
        <span aria-hidden="true" class="text-[16px] leading-none">+</span>
        {props.label}
      </button>
    </Show>
  );
}
