import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "./api";
import { Composer } from "./components/Composer";
import { Conversation, EmptyState } from "./components/Conversation";
import { DropOverlay } from "./components/DropOverlay";
import { Header } from "./components/Header";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { useConversation } from "./hooks/useConversation";
import { useVoiceRoom } from "./hooks/useVoiceRoom";
import { useWorkspaceData } from "./hooks/useWorkspaceData";
import { cx, datasetLabel, formatInteger } from "./lib/format";
import type { Selection } from "./types";

const VoiceLayer = lazy(() => import("./components/VoiceLayer"));

interface Notice {
  tone: "success" | "error";
  text: string;
}

interface WorkspaceProps {
  sessionId: string;
  onNewSession: () => void;
}

export function Workspace({ sessionId, onNewSession }: WorkspaceProps) {
  const data = useWorkspaceData(sessionId);
  const conversation = useConversation(sessionId);
  const voice = useVoiceRoom(sessionId);
  const { session, refresh, upload, activate } = data;
  const { addEvent, sendText } = conversation;

  const [selection, setSelection] = useState<Selection | null>(null);
  const [drawer, setDrawer] = useState<"sidebar" | "inspector" | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .health()
        .then(() => !cancelled && setBackendOnline(true))
        .catch(() => !cancelled && setBackendOnline(false));
    void check();
    const timer = window.setInterval(check, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const { error: voiceError, clearError: clearVoiceError } = voice;
  useEffect(() => {
    if (!voiceError) return;
    setNotice({ tone: "error", text: voiceError });
    clearVoiceError();
  }, [voiceError, clearVoiceError]);

  // Sesli tur bitince agent dataset seçmiş ya da model eğitmiş olabilir
  const wasVoiceBusy = useRef(false);
  useEffect(() => {
    if (wasVoiceBusy.current && !voiceBusy) void refresh();
    wasVoiceBusy.current = voiceBusy;
  }, [voiceBusy, refresh]);

  // Yeni üretilen artifact'ı otomatik göster: model > yeni dataset > aktif dataset değişimi
  const previous = useRef<{ active: string | null; datasets: number; models: number } | null>(null);
  useEffect(() => {
    if (!session) return;
    const before = previous.current;
    previous.current = {
      active: session.active_dataset_id,
      datasets: session.datasets.length,
      models: session.model_ids.length,
    };
    if (!before) return;

    const newModel = session.model_ids.at(-1);
    const newDataset = session.datasets.at(-1);
    if (session.model_ids.length > before.models && newModel) {
      setSelection({ kind: "model", id: newModel });
    } else if (session.datasets.length > before.datasets && newDataset) {
      setSelection({ kind: "dataset", id: newDataset.dataset_id });
    } else if (session.active_dataset_id && session.active_dataset_id !== before.active) {
      setSelection({ kind: "dataset", id: session.active_dataset_id });
    }
  }, [session]);

  const effectiveSelection: Selection | null =
    selection ?? (session?.active_dataset_id ? { kind: "dataset", id: session.active_dataset_id } : null);

  const select = (next: Selection) => {
    setSelection(next);
    // Dar ekranda detaylar ayrı çekmecede
    setDrawer("inspector");
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setNotice({ tone: "error", text: "Sadece CSV dosyaları yüklenebilir." });
        return;
      }
      setUploading(true);
      try {
        const result = await upload(file);
        addEvent(
          `${file.name} yüklendi · ${formatInteger(result.summary.row_count)} satır, ` +
            `${result.summary.column_count} sütun · aktif veri seti`,
        );
        setNotice({ tone: "success", text: `${file.name} aktif veri seti yapıldı.` });
      } catch (error) {
        setNotice({ tone: "error", text: errorMessage(error) });
      } finally {
        setUploading(false);
      }
    },
    [upload, addEvent],
  );

  const handleActivate = async (datasetId: string) => {
    setActivating(true);
    try {
      await activate(datasetId);
      addEvent(`${datasetLabel(datasetId, session, data.names)} aktif veri seti yapıldı`);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setActivating(false);
    }
  };

  const handleSend = async (text: string) => {
    await sendText(text);
    void refresh();
  };

  const handleNewSession = () => {
    voice.stop();
    onNewSession();
  };

  const blockedReason = conversation.pending
    ? "Jarvis önceki isteği işliyor…"
    : voiceBusy
      ? "Jarvis sesli isteğini işliyor…"
      : null;

  return (
    <div className="app">
      <Header
        backendOnline={backendOnline}
        voiceConnected={Boolean(voice.room)}
        onToggleSidebar={() => setDrawer((open) => (open === "sidebar" ? null : "sidebar"))}
        onToggleInspector={() => setDrawer((open) => (open === "inspector" ? null : "inspector"))}
      />

      <main className="workspace">
        <Sidebar
          session={session}
          names={data.names}
          datasets={data.datasets}
          models={data.models}
          selection={effectiveSelection}
          uploading={uploading}
          open={drawer === "sidebar"}
          onSelect={select}
          onUpload={openFilePicker}
          onNewSession={handleNewSession}
        />

        <section className="conversation" aria-label="Konuşma">
          <Conversation
            messages={conversation.messages}
            emptyState={
              <EmptyState
                activeDatasetId={session?.active_dataset_id ?? null}
                voiceActive={Boolean(voice.room)}
                onSuggestion={(text) => void handleSend(text)}
                onStartVoice={() => void voice.start()}
                onUpload={openFilePicker}
              />
            }
          />

          <div className="conversation__footer">
            {voice.room && (
              <Suspense fallback={null}>
                <VoiceLayer
                  room={voice.room}
                  onSegments={conversation.upsertVoiceSegments}
                  onBusyChange={setVoiceBusy}
                  onStop={voice.stop}
                />
              </Suspense>
            )}
            <Composer
              blockedReason={blockedReason}
              voiceActive={Boolean(voice.room)}
              uploading={uploading}
              onSend={(text) => void handleSend(text)}
              onUpload={openFilePicker}
              onStartVoice={() => void voice.start()}
            />
          </div>
        </section>

        <Inspector
          selection={effectiveSelection}
          session={session}
          names={data.names}
          datasets={data.datasets}
          models={data.models}
          open={drawer === "inspector"}
          activating={activating}
          onClose={() => setDrawer(null)}
          onSelect={select}
          onActivate={(datasetId) => void handleActivate(datasetId)}
          onUpload={openFilePicker}
          onAsk={(text) => {
            if (blockedReason) {
              setNotice({ tone: "error", text: blockedReason });
              return;
            }
            setDrawer(null);
            void handleSend(text);
          }}
          ensureDataset={data.ensureDataset}
          ensureModel={data.ensureModel}
        />

        {drawer && <div className="backdrop" onClick={() => setDrawer(null)} aria-hidden="true" />}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleUpload(file);
        }}
      />
      <DropOverlay onFile={handleUpload} />

      {notice && (
        <div className={cx("toast", `toast--${notice.tone}`)} role="status">
          {notice.tone === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
          <button type="button" className="icon-btn icon-btn--small" onClick={() => setNotice(null)} aria-label="Kapat">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
