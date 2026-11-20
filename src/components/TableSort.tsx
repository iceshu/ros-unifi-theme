import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import type { ParentProps } from "solid-js";

type SortValue = string | number | null | undefined;
export function createTableSort<T>() {
  const [sort, setSort] = createSignal<{ key: string; desc: boolean } | null>(null);
  return {
    sort,
    toggle(key: string) { setSort((previous) => ({ key, desc: previous?.key === key ? !previous.desc : false })); },
    rows(rows: T[], value: (row: T, key: string) => SortValue): T[] {
      const current = sort();
      if (!current) return rows;
      return rows.map((row, index) => ({ row, index })).sort((a, b) => {
        const av = value(a.row, current.key), bv = value(b.row, current.key);
        const comparison = av == null ? (bv == null ? 0 : 1) : bv == null ? -1
          : typeof av === "number" && typeof bv === "number" ? av - bv
          : String(av).localeCompare(String(bv), "zh-CN", { numeric: true, sensitivity: "base" });
        return (current.desc ? -comparison : comparison) || a.index - b.index;
      }).map(({ row }) => row);
    },
  };
}

export function SortHeader(props: ParentProps<{ column: string; state: { key: string; desc: boolean } | null; toggle: (key: string) => void }>) {
  const active = () => props.state?.key === props.column;
  return <th aria-sort={active() ? (props.state?.desc ? "descending" : "ascending") : "none"}>
    <button type="button" class="inline-flex cursor-pointer items-center gap-1" onClick={() => props.toggle(props.column)}>
      {props.children}<span aria-hidden="true" class={active() ? "text-accent" : "text-faint"}>{active() ? (props.state?.desc ? "↓" : "↑") : "↕"}</span>
    </button>
  </th>;
}

/** One listener per page; never steal shortcuts from editable controls. */
export function useTableKeyboard(search?: () => HTMLInputElement | undefined): Accessor<number> {
  const [escape, setEscape] = createSignal(0);
  createEffect(() => true, () => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEscape((value) => value + 1);
      const target = event.target;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey &&
        !(target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable))) {
        const input = search?.();
        if (input) { event.preventDefault(); input.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    onCleanup(() => document.removeEventListener("keydown", keydown));
  });
  return escape;
}
