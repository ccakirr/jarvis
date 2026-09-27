import { PanelLeft, PanelRight } from "lucide-react";

import { cx } from "../lib/format";
import { Orb } from "./Orb";

interface HeaderProps {
  backendOnline: boolean | null;
  voiceConnected: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
}

export function Header({ backendOnline, voiceConnected, onToggleSidebar, onToggleInspector }: HeaderProps) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__toggle topbar__toggle--left" onClick={onToggleSidebar} aria-label="Çalışma alanını aç">
        <PanelLeft size={18} />
      </button>

      <div className="brand">
        <Orb size="sm" mode={voiceConnected ? "listening" : "idle"} />
        <span className="brand__name">Jarvis</span>
        <span className="brand__tag">AI Data Workspace</span>
      </div>

      <div className="topbar__status">
        <span className={cx("status-pill", backendOnline === false ? "is-bad" : backendOnline ? "is-ok" : "is-idle")}>
          <i />
          {backendOnline === false ? "Backend kapalı" : "Backend"}
        </span>
        <span className={cx("status-pill", voiceConnected ? "is-live" : "is-idle")}>
          <i />
          {voiceConnected ? "Ses bağlı" : "Ses kapalı"}
        </span>
      </div>

      <button type="button" className="icon-btn topbar__toggle topbar__toggle--right" onClick={onToggleInspector} aria-label="Detayları aç">
        <PanelRight size={18} />
      </button>
    </header>
  );
}
