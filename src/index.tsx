import { render, type JSX } from "@solidjs/web";
import { Errored, onSettled, Show, createSignal } from "solid-js";
import { GlobalConfirm } from "./components/form";
import { Toasts } from "./components/Toast";
import { Shell } from "./components/Shell";
import { getSession, LOGGED_OUT_EVENT } from "./lib/api";
import { session, setSession } from "./lib/session";
import { DashboardProvider } from "./lib/store";
import { initTheme } from "./lib/theme";
import { LoginPage } from "./pages/Login";
import { Router } from "./router";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("找不到页面根节点");
initTheme();

/** Nothing talks to the router until a RouterOS account is logged in. */
function AuthGate(props: { children: JSX.Element }) {
  const [checked, setChecked] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  onSettled(() => {
    getSession()
      .then((current) => setSession(current))
      .catch(() => setSession(null))
      .finally(() => setChecked(true));
    const loggedOut = () => {
      if (session()) setNotice("登录已失效，请重新登录。");
      setSession(null);
    };
    window.addEventListener(LOGGED_OUT_EVENT, loggedOut);
    return () => window.removeEventListener(LOGGED_OUT_EVENT, loggedOut);
  });
  return (
    <Show when={checked()}>
      <Show
        when={session()}
        keyed
        fallback={
          <LoginPage
            notice={notice()}
            onLogin={(next) => {
              setNotice("");
              setSession(next);
            }}
          />
        }
      >
        {/* keyed: a different account gets a fresh dashboard store */}
        <>{props.children}</>
      </Show>
    </Show>
  );
}

render(
  () => (
    <Router>
      {(props) => (
        <>
          <AuthGate>
            <DashboardProvider>
              <Shell>
                <Errored
                  fallback={(err) => {
                    const value = err();
                    const message = value instanceof Error ? value.message : "未知错误";
                    return (
                      <div class="card p-6">
                        <p class="text-lg">这个页面渲染失败。</p>
                        <p class="mt-2 text-sm text-muted">{message}</p>
                      </div>
                    );
                  }}
                >
                  {props.children}
                </Errored>
              </Shell>
            </DashboardProvider>
          </AuthGate>
          <Toasts />
          <GlobalConfirm />
        </>
      )}
    </Router>
  ),
  root,
);
