import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  PhaseStatus,
  ProjectCategory,
  ProjectPhase,
  TaskActivity,
  TaskItem,
  TaskPatch,
  TaskPriority,
  TaskState,
  TaskType,
  TaskWorkflow,
} from "../api";

type TrackerTab = "backlog" | "board" | "history";

const BOARD_COLUMNS: { key: TaskWorkflow; label: string; dotClass: string }[] = [
  { key: "todo", label: "TODO", dotClass: "dot-todo" },
  { key: "doing", label: "DOING", dotClass: "dot-doing" },
  { key: "qa", label: "QA", dotClass: "dot-qa" },
  { key: "done", label: "DONE", dotClass: "dot-done" },
];

const PRIORITY_META: Record<TaskPriority, { label: string; cls: string }> = {
  urgent: { label: "! URGENT", cls: "prio-urgent" },
  high: { label: "∧ HIGH", cls: "prio-high" },
  medium: { label: "— MEDIUM", cls: "prio-medium" },
  low: { label: "∨ LOW", cls: "prio-low" },
};

export function formatRelativeTime(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDuration(mins: number): string {
  if (!mins || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function filterTasks(
  tasks: TaskItem[],
  opts: {
    tab: TrackerTab;
    search: string;
    assignee: string;
    epicId: string;
    category: string;
    state: string;
    priority: string;
  },
): TaskItem[] {
  const q = opts.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (opts.tab === "history") {
      if (t.state !== "closed") return false;
    } else if (opts.tab === "backlog") {
      if (t.state === "closed" || t.workflow !== "backlog") return false;
    } else {
      // board
      if (t.state === "closed" || t.workflow === "backlog") return false;
    }

    if (opts.assignee !== "all" && t.assignee.toLowerCase() !== opts.assignee.toLowerCase()) {
      return false;
    }
    if (opts.epicId !== "all" && (t.epicId ?? "") !== opts.epicId) {
      return false;
    }
    if (opts.category !== "all" && !t.categories.includes(opts.category)) {
      return false;
    }
    if (opts.state !== "all" && t.state !== opts.state) {
      return false;
    }
    if (opts.priority !== "all" && t.priority !== opts.priority) {
      return false;
    }
    if (q) {
      const matchSeq = `#${t.seq}`.includes(q) || String(t.seq) === q;
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description.toLowerCase().includes(q);
      if (!matchSeq && !matchTitle && !matchDesc) return false;
    }
    return true;
  });
}

const TaskCard = memo(function TaskCard({
  task,
  allTasks,
  onSelect,
  onDragStart,
}: {
  task: TaskItem;
  allTasks: TaskItem[];
  onSelect: (t: TaskItem) => void;
  onDragStart: (id: string) => void;
}) {
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const hasUnresolvedDep = useMemo(() => {
    if (task.dependsOn.length === 0) return false;
    return task.dependsOn.some((depId) => {
      const dep = allTasks.find((x) => x.id === depId);
      return dep && dep.workflow !== "done" && dep.state !== "closed";
    });
  }, [task.dependsOn, allTasks]);

  const isBlocked = task.state === "blocked" || hasUnresolvedDep;

  return (
    <div
      className={"tk-card" + (isBlocked ? " is-blocked" : "")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onClick={() => onSelect(task)}
    >
      <div className="tk-card-top">
        <div className="tk-card-badges">
          <span className="tk-seq">#{task.seq}</span>
          <span className={`tk-badge ${prio.cls}`}>{prio.label}</span>
          {isBlocked && <span className="tk-badge badge-blocked">BLOCKED</span>}
          {task.categories.map((cat) => (
            <span key={cat} className="tk-badge badge-cat">
              {cat}
            </span>
          ))}
        </div>
        <span className={`tk-type type-${task.taskType}`}>{task.taskType}</span>
      </div>
      <div className="tk-card-title">{task.title || "Untitled task"}</div>
      <div className="tk-card-foot">
        <span className="tk-assignee">{task.assignee || "Unassigned"}</span>
        <div className="tk-card-meta">
          {task.viaMcp && <span className="tk-mcp-pill" title="Posted through the MCP">MCP</span>}
          {task.commentCount > 0 && <span className="tk-comments-pill">💬 {task.commentCount}</span>}
        </div>
      </div>
    </div>
  );
});

export default memo(function TaskTracker({
  pageId,
  onCountChange,
}: {
  pageId: string;
  onCountChange?: (count: number) => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [tab, setTab] = useState<TrackerTab>("board");

  // Filters
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [epicFilter, setEpicFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Modals
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<TaskWorkflow | null>(null);

  const reload = useCallback(async () => {
    const data = await api.getProjectTracker(pageId);
    setTasks(data.tasks);
    setPhases(data.phases);
    setCategories(data.categories);
    onCountChange?.(data.tasks.filter((t) => t.state !== "closed").length);
  }, [pageId, onCountChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activePhase = useMemo(
    () => phases.find((p) => p.status === "active") ?? null,
    [phases],
  );

  const backlogCount = useMemo(
    () => tasks.filter((t) => t.state !== "closed" && t.workflow === "backlog").length,
    [tasks],
  );
  const boardCount = useMemo(
    () => tasks.filter((t) => t.state !== "closed" && t.workflow !== "backlog").length,
    [tasks],
  );
  const historyCount = useMemo(
    () => tasks.filter((t) => t.state === "closed").length,
    [tasks],
  );

  const assignees = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) {
      if (t.assignee) s.add(t.assignee);
    }
    return Array.from(s).sort();
  }, [tasks]);

  const epics = useMemo(
    () => tasks.filter((t) => t.taskType === "epic"),
    [tasks],
  );

  const allCategoryNames = useMemo(() => {
    const s = new Set<string>(categories.map((c) => c.name));
    for (const t of tasks) {
      for (const c of t.categories) s.add(c);
    }
    return Array.from(s).sort();
  }, [categories, tasks]);

  const filteredTasks = useMemo(
    () =>
      filterTasks(tasks, {
        tab,
        search,
        assignee: assigneeFilter,
        epicId: epicFilter,
        category: categoryFilter,
        state: stateFilter,
        priority: priorityFilter,
      }),
    [tasks, tab, search, assigneeFilter, epicFilter, categoryFilter, stateFilter, priorityFilter],
  );

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId],
  );

  const handlePatchTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      const updated = await api.updateTask(id, patch);
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === id ? updated : t));
        onCountChange?.(next.filter((t) => t.state !== "closed").length);
        return next;
      });
    },
    [onCountChange],
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      await api.deleteTask(id);
      setSelectedTaskId(null);
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== id);
        onCountChange?.(next.filter((t) => t.state !== "closed").length);
        return next;
      });
    },
    [onCountChange],
  );

  const handleDropToColumn = async (col: TaskWorkflow) => {
    const id = dragTaskId;
    setDropCol(null);
    setDragTaskId(null);
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.workflow === col) return;
    await handlePatchTask(id, { workflow: col });
  };

  return (
    <div className="tk-wrap">
      {/* Header */}
      <div className="tk-header">
        <div className="tk-header-left">
          <div className="tk-title-block">
            <span className="tk-eyebrow">TASKS</span>
            <h2 className="tk-heading">Task tracker</h2>
            <span className="tk-sub">
              Active phase: <b>{activePhase ? activePhase.name : "None"}</b>
            </span>
          </div>
          <div className="tk-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "backlog"}
              className={"tk-tab" + (tab === "backlog" ? " active" : "")}
              onClick={() => setTab("backlog")}
            >
              Backlog <span className="tk-tab-count">{backlogCount}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "board"}
              className={"tk-tab" + (tab === "board" ? " active" : "")}
              onClick={() => setTab("board")}
            >
              Board <span className="tk-tab-count">{boardCount}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "history"}
              className={"tk-tab" + (tab === "history" ? " active" : "")}
              onClick={() => setTab("history")}
            >
              History <span className="tk-tab-count">{historyCount}</span>
            </button>
          </div>
        </div>
        <div className="tk-header-actions">
          <button className="btn" onClick={() => setPhasesOpen(true)}>
            Manage Phases
          </button>
          <button className="btn" onClick={() => setCategoriesOpen(true)}>
            Manage Categories
          </button>
          <button className="btn primary" onClick={() => setNewTaskOpen(true)}>
            + New Task
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="tk-filters">
        <div className="tk-filter-group search-col">
          <label className="label">SEARCH</label>
          <input
            className="tk-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="tk-filter-group">
          <label className="label">ASSIGNEE</label>
          <select
            className="tk-select"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="tk-filter-group">
          <label className="label">EPIC</label>
          <select
            className="tk-select"
            value={epicFilter}
            onChange={(e) => setEpicFilter(e.target.value)}
          >
            <option value="all">All</option>
            {epics.map((ep) => (
              <option key={ep.id} value={ep.id}>
                #{ep.seq} {ep.title}
              </option>
            ))}
          </select>
        </div>
        <div className="tk-filter-group">
          <label className="label">CATEGORY</label>
          <select
            className="tk-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All</option>
            {allCategoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="tk-filter-group">
          <label className="label">STATE</label>
          <select
            className="tk-select"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="blocked">Blocked</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="tk-filter-group">
          <label className="label">PRIORITY</label>
          <select
            className="tk-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Main Content: Board vs Backlog/History */}
      {tab === "board" ? (
        <div className="tk-board">
          {BOARD_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.workflow === col.key);
            return (
              <div
                key={col.key}
                className={"tk-col" + (dropCol === col.key ? " drop-target" : "")}
                onDragOver={(e) => {
                  if (!dragTaskId) return;
                  e.preventDefault();
                  setDropCol(col.key);
                }}
                onDragLeave={() => {
                  if (dropCol === col.key) setDropCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDropToColumn(col.key);
                }}
              >
                <div className="tk-col-head">
                  <span className={`tk-dot ${col.dotClass}`} />
                  <span className="tk-col-name">{col.label}</span>
                  <span className="tk-col-count">{colTasks.length}</span>
                </div>
                <div className="tk-col-list">
                  {colTasks.length === 0 && (
                    <div className="tk-col-empty">No tasks in {col.label}</div>
                  )}
                  {colTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      allTasks={tasks}
                      onSelect={(item) => setSelectedTaskId(item.id)}
                      onDragStart={(id) => setDragTaskId(id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tk-list-view">
          {filteredTasks.length === 0 ? (
            <div className="tk-empty-box">
              No tasks in {tab === "backlog" ? "Backlog" : "History"}.
            </div>
          ) : (
            <div className="tk-list-grid">
              {filteredTasks.map((t) => (
                <div key={t.id} className="tk-list-item-wrap">
                  <TaskCard
                    task={t}
                    allTasks={tasks}
                    onSelect={(item) => setSelectedTaskId(item.id)}
                    onDragStart={(id) => setDragTaskId(id)}
                  />
                  <div className="tk-list-quick-actions">
                    {tab === "backlog" ? (
                      <button
                        className="btn"
                        onClick={() => void handlePatchTask(t.id, { workflow: "todo" })}
                      >
                        Move to Board (TODO)
                      </button>
                    ) : (
                      <button
                        className="btn"
                        onClick={() => void handlePatchTask(t.id, { state: "open" })}
                      >
                        Reopen Task
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Task Modal */}
      {newTaskOpen && (
        <NewTaskModal
          pageId={pageId}
          defaultWorkflow={tab === "backlog" ? "backlog" : "todo"}
          phases={phases}
          epics={epics}
          categories={allCategoryNames}
          onClose={() => setNewTaskOpen(false)}
          onCreated={(created) => {
            setNewTaskOpen(false);
            setTasks((prev) => {
              const next = [created, ...prev];
              onCountChange?.(next.filter((t) => t.state !== "closed").length);
              return next;
            });
          }}
        />
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          allTasks={tasks}
          phases={phases}
          epics={epics}
          allCategories={allCategoryNames}
          onClose={() => setSelectedTaskId(null)}
          onPatch={(patch) => handlePatchTask(selectedTask.id, patch)}
          onDelete={() => handleDeleteTask(selectedTask.id)}
          onReloadTracker={reload}
        />
      )}

      {/* Manage Phases Modal */}
      {phasesOpen && (
        <ManagePhasesModal
          pageId={pageId}
          phases={phases}
          onClose={() => setPhasesOpen(false)}
          onChanged={reload}
        />
      )}

      {/* Manage Categories Modal */}
      {categoriesOpen && (
        <ManageCategoriesModal
          pageId={pageId}
          categories={categories}
          onClose={() => setCategoriesOpen(false)}
          onChanged={reload}
        />
      )}
    </div>
  );
});

function NewTaskModal({
  pageId,
  defaultWorkflow,
  phases,
  epics,
  categories,
  onClose,
  onCreated,
}: {
  pageId: string;
  defaultWorkflow: TaskWorkflow;
  phases: ProjectPhase[];
  epics: TaskItem[];
  categories: string[];
  onClose: () => void;
  onCreated: (t: TaskItem) => void;
}) {
  const activePhase = phases.find((p) => p.status === "active");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workflow, setWorkflow] = useState<TaskWorkflow>(defaultWorkflow);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [assignee, setAssignee] = useState("Luccas");
  const [phaseId, setPhaseId] = useState<string>(activePhase?.id ?? "");
  const [epicId, setEpicId] = useState<string>("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [aiMinutes, setAiMinutes] = useState(0);
  const [realMinutes, setRealMinutes] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const created = await api.createTask({
      pageId,
      title: title.trim(),
      description,
      workflow,
      priority,
      taskType,
      assignee: assignee.trim() || "Luccas",
      phaseId: phaseId || null,
      epicId: epicId || null,
      categories: selectedCats,
      aiMinutes,
      realMinutes,
    });
    onCreated(created);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tk-modal-create" onClick={(e) => e.stopPropagation()}>
        <div className="tk-modal-head">
          <div>
            <span className="tk-eyebrow">PROJECT TASK</span>
            <h3>Create New Task</h3>
          </div>
          <button className="tk-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="tk-create-form" onSubmit={submit}>
          <label className="label">TITLE</label>
          <input
            className="tk-input"
            autoFocus
            placeholder="Task title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="label">DESCRIPTION</label>
          <textarea
            className="tk-textarea"
            rows={4}
            placeholder="Describe context, acceptance criteria, or notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="tk-form-grid">
            <div>
              <label className="label">WORKFLOW</label>
              <select
                className="tk-select"
                value={workflow}
                onChange={(e) => setWorkflow(e.target.value as TaskWorkflow)}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">TODO</option>
                <option value="doing">DOING</option>
                <option value="qa">QA</option>
                <option value="done">DONE</option>
              </select>
            </div>
            <div>
              <label className="label">PRIORITY</label>
              <select
                className="tk-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="label">TYPE</label>
              <select
                className="tk-select"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
              >
                <option value="task">task</option>
                <option value="epic">epic</option>
                <option value="bug">bug</option>
                <option value="stub">stub</option>
              </select>
            </div>
            <div>
              <label className="label">ASSIGNEE</label>
              <input
                className="tk-input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              />
            </div>
            <div>
              <label className="label">PHASE</label>
              <select
                className="tk-select"
                value={phaseId}
                onChange={(e) => setPhaseId(e.target.value)}
              >
                <option value="">No phase</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">EPIC</label>
              <select
                className="tk-select"
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
              >
                <option value="">No epic</option>
                {epics.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    #{ep.seq} {ep.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">AI TIME (MIN)</label>
              <input
                type="number"
                min={0}
                className="tk-input"
                value={aiMinutes}
                onChange={(e) => setAiMinutes(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="label">REAL TIME (MIN)</label>
              <input
                type="number"
                min={0}
                className="tk-input"
                value={realMinutes}
                onChange={(e) => setRealMinutes(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          {categories.length > 0 && (
            <div>
              <label className="label">CATEGORIES</label>
              <div className="tk-chip-row">
                {categories.map((c) => {
                  const active = selectedCats.includes(c);
                  return (
                    <button
                      type="button"
                      key={c}
                      className={"tk-chip-toggle" + (active ? " active" : "")}
                      onClick={() =>
                        setSelectedCats((prev) =>
                          active ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="tk-modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  allTasks,
  phases,
  epics,
  allCategories,
  onClose,
  onPatch,
  onDelete,
  onReloadTracker,
}: {
  task: TaskItem;
  allTasks: TaskItem[];
  phases: ProjectPhase[];
  epics: TaskItem[];
  allCategories: string[];
  onClose: () => void;
  onPatch: (p: TaskPatch) => Promise<void>;
  onDelete: () => Promise<void>;
  onReloadTracker: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [addingDep, setAddingDep] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setDescDraft(task.description);
  }, [task.id, task.title, task.description]);

  const loadActivity = useCallback(async () => {
    const list = await api.listTaskActivity(task.id);
    setActivities(list);
  }, [task.id]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity, task.workflow, task.state]);

  const submitComment = async () => {
    const text = commentBody.trim();
    if (!text) return;
    setCommentBody("");
    await api.addTaskComment(task.id, task.assignee || "Luccas", text, false);
    await loadActivity();
    await onReloadTracker();
  };

  const commentCount = useMemo(
    () => activities.filter((a) => a.kind === "comment").length,
    [activities],
  );

  const totalMinutes = task.realMinutes || task.aiMinutes || task.humanMinutes;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tk-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top bar */}
        <div className="tk-detail-head">
          <div className="tk-detail-id-row">
            <span className="tk-detail-seq">#{task.seq}</span>
            <button
              className={`tk-state-pill state-${task.state}`}
              title="Click to cycle task state (OPEN / BLOCKED / CLOSED)"
              onClick={() => {
                const order: TaskState[] = ["open", "blocked", "closed"];
                const next = order[(order.indexOf(task.state) + 1) % order.length];
                void onPatch({ state: next });
              }}
            >
              ● {task.state.toUpperCase()}
            </button>
          </div>
          <div className="tk-detail-top-actions">
            <button className="tk-del-link" onClick={() => void onDelete()}>
              Delete
            </button>
            <button className="tk-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <input
          className="tk-detail-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== task.title) {
              void onPatch({ title: title.trim() });
            }
          }}
        />

        <div className="tk-detail-body">
          {/* Left Column */}
          <div className="tk-detail-main">
            <div className="tk-section-label">DESCRIPTION</div>
            <div className="tk-desc-box">
              {editingDesc ? (
                <div className="tk-desc-editor">
                  <textarea
                    className="tk-textarea"
                    rows={5}
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                  />
                  <div className="tk-desc-editor-actions">
                    <button
                      className="btn"
                      onClick={() => {
                        setDescDraft(task.description);
                        setEditingDesc(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => {
                        void onPatch({ description: descDraft });
                        setEditingDesc(false);
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="tk-edit-icon"
                    title="Edit description"
                    onClick={() => setEditingDesc(true)}
                  >
                    ✎
                  </button>
                  <div className="tk-desc-text">
                    {task.description || "No description provided. Click ✎ to add details."}
                  </div>
                  {task.viaMcp && (
                    <div className="tk-mcp-signature">Posted through the MCP 🤖</div>
                  )}
                </>
              )}
            </div>

            <div className="tk-activity-head">
              <span className="tk-section-label">ACTIVITY</span>
              <span className="tk-comment-counter">💬 {commentCount}</span>
            </div>

            <div className="tk-comment-box">
              <textarea
                className="tk-comment-input"
                rows={3}
                placeholder="Write a comment... (markdown supported)"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
              />
              <div className="tk-comment-bar">
                <span className="tk-md-hint">
                  **bold**, *italic*, `code`, ~~strikethrough~~ · Ctrl+Enter to submit
                </span>
                <button className="btn primary" onClick={() => void submitComment()}>
                  Post Comment
                </button>
              </div>
            </div>

            <div className="tk-timeline">
              {activities.map((act) =>
                act.kind === "event" ? (
                  <div key={act.id} className="tk-tl-event">
                    <span className="tk-tl-dot" />
                    <div className="tk-tl-event-box">
                      <span>
                        <b>
                          {act.author}
                          {act.viaMcp ? " (via MCP)" : ""}
                        </b>{" "}
                        {act.body}
                      </span>
                      <span className="tk-tl-time">{formatRelativeTime(act.createdAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div key={act.id} className="tk-tl-comment">
                    <span className="tk-tl-dot comment-dot" />
                    <div className="tk-tl-comment-card">
                      <div className="tk-tl-comment-head">
                        <div className="tk-tl-author">
                          <span className="tk-avatar">
                            {(act.author || "U").slice(0, 2).toUpperCase()}
                          </span>
                          <b>
                            {act.author}
                            {act.viaMcp ? " (via MCP)" : ""}
                          </b>
                          <span className="tk-tl-time">{formatRelativeTime(act.createdAt)}</span>
                        </div>
                        <div className="tk-tl-actions">
                          <button
                            onClick={() => void navigator.clipboard?.writeText(act.body)}
                          >
                            copy
                          </button>
                          <button
                            onClick={() =>
                              setCommentBody((prev) =>
                                prev ? `${prev}\n> ${act.body}\n` : `> ${act.body}\n`,
                              )
                            }
                          >
                            reply
                          </button>
                          <button
                            onClick={() => {
                              setEditingCommentId(act.id);
                              setEditingCommentBody(act.body);
                            }}
                          >
                            edit
                          </button>
                          <button
                            onClick={async () => {
                              await api.deleteTaskComment(act.id);
                              await loadActivity();
                              await onReloadTracker();
                            }}
                          >
                            del
                          </button>
                        </div>
                      </div>
                      {editingCommentId === act.id ? (
                        <div className="tk-desc-editor">
                          <textarea
                            className="tk-textarea"
                            rows={3}
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                          />
                          <div className="tk-desc-editor-actions">
                            <button className="btn" onClick={() => setEditingCommentId(null)}>
                              Cancel
                            </button>
                            <button
                              className="btn primary"
                              onClick={async () => {
                                await api.updateTaskComment(act.id, editingCommentBody);
                                setEditingCommentId(null);
                                await loadActivity();
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="tk-tl-comment-body">{act.body}</div>
                      )}
                      {act.viaMcp && (
                        <div className="tk-mcp-signature">Posted through the MCP 🤖</div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Right Column (Metadata Sidebar) */}
          <aside className="tk-detail-side">
            <div className="tk-meta-block">
              <span className="label">PHASE</span>
              <select
                className="tk-side-select"
                value={task.phaseId ?? ""}
                onChange={(e) => void onPatch({ phaseId: e.target.value })}
              >
                <option value="">No phase</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="tk-meta-block">
              <span className="label">EPIC</span>
              <select
                className="tk-side-select"
                value={task.epicId ?? ""}
                onChange={(e) => void onPatch({ epicId: e.target.value })}
              >
                <option value="">No epic</option>
                {epics
                  .filter((ep) => ep.id !== task.id)
                  .map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      #{ep.seq} {ep.title}
                    </option>
                  ))}
              </select>
            </div>

            <div className="tk-meta-block">
              <span className="label">AUTHOR</span>
              <div className="tk-person-row">
                <span className="tk-avatar">{(task.author || "L").slice(0, 1).toUpperCase()}</span>
                <span>{task.author}</span>
              </div>
            </div>

            <div className="tk-meta-block">
              <span className="label">ASSIGNEE</span>
              <div className="tk-person-row">
                <span className="tk-avatar">
                  {(task.assignee || "L").slice(0, 1).toUpperCase()}
                </span>
                <input
                  className="tk-side-input"
                  defaultValue={task.assignee}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== task.assignee) void onPatch({ assignee: v });
                  }}
                />
              </div>
            </div>

            <div className="tk-meta-block">
              <span className="label">TYPE</span>
              <select
                className="tk-side-select"
                value={task.taskType}
                onChange={(e) => void onPatch({ taskType: e.target.value as TaskType })}
              >
                <option value="task">task</option>
                <option value="epic">epic</option>
                <option value="bug">bug</option>
                <option value="stub">stub</option>
              </select>
            </div>

            <div className="tk-meta-block">
              <span className="label">PRIORITY</span>
              <select
                className="tk-side-select"
                value={task.priority}
                onChange={(e) => void onPatch({ priority: e.target.value as TaskPriority })}
              >
                <option value="urgent">! URGENT</option>
                <option value="high">∧ HIGH</option>
                <option value="medium">— MEDIUM</option>
                <option value="low">∨ LOW</option>
              </select>
            </div>

            <div className="tk-meta-block">
              <span className="label">WORKFLOW</span>
              <select
                className="tk-side-select"
                value={task.workflow}
                onChange={(e) => void onPatch({ workflow: e.target.value as TaskWorkflow })}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">TODO</option>
                <option value="doing">DOING</option>
                <option value="qa">QA</option>
                <option value="done">DONE</option>
              </select>
            </div>

            <div className="tk-meta-block">
              <span className="label">OPENED</span>
              <span className="tk-meta-val">{formatRelativeTime(task.createdAt)}</span>
            </div>

            <div className="tk-meta-block">
              <span className="label">UPDATED</span>
              <span className="tk-meta-val">{formatRelativeTime(task.updatedAt)}</span>
            </div>

            <div className="tk-meta-block">
              <span className="label">CATEGORIES</span>
              <div className="tk-side-tags">
                {task.categories.map((cat) => (
                  <span key={cat} className="tk-badge badge-cat">
                    {cat}
                    <button
                      onClick={() =>
                        void onPatch({
                          categories: task.categories.filter((c) => c !== cat),
                        })
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {addingCat ? (
                <div className="tk-inline-add">
                  <input
                    className="tk-side-input"
                    placeholder="Category..."
                    list="corral-cat-options"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = newCategoryInput.trim().toUpperCase();
                        if (val && !task.categories.includes(val)) {
                          void onPatch({ categories: [...task.categories, val] });
                        }
                        setNewCategoryInput("");
                        setAddingCat(false);
                      }
                    }}
                  />
                  <datalist id="corral-cat-options">
                    {allCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              ) : (
                <button className="tk-add-chip-btn" onClick={() => setAddingCat(true)}>
                  + Add category
                </button>
              )}
            </div>

            <div className="tk-meta-block">
              <span className="label">DEPENDS ON</span>
              <div className="tk-side-tags">
                {task.dependsOn.map((depId) => {
                  const dep = allTasks.find((x) => x.id === depId);
                  return (
                    <span key={depId} className="tk-badge badge-cat">
                      {dep ? `#${dep.seq}` : depId.slice(0, 6)}
                      <button
                        onClick={() =>
                          void onPatch({
                            dependsOn: task.dependsOn.filter((d) => d !== depId),
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
              {addingDep ? (
                <select
                  className="tk-side-select"
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !task.dependsOn.includes(val)) {
                      void onPatch({ dependsOn: [...task.dependsOn, val] });
                    }
                    setAddingDep(false);
                  }}
                >
                  <option value="">Select task...</option>
                  {allTasks
                    .filter((x) => x.id !== task.id && !task.dependsOn.includes(x.id))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        #{x.seq} {x.title}
                      </option>
                    ))}
                </select>
              ) : (
                <button className="tk-add-chip-btn" onClick={() => setAddingDep(true)}>
                  + Add dependency
                </button>
              )}
            </div>

            <div className="tk-meta-block">
              <span className="label">TIME ({formatDuration(totalMinutes)})</span>
              <div className="tk-time-inputs">
                <label>
                  <span>AI (m)</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={task.aiMinutes}
                    onBlur={(e) =>
                      void onPatch({ aiMinutes: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
                <label>
                  <span>Real (m)</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={task.realMinutes}
                    onBlur={(e) =>
                      void onPatch({ realMinutes: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
                <label>
                  <span>Human (m)</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={task.humanMinutes}
                    onBlur={(e) =>
                      void onPatch({ humanMinutes: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ManagePhasesModal({
  pageId,
  phases,
  onClose,
  onChanged,
}: {
  pageId: string;
  phases: ProjectPhase[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<"list" | "create">("list");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [activateOnCreate, setActivateOnCreate] = useState(true);
  const [pageIdx, setPageIdx] = useState(1);
  const PAGE_SIZE = 6;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return phases;
    return phases.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [phases, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((pageIdx - 1) * PAGE_SIZE, pageIdx * PAGE_SIZE);

  const activePhases = paged.filter((p) => p.status === "active");
  const otherPhases = paged.filter((p) => p.status === "other");
  const completedPhases = paged.filter((p) => p.status === "completed");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.createPhase(pageId, newName.trim(), activateOnCreate);
    setNewName("");
    setSubTab("list");
    await onChanged();
  };

  const setStatus = async (id: string, status: PhaseStatus) => {
    await api.updatePhaseStatus(id, status);
    await onChanged();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tk-phases-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tk-modal-head">
          <div>
            <span className="tk-eyebrow">PROJECT</span>
            <h3>Manage Phases</h3>
          </div>
          <button className="tk-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="tk-phase-tabs">
          <button
            className={"tk-tab" + (subTab === "list" ? " active" : "")}
            onClick={() => setSubTab("list")}
          >
            Phases
          </button>
          <button
            className={"tk-tab" + (subTab === "create" ? " active" : "")}
            onClick={() => setSubTab("create")}
          >
            Create New Phase
          </button>
        </div>

        {subTab === "create" ? (
          <form className="tk-create-form" onSubmit={handleCreate}>
            <label className="label">PHASE NAME / VERSION</label>
            <input
              className="tk-input"
              autoFocus
              placeholder="e.g. 3.0, MVP, Polishing for Production..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <label className="tk-checkbox-row">
              <input
                type="checkbox"
                checked={activateOnCreate}
                onChange={(e) => setActivateOnCreate(e.target.checked)}
              />
              <span>Set as Active Phase immediately</span>
            </label>
            <div className="tk-modal-foot">
              <button type="button" className="btn" onClick={() => setSubTab("list")}>
                Cancel
              </button>
              <button type="submit" className="btn primary">
                Create Phase
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="tk-phases-toolbar">
              <input
                className="tk-input"
                placeholder="Search by name or ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPageIdx(1);
                }}
              />
              <span className="tk-phases-range">
                {filtered.length === 0
                  ? "0 of 0"
                  : `${(pageIdx - 1) * PAGE_SIZE + 1}–${Math.min(
                      pageIdx * PAGE_SIZE,
                      filtered.length,
                    )} of ${filtered.length}`}
              </span>
            </div>

            <div className="tk-phases-table">
              <div className="tk-phases-thead">
                <span>PHASE</span>
                <span>CREATED</span>
                <span>ACTIVATED</span>
                <span>COMPLETED</span>
                <span>ACTIONS</span>
              </div>

              {activePhases.length > 0 && (
                <>
                  <div className="tk-phase-group-row active-group">ACTIVE PHASE</div>
                  {activePhases.map((p) => (
                    <div key={p.id} className="tk-phase-row is-active">
                      <span className="tk-phase-name">
                        <b>{p.name}</b> <span className="tk-phase-badge active">ACTIVE</span>
                      </span>
                      <span>{formatShortDate(p.createdAt)}</span>
                      <span>{formatShortDate(p.activatedAt)}</span>
                      <span>{formatShortDate(p.completedAt)}</span>
                      <span className="tk-phase-actions">
                        <button onClick={() => void setStatus(p.id, "completed")}>Complete</button>
                      </span>
                    </div>
                  ))}
                </>
              )}

              {otherPhases.length > 0 && (
                <>
                  <div className="tk-phase-group-row other-group">OTHER PHASES</div>
                  {otherPhases.map((p) => (
                    <div key={p.id} className="tk-phase-row">
                      <span className="tk-phase-name">
                        <b>{p.name}</b>
                      </span>
                      <span>{formatShortDate(p.createdAt)}</span>
                      <span>{formatShortDate(p.activatedAt)}</span>
                      <span>{formatShortDate(p.completedAt)}</span>
                      <span className="tk-phase-actions">
                        <button onClick={() => void setStatus(p.id, "active")}>Activate</button>
                        <button onClick={() => void setStatus(p.id, "completed")}>Complete</button>
                        <button
                          className="danger"
                          onClick={async () => {
                            await api.deletePhase(p.id);
                            await onChanged();
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                </>
              )}

              {completedPhases.length > 0 && (
                <>
                  <div className="tk-phase-group-row completed-group">COMPLETED PHASES</div>
                  {completedPhases.map((p) => (
                    <div key={p.id} className="tk-phase-row">
                      <span className="tk-phase-name">
                        <b>{p.name}</b>{" "}
                        <span className="tk-phase-badge completed">COMPLETED</span>
                      </span>
                      <span>{formatShortDate(p.createdAt)}</span>
                      <span>{formatShortDate(p.activatedAt)}</span>
                      <span>{formatShortDate(p.completedAt)}</span>
                      <span className="tk-phase-actions">
                        <button onClick={() => void setStatus(p.id, "active")}>Reactivate</button>
                        <button
                          className="danger"
                          onClick={async () => {
                            await api.deletePhase(p.id);
                            await onChanged();
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                </>
              )}

              {filtered.length === 0 && (
                <div className="tk-empty-box">
                  No phases created yet. Use "Create New Phase" to start.
                </div>
              )}
            </div>

            <div className="tk-phases-pagination">
              <button
                className="btn"
                disabled={pageIdx <= 1}
                onClick={() => setPageIdx((x) => Math.max(1, x - 1))}
              >
                Previous
              </button>
              <span className="tk-page-indicator">
                Page {pageIdx} of {totalPages}
              </span>
              <button
                className="btn"
                disabled={pageIdx >= totalPages}
                onClick={() => setPageIdx((x) => Math.min(totalPages, x + 1))}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ManageCategoriesModal({
  pageId,
  categories,
  onClose,
  onChanged,
}: {
  pageId: string;
  categories: ProjectCategory[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createCategory(pageId, name.trim());
    setName("");
    await onChanged();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal tk-cats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tk-modal-head">
          <div>
            <span className="tk-eyebrow">PROJECT</span>
            <h3>Manage Categories</h3>
          </div>
          <button className="tk-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="tk-cat-add-row" onSubmit={add}>
          <input
            className="tk-input"
            autoFocus
            placeholder="New category tag (e.g. MOBILE, INFRA, UI)..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn primary">
            Add
          </button>
        </form>
        <div className="tk-cats-list">
          {categories.length === 0 && (
            <div className="tk-empty-box">No categories defined for this project.</div>
          )}
          {categories.map((c) => (
            <div key={c.id} className="tk-cat-item">
              <span className="tk-badge badge-cat">{c.name}</span>
              <button
                className="tk-del-link"
                onClick={async () => {
                  await api.deleteCategory(c.id);
                  await onChanged();
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
