import { render } from "@solidjs/web";
import { Errored } from "solid-js";
import { Shell } from "./components/Shell";
import { DashboardProvider } from "./lib/store";
import { Router } from "./router";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("找不到页面根节点");

render(
  () => (
    <Router>
      {(props) => (
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
      )}
    </Router>
  ),
  root,
);
