import { memo, useEffect, useMemo, useState } from "react";
import { api, DailyStatPoint, StatsSummary } from "../api";
import { useStore } from "../store";
import { formatDuration } from "./TaskTracker";

const PERIODS: { label: string; days: number }[] = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function Sparkline({
  values,
  strokeVar,
}: {
  values: number[];
  strokeVar: string;
}) {
  const pts = useMemo(() => {
    if (values.length === 0) return "";
    const list = values.length === 1 ? [0, values[0]] : values;
    const max = Math.max(1, ...list);
    const w = 110;
    const h = 28;
    return list
      .map((v, i) => {
        const x = (i / Math.max(1, list.length - 1)) * w;
        const y = h - 3 - (v / max) * (h - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg className="st-spark" viewBox="0 0 110 28" aria-hidden="true">
      <polyline
        fill="none"
        stroke={strokeVar}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

function formatDayShort(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

export default memo(function StatsView({
  pageId,
  embedded = false,
}: {
  pageId: string | null;
  embedded?: boolean;
}) {
  const pages = useStore((s) => s.pages);
  const openPage = useStore((s) => s.open);
  const setPageTab = useStore((s) => s.setPageTab);
  const [selectedScope, setSelectedScope] = useState<string>(pageId ?? "all");
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<StatsSummary | null>(null);

  useEffect(() => {
    setSelectedScope(pageId ?? "all");
  }, [pageId]);

  const alivePages = useMemo(
    () => pages.filter((p) => p.deletedAt == null),
    [pages],
  );

  const pageById = useMemo(
    () => new Map(alivePages.map((p) => [p.id, p])),
    [alivePages],
  );

  useEffect(() => {
    let cancelled = false;
    const targetId = selectedScope === "all" ? null : selectedScope;
    api.getStatistics(targetId, days).then((res) => {
      if (!cancelled) setStats(res);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedScope, days]);

  const daily: DailyStatPoint[] = stats?.daily ?? [];

  const maxStacked = useMemo(() => {
    let m = 1;
    for (const d of daily) {
      const sum = d.created + d.completed + d.closed;
      if (sum > m) m = sum;
    }
    return m;
  }, [daily]);

  const rangeLabel = useMemo(() => {
    if (daily.length === 0) return "";
    const first = formatDayShort(daily[0].dayStart);
    const last = formatDayShort(daily[daily.length - 1].dayStart);
    return first === last ? `${last} · daily, stacked` : `${first} – ${last} · daily, stacked`;
  }, [daily]);

  const maxTimeTotal = Math.max(
    1,
    stats?.realMinutesTotal ?? 0,
    stats?.aiMinutesTotal ?? 0,
    stats?.humanMinutesTotal ?? 0,
  );

  const maxTaskMinutes = useMemo(() => {
    let m = 1;
    for (const t of stats?.topTimeTasks ?? []) {
      const best = Math.max(t.aiMinutes, t.realMinutes, t.humanMinutes);
      if (best > m) m = best;
    }
    return m;
  }, [stats?.topTimeTasks]);

  const currentProjectTitle =
    selectedScope === "all"
      ? "ALL PROJECTS"
      : (pageById.get(selectedScope)?.title || "UNTITLED").toUpperCase();

  return (
    <div className={"st-wrap" + (embedded ? " is-embedded" : " is-global")}>
      {!embedded && <span className="ram ghost page-ghost" aria-hidden="true" />}

      <div className="st-container">
        {/* Header */}
        <div className="st-header">
          <div>
            <div className="st-breadcrumb">
              CORRAL &gt; {currentProjectTitle} &gt; <b>STATS</b>
            </div>
            <h1 className="st-title">Statistics</h1>
            <p className="st-subtitle">
              {selectedScope === "all"
                ? "Task activity across all projects"
                : "Task activity for the selected project"}
            </p>
          </div>

          <div className="st-controls">
            <select
              className="tk-select st-scope-select"
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
            >
              <option value="all">All projects ({alivePages.length})</option>
              {alivePages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon || "📄"} {p.title || "Sin título"}
                </option>
              ))}
            </select>

            <div className="st-period-tabs" role="tablist">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  role="tab"
                  aria-selected={days === p.days}
                  className={"st-period-btn" + (days === p.days ? " active" : "")}
                  onClick={() => setDays(p.days)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="st-kpi-grid">
          <div className="st-kpi-card">
            <div className="st-kpi-info">
              <span className="st-kpi-label">
                <i className="st-dot dot-created" /> CREATED
              </span>
              <strong className="st-kpi-val">
                {(stats?.createdCount ?? 0).toLocaleString()}
              </strong>
            </div>
            <Sparkline
              values={daily.map((d) => d.created)}
              strokeVar="var(--yellow)"
            />
          </div>

          <div className="st-kpi-card">
            <div className="st-kpi-info">
              <span className="st-kpi-label">
                <i className="st-dot dot-completed" /> COMPLETED
              </span>
              <strong className="st-kpi-val">
                {(stats?.completedCount ?? 0).toLocaleString()}
              </strong>
            </div>
            <Sparkline
              values={daily.map((d) => d.completed)}
              strokeVar="var(--blue)"
            />
          </div>

          <div className="st-kpi-card">
            <div className="st-kpi-info">
              <span className="st-kpi-label">
                <i className="st-dot dot-closed" /> CLOSED
              </span>
              <strong className="st-kpi-val">
                {(stats?.closedCount ?? 0).toLocaleString()}
              </strong>
            </div>
            <Sparkline
              values={daily.map((d) => d.closed)}
              strokeVar="var(--red)"
            />
          </div>

          <div className="st-kpi-card">
            <div className="st-kpi-info">
              <span className="st-kpi-label">
                <i className="st-dot dot-activity" /> ACTIVITY
              </span>
              <strong className="st-kpi-val">
                {(stats?.activityCount ?? 0).toLocaleString()}
              </strong>
            </div>
            <Sparkline
              values={daily.map((d) => d.activity)}
              strokeVar="var(--green)"
            />
          </div>
        </div>

        {/* Activity Trend Panel */}
        <div className="st-panel">
          <div className="st-panel-head">
            <div>
              <div className="label">ACTIVITY TREND</div>
              <div className="st-panel-sub">{rangeLabel}</div>
            </div>
            <div className="st-legend">
              <span>
                <i className="st-sq dot-created" /> Created{" "}
                <b>{stats?.createdCount ?? 0}</b>
              </span>
              <span>
                <i className="st-sq dot-completed" /> Completed{" "}
                <b>{stats?.completedCount ?? 0}</b>
              </span>
              <span>
                <i className="st-sq dot-closed" /> Closed{" "}
                <b>{stats?.closedCount ?? 0}</b>
              </span>
            </div>
          </div>

          <div className="st-chart-area">
            <div className="st-y-axis">
              <span>{maxStacked}</span>
              <span>{Math.round(maxStacked / 2)}</span>
              <span>0</span>
            </div>
            <div className="st-bars-wrap">
              <div className="st-bars">
                {daily.map((d) => {
                  const cPct = (d.created / maxStacked) * 100;
                  const compPct = (d.completed / maxStacked) * 100;
                  const clPct = (d.closed / maxStacked) * 100;
                  const dateText = formatDayShort(d.dayStart);
                  return (
                    <div
                      key={d.dayStart}
                      className="st-bar-col"
                      title={`${dateText}: ${d.created} created, ${d.completed} completed, ${d.closed} closed`}
                    >
                      <div className="st-bar-stack">
                        {clPct > 0 && (
                          <div
                            className="st-seg seg-closed"
                            style={{ height: `${clPct}%` }}
                          />
                        )}
                        {compPct > 0 && (
                          <div
                            className="st-seg seg-completed"
                            style={{ height: `${compPct}%` }}
                          />
                        )}
                        {cPct > 0 && (
                          <div
                            className="st-seg seg-created"
                            style={{ height: `${cPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="st-x-axis">
                {daily.length > 0 && (
                  <>
                    <span>{formatDayShort(daily[0].dayStart)}</span>
                    {daily.length > 4 && (
                      <span>
                        {formatDayShort(
                          daily[Math.floor(daily.length / 3)].dayStart,
                        )}
                      </span>
                    )}
                    {daily.length > 4 && (
                      <span>
                        {formatDayShort(
                          daily[Math.floor((daily.length * 2) / 3)].dayStart,
                        )}
                      </span>
                    )}
                    {daily.length > 1 && (
                      <span>
                        {formatDayShort(daily[daily.length - 1].dayStart)}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Time Invested Panel */}
        <div className="st-panel">
          <div className="st-panel-head">
            <div>
              <div className="label">TIME INVESTED</div>
              <div className="st-panel-sub">real-world duration vs AI-hours</div>
            </div>
            <span className="st-cap-badge">
              {(stats?.topTimeTasks.length ?? 0)} TASKS LOGGED
            </span>
          </div>

          <div className="st-time-bars">
            <div className="st-time-row">
              <span className="st-time-label">Real time</span>
              <div className="st-time-track">
                <div
                  className="st-time-fill fill-real"
                  style={{
                    width: `${((stats?.realMinutesTotal ?? 0) / maxTimeTotal) * 100}%`,
                  }}
                />
              </div>
              <strong className="st-time-val">
                {formatDuration(stats?.realMinutesTotal ?? 0)}
              </strong>
            </div>

            <div className="st-time-row">
              <span className="st-time-label">AI-hours</span>
              <div className="st-time-track">
                <div
                  className="st-time-fill fill-ai"
                  style={{
                    width: `${((stats?.aiMinutesTotal ?? 0) / maxTimeTotal) * 100}%`,
                  }}
                />
              </div>
              <strong className="st-time-val">
                {formatDuration(stats?.aiMinutesTotal ?? 0)}
              </strong>
            </div>

            <div className="st-time-row">
              <span className="st-time-label">Human time</span>
              <div className="st-time-track">
                <div
                  className="st-time-fill fill-human"
                  style={{
                    width: `${((stats?.humanMinutesTotal ?? 0) / maxTimeTotal) * 100}%`,
                  }}
                />
              </div>
              <strong className="st-time-val">
                {formatDuration(stats?.humanMinutesTotal ?? 0)}
              </strong>
            </div>
          </div>

          <div className="st-top-tasks">
            {(stats?.topTimeTasks ?? []).map((t) => {
              const primaryMins =
                t.aiMinutes > 0
                  ? t.aiMinutes
                  : t.realMinutes > 0
                    ? t.realMinutes
                    : t.humanMinutes;
              const tag =
                t.aiMinutes > 0 ? "AI" : t.realMinutes > 0 ? "Real" : "Human";
              const proj = pageById.get(t.pageId);
              return (
                <div
                  key={t.id}
                  className="st-task-row"
                  onClick={() => {
                    setPageTab(t.pageId, "tasks");
                    openPage(t.pageId);
                  }}
                >
                  <span className="tk-seq">#{t.seq}</span>
                  <span className="st-task-title">
                    {t.title}
                    {selectedScope === "all" && proj && (
                      <span className="st-task-proj">
                        {proj.icon || "📄"} {proj.title || "Sin título"}
                      </span>
                    )}
                  </span>
                  <span className="st-task-dur">
                    {formatDuration(primaryMins)} {tag}
                  </span>
                  <div className="st-task-mini-track">
                    <div
                      className="st-task-mini-fill"
                      style={{
                        width: `${(primaryMins / maxTaskMinutes) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
