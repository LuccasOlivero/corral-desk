import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMap = vi.hoisted(() => {
  const map = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string): string | null => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string): void => {
      map.set(key, String(value));
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
    clear: (): void => {
      map.clear();
    },
    key: (index: number): string | null => Array.from(map.keys())[index] ?? null,
    get length(): number {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  });
  return map;
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

import { api, PageMeta } from "./api";
import { getParentChain, getRootPages, pushRecentId, useStore } from "./store";
import { filterItems, ITEMS } from "./editor/slash";

const makePage = (
  id: string,
  title: string,
  parentId: string | null = null,
  position = 1,
  deletedAt: number | null = null,
  updatedAt = 1000,
): PageMeta => ({
  id,
  parentId,
  title,
  icon: null,
  cover: null,
  position,
  favorite: false,
  deletedAt,
  updatedAt,
});

describe("pushRecentId y sección 'vistas recientemente'", () => {
  it("mantiene como máximo las últimas 3 páginas abiertas en orden más reciente primero", () => {
    let recent: string[] = [];
    recent = pushRecentId(recent, "page-1");
    expect(recent).toEqual(["page-1"]);

    recent = pushRecentId(recent, "page-2");
    expect(recent).toEqual(["page-2", "page-1"]);

    recent = pushRecentId(recent, "page-3");
    expect(recent).toEqual(["page-3", "page-2", "page-1"]);

    recent = pushRecentId(recent, "page-4");
    expect(recent).toEqual(["page-4", "page-3", "page-2"]);
    expect(recent).toHaveLength(3);
  });

  it("mueve al primer lugar sin duplicar cuando se vuelve a abrir una página existente", () => {
    const initial = ["page-3", "page-2", "page-1"];
    const updated = pushRecentId(initial, "page-1");
    expect(updated).toEqual(["page-1", "page-3", "page-2"]);
    expect(updated).toHaveLength(3);

    const sameFirst = pushRecentId(updated, "page-1");
    expect(sameFirst).toEqual(["page-1", "page-3", "page-2"]);
  });

  it("ignora IDs vacíos respetando el límite máximo", () => {
    expect(pushRecentId(["a", "b", "c", "d"], "")).toEqual(["a", "b", "c"]);
  });

  it("incluye subpáginas (parentId !== null) en recentIds igual que las páginas raíz", () => {
    const pages: PageMeta[] = [
      makePage("root-inv", "Investigaciones, cursos y libros.", null, 1),
      makePage("sub-franco", "C - Persuasión y ventas - Franco Pisso", "root-inv", 1),
      makePage("sub-autoridad", "Autoridad", "sub-franco", 1),
    ];

    let recentIds: string[] = [];
    for (const p of pages) {
      recentIds = pushRecentId(recentIds, p.id);
    }

    expect(recentIds).toEqual(["sub-autoridad", "sub-franco", "root-inv"]);

    const resolvedRecents = recentIds
      .map((rid) => pages.find((p) => p.id === rid && p.deletedAt == null))
      .filter((p): p is PageMeta => !!p)
      .slice(0, 3);

    expect(resolvedRecents.map((p) => p.title)).toEqual([
      "Autoridad",
      "C - Persuasión y ventas - Franco Pisso",
      "Investigaciones, cursos y libros.",
    ]);
  });
});

describe("getRootPages y getParentChain (acceso exclusivo a subpáginas)", () => {
  const samplePages: PageMeta[] = [
    makePage("root-b", "Raíz B", null, 20),
    makePage("root-a", "Investigaciones, cursos y libros.", null, 10),
    makePage("sub-1", "C - Persuasión y ventas - Franco Pisso", "root-a", 1),
    makePage("sub-2", "Autoridad", "sub-1", 1),
    makePage("root-trash", "Raíz en papelera", null, 5, 9999),
    makePage("sub-trash", "Subpágina en papelera", "root-a", 2, 9999),
  ];

  it("getRootPages devuelve únicamente páginas con parentId === null && deletedAt == null ordenadas por position", () => {
    const roots = getRootPages(samplePages);
    expect(roots.map((p) => p.id)).toEqual(["root-a", "root-b"]);
    expect(roots.every((p) => p.parentId === null && p.deletedAt === null)).toBe(true);
  });

  it("getParentChain construye la ruta [root, ..., parent] para subpáginas de 1 y 2+ niveles", () => {
    expect(getParentChain(samplePages, "root-a")).toEqual([]);

    const chainLevel1 = getParentChain(samplePages, "sub-1");
    expect(chainLevel1.map((p) => p.id)).toEqual(["root-a"]);
    expect(chainLevel1.map((p) => p.title)).toEqual(["Investigaciones, cursos y libros."]);

    const chainLevel2 = getParentChain(samplePages, "sub-2");
    expect(chainLevel2.map((p) => p.id)).toEqual(["root-a", "sub-1"]);
    expect(chainLevel2.map((p) => p.title)).toEqual([
      "Investigaciones, cursos y libros.",
      "C - Persuasión y ventas - Franco Pisso",
    ]);
  });

  it("getParentChain se detiene ante ancestros eliminados y maneja ciclos sin colgarse", () => {
    const cyclicPages: PageMeta[] = [
      makePage("cycle-a", "Ciclo A", "cycle-b", 1),
      makePage("cycle-b", "Ciclo B", "cycle-a", 1),
    ];
    const chain = getParentChain(cyclicPages, "cycle-a");
    expect(chain.map((p) => p.id)).toEqual(["cycle-b"]);

    const deletedParentPages: PageMeta[] = [
      makePage("del-root", "Raíz borrada", null, 1, 12345),
      makePage("child-of-del", "Hija", "del-root", 1, null),
    ];
    expect(getParentChain(deletedParentPages, "child-of-del")).toEqual([]);
  });
});

describe("useStore (open, newPage, trash, purge con localStorage)", () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
    useStore.setState({
      pages: [
        makePage("root-1", "Investigaciones, cursos y libros.", null, 1),
        makePage("root-2", "Notas generales", null, 2),
        makePage("sub-1", "C - Persuasión y ventas - Franco Pisso", "root-1", 1),
        makePage("sub-2", "Autoridad", "sub-1", 1),
      ],
      activeId: null,
      recentIds: [],
    });
  });

  it("open(id) actualiza activeId, recentIds (incluyendo subpáginas) hasta 3 elementos y persiste en localStorage", () => {
    const store = useStore.getState();

    store.open("root-1");
    expect(useStore.getState().activeId).toBe("root-1");
    expect(useStore.getState().recentIds).toEqual(["root-1"]);

    store.open("sub-1");
    store.open("sub-2");
    expect(useStore.getState().activeId).toBe("sub-2");
    expect(useStore.getState().recentIds).toEqual(["sub-2", "sub-1", "root-1"]);

    store.open("root-2");
    expect(useStore.getState().activeId).toBe("root-2");
    expect(useStore.getState().recentIds).toEqual(["root-2", "sub-2", "sub-1"]);
    expect(JSON.parse(localStorage.getItem("corral-recent") ?? "[]")).toEqual([
      "root-2",
      "sub-2",
      "sub-1",
    ]);

    // Reabrir una subpágina ya presente la mueve al frente sin duplicar
    store.open("sub-1");
    expect(useStore.getState().recentIds).toEqual(["sub-1", "root-2", "sub-2"]);
  });

  it("newPage con openAfterCreate: false no cambia activeId ni recentIds hasta abrirla explícitamente", async () => {
    const createdSub = makePage("sub-new", "Nueva subpágina", "root-1", 2);
    vi.spyOn(api, "createPage").mockResolvedValueOnce(createdSub);

    useStore.getState().open("root-1");
    const page = await useStore.getState().newPage("root-1", { openAfterCreate: false });

    expect(page.id).toBe("sub-new");
    expect(useStore.getState().activeId).toBe("root-1");
    expect(useStore.getState().recentIds).toEqual(["root-1"]);
  });

  it("trash(id) elimina tanto la página como sus subpáginas descendientes de recentIds y limpia activeId si corresponde", async () => {
    vi.spyOn(api, "trashPage").mockResolvedValueOnce(undefined);

    const store = useStore.getState();
    store.open("root-2");
    store.open("sub-1");
    store.open("sub-2");
    expect(useStore.getState().recentIds).toEqual(["sub-2", "sub-1", "root-2"]);

    await useStore.getState().trash("root-1");

    const after = useStore.getState();
    expect(after.activeId).toBeNull();
    expect(after.recentIds).toEqual(["root-2"]);
    expect(JSON.parse(localStorage.getItem("corral-recent") ?? "[]")).toEqual(["root-2"]);
  });

  it("purge(id) elimina definitivamente la página y sus subpáginas descendientes de pages y recentIds", async () => {
    vi.spyOn(api, "purgePage").mockResolvedValueOnce(undefined);

    const store = useStore.getState();
    store.open("root-2");
    store.open("sub-1");
    store.open("sub-2");

    await useStore.getState().purge("sub-1");

    const after = useStore.getState();
    expect(after.pages.map((p) => p.id)).toEqual(["root-1", "root-2"]);
    expect(after.activeId).toBeNull();
    expect(after.recentIds).toEqual(["root-2"]);
    expect(JSON.parse(localStorage.getItem("corral-recent") ?? "[]")).toEqual(["root-2"]);
  });
});

describe("Comando Slash '/pagina' (filterItems)", () => {
  it("filterItems('pagina') y filterItems('subpagina') devuelven el comando 'Página' para crear subpáginas", () => {
    const byPagina = filterItems("pagina");
    expect(byPagina.some((item) => item.title === "Página")).toBe(true);

    const bySubpagina = filterItems("subpagina");
    expect(bySubpagina.some((item) => item.title === "Página")).toBe(true);

    const byAccented = filterItems("Página");
    expect(byAccented.some((item) => item.title === "Página")).toBe(true);

    const pageItem = ITEMS.find((item) => item.title === "Página");
    expect(pageItem).toBeDefined();
    expect(pageItem?.desc).toBe("Subpágina dentro de esta página");
  });
});
