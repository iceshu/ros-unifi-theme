import { KeyRound, Network, Search } from "@lucide/solid";
import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { useDashboard, type Selection } from "../lib/store";
import { DeviceIcon } from "./DeviceIcon";
import { NAV } from "./icons";
import { typeLabel } from "../lib/model";

interface Entry {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  blob: string;
  icon: () => JSX.Element;
  run: () => void;
}

const fold = (value: string) => value.toLowerCase().replace(/[:\-\s.]/g, "");

/** ⌘K / Ctrl+K: jump to a page or open any client, port or peer in the detail panel. */
export function CommandPalette(props: { onClose: () => void }) {
  const dash = useDashboard();
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  let input!: HTMLInputElement;
  let list!: HTMLUListElement;

  const open = (selection: Selection) => () => {
    dash.setSelection(selection);
    props.onClose();
  };

  const entries = createMemo<Entry[]>(() => {
    const pages: Entry[] = NAV.flatMap((group) =>
      group.items.map((item) => ({
        id: `page:${item.href}`,
        group: "页面",
        title: item.label,
        subtitle: group.title,
        blob: fold(`${item.label} ${item.keywords ?? ""} ${item.href}`),
        icon: () => <item.icon class="h-4 w-4" aria-hidden="true" />,
        run: () => {
          navigate(item.href);
          props.onClose();
        },
      })),
    );
    const clients: Entry[] = dash.clients().map((client) => ({
      id: `client:${client.key}`,
      group: "客户端",
      title: client.title,
      subtitle: [client.ip, client.mac, client.port].filter(Boolean).join(" · "),
      blob: fold(`${client.title} ${client.subtitle} ${client.ip} ${client.mac} ${client.port} ${client.vendor}`),
      icon: () => <DeviceIcon kind={client.kind} online={client.online} />,
      run: open({ type: "client", ip: client.ip, mac: client.mac }),
    }));
    const ports: Entry[] = dash.interfaces().map((row) => ({
      id: `iface:${row.name}`,
      group: "端口与接口",
      title: row.name,
      subtitle: [typeLabel(row.type), row.comment].filter(Boolean).join(" · "),
      blob: fold(`${row.name} ${row.comment ?? ""} ${row.type ?? ""}`),
      icon: () => <Network class="h-4 w-4" aria-hidden="true" />,
      run: open({ type: "iface", name: row.name }),
    }));
    const peers: Entry[] = (dash.wireguardPeers() ?? []).map((peer) => ({
      id: `peer:${peer[".id"]}`,
      group: "WireGuard",
      title: peer.comment || peer["allowed-address"] || "对端",
      subtitle: peer["allowed-address"] || "",
      blob: fold(`${peer.comment ?? ""} ${peer["allowed-address"] ?? ""} wireguard`),
      icon: () => <KeyRound class="h-4 w-4" aria-hidden="true" />,
      run: open({ type: "peer", id: peer[".id"] || "" }),
    }));
    return [...pages, ...clients, ...ports, ...peers];
  });

  const results = createMemo(() => {
    const needle = fold(query());
    const all = entries();
    if (!needle) return all.filter((entry) => entry.group === "页面").concat(all.filter((entry) => entry.group === "客户端").slice(0, 6));
    return all.filter((entry) => entry.blob.includes(needle)).slice(0, 40);
  });

  const move = (delta: number) => {
    const count = results().length;
    if (!count) return;
    const next = (active() + delta + count) % count;
    setActive(next);
    list.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  onSettled(() => {
    input.focus();
  });

  return (
    <div class="palette-backdrop" onClick={props.onClose}>
      <div class="palette" role="dialog" aria-modal="true" aria-label="快速跳转" onClick={(event) => event.stopPropagation()}>
        <div class="relative">
          <Search class="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            ref={input}
            style={{ "padding-left": "2.6rem" }}
            placeholder="搜索页面、客户端、IP、MAC、端口…"
            value={query()}
            aria-label="搜索"
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                results()[active()]?.run();
              } else if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
              }
            }}
          />
        </div>
        <ul ref={list} role="listbox">
          <Show when={results().length > 0} fallback={<li class="px-4 py-8 text-center text-[13px] text-faint">没有匹配项</li>}>
            <For each={results()}>
              {(entry, index) => (
                <>
                  {index() === 0 || results()[index() - 1]?.group !== entry.group ? <li class="group">{entry.group}</li> : null}
                  <li>
                    <button
                      type="button"
                      role="option"
                      data-index={index()}
                      aria-selected={active() === index() ? "true" : "false"}
                      onMouseMove={() => setActive(index())}
                      onClick={() => entry.run()}
                    >
                      <span class="grid h-8 w-8 shrink-0 place-items-center text-muted">{entry.icon()}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[13.5px]">{entry.title}</span>
                        {entry.subtitle ? <span class="block truncate text-[12px] text-faint">{entry.subtitle}</span> : null}
                      </span>
                      {active() === index() ? <span class="kbd">↵</span> : null}
                    </button>
                  </li>
                </>
              )}
            </For>
          </Show>
        </ul>
      </div>
    </div>
  );
}
