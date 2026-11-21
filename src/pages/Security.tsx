import { createMemo, For, Show } from "solid-js";
import { EmptyState, PageHeader } from "../components/ui";
import { useLoad } from "../lib/useRos";

type Severity = "critical" | "warn" | "info";

interface SecurityFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  fix: string;
  link?: string;
}

interface SecurityData {
  findings: SecurityFinding[];
  score: number;
}

function ScoreGauge(props: { score: number }) {
  const color = () => props.score >= 80 ? "var(--color-good)" : props.score >= 50 ? "var(--color-warn)" : "var(--color-bad)";
  const label = () => props.score >= 80 ? "良好" : props.score >= 50 ? "一般" : "高风险";
  return (
    <div class="flex flex-col items-center gap-1 p-6">
      <svg viewBox="0 0 120 70" width="160" height="94" aria-hidden="true">
        <path d="M10,60 A50,50,0,0,1,110,60" fill="none" stroke="var(--color-line)" stroke-width="10" stroke-linecap="round" />
        <path
          d="M10,60 A50,50,0,0,1,110,60"
          fill="none"
          stroke={color()}
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray={`${props.score * 1.571} 200`}
        />
        <text x="60" y="58" text-anchor="middle" font-size="22" font-weight="bold" fill={color()}>{props.score}</text>
        <text x="60" y="68" text-anchor="middle" font-size="10" fill="var(--color-muted)">{label()}</text>
      </svg>
      <p class="text-[12px] text-muted">安全评分（满分 100）</p>
    </div>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = { critical: "高危", warn: "警告", info: "提示" };
const SEVERITY_TONE: Record<Severity, string> = { critical: "pill-bad", warn: "pill-warn", info: "pill-muted" };
const SEVERITY_ORDER: Severity[] = ["critical", "warn", "info"];

export function SecurityPage() {
  const loaded = useLoad<SecurityData>(() => "/api/security", 60_000, (raw) => raw as SecurityData);
  const findings = createMemo(() => {
    const data = loaded.data();
    if (!data) return [];
    return [...data.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  });
  const score = () => loaded.data()?.score ?? 100;
  const counts = createMemo(() => {
    const c = { critical: 0, warn: 0, info: 0 };
    for (const f of findings()) c[f.severity]++;
    return c;
  });

  return (
    <div>
      <PageHeader
        title="安全检查"
        subtitle="检测常见路由器安全配置问题"
      />

      <Show when={loaded.error()}>
        <div class="card mb-4 p-4 text-[13px] text-bad">{loaded.error()}</div>
      </Show>

      <Show when={loaded.loaded()}>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
          {/* Score card */}
          <section class="card flex flex-col items-center">
            <div class="card-head w-full"><h2 class="card-title">总体评分</h2></div>
            <ScoreGauge score={score()} />
            <div class="mt-2 flex gap-3 pb-4 text-[13px]">
              <span class="pill pill-bad">{counts().critical} 高危</span>
              <span class="pill pill-warn">{counts().warn} 警告</span>
              <span class="pill pill-muted">{counts().info} 提示</span>
            </div>
          </section>

          {/* Findings */}
          <section class="card">
            <div class="card-head"><h2 class="card-title">检查项目</h2></div>
            <Show when={findings().length === 0}>
              <EmptyState title="未发现安全问题" detail="当前配置符合安全最佳实践。" compact />
            </Show>
            <Show when={findings().length > 0}>
              <ul class="divide-y divide-line">
                <For each={findings()}>
                  {(finding) => (
                    <li class="px-4 py-3">
                      <div class="flex items-start gap-3">
                        <span class={`pill mt-0.5 shrink-0 ${SEVERITY_TONE[finding.severity]}`}>{SEVERITY_LABEL[finding.severity]}</span>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <p class="font-medium text-[14px]">{finding.title}</p>
                            <Show when={finding.link}>
                              <a href={finding.link} class="text-[12px] text-accent hover:underline">前往修复 →</a>
                            </Show>
                          </div>
                          <p class="mt-0.5 text-[13px] text-muted">{finding.description}</p>
                          <pre class="mt-2 overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono text-[12px] text-muted whitespace-pre-wrap">{finding.fix}</pre>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </div>
      </Show>

      <Show when={!loaded.loaded()}>
        <EmptyState title="加载安全检查数据中…" compact />
      </Show>
    </div>
  );
}
