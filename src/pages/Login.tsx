import { LoaderCircle, LogIn } from "@lucide/solid";
import { createSignal, onSettled, Show } from "solid-js";
import { IconMark } from "../components/icons";
import { getMeta, login, toApiError, type Meta, type Session } from "../lib/api";

/**
 * Sign in with a RouterOS account. What the dashboard can change afterwards is
 * exactly what that account's group allows on the router.
 */
export function LoginPage(props: { onLogin: (session: Session) => void; notice?: string }) {
  const [meta, setMeta] = createSignal<Meta | null>(null);
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal(props.notice ?? "");
  const [busy, setBusy] = createSignal(false);
  let userInput!: HTMLInputElement;

  onSettled(() => {
    userInput.focus();
    getMeta().then(setMeta, () => undefined);
  });

  return (
    <div class="login-wrap">
      <form
        class="login-card"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy()) return;
          setBusy(true);
          setError("");
          try {
            props.onLogin(await login(username().trim(), password()));
          } catch (cause) {
            setError(toApiError(cause).message);
            setPassword("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div class="flex flex-col items-center text-center">
          <IconMark class="h-12 w-12" />
          <h1 class="mt-4 text-[20px] font-semibold tracking-tight">登录网关</h1>
          <p class="mt-1 text-[13px] text-muted">
            使用 RouterOS 账号登录
            <Show when={meta()?.host}>
              <span class="font-mono"> · {meta()?.host.replace(/^https?:\/\//, "")}</span>
            </Show>
          </p>
        </div>
        <div class="mt-6 flex flex-col gap-3">
          <label class="form-field">
            <span class="form-label">用户名</span>
            <input ref={userInput} class="input" autocomplete="username" value={username()} onInput={(event) => setUsername(event.currentTarget.value)} />
          </label>
          <label class="form-field">
            <span class="form-label">密码</span>
            <input class="input" type="password" autocomplete="current-password" value={password()} onInput={(event) => setPassword(event.currentTarget.value)} />
          </label>
          <Show when={error()}>
            <p class="rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-bad" role="alert">
              {error()}
            </p>
          </Show>
          <button type="submit" class="btn btn-primary mt-1 h-10 w-full" disabled={busy() || !username().trim() || !password()}>
            {busy() ? <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn class="h-4 w-4" aria-hidden="true" />}
            登录
          </button>
        </div>
        <p class="mt-5 text-center text-[11.5px] leading-relaxed text-faint">
          <Show when={meta()?.demo} fallback={<>能看到和能修改的内容由该账号在路由器上所属组的权限决定。只读组只能查看。</>}>
            演示模式：任意用户名和密码都能登录，修改只作用于内存里的演示数据。
          </Show>
        </p>
      </form>
    </div>
  );
}
