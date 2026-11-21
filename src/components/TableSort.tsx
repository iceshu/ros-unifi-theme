import { ArrowDown, ArrowUp, ArrowUpDown } from "@lucide/solid";
import { createSignal, onSettled, type Accessor, type ParentProps } from "solid-js";

type SortValue = string | number | null | undefined;
export interface SortState {
  key: string;
  desc: boolean;
}

export function createTableSort<T>(initial: SortState | null = null) {
  const [sort, setSort] = createSignal<SortState | null>(initial);
  return {
    sort,
    toggle(key: string) {
      setSort((previous) => ({ key, desc: previous?.key === key ? !previous.desc : false }));
    },
    rows(rows: T[], value: (row: T, key: string) => SortValue): T[] {
      const current = sort();
      if (!current) return rows;
      return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          const av = value(a.row, current.key);
          const bv = value(b.row, current.key);
          const comparison =
            av == null
              ? bv == null
                ? 0
                : 1
              : bv == null
                ? -1
                : typeof av === "number" && typeof bv === "number"
                  ? av - bv
                  : String(av).localeCompare(String(bv), "zh-CN", { numeric: true, sensitivity: "base" });
          return (current.desc ? -comparison : comparison) || a.index - b.index;
        })
        .map(({ row }) => row);
    },
  };
}

export function SortHeader(props: ParentProps<{ column: string; state: SortState | null; toggle: (key: string) => void; class?: string }>) {
  const active = () => props.state?.key === props.column;
  return (
    <th class={props.class} aria-sort={active() ? (props.state?.desc ? "descending" : "ascending") : "none"}>
      <button type="button" class="th-btn" onClick={() => props.toggle(props.column)}>
        {props.children}
        {active() ? (
          props.state?.desc ? (
            <ArrowDown class="h-3 w-3 text-accent" aria-hidden="true" />
          ) : (
            <ArrowUp class="h-3 w-3 text-accent" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown class="h-3 w-3 opacity-40" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

/** One listener per page: "/" focuses the search box, Escape bumps a counter rows can react to. */
export function useTableKeyboard(search?: () => HTMLInputElement | undefined): Accessor<number> {
  const [escape, setEscape] = createSignal(0);
  onSettled(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEscape((value) => value + 1);
      const target = event.target;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !(target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable))
      ) {
        const input = search?.();
        if (input) {
          event.preventDefault();
          input.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });
  return escape;
}
