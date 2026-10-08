import { useEffect, useRef, useState } from "react";
import { api, SearchHit } from "../api";
import { useStore } from "../store";

export function QuickSearch() {
  const { setSearch, open, pages } = useStore();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    if (!q.trim()) {
      // sin consulta: páginas recientes
      const recent = [...pages].filter((p) => p.deletedAt == null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
        .map((p) => ({ id: p.id, title: p.title, icon: p.icon, snippet: "" }));
      setHits(recent); setSel(0);
      return;
    }
    const h = window.setTimeout(() => {
      api.search(q).then((r) => { if (live) { setHits(r); setSel(0); } }).catch(() => live && setHits([]));
    }, 90);
    return () => { live = false; window.clearTimeout(h); };
  }, [q, pages]);

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
}

export function Trash() {
  const { pages, setTrash, restore, purge } = useStore();
  const items = pages.filter((p) => p.deletedAt != null).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
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
}
