import { invoke } from "@tauri-apps/api/core";

export interface PageMeta {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: string | null;
  position: number;
  favorite: boolean;
  deletedAt: number | null;
  updatedAt: number;
}

export interface PagePatch {
  title?: string;
  icon?: string; // "" = quitar
  cover?: string;
  content?: string;
  body?: string;
  favorite?: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  icon: string | null;
  snippet: string;
}

export type TaskWorkflow = "backlog" | "todo" | "doing" | "qa" | "done";
export type TaskState = "open" | "blocked" | "closed";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskType = "task" | "epic" | "bug" | "stub";
export type PhaseStatus = "active" | "other" | "completed";

export interface ProjectPhase {
  id: string;
  pageId: string;
  name: string;
  status: PhaseStatus;
  createdAt: number;
  activatedAt: number | null;
  completedAt: number | null;
}

export interface ProjectCategory {
  id: string;
  pageId: string;
  name: string;
  createdAt: number;
}

export interface TaskItem {
  id: string;
  pageId: string;
  seq: number;
  title: string;
  description: string;
  workflow: TaskWorkflow;
  state: TaskState;
  priority: TaskPriority;
  taskType: TaskType;
  author: string;
  assignee: string;
  phaseId: string | null;
  epicId: string | null;
  categories: string[];
  dependsOn: string[];
  realMinutes: number;
  aiMinutes: number;
  humanMinutes: number;
  viaMcp: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  closedAt: number | null;
  commentCount: number;
}

export interface TaskCreate {
  pageId: string;
  title: string;
  description?: string;
  workflow?: TaskWorkflow;
  state?: TaskState;
  priority?: TaskPriority;
  taskType?: TaskType;
  author?: string;
  assignee?: string;
  phaseId?: string | null;
  epicId?: string | null;
  categories?: string[];
  dependsOn?: string[];
  realMinutes?: number;
  aiMinutes?: number;
  humanMinutes?: number;
  viaMcp?: boolean;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  workflow?: TaskWorkflow;
  state?: TaskState;
  priority?: TaskPriority;
  taskType?: TaskType;
  assignee?: string;
  phaseId?: string; // "" = quitar
  epicId?: string; // "" = quitar
  categories?: string[];
  dependsOn?: string[];
  realMinutes?: number;
  aiMinutes?: number;
  humanMinutes?: number;
  position?: number;
  actor?: string;
  viaMcp?: boolean;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  pageId: string;
  kind: "event" | "comment";
  author: string;
  body: string;
  viaMcp: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectTrackerData {
  tasks: TaskItem[];
  phases: ProjectPhase[];
  categories: ProjectCategory[];
}

export interface DailyStatPoint {
  dayStart: number;
  label: string;
  created: number;
  completed: number;
  closed: number;
  activity: number;
}

export interface TaskTimeEntry {
  id: string;
  pageId: string;
  seq: number;
  title: string;
  realMinutes: number;
  aiMinutes: number;
  humanMinutes: number;
}

export interface StatsSummary {
  createdCount: number;
  completedCount: number;
  closedCount: number;
  activityCount: number;
  realMinutesTotal: number;
  aiMinutesTotal: number;
  humanMinutesTotal: number;
  daily: DailyStatPoint[];
  topTimeTasks: TaskTimeEntry[];
}

const contentCache = new Map<string, string>();
const inFlightContent = new Map<string, Promise<string>>();
const searchCache = new Map<string, SearchHit[]>();
const inFlightSearch = new Map<string, Promise<SearchHit[]>>();
let hasUserCache: boolean | null = null;

const MAX_SEARCH_CACHE = 50;

export function clearSearchCache() {
  searchCache.clear();
  inFlightSearch.clear();
}

export function peekCachedContent(id: string): string | undefined {
  return contentCache.get(id);
}

export function evictCachedContent(ids: Iterable<string>) {
  for (const id of ids) {
    contentCache.delete(id);
    inFlightContent.delete(id);
  }
}

export const api = {
  hasUser: async () => {
    if (hasUserCache === true) return true;
    const res = await invoke<boolean>("has_user");
    if (res) hasUserCache = true;
    return res;
  },
  register: async (email: string, password: string) => {
    await invoke<void>("register", { email, password });
    hasUserCache = true;
  },
  login: async (email: string, password: string) => {
    await invoke<void>("login", { email, password });
    hasUserCache = true;
  },
  listPages: () => invoke<PageMeta[]>("list_pages"),
  getContent: (id: string): Promise<string> => {
    const cached = contentCache.get(id);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inFlightContent.get(id);
    if (pending) return pending;
    const req = invoke<string>("get_content", { id })
      .then((raw) => {
        if (!contentCache.has(id)) {
          contentCache.set(id, raw);
        }
        return contentCache.get(id) ?? raw;
      })
      .finally(() => {
        inFlightContent.delete(id);
      });
    inFlightContent.set(id, req);
    return req;
  },
  createPage: async (parentId: string | null) => {
    const meta = await invoke<PageMeta>("create_page", { parentId });
    contentCache.set(meta.id, "");
    clearSearchCache();
    return meta;
  },
  updatePage: async (id: string, patch: PagePatch) => {
    if (patch.content !== undefined) {
      contentCache.set(id, patch.content);
    }
    if (patch.title !== undefined || patch.body !== undefined) {
      clearSearchCache();
    }
    return invoke<PageMeta>("update_page", { id, patch });
  },
  movePage: (id: string, parentId: string | null, position: number) =>
    invoke<void>("move_page", { id, parentId, position }),
  trashPage: async (id: string) => {
    clearSearchCache();
    await invoke<void>("trash_page", { id });
  },
  restorePage: async (id: string) => {
    clearSearchCache();
    await invoke<void>("restore_page", { id });
  },
  purgePage: async (id: string) => {
    contentCache.delete(id);
    inFlightContent.delete(id);
    clearSearchCache();
    await invoke<void>("purge_page", { id });
  },
  search: (q: string): Promise<SearchHit[]> => {
    const key = q.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) return Promise.resolve([]);
    const cached = searchCache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = inFlightSearch.get(key);
    if (pending) return pending;
    const req = invoke<SearchHit[]>("search", { q: key })
      .then((hits) => {
        if (searchCache.size >= MAX_SEARCH_CACHE) {
          const oldest = searchCache.keys().next().value;
          if (oldest !== undefined) searchCache.delete(oldest);
        }
        searchCache.set(key, hits);
        return hits;
      })
      .finally(() => {
        inFlightSearch.delete(key);
      });
    inFlightSearch.set(key, req);
    return req;
  },
  saveImage: (bytes: Uint8Array | number[], ext: string) =>
    invoke<string>("save_image", { bytes, ext }),

  // Task Tracker & Statistics
  getProjectTracker: (pageId: string) =>
    invoke<ProjectTrackerData>("get_project_tracker", { pageId }),
  createTask: (input: TaskCreate) =>
    invoke<TaskItem>("create_task", { input }),
  updateTask: (id: string, patch: TaskPatch) =>
    invoke<TaskItem>("update_task", { id, patch }),
  deleteTask: (id: string) =>
    invoke<void>("delete_task", { id }),
  listTaskActivity: (taskId: string) =>
    invoke<TaskActivity[]>("list_task_activity", { taskId }),
  addTaskComment: (taskId: string, author: string, body: string, viaMcp?: boolean) =>
    invoke<TaskActivity>("add_task_comment", { taskId, author, body, viaMcp }),
  updateTaskComment: (id: string, body: string) =>
    invoke<TaskActivity>("update_task_comment", { id, body }),
  deleteTaskComment: (id: string) =>
    invoke<void>("delete_task_comment", { id }),
  createPhase: (pageId: string, name: string, activate: boolean) =>
    invoke<ProjectPhase>("create_phase", { pageId, name, activate }),
  updatePhaseStatus: (id: string, status: PhaseStatus) =>
    invoke<ProjectPhase>("update_phase_status", { id, status }),
  deletePhase: (id: string) =>
    invoke<void>("delete_phase", { id }),
  createCategory: (pageId: string, name: string) =>
    invoke<ProjectCategory>("create_category", { pageId, name }),
  deleteCategory: (id: string) =>
    invoke<void>("delete_category", { id }),
  getStatistics: (pageId: string | null, days: number) =>
    invoke<StatsSummary>("get_statistics", { pageId, days }),
};
