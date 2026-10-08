import { describe, expect, it } from "vitest";
import { buildTree, isDescendant, positionBetween } from "./tree";

const p = (id: string, parentId: string | null, position: number, deletedAt: number | null = null) => ({
  id, parentId, position, deletedAt,
});

describe("buildTree", () => {
  it("anida y ordena por position", () => {
    const t = buildTree([p("b", null, 2), p("a", null, 1), p("c", "a", 1)]);
    expect(t.map((n) => n.page.id)).toEqual(["a", "b"]);
    expect(t[0].children[0].page.id).toBe("c");
  });
  it("oculta eliminadas y sube huérfanas a la raíz", () => {
    const t = buildTree([p("a", null, 1, 5), p("c", "a", 1)]);
    expect(t.map((n) => n.page.id)).toEqual(["c"]);
  });
});

describe("positionBetween", () => {
  const s = [{ position: 1 }, { position: 3 }];
  it("calcula extremos y medio", () => {
    expect(positionBetween(s, 0)).toBe(0);
    expect(positionBetween(s, 1)).toBe(2);
    expect(positionBetween(s, 2)).toBe(4);
    expect(positionBetween([], 0)).toBe(1);
  });
});

describe("isDescendant", () => {
  it("detecta ancestros", () => {
    const pages = [p("a", null, 1), p("b", "a", 1), p("c", "b", 1)];
    expect(isDescendant(pages, "c", "a")).toBe(true);
    expect(isDescendant(pages, "a", "c")).toBe(false);
  });
});
