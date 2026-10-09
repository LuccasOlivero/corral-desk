import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../store";

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="lock-logo">
      <span className="ram" style={{ width: size, height: size }} />
      <b>corral</b>
    </span>
  );
}

export default function TitleBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const saveStatus = useStore((s) => s.saveStatus);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const w = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <button className="tb-btn" title="Mostrar/Ocultar Panel (\)" onClick={() => toggleSidebar()}>
        {sidebarOpen ? "◀" : "▶"}
      </button>
      <Logo />
      <div className="drag" data-tauri-drag-region />
      {saveStatus !== "idle" && (
        <span className="save-status">{saveStatus === "saving" ? "Guardando..." : "Guardado"}</span>
      )}
      <div className="mode">
        <button aria-pressed={mode === "ink"} onClick={() => setMode("ink")}>ink</button>
        <button aria-pressed={mode === "paper"} onClick={() => setMode("paper")}>paper</button>
      </div>
      <button className="tb-btn" aria-label="Minimizar" onClick={() => w.minimize()}>—</button>
      <button className="tb-btn" aria-label="Maximizar" onClick={() => w.toggleMaximize()}>▢</button>
      <button className="tb-btn close" aria-label="Cerrar" onClick={() => w.close()}>✕</button>
    </div>
  );
}
