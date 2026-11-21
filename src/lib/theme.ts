import { createSignal } from "solid-js";

export type ThemeName = "light" | "dark";
const KEY = "rut-theme";

function stored(): ThemeName | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
const [theme, setThemeSignal] = createSignal<ThemeName>(stored() ?? (media?.matches ? "dark" : "light"));

function apply(name: ThemeName) {
  document.documentElement.dataset.theme = name;
  document.documentElement.style.colorScheme = name;
}

/** Called once before render so the first paint already uses the right palette. */
export function initTheme() {
  apply(theme());
  media?.addEventListener("change", (event) => {
    if (stored()) return;
    const next = event.matches ? "dark" : "light";
    setThemeSignal(next);
    apply(next);
  });
}

export function toggleTheme() {
  const next: ThemeName = theme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: still switch for this tab */
  }
  setThemeSignal(next);
  apply(next);
}

export { theme };

/** Resolved CSS custom property, for canvas renderers that cannot read var(). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
