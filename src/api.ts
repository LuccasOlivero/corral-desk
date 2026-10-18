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
        // Solo guardar si no fue sobrescrito por una edición más reciente mientras cargaba
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
};

