import type { CSSProperties } from "react";

import { cx } from "../lib/format";
import type { VoiceMode } from "../types";

interface OrbProps {
  mode?: VoiceMode;
  /** 0–1 arası ses seviyesi; küre bununla nefes alır */
  level?: number;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function Orb({ mode = "idle", level = 0, size = "md", className }: OrbProps) {
  const style = { "--level": Math.max(0, Math.min(1, level)).toFixed(3) } as CSSProperties;

  return (
    <div className={cx("orb", `orb--${size}`, `orb--${mode}`, className)} style={style} aria-hidden="true">
      <div className="orb__glow" />
      <div className="orb__ring" />
      <div className="orb__core">
        <div className="orb__swirl" />
      </div>
    </div>
  );
}
