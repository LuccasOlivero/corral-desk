import { useEffect, useState } from "react";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/800.css";
import "@fontsource/archivo/900.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./styles/app.css";
import { useStore } from "./store";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import PageView from "./components/PageView";
import { Suspense, lazy } from "react";
import Lock from "./screens/Lock";

const QuickSearch = lazy(() => import("./components/Modals").then(m => ({ default: m.QuickSearch })));
const Trash = lazy(() => import("./components/Modals").then(m => ({ default: m.Trash })));

function Shell({ onLock }: { onLock: () => void }) {
  const load = useStore((s) => s.load);
  const activeId = useStore((s) => s.activeId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const trashOpen = useStore((s) => s.trashOpen);
  const newPage = useStore((s) => s.newPage);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSearch = useStore((s) => s.setSearch);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      if (e.altKey && k === "c") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      if (!e.ctrlKey && !e.metaKey) return;
      
      if (k === "k") { e.preventDefault(); setSearch(true); }
      else if (k === "s") { e.preventDefault(); /* solo interceptar para evitar Save As, el autosave ya guarda */ }
      else if (k === "n" && !e.shiftKey) { e.preventDefault(); newPage(null); }
      else if (e.key === "\\") { e.preventDefault(); toggleSidebar(); }
      else if (k === "l" && e.shiftKey) { e.preventDefault(); setMode(mode === "ink" ? "paper" : "ink"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newPage, toggleSidebar, setSearch, setMode, mode]);

  return (
    <>
      <div className="body">
        {sidebarOpen && <Sidebar onLock={onLock} />}
        <main className="main">
          {activeId ? (
            <PageView key={activeId} id={activeId} />
          ) : (
            <div className="empty">
              <span className="ram ghost" />
              <span className="label">sin página abierta</span>
              <h2>Escribe algo.<br />Rápido.</h2>
              <button className="btn" onClick={() => newPage(null)}>Nueva página</button>
            </div>
          )}
        </main>
      </div>
      <Suspense fallback={null}>
        {searchOpen && <QuickSearch />}
        {trashOpen && <Trash />}
      </Suspense>
    </>
  );
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => {
    return localStorage.getItem("corral-session-open") === "true";
  });
  const mode = useStore((s) => s.mode);

  useEffect(() => { document.documentElement.setAttribute("data-mode", mode); }, [mode]);

  const handleUnlock = () => {
    localStorage.setItem("corral-session-open", "true");
    setUnlocked(true);
  };

  const handleLock = () => {
    localStorage.removeItem("corral-session-open");
    setUnlocked(false);
  };

  return (
    <div className="app">
      <TitleBar />
      {unlocked ? <Shell onLock={handleLock} /> : <Lock onUnlock={handleUnlock} />}
    </div>
  );
}
