import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Database,
  Download,
  FileSpreadsheet,
  Mic,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { memo, useLayoutEffect, useRef, type ReactNode } from "react";

import { useElapsed } from "../hooks/useElapsed";
import { cx } from "../lib/format";
import type { ChatMessage } from "../types";
import { Markdown } from "./Markdown";
import { Orb } from "./Orb";

interface ConversationProps {
  messages: ChatMessage[];
  emptyState: ReactNode;
}

export function Conversation({ messages, emptyState }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Kullanıcı yukarıyı okuyorsa zorla aşağı kaydırma; yeni istek gönderince kaydır
    const last = messages.at(-1);
    if (stickToBottom.current || last?.role === "user" || last?.status === "pending") {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
  };

  if (messages.length === 0) {
    return <div className="conversation__scroll">{emptyState}</div>;
  }

  return (
    <div className="conversation__scroll" ref={scrollRef} onScroll={handleScroll}>
      <div className="thread">
        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            continued={index > 0 && messages[index - 1].role === message.role && message.role !== "event"}
          />
        ))}
      </div>
    </div>
  );
}

const MessageItem = memo(function MessageItem({
  message,
  continued,
}: {
  message: ChatMessage;
  continued: boolean;
}) {
  if (message.role === "event") {
    return (
      <div className="msg-event">
        <Database size={13} />
        <span>{message.text}</span>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className={cx("msg msg--user", continued && "msg--continued")}>
        <div className={cx("msg-user__bubble", message.channel === "voice" && "msg-user__bubble--voice")}>
          {message.channel === "voice" && <Mic size={13} className="msg-user__mic" aria-label="Sesli" />}
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("msg msg--assistant", continued && "msg--continued")}>
      <div className="msg__avatar">
        {!continued && <Orb size="xs" mode={message.status === "pending" ? "busy" : "idle"} />}
      </div>
      <div className="msg__body">
        {!continued && (
          <div className="msg__header">
            <span className="msg__name">Jarvis</span>
            {message.channel === "voice" && (
              <span className="chip chip--voice">
                <AudioLines size={11} /> sesli
              </span>
            )}
          </div>
        )}
        {message.status === "pending" ? (
          <PendingIndicator since={message.createdAt} />
        ) : message.status === "error" ? (
          <div className="msg-error">
            <AlertTriangle size={15} />
            <span>{message.text}</span>
          </div>
        ) : (
          <Markdown text={message.text} />
        )}
      </div>
    </div>
  );
});

function PendingIndicator({ since }: { since: number }) {
  const seconds = useElapsed(since);

  return (
    <div className="pending">
      <div className="pending__row">
        <span className="pending__label">Çalışıyor</span>
        <span className="pending__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="pending__timer">{seconds} sn</span>
      </div>
      {seconds >= 12 && <p className="pending__hint">Model eğitimi gibi işlemler biraz sürebilir.</p>}
    </div>
  );
}

// ---------- Boş durum ----------

const PIPELINE = [
  { icon: FileSpreadsheet, label: "CSV" },
  { icon: Sparkles, label: "Analiz" },
  { icon: Wand2, label: "Dönüşüm" },
  { icon: BrainCircuit, label: "Model" },
  { icon: Download, label: "İndir" },
];

interface EmptyStateProps {
  activeDatasetId: string | null;
  voiceActive: boolean;
  onSuggestion: (text: string) => void;
  onStartVoice: () => void;
  onUpload: () => void;
}

export function EmptyState({ activeDatasetId, voiceActive, onSuggestion, onStartVoice, onUpload }: EmptyStateProps) {
  const suggestions = activeDatasetId
    ? [
        "Bu veriyi incele",
        "Eksik değerleri ve tekrarlı satırları özetle",
        "Hangi sütunu tahmin edebiliriz?",
        ...(activeDatasetId === "sample" ? ["Ülkelere göre toplam satış adedini göster"] : []),
      ]
    : ["Hangi veri setleri var?", "Sample veri setini seç ve incele", "Neler yapabilirsin?"];

  return (
    <div className="empty">
      <Orb size="lg" mode={voiceActive ? "listening" : "idle"} />

      <h1 className="empty__title">
        Merhaba, ben <span className="gradient-text">Jarvis</span>
      </h1>
      <p className="empty__subtitle">
        Veri setini yükle; konuşarak ya da yazarak analiz et, dönüştür ve model eğit.
      </p>

      <ol className="pipeline" aria-label="Çalışma akışı">
        {PIPELINE.map(({ icon: Icon, label }, index) => (
          <li key={label}>
            {index > 0 && <ArrowRight size={13} className="pipeline__arrow" aria-hidden="true" />}
            <span className="pipeline__step">
              <Icon size={14} />
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="empty__actions">
        {!voiceActive && (
          <button type="button" className="btn btn--primary" onClick={onStartVoice}>
            <AudioLines size={17} /> Sesli başlat
          </button>
        )}
        <button type="button" className="btn" onClick={onUpload}>
          <Upload size={16} /> CSV yükle
        </button>
      </div>

      <div className="suggestions">
        {suggestions.map((text) => (
          <button key={text} type="button" className="suggestion" onClick={() => onSuggestion(text)}>
            <Sparkles size={13} />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
