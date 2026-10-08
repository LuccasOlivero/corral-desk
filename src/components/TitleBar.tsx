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
  const { mode, setMode } = useStore();
  const w = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <Logo />
      <div className="drag" data-tauri-drag-region />
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
