export interface TreeNode<T> {
  page: T;
  children: TreeNode<T>[];
}

interface Node {
  id: string;
  parentId: string | null;
  position: number;
  deletedAt: number | null;
}

/** Construye el árbol de páginas no eliminadas, ordenado por position. */
export function buildTree<T extends Node>(pages: T[]): TreeNode<T>[] {
  const live = pages.filter((p) => p.deletedAt == null);
  const ids = new Set(live.map((p) => p.id));
  const byParent = new Map<string | null, T[]>();
  for (const p of live) {
    // un hijo cuyo padre no existe/está en papelera se muestra en la raíz
    const key = p.parentId && ids.has(p.parentId) ? p.parentId : null;
    const arr = byParent.get(key) ?? [];
    arr.push(p);
    byParent.set(key, arr);
  }
  const make = (key: string | null): TreeNode<T>[] =>
    (byParent.get(key) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((page) => ({ page, children: make(page.id) }));
  return make(null);
}

/** Posición entre hermanos para insertar antes/después de un nodo de referencia. */
export function positionBetween(siblings: { position: number }[], index: number): number {
  const prev = siblings[index - 1]?.position;
  const next = siblings[index]?.position;
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

export function isDescendant(pages: Node[], id: string, maybeAncestor: string): boolean {
  const byId = new Map(pages.map((p) => [p.id, p]));
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.id)) {
    if (cur.parentId === maybeAncestor) return true;
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
  }
  return false;
}

/** Obtiene en O(N) el conjunto de IDs del subárbol (incluyendo `rootId`). */
export function getDescendantIds(pages: Node[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const p of pages) {
    if (p.parentId) {
      let list = childrenByParent.get(p.parentId);
      if (!list) {
        list = [];
        childrenByParent.set(p.parentId, list);
      }
      list.push(p.id);
    }
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (result.has(cur)) continue;
    result.add(cur);
    const kids = childrenByParent.get(cur);
    if (kids) {
      for (const k of kids) stack.push(k);
    }
  }
  return result;
}

