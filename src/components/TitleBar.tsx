import { memo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "../store";

export const Logo = memo(function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="lock-logo">
      <span className="ram" style={{ width: size, height: size }} />
      <b>corral</b>
    </span>
  );
});

const SaveStatus = memo(function SaveStatus() {
  const saveStatus = useStore((s) => s.saveStatus);
  if (saveStatus === "idle") return null;
  return (
    <span className="save-status">
      {saveStatus === "saving" ? "Guardando..." : "Guardado"}
    </span>
  );
});

export default memo(function TitleBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  return (
    <div className="titlebar" data-tauri-drag-region>
      <button className="tb-btn" title="Mostrar/Ocultar Panel (\)" onClick={() => toggleSidebar()}>
        {sidebarOpen ? "◀" : "▶"}
      </button>
      <Logo />
      <div className="drag" data-tauri-drag-region />
      <SaveStatus />
      <div className="mode">
        <button aria-pressed={mode === "ink"} onClick={() => setMode("ink")}>ink</button>
        <button aria-pressed={mode === "paper"} onClick={() => setMode("paper")}>paper</button>
      </div>
      <button className="tb-btn" aria-label="Minimizar" onClick={() => getCurrentWindow().minimize()}>—</button>
      <button className="tb-btn" aria-label="Maximizar" onClick={() => getCurrentWindow().toggleMaximize()}>▢</button>
      <button className="tb-btn close" aria-label="Cerrar" onClick={() => getCurrentWindow().close()}>✕</button>
    </div>
  );
});

