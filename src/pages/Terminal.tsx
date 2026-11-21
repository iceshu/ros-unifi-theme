import { ClipboardCopy, RotateCcw, TriangleAlert } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { api, toApiError } from "../lib/api";
import { can } from "../lib/session";
import { showToast } from "../lib/toast";
import { PageHeader } from "../components/ui";

const MAX_CMD = 4096;

interface OutputLine {
  kind: "cmd" | "out" | "err";
  text: string;
}

export function TerminalPage() {
  const [lines, setLines] = createSignal<OutputLine[]>([]);
  const [input, setInput] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [history, setHistory] = createSignal<string[]>([]);
  const [histIdx, setHistIdx] = createSignal(-1);
  const [draftInput, setDraftInput] = createSignal("");

  const appendLine = (kind: OutputLine["kind"], text: string) => {
    setLines((prev) => [...prev, { kind, text }]);
  };

  const runCommand = async () => {
    const cmd = input().trim();
    if (!cmd || busy()) return;
    if (cmd.length > MAX_CMD) {
      showToast(`命令超过 ${MAX_CMD} 字符`, "err");
      return;
    }
    setHistory((h) => [cmd, ...h.slice(0, 99)]);
    setHistIdx(-1);
    setDraftInput("");
    setInput("");
    appendLine("cmd", `> ${cmd}`);
    setBusy(true);
    try {
      const result = (await api.post("/api/terminal", { command: cmd })) as { output: string };
      const out = result.output ?? "";
      if (out) {
        for (const line of out.split("\n")) appendLine("out", line);
      } else {
        appendLine("out", "（无输出）");
      }
    } catch (e) {
      appendLine("err", toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void runCommand();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = history();
      if (!h.length) return;
      if (histIdx() === -1) setDraftInput(input());
      const next = Math.min(histIdx() + 1, h.length - 1);
      setHistIdx(next);
      setInput(h[next]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx() <= 0) {
        setHistIdx(-1);
        setInput(draftInput());
        return;
      }
      const next = histIdx() - 1;
      setHistIdx(next);
      setInput(history()[next]);
    }
  };

  const clearTerminal = () => setLines([]);

  const copyAll = () => {
    const text = lines()
      .map((l) => l.text)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => showToast("已复制", "ok"), () => showToast("复制失败", "err"));
  };

  return (
    <div class="flex h-full flex-col gap-3">
      <PageHeader title="终端" subtitle="以当前登录账号的权限在路由器上执行 RouterOS 控制台命令" />

      <div class="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-[var(--color-warn)]">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>命令以当前登录的 RouterOS 账号权限执行，所有操作均被记录到审计日志。请谨慎操作。</span>
      </div>

      <Show
        when={can("write")}
        fallback={
          <div class="rounded-xl border border-dashed border-line py-10 text-center text-[13px] text-muted">
            当前账号没有 <code class="font-mono">write</code> 权限，无法使用终端。
          </div>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#0d1117]">
          {/* toolbar */}
          <div class="flex items-center justify-between border-b border-[#30363d] px-3 py-1.5">
            <span class="text-[12px] text-[#8b949e]">RouterOS 终端</span>
            <div class="flex gap-2">
              <button
                type="button"
                class="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9]"
                onClick={copyAll}
                title="复制全部输出"
              >
                <ClipboardCopy class="h-3.5 w-3.5" aria-hidden="true" />
                复制
              </button>
              <button
                type="button"
                class="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9]"
                onClick={clearTerminal}
                title="清屏"
              >
                <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                清屏
              </button>
            </div>
          </div>

          {/* output area */}
          <div
            class="min-h-[300px] flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-relaxed"
            style={{ "background-color": "#0d1117" }}
          >
            <Show when={lines().length === 0}>
              <span class="text-[#484f58]">输入命令后按 Enter 执行。↑ / ↓ 浏览历史。</span>
            </Show>
            <For each={lines()}>
              {(line) => (
                <div
                  class={
                    line.kind === "cmd"
                      ? "text-[#58a6ff]"
                      : line.kind === "err"
                        ? "text-[#f85149]"
                        : "text-[#c9d1d9]"
                  }
                >
                  <pre class="whitespace-pre-wrap break-all">{line.text}</pre>
                </div>
              )}
            </For>
            <Show when={busy()}>
              <span class="animate-pulse text-[#484f58]">执行中…</span>
            </Show>
          </div>

          {/* input bar */}
          <div class="flex items-center border-t border-[#30363d] bg-[#161b22] px-3 py-2">
            <span class="mr-2 select-none font-mono text-[13px] text-[#58a6ff]">&gt;</span>
            <input
              class="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[#c9d1d9] outline-none placeholder:text-[#484f58]"
              placeholder="输入 RouterOS 命令…"
              value={input()}
              maxlength={MAX_CMD}
              onInput={(e) => { setInput(e.currentTarget.value); setHistIdx(-1); }}
              onKeyDown={handleKeyDown}
              disabled={busy()}
              autocomplete="off"
              spellcheck={false}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}
