import { create } from "zustand";
import { api, evictCachedContent, PageMeta, PagePatch } from "./api";
import { getDescendantIds, isDescendant, positionBetween } from "./tree";

export type Mode = "ink" | "paper";

export function pushRecentId(recentIds: string[], id: string, max = 3): string[] {
  if (!id) return recentIds.slice(0, max);
  return [id, ...recentIds.filter((x) => x !== id)].slice(0, max);
}

export function getRootPages(pages: PageMeta[]): PageMeta[] {
  return pages
    .filter((p) => p.parentId === null && p.deletedAt == null)
    .sort((a, b) => a.position - b.position);
}

export function getParentChain(pages: PageMeta[], pageId: string): PageMeta[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: PageMeta[] = [];
  const seen = new Set<string>([pageId]);
  let cur = byId.get(pageId);
  while (cur?.parentId && !seen.has(cur.parentId)) {
    const parent = byId.get(cur.parentId);
    if (!parent || parent.deletedAt != null) break;
    seen.add(parent.id);
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

interface State {
  pages: PageMeta[];
  activeId: string | null;
  recentIds: string[];
  mode: Mode;
  sidebarOpen: boolean;
  searchOpen: boolean;
  trashOpen: boolean;
  expanded: Record<string, boolean>;
  load: () => Promise<void>;
  open: (id: string | null) => void;
  newPage: (parentId?: string | null, options?: { openAfterCreate?: boolean }) => Promise<PageMeta>;
  patch: (id: string, p: PagePatch) => Promise<void>;
  trash: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  /** Mueve `id` a `parentId`, insertándolo en el índice `index` entre hermanos vivos. */
  move: (id: string, parentId: string | null, index?: number) => Promise<void>;
  toggleExpand: (id: string, v?: boolean) => void;
  setMode: (m: Mode) => void;
  toggleSidebar: () => void;
  setSearch: (v: boolean) => void;
  setTrash: (v: boolean) => void;
  saveStatus: "idle" | "saving" | "saved";
  setSaveStatus: (status: "idle" | "saving" | "saved") => void;
}

const initialMode = (): Mode => (localStorage.getItem("corral-mode") === "paper" ? "paper" : "ink");

const initialRecentIds = (): string[] => {
  try {
    const raw = localStorage.getItem("corral-recent");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 3);
  } catch {
    return [];
  }
};

export const useStore = create<State>((set, get) => ({
  pages: [],
  activeId: localStorage.getItem("corral-active"),
  recentIds: initialRecentIds(),
  mode: initialMode(),
  sidebarOpen: true,
  searchOpen: false,
  trashOpen: false,
  expanded: {},

  load: async () => {
    const pages = await api.listPages();
    const { activeId } = get();

    let targetId = activeId;
    const valid = targetId && pages.some((p) => p.id === targetId && p.deletedAt == null);

    if (!valid) {
      const alivePages = pages.filter((p) => p.deletedAt == null);
      if (alivePages.length > 0) {
        const mostRecent = alivePages.reduce((latest, p) => p.updatedAt > latest.updatedAt ? p : latest, alivePages[0]);
        targetId = mostRecent.id;
      } else {
        targetId = null;
      }
    }

    if (targetId && targetId !== activeId) {
      localStorage.setItem("corral-active", targetId);
    } else if (!targetId) {
      localStorage.removeItem("corral-active");
    }

    const aliveIds = new Set(pages.filter((p) => p.deletedAt == null).map((p) => p.id));
    const filteredRecent = get().recentIds.filter((rid) => aliveIds.has(rid));
    const nextRecent = targetId ? pushRecentId(filteredRecent, targetId) : filteredRecent.slice(0, 3);
    localStorage.setItem("corral-recent", JSON.stringify(nextRecent));

    set({ pages, activeId: targetId, recentIds: nextRecent });
  },

  open: (id) => {
    const prevActive = get().activeId;
    if (id) {
      const nextRecent = pushRecentId(get().recentIds, id);
      localStorage.setItem("corral-recent", JSON.stringify(nextRecent));
      if (prevActive !== id) {
        localStorage.setItem("corral-active", id);
        set({ activeId: id, recentIds: nextRecent });
      } else {
        set({ recentIds: nextRecent });
      }
      return;
    }
    if (prevActive === null) return;
    localStorage.removeItem("corral-active");
    set({ activeId: null });
  },

  newPage: async (parentId = null, options) => {
    const page = await api.createPage(parentId);
    set((s) => ({
      pages: [...s.pages, page],
      expanded: parentId ? { ...s.expanded, [parentId]: true } : s.expanded,
    }));
    if (options?.openAfterCreate !== false) {
      get().open(page.id);
    }
    return page;
  },

  patch: async (id, p) => {
    const cur = get().pages.find((x) => x.id === id);
    if (cur && p.content === undefined && p.body === undefined) {
      const sameTitle = p.title === undefined || p.title === cur.title;
      const sameIcon = p.icon === undefined || (p.icon || null) === cur.icon;
      const sameCover = p.cover === undefined || (p.cover || null) === cur.cover;
      const sameFav = p.favorite === undefined || p.favorite === cur.favorite;
      if (sameTitle && sameIcon && sameCover && sameFav) return;
    }

    const now = Date.now();
    // actualización optimista única de metadatos (evita doble re-render tras IPC)
    set((s) => ({
      pages: s.pages.map((x) =>
        x.id === id
          ? {
              ...x,
              ...(p.title !== undefined ? { title: p.title } : {}),
              ...(p.icon !== undefined ? { icon: p.icon || null } : {}),
              ...(p.cover !== undefined ? { cover: p.cover || null } : {}),
              ...(p.favorite !== undefined ? { favorite: p.favorite } : {}),
              updatedAt: now,
            }
          : x,
      ),
    }));
    await api.updatePage(id, p);
  },

  trash: async (id) => {
    const now = Date.now();
    const { pages, activeId, recentIds } = get();
    const ids = getDescendantIds(pages, id);
    const nextPages = pages.map((p) =>
      ids.has(p.id) && p.deletedAt == null ? { ...p, deletedAt: now } : p,
    );
    const nextActive = activeId && ids.has(activeId) ? null : activeId;
    if (nextActive !== activeId) {
      if (nextActive) localStorage.setItem("corral-active", nextActive);
      else localStorage.removeItem("corral-active");
    }
    const nextRecent = recentIds.filter((rid) => !ids.has(rid));
    localStorage.setItem("corral-recent", JSON.stringify(nextRecent));
    set({ pages: nextPages, activeId: nextActive, recentIds: nextRecent });
    await api.trashPage(id);
  },

  restore: async (id) => {
    const { pages } = get();
    const ids = getDescendantIds(pages, id);
    const target = pages.find((p) => p.id === id);
    const parentStillDeleted =
      target?.parentId != null &&
      pages.find((p) => p.id === target.parentId)?.deletedAt != null;
    set({
      pages: pages.map((p) => {
        if (!ids.has(p.id)) return p;
        return {
          ...p,
          deletedAt: null,
          parentId: p.id === id && parentStillDeleted ? null : p.parentId,
        };
      }),
    });
    await api.restorePage(id);
  },

  purge: async (id) => {
    const { pages, activeId, recentIds } = get();
    const ids = getDescendantIds(pages, id);
    evictCachedContent(ids);
    const nextActive = activeId && ids.has(activeId) ? null : activeId;
    if (nextActive !== activeId) {
      localStorage.removeItem("corral-active");
    }
    const nextRecent = recentIds.filter((rid) => !ids.has(rid));
    localStorage.setItem("corral-recent", JSON.stringify(nextRecent));
    set({
      pages: pages.filter((p) => !ids.has(p.id)),
      activeId: nextActive,
      recentIds: nextRecent,
    });
    await api.purgePage(id);
  },

  move: async (id, parentId, index) => {
    const { pages } = get();
    if (parentId === id || (parentId && isDescendant(pages, parentId, id))) return;
    const siblings = pages
      .filter((p) => p.id !== id && p.deletedAt == null && p.parentId === parentId)
      .sort((a, b) => a.position - b.position);
    const idx = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    const position = positionBetween(siblings, idx);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, parentId, position } : p)),
      expanded: parentId ? { ...s.expanded, [parentId]: true } : s.expanded,
    }));
    await api.movePage(id, parentId, position);
  },

  toggleExpand: (id, v) =>
    set((s) => {
      const next = v ?? !s.expanded[id];
      if (!!s.expanded[id] === next) return s;
      return { expanded: { ...s.expanded, [id]: next } };
    }),

  setMode: (mode) => {
    if (get().mode === mode) return;
    localStorage.setItem("corral-mode", mode);
    set({ mode });
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSearch: (searchOpen) => set((s) => (s.searchOpen === searchOpen ? s : { searchOpen })),
  setTrash: (trashOpen) => set((s) => (s.trashOpen === trashOpen ? s : { trashOpen })),
  saveStatus: "idle",
  setSaveStatus: (saveStatus) => set((s) => (s.saveStatus === saveStatus ? s : { saveStatus })),
}));

