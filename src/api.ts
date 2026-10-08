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

export const api = {
  hasUser: () => invoke<boolean>("has_user"),
  register: (email: string, password: string) => invoke<void>("register", { email, password }),
  login: (email: string, password: string) => invoke<void>("login", { email, password }),
  listPages: () => invoke<PageMeta[]>("list_pages"),
  getContent: (id: string) => invoke<string>("get_content", { id }),
  createPage: (parentId: string | null) => invoke<PageMeta>("create_page", { parentId }),
  updatePage: (id: string, patch: PagePatch) => invoke<PageMeta>("update_page", { id, patch }),
  movePage: (id: string, parentId: string | null, position: number) =>
    invoke<void>("move_page", { id, parentId, position }),
  trashPage: (id: string) => invoke<void>("trash_page", { id }),
  restorePage: (id: string) => invoke<void>("restore_page", { id }),
  purgePage: (id: string) => invoke<void>("purge_page", { id }),
  search: (q: string) => invoke<SearchHit[]>("search", { q }),
  saveImage: (bytes: number[], ext: string) => invoke<string>("save_image", { bytes, ext }),
};
