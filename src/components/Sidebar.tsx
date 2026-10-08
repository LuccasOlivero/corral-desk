import { DragEvent, useMemo, useState } from "react";
import { useStore } from "../store";
import { buildTree, TreeNode } from "../tree";
import { PageMeta } from "../api";

type Zone = "before" | "into" | "after";

function Row({
  node, depth, siblings, drop, setDrop, dragId, setDragId,
}: {
  node: TreeNode<PageMeta>;
  depth: number;
  siblings: PageMeta[];
  drop: { id: string; zone: Zone } | null;
  setDrop: (d: { id: string; zone: Zone } | null) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
}) {
  const { activeId, open, expanded, toggleExpand, newPage, trash, move } = useStore();
  const p = node.page;
  const isOpen = !!expanded[p.id];
  const has = node.children.length > 0;

  const zoneOf = (e: DragEvent): Zone => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.28 ? "before" : y > 0.72 ? "after" : "into";
  };

  const cls = [
    "row",
    activeId === p.id ? "active" : "",
    drop?.id === p.id ? `drop-${drop.zone}` : "",
  ].join(" ");

  return (
    <>
      <div
        className={cls}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; setDragId(p.id); }}
        onDragEnd={() => { setDragId(null); setDrop(null); }}
        onDragOver={(e) => {
          if (!dragId || dragId === p.id) return;
          e.preventDefault();
          setDrop({ id: p.id, zone: zoneOf(e) });
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = dragId;
          const z = drop?.zone ?? zoneOf(e);
          setDrop(null); setDragId(null);
          if (!id || id === p.id) return;
          if (z === "into") return void move(id, p.id);
          const list = siblings.filter((s) => s.id !== id);
          const idx = list.findIndex((s) => s.id === p.id);
          move(id, p.parentId, z === "before" ? idx : idx + 1);
        }}
        onClick={() => open(p.id)}
      >
        <button className="chev" onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }}>
          {has ? (isOpen ? "▾" : "▸") : "·"}
        </button>
        <span className="ico">{p.icon ?? "📄"}</span>
        <span className="name">{p.title || "Sin título"}</span>
        <span className="hover-actions">
          <button title="Subpágina" onClick={(e) => { e.stopPropagation(); newPage(p.id); }}>+</button>
          <button title="Mover a papelera" onClick={(e) => { e.stopPropagation(); trash(p.id); }}>✕</button>
        </span>
      </div>
      {isOpen && node.children.map((c) => (
        <Row key={c.page.id} node={c} depth={depth + 1} siblings={node.children.map((x) => x.page)}
          drop={drop} setDrop={setDrop} dragId={dragId} setDragId={setDragId} />
      ))}
    </>
  );
}

export default function Sidebar({ onLock }: { onLock: () => void }) {
  const { pages, newPage, open, activeId, setSearch, setTrash } = useStore();
  const tree = useMemo(() => buildTree(pages), [pages]);
  const favs = useMemo(() => pages.filter((p) => p.favorite && p.deletedAt == null), [pages]);
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const roots = tree.map((t) => t.page);

  return (
    <aside className="sidebar">
      <div className="sb-actions">
        <button className="sb-btn" onClick={() => setSearch(true)}>🔍 Buscar <kbd>Ctrl K</kbd></button>
        <button className="sb-btn" onClick={() => newPage(null)}>＋ Nueva página <kbd>Ctrl N</kbd></button>
      </div>
      <div className="sb-scroll">
        {favs.length > 0 && (
          <>
            <div className="sb-title"><span className="label">favoritos</span></div>
            {favs.map((p) => (
              <div key={p.id} className={"row" + (activeId === p.id ? " active" : "")} onClick={() => open(p.id)}>
                <span className="chev" />
                <span className="ico">{p.icon ?? "📄"}</span>
                <span className="name">{p.title || "Sin título"}</span>
              </div>
            ))}
          </>
        )}
        <div className="sb-title">
          <span className="label">páginas</span>
          <button title="Nueva página" onClick={() => newPage(null)}>+</button>
        </div>
        {tree.length === 0 && <div className="sb-empty">Aún no hay páginas.</div>}
        <div
          onDragOver={(e) => { if (dragId) e.preventDefault(); }}
          onDrop={(e) => {
            // soltar en el espacio vacío = mover a la raíz al final
            if (e.target === e.currentTarget && dragId) {
              useStore.getState().move(dragId, null);
              setDragId(null); setDrop(null);
            }
          }}
          style={{ minHeight: 40 }}
        >
          {tree.map((n) => (
            <Row key={n.page.id} node={n} depth={0} siblings={roots}
              drop={drop} setDrop={setDrop} dragId={dragId} setDragId={setDragId} />
          ))}
        </div>
      </div>
      <div className="sb-actions" style={{ borderTop: "1px solid var(--line2)" }}>
        <button className="sb-btn" onClick={() => setTrash(true)}>🗑 Papelera</button>
        <button className="sb-btn" onClick={onLock}>🔒 Bloquear</button>
      </div>
    </aside>
  );
}
