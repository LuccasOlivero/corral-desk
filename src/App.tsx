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
import { QuickSearch, Trash } from "./components/Modals";
import Lock from "./screens/Lock";

function Shell({ onLock }: { onLock: () => void }) {
  const { load, activeId, sidebarOpen, searchOpen, trashOpen, newPage, toggleSidebar, setSearch, mode, setMode } = useStore();

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") { e.preventDefault(); setSearch(true); }
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
      {searchOpen && <QuickSearch />}
      {trashOpen && <Trash />}
    </>
  );
}

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const mode = useStore((s) => s.mode);

  useEffect(() => { document.documentElement.setAttribute("data-mode", mode); }, [mode]);

  return (
    <div className="app">
      <TitleBar />
      {unlocked ? <Shell onLock={() => setUnlocked(false)} /> : <Lock onUnlock={() => setUnlocked(true)} />}
    </div>
  );
}
