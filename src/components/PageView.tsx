import { memo, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { api, peekCachedContent } from "../api";
import { getParentChain, PageViewTab, useStore } from "../store";
import { optimizeAndSaveImage } from "../utils/image";
import type { InsertSubpageDetail } from "../editor/Editor";

const Editor = lazy(() => import("../editor/Editor"));
const TaskTracker = lazy(() => import("./TaskTracker"));
const StatsView = lazy(() => import("./StatsView"));

const EMOJIS = "📄 📝 📒 📚 📌 📎 ✅ ⭐ 💡 🔥 🚀 🎯 🧠 💻 🛠️ 🧪 🎨 🎵 🎬 📷 🏠 🌱 🌍 ☕ 🍎 ✈️ 💰 📅 ❤️ 🐏 🐑 🧩 🔖 📊 🗂️ 🔒 🔑 🎓 🏋️ 🍳".split(" ");

const COVERS = [
  "linear-gradient(135deg,#cba6f7,#89b4fa)",
  "linear-gradient(135deg,#f38ba8,#fab387)",
  "linear-gradient(135deg,#a6e3a1,#89dceb)",
  "linear-gradient(135deg,#f9e2af,#f5c2e7)",
  "linear-gradient(135deg,#313244,#585b70)",
  "linear-gradient(135deg,#8839ef,#1e66f5)",
];

function extractSubpageIds(raw: string | undefined): Set<string> {
  const result = new Set<string>();
  if (!raw) return result;
  try {
    const doc = JSON.parse(raw);
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as { type?: string; attrs?: { pageId?: unknown }; content?: unknown[] };
      if (n.type === "subpage" && typeof n.attrs?.pageId === "string") {
        result.add(n.attrs.pageId);
      }
      if (Array.isArray(n.content)) {
        for (const child of n.content) visit(child);
      }
    };
    visit(doc);
  } catch {
    // ignore invalid json
  }
  return result;
}

export default memo(function PageView({ id }: { id: string }) {
  const pages = useStore((s) => s.pages);
  const page = useMemo(() => pages.find((p) => p.id === id), [pages, id]);
  const activeTab: PageViewTab = useStore((s) => s.pageTabs[id] ?? "doc");
  const setPageTab = useStore((s) => s.setPageTab);
  const patch = useStore((s) => s.patch);
  const open = useStore((s) => s.open);
  const newPage = useStore((s) => s.newPage);
  const trash = useStore((s) => s.trash);
  const [title, setTitle] = useState(page?.title ?? "");
  const [picker, setPicker] = useState(false);
  const [rawContent, setRawContent] = useState<string | undefined>(() => peekCachedContent(id));
  const [taskCount, setTaskCount] = useState<number>(0);
  const t = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);
  const latestTitleRef = useRef(title);
  latestTitleRef.current = title;
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(page?.title ?? "");
    dirtyRef.current = false;
    setPicker(false);
    setRawContent(peekCachedContent(id));
    if (page && !page.title) titleRef.current?.focus();
    let cancelled = false;
    api
      .getProjectTracker(id)
      .then((res) => {
        if (!cancelled) {
          setTaskCount(res.tasks.filter((x) => x.state !== "closed").length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (dirtyRef.current) {
        window.clearTimeout(t.current);
        dirtyRef.current = false;
        patch(id, { title: latestTitleRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onContentSync = (ev: Event) => {
      const custom = ev as CustomEvent<{ pageId: string; content: string }>;
      if (custom.detail?.pageId === id) {
        setRawContent(custom.detail.content);
      }
    };
    window.addEventListener("corral:content-sync", onContentSync);
    return () => window.removeEventListener("corral:content-sync", onContentSync);
  }, [id]);

  useEffect(() => {
    if (page && !dirtyRef.current && page.title !== title) {
      setTitle(page.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.title]);

  const parentChain = useMemo(
    () => (page?.parentId ? getParentChain(pages, id) : []),
    [pages, id, page?.parentId],
  );

  const embeddedIds = useMemo(() => extractSubpageIds(rawContent), [rawContent]);

  const unembeddedSubpages = useMemo(
    () =>
      pages
        .filter((p) => p.parentId === id && p.deletedAt == null && !embeddedIds.has(p.id))
        .sort((a, b) => a.position - b.position),
    [pages, id, embeddedIds],
  );

  if (!page) return null;

  const onTitle = (v: string) => {
    setTitle(v);
    dirtyRef.current = true;
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      dirtyRef.current = false;
      patch(id, { title: v });
    }, 250);
  };
  const cycleCover = () => {
    const i = COVERS.indexOf(page.cover ?? "");
    patch(id, { cover: COVERS[(i + 1) % COVERS.length] });
  };
  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = await optimizeAndSaveImage(file, 1920);
    patch(id, { cover: `url('${src}')` });
  };
  const handleCreateSubpage = async () => {
    const created = await newPage(id, { openAfterCreate: false });
    const detail: InsertSubpageDetail = { parentId: id, subpageId: created.id, handled: false };
    window.dispatchEvent(new CustomEvent("corral:insert-subpage", { detail }));
    if (!detail.handled) {
      open(created.id);
    }
  };

  const isWide = activeTab === "tasks" || activeTab === "stats";

  return (
    <>
      <span className="ram ghost page-ghost" aria-hidden="true" />
      {page.cover && (
        <div className="cover" style={{ backgroundImage: page.cover }}>
          <div className="cover-actions">
            <button className="btn" onClick={() => fileInputRef.current?.click()}>Cambiar</button>
            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }} onChange={handleUploadCover} />
            <button className="btn" onClick={() => patch(id, { cover: "" })}>Quitar</button>
          </div>
        </div>
      )}
      <div className={"page" + (page.cover ? " has-cover" : "") + (isWide ? " wide-view" : "")}>
        {page.parentId !== null && (
          <nav className="page-breadcrumbs" aria-label="Ruta de navegación">
            {parentChain.map((anc) => (
              <span key={anc.id} className="crumb-group">
                <button className="crumb" onClick={() => open(anc.id)}>
                  <span>{anc.icon || "📄"}</span>
                  <span>{anc.title || "Sin título"}</span>
                </button>
                <span className="crumb-sep">/</span>
              </span>
            ))}
            <span className="crumb current">
              <span>{page.icon || "📄"}</span>
              <span>{page.title || "Sin título"}</span>
            </span>
          </nav>
        )}
        {page.icon && <div className="page-ico" onClick={() => setPicker(!picker)}>{page.icon}</div>}
        <div className="page-tools">
          <div className="page-view-switch" role="tablist" aria-label="Vistas del proyecto">
            <button
              role="tab"
              aria-selected={activeTab === "doc"}
              className={"btn" + (activeTab === "doc" ? " primary" : "")}
              onClick={() => setPageTab(id, "doc")}
            >
              📝 Documento
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "tasks"}
              className={"btn" + (activeTab === "tasks" ? " primary" : "")}
              onClick={() => setPageTab(id, "tasks")}
            >
              🗂 Tasks {taskCount > 0 ? `(${taskCount})` : ""}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "stats"}
              className={"btn" + (activeTab === "stats" ? " primary" : "")}
              onClick={() => setPageTab(id, "stats")}
            >
              📊 Stats
            </button>
          </div>

          <span className="page-tools-sep" />

          {!page.icon && <button className="btn" onClick={() => setPicker(!picker)}>＋ Ícono</button>}
          {!page.cover && <button className="btn" onClick={cycleCover}>＋ Portada</button>}
          <button className="btn" onClick={() => patch(id, { favorite: !page.favorite })}>
            {page.favorite ? "★ Favorita" : "☆ Favorito"}
          </button>
          {activeTab === "doc" && (
            <button className="btn" onClick={handleCreateSubpage}>＋ Subpágina</button>
          )}
        </div>
        {picker && (
          <div className="emoji-pop">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { patch(id, { icon: e }); setPicker(false); }}>{e}</button>
            ))}
            {page.icon && <button className="rm" onClick={() => { patch(id, { icon: "" }); setPicker(false); }}>Quitar ícono</button>}
          </div>
        )}
        <input
          ref={titleRef}
          className="title"
          placeholder="Sin título"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onBlur={() => {
            if (dirtyRef.current) {
              window.clearTimeout(t.current);
              dirtyRef.current = false;
              patch(id, { title });
            }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.querySelector<HTMLElement>(".tiptap")?.focus(); } }}
        />

        {activeTab === "doc" && (
          <>
            {unembeddedSubpages.length > 0 && (
              <div className="page-subpages">
                {unembeddedSubpages.map((sub) => (
                  <div
                    key={sub.id}
                    className="subpage-block"
                    onClick={() => open(sub.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(sub.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="subpage-ico">{sub.icon || "📄"}</span>
                    <span className="subpage-title">{sub.title || "Sin título"}</span>
                    <span className="subpage-actions">
                      <button
                        title="Mover a papelera"
                        onClick={(e) => {
                          e.stopPropagation();
                          void trash(sub.id);
                        }}
                      >
                        ✕
                      </button>
                      <span className="subpage-arrow">→</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Suspense fallback={null}>
              <Editor key={id} pageId={id} />
            </Suspense>
          </>
        )}

        {activeTab === "tasks" && (
          <Suspense fallback={null}>
            <TaskTracker key={id} pageId={id} onCountChange={setTaskCount} />
          </Suspense>
        )}

        {activeTab === "stats" && (
          <Suspense fallback={null}>
            <StatsView key={id} pageId={id} embedded />
          </Suspense>
        )}
      </div>
    </>
  );
});
