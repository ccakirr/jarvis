import { ArrowUp, AudioLines, LoaderCircle, Paperclip } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

interface ComposerProps {
  /** Gönderim kapalıyken gösterilecek neden */
  blockedReason: string | null;
  voiceActive: boolean;
  uploading: boolean;
  onSend: (text: string) => void;
  onUpload: () => void;
  onStartVoice: () => void;
}

export function Composer({ blockedReason, voiceActive, uploading, onSend, onUpload, onStartVoice }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !blockedReason;

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [value]);

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__box">
        <button
          type="button"
          className="icon-btn"
          onClick={onUpload}
          disabled={uploading}
          aria-label="CSV yükle"
          title="CSV yükle"
        >
          {uploading ? <LoaderCircle size={18} className="spin" /> : <Paperclip size={18} />}
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={voiceActive ? "Konuşabilir ya da yazabilirsin…" : "Jarvis'e bir şey sor…"}
          aria-label="Mesaj"
        />

        {!voiceActive && (
          <button type="button" className="voice-btn" onClick={onStartVoice} title="Sesli modu başlat">
            <AudioLines size={17} />
            <span>Sesli</span>
          </button>
        )}

        <button type="submit" className="send-btn" disabled={!canSend} aria-label="Gönder" title="Gönder">
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </div>
      {blockedReason ? (
        <p className="composer__hint">{blockedReason}</p>
      ) : (
        <p className="composer__hint composer__hint--tips">
          Enter ile gönder · Shift + Enter yeni satır · CSV'yi pencereye sürükleyebilirsin
        </p>
      )}
    </form>
  );
}
