import { UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Pencereye sürüklenen dosyayı yakalar. */
export function DropOverlay({ onFile }: { onFile: (file: File) => void }) {
  const [visible, setVisible] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setVisible(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setVisible(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setVisible(false);
      const file = event.dataTransfer?.files[0];
      if (file) onFile(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFile]);

  if (!visible) return null;

  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay__card">
        <UploadCloud size={34} />
        <strong>CSV'yi bırak</strong>
        <span>Yüklenip aktif veri seti yapılacak</span>
      </div>
    </div>
  );
}
