import {
  RoomAudioRenderer,
  useAudioPlayback,
  useLocalParticipant,
  useMultibandTrackVolume,
  useTextStream,
  useTranscriptions,
  useVoiceAssistant,
  type TextStreamData,
  type TrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { useElapsed } from "../hooks/useElapsed";
import { cx } from "../lib/format";
import type { VoiceMode, VoiceSegment } from "../types";
import { Orb } from "./Orb";

// voice/voice_agent.py ile aynı sabitler
const BUSY_ATTRIBUTE = "jarvis.busy";
const CHAT_TOPIC = "jarvis.chat";
const ROLE_ATTRIBUTE = "jarvis.role";
const CHAT_ROLES: ReadonlyArray<VoiceSegment["role"]> = ["user", "assistant", "notice", "error"];
const BAR_COUNT = 7;

type AgentState = ReturnType<typeof useVoiceAssistant>["state"];

const MODE_LABELS: Record<VoiceMode, string> = {
  idle: "Bağlantı kapandı",
  connecting: "Bağlanıyor…",
  listening: "Dinliyorum",
  busy: "Çalışıyor",
  speaking: "Konuşuyor",
};

function deriveMode(state: AgentState, busy: boolean): VoiceMode {
  // "Bakıyorum." konuşulurken backend zaten meşgul; önce konuşmayı göster
  if (state === "speaking") return "speaking";
  if (busy || state === "thinking") return "busy";
  if (state === "listening" || state === "idle") return "listening";
  if (state === "disconnected" || state === "failed") return "idle";
  return "connecting";
}

function isChatRole(value: string | undefined): value is VoiceSegment["role"] {
  return CHAT_ROLES.includes(value as VoiceSegment["role"]);
}

/**
 * Sohbet geçmişi worker'ın gönderdiği tam turlardan kuruluyor.
 * TTS transcript'i sesle senkron olduğu için kullanıcı araya girince
 * cevap metni kayboluyordu; o yüzden sadece canlı altyazıda kullanılıyor.
 */
function toSegments(streams: TextStreamData[]): VoiceSegment[] {
  return streams
    .filter((stream) => stream.text.trim())
    .map((stream) => {
      const role = stream.streamInfo.attributes?.[ROLE_ATTRIBUTE];
      return { id: stream.streamInfo.id, role: isChatRole(role) ? role : "assistant", text: stream.text.trim() };
    });
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

interface VoiceDockProps {
  onSegments: (segments: VoiceSegment[]) => void;
  onBusyChange: (busy: boolean) => void;
  onStop: () => void;
}

/** LiveKit RoomContext içinde render edilmeli. */
export function VoiceDock({ onSegments, onBusyChange, onStop }: VoiceDockProps) {
  const { state, audioTrack, agentAttributes } = useVoiceAssistant();
  const { localParticipant, microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const transcriptions = useTranscriptions();
  const { textStreams: chatStreams } = useTextStream(CHAT_TOPIC);

  const busy = agentAttributes?.[BUSY_ATTRIBUTE] === "true";
  const mode = deriveMode(state, busy);

  const [busySince, setBusySince] = useState<number | null>(null);
  const [connectingSince, setConnectingSince] = useState<number | null>(null);
  useEffect(() => setBusySince(busy ? Date.now() : null), [busy]);
  useEffect(() => setConnectingSince(mode === "connecting" ? Date.now() : null), [mode === "connecting"]);
  const busySeconds = useElapsed(busySince);
  const connectingSeconds = useElapsed(connectingSince);

  useEffect(() => {
    onSegments(toSegments(chatStreams));
  }, [chatStreams, onSegments]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const micTrack = useMemo<TrackReference | undefined>(
    () =>
      microphoneTrack
        ? { participant: localParticipant, publication: microphoneTrack, source: Track.Source.Microphone }
        : undefined,
    [localParticipant, microphoneTrack],
  );
  const micBands = useMultibandTrackVolume(micTrack, { bands: BAR_COUNT });
  const agentBands = useMultibandTrackVolume(audioTrack, { bands: BAR_COUNT });

  const bands =
    mode === "speaking" ? agentBands : mode === "listening" && isMicrophoneEnabled ? micBands : [];
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => bands[i] ?? 0);
  const level = Math.min(1, average(bands) * 1.8);

  const lastText = transcriptions.at(-1)?.text.trim();
  let caption: string;
  if (mode === "connecting") {
    caption =
      connectingSeconds > 8
        ? "Jarvis odaya katılmadı. Voice worker çalışıyor mu? (python voice_agent.py dev)"
        : "Jarvis odaya katılıyor…";
  } else if (mode === "listening" && !isMicrophoneEnabled) {
    caption = "Mikrofon kapalı. Yazarak devam edebilirsin.";
  } else if (mode === "busy") {
    caption =
      busySeconds > 10
        ? "Hâlâ çalışıyor; model eğitimi gibi işlemler biraz sürebilir."
        : "İsteğin backend'de işleniyor…";
  } else {
    caption = lastText || "Konuşmaya başlayabilirsin.";
  }

  return (
    <div className={cx("voice-dock", `voice-dock--${mode}`)}>
      <RoomAudioRenderer />
      <Orb mode={mode} level={level} size="md" />

      <div className="voice-dock__text" role="status" aria-live="polite">
        <div className="voice-dock__state">
          <span>{MODE_LABELS[mode]}</span>
          {mode === "busy" && <span className="voice-dock__timer">{busySeconds} sn</span>}
        </div>
        <p className="voice-dock__caption">{caption}</p>
      </div>

      <div className={cx("voice-bars", `voice-bars--${mode}`)} aria-hidden="true">
        {bars.map((value, i) => (
          <span key={i} style={{ "--bar": value.toFixed(3), "--i": i } as CSSProperties} />
        ))}
      </div>

      <div className="voice-dock__actions">
        {!canPlayAudio && (
          <button type="button" className="btn btn--small" onClick={() => void startAudio()}>
            <Volume2 size={15} /> Sesi aç
          </button>
        )}
        <button
          type="button"
          className={cx("icon-btn", !isMicrophoneEnabled && "icon-btn--warn")}
          onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          aria-label={isMicrophoneEnabled ? "Mikrofonu kapat" : "Mikrofonu aç"}
          title={isMicrophoneEnabled ? "Mikrofonu kapat" : "Mikrofonu aç"}
        >
          {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          onClick={onStop}
          aria-label="Sesli modu kapat"
          title="Sesli modu kapat"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
