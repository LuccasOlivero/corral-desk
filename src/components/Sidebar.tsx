import { DragEvent, memo, useMemo, useSyncExternalStore } from "react";
import { getRootPages, useStore } from "../store";
import { PageMeta } from "../api";

type Zone = "before" | "after";

// Estado efímero de drag & drop aislado para no re-renderizar toda la lista en cada evento dragover
let currentDragId: string | null = null;
let currentDrop: { id: string; zone: Zone } | null = null;
const dropListeners = new Set<() => void>();

function setDropState(next: { id: string; zone: Zone } | null) {
  if (currentDrop?.id === next?.id && currentDrop?.zone === next?.zone) return;
  currentDrop = next;
  for (const l of dropListeners) l();
}

function subscribeDrop(listener: () => void) {
  dropListeners.add(listener);
  return () => dropListeners.delete(listener);
}

function useDropZone(id: string): Zone | null {
  return useSyncExternalStore(
    subscribeDrop,
    () => (currentDrop?.id === id ? currentDrop.zone : null),
  );
}

const zoneOf = (e: DragEvent): Zone => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  return y < 0.5 ? "before" : "after";
};

const RootRow = memo(function RootRow({
  page: p,
  siblings,
}: {
  page: PageMeta;
  siblings: PageMeta[];
}) {
  const isActive = useStore((s) => !s.globalStatsOpen && s.activeId === p.id);
  const open = useStore((s) => s.open);
  const trash = useStore((s) => s.trash);
  const move = useStore((s) => s.move);
  const dropZone = useDropZone(p.id);

  const cls = [
    "row",
    isActive ? "active" : "",
    dropZone ? `drop-${dropZone}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{ paddingLeft: 6 }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        currentDragId = p.id;
      }}
      onDragEnd={() => {
        currentDragId = null;
        setDropState(null);
      }}
      onDragOver={(e) => {
        if (!currentDragId || currentDragId === p.id) return;
        e.preventDefault();
        setDropState({ id: p.id, zone: zoneOf(e) });
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = currentDragId;
        const z = (currentDrop?.id === p.id ? currentDrop.zone : null) ?? zoneOf(e);
        setDropState(null);
        currentDragId = null;
        if (!id || id === p.id) return;
        const list = siblings.filter((s) => s.id !== id);
        const idx = list.findIndex((s) => s.id === p.id);
        void move(id, null, z === "before" ? idx : idx + 1);
      }}
      onClick={() => open(p.id)}
    >
      <span className="chev">·</span>
      <span className="ico">{p.icon ?? "📄"}</span>
      <span className="name">{p.title || "Sin título"}</span>
      <span className="hover-actions">
        <button
          title="Mover a papelera"
          onClick={(e) => {
            e.stopPropagation();
            void trash(p.id);
          }}
        >
          ✕
        </button>
      </span>
    </div>
  );
});

const SimpleRow = memo(function SimpleRow({ page }: { page: PageMeta }) {
  const isActive = useStore((s) => !s.globalStatsOpen && s.activeId === page.id);
  const open = useStore((s) => s.open);
  return (
    <div className={"row" + (isActive ? " active" : "")} onClick={() => open(page.id)}>
      <span className="chev" />
      <span className="ico">{page.icon ?? "📄"}</span>
      <span className="name">{page.title || "Sin título"}</span>
    </div>
  );
});

export default memo(function Sidebar({ onLock }: { onLock: () => void }) {
  const pages = useStore((s) => s.pages);
  const recentIds = useStore((s) => s.recentIds);
  const globalStatsOpen = useStore((s) => s.globalStatsOpen);
  const newPage = useStore((s) => s.newPage);
  const setSearch = useStore((s) => s.setSearch);
  const setTrash = useStore((s) => s.setTrash);
  const setGlobalStats = useStore((s) => s.setGlobalStats);

  const recents = useMemo(
    () =>
      recentIds
        .map((rid) => pages.find((p) => p.id === rid && p.deletedAt == null))
        .filter((p): p is PageMeta => !!p)
        .slice(0, 3),
    [recentIds, pages],
  );

  const favs = useMemo(
    () => pages.filter((p) => p.favorite && p.deletedAt == null && p.parentId === null),
    [pages],
  );
  const roots = useMemo(() => getRootPages(pages), [pages]);

  return (
    <aside className="sidebar">
      <div className="sb-actions">
        <button className="sb-btn" onClick={() => setSearch(true)}>🔍 Buscar <kbd>Ctrl K</kbd></button>
        <button className="sb-btn" onClick={() => void newPage(null)}>＋ Nueva página <kbd>Ctrl N</kbd></button>
      </div>
      <div className="sb-scroll">
        {recents.length > 0 && (
          <>
            <div className="sb-title"><span className="label">vistas recientemente</span></div>
            {recents.map((p) => (
              <SimpleRow key={p.id} page={p} />
            ))}
          </>
        )}
        {favs.length > 0 && (
          <>
            <div className="sb-title"><span className="label">favoritos</span></div>
            {favs.map((p) => (
              <SimpleRow key={p.id} page={p} />
            ))}
          </>
        )}
        <div className="sb-title">
          <span className="label">páginas</span>
          <button title="Nueva página" onClick={() => void newPage(null)}>+</button>
        </div>
        {roots.length === 0 && <div className="sb-empty">Aún no hay páginas.</div>}
        <div
          onDragOver={(e) => { if (currentDragId) e.preventDefault(); }}
          onDrop={(e) => {
            if (e.target === e.currentTarget && currentDragId) {
              void useStore.getState().move(currentDragId, null);
              currentDragId = null;
              setDropState(null);
            }
          }}
          style={{ minHeight: 40 }}
        >
          {roots.map((p) => (
            <RootRow key={p.id} page={p} siblings={roots} />
          ))}
        </div>
      </div>
      <div className="sb-actions" style={{ borderTop: "1px solid var(--line2)" }}>
        <button
          className={"sb-btn" + (globalStatsOpen ? " active" : "")}
          onClick={() => setGlobalStats(!globalStatsOpen)}
        >
          📊 Estadísticas
        </button>
        <button className="sb-btn" onClick={() => setTrash(true)}>🗑 Papelera</button>
        <button className="sb-btn" onClick={onLock}>🔒 Bloquear</button>
      </div>
    </aside>
  );
});
