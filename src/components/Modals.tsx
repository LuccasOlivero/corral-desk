import { memo, useEffect, useMemo, useRef, useState } from "react";
import { api, SearchHit } from "../api";
import { useStore } from "../store";

export const QuickSearch = memo(function QuickSearch() {
  const setSearch = useStore((s) => s.setSearch);
  const open = useStore((s) => s.open);
  const pages = useStore((s) => s.pages);
  const [q, setQ] = useState("");
  const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const rootIdSet = useMemo(
    () => new Set(pages.filter((p) => p.deletedAt == null && p.parentId === null).map((p) => p.id)),
    [pages],
  );

  const recentHits = useMemo<SearchHit[]>(
    () =>
      pages
        .filter((p) => p.deletedAt == null && p.parentId === null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
        .map((p) => ({ id: p.id, title: p.title, icon: p.icon, snippet: "" })),
    [pages],
  );

  useEffect(() => { ref.current?.focus(); }, []);

  const trimmed = q.trim();
  useEffect(() => {
    if (!trimmed) {
      setSel(0);
      return;
    }
    let live = true;
    const h = window.setTimeout(() => {
      api
        .search(trimmed)
        .then((r) => {
          if (live) {
            setRemoteHits(r.filter((hit) => rootIdSet.has(hit.id)));
            setSel(0);
          }
        })
        .catch(() => live && setRemoteHits([]));
    }, 90);
    return () => {
      live = false;
      window.clearTimeout(h);
    };
  }, [trimmed, rootIdSet]);

  const hits = trimmed ? remoteHits : recentHits;
  const go = (id: string) => { open(id); setSearch(false); };

  return (
    <div className="overlay" onMouseDown={() => setSearch(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">buscar</span>
          <input
            ref={ref} value={q} placeholder="Título o contenido…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch(false);
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter" && hits[sel]) go(hits[sel].id);
            }}
          />
        </div>
        <div className="modal-body">
          {hits.length === 0 && <div className="sb-empty">Sin resultados</div>}
          {hits.map((h, i) => (
            <button key={h.id} className={"hit" + (i === sel ? " sel" : "")} onMouseEnter={() => setSel(i)} onClick={() => go(h.id)}>
              <span>{h.icon ?? "📄"}</span>
              <span>{h.title || "Sin título"}</span>
              <span className="snip">{h.snippet}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export const Trash = memo(function Trash() {
  const pages = useStore((s) => s.pages);
  const setTrash = useStore((s) => s.setTrash);
  const restore = useStore((s) => s.restore);
  const purge = useStore((s) => s.purge);
  const items = useMemo(
    () =>
      pages
        .filter((p) => p.deletedAt != null)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [pages],
  );
  return (
    <div className="overlay" onMouseDown={() => setTrash(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">papelera</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => setTrash(false)}>Cerrar</button>
        </div>
        <div className="modal-body">
          {items.length === 0 && <div className="sb-empty">La papelera está vacía.</div>}
          {items.map((p) => (
            <div key={p.id} className="trash-row">
              <span>{p.icon ?? "📄"}</span>
              <span className="name">{p.title || "Sin título"}</span>
              <button className="btn" onClick={() => restore(p.id)}>Restaurar</button>
              <button className="btn danger" onClick={() => { if (confirm("¿Borrar definitivamente?")) purge(p.id); }}>Borrar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

