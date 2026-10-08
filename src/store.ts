import { create } from "zustand";
import { api, PageMeta, PagePatch } from "./api";
import { isDescendant, positionBetween } from "./tree";

export type Mode = "ink" | "paper";

interface State {
  pages: PageMeta[];
  activeId: string | null;
  mode: Mode;
  sidebarOpen: boolean;
  searchOpen: boolean;
  trashOpen: boolean;
  expanded: Record<string, boolean>;
  load: () => Promise<void>;
  open: (id: string | null) => void;
  newPage: (parentId?: string | null) => Promise<void>;
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
}

const initialMode = (): Mode => (localStorage.getItem("corral-mode") === "paper" ? "paper" : "ink");

export const useStore = create<State>((set, get) => ({
  pages: [],
  activeId: localStorage.getItem("corral-active"),
  mode: initialMode(),
  sidebarOpen: true,
  searchOpen: false,
  trashOpen: false,
  expanded: {},

  load: async () => {
    const pages = await api.listPages();
    const { activeId } = get();
    const valid = activeId && pages.some((p) => p.id === activeId && p.deletedAt == null);
    set({ pages, activeId: valid ? activeId : null });
  },

  open: (id) => {
    if (id) localStorage.setItem("corral-active", id);
    else localStorage.removeItem("corral-active");
    set({ activeId: id });
  },

  newPage: async (parentId = null) => {
    const page = await api.createPage(parentId);
    set((s) => ({
      pages: [...s.pages, page],
      expanded: parentId ? { ...s.expanded, [parentId]: true } : s.expanded,
    }));
    get().open(page.id);
  },

  patch: async (id, p) => {
    // actualización optimista de metadatos
    set((s) => ({
      pages: s.pages.map((x) =>
        x.id === id
          ? {
              ...x,
              ...(p.title !== undefined ? { title: p.title } : {}),
              ...(p.icon !== undefined ? { icon: p.icon || null } : {}),
              ...(p.cover !== undefined ? { cover: p.cover || null } : {}),
              ...(p.favorite !== undefined ? { favorite: p.favorite } : {}),
            }
          : x,
      ),
    }));
    const meta = await api.updatePage(id, p);
    set((s) => ({ pages: s.pages.map((x) => (x.id === id ? meta : x)) }));
  },

  trash: async (id) => {
    await api.trashPage(id);
    await get().load();
    const { activeId, pages } = get();
    if (activeId && pages.find((p) => p.id === activeId)?.deletedAt != null) get().open(null);
  },

  restore: async (id) => {
    await api.restorePage(id);
    await get().load();
  },

  purge: async (id) => {
    await api.purgePage(id);
    await get().load();
  },

  move: async (id, parentId, index) => {
    const { pages } = get();
    if (parentId === id || (parentId && isDescendant(pages, parentId, id))) return;
    const siblings = pages
      .filter((p) => p.id !== id && p.deletedAt == null && p.parentId === parentId)
      .sort((a, b) => a.position - b.position);
    const idx = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    const position = positionBetween(siblings, idx);
    await api.movePage(id, parentId, position);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, parentId, position } : p)),
      expanded: parentId ? { ...s.expanded, [parentId]: true } : s.expanded,
    }));
  },

  toggleExpand: (id, v) =>
    set((s) => ({ expanded: { ...s.expanded, [id]: v ?? !s.expanded[id] } })),

  setMode: (mode) => {
    localStorage.setItem("corral-mode", mode);
    set({ mode });
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSearch: (searchOpen) => set({ searchOpen }),
  setTrash: (trashOpen) => set({ trashOpen }),
}));
