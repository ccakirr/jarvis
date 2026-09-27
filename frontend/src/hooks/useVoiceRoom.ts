import type { Room } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, errorMessage } from "../api";

function voiceErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.";
    if (error.name === "NotFoundError") return "Mikrofon bulunamadı.";
  }
  if (error instanceof ApiError && error.status === 503) {
    return "Ses servisi yapılandırılmamış: .env içinde LIVEKIT_* değişkenlerini kontrol et.";
  }
  return `Sesli bağlantı kurulamadı: ${errorMessage(error)}`;
}

/**
 * Her sesli oturum için yeni bir LiveKit Room.
 * Aynı Room'u yeniden kullanmak transcript handler'larının
 * tekrar kaydedilmesine takılıyor; yeni nesne bu durumu tamamen önlüyor.
 */
export function useVoiceRoom(sessionId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  const release = useCallback((target: Room) => {
    if (roomRef.current === target) {
      roomRef.current = null;
      setRoom(null);
    }
  }, []);

  const start = useCallback(async () => {
    if (roomRef.current) return;
    setError(null);

    // SDK büyük; sadece sesli mod açılınca indiriliyor
    const { Room, RoomEvent } = await import("livekit-client");
    if (roomRef.current) return;

    const next = new Room({ adaptiveStream: true, dynacast: true });
    next.on(RoomEvent.Disconnected, () => release(next));
    roomRef.current = next;
    setRoom(next);

    try {
      const token = await api.voiceToken(sessionId);
      await next.connect(token.server_url, token.participant_token);
      await next.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      setError(voiceErrorMessage(err));
      await next.disconnect();
      release(next);
    }
  }, [sessionId, release]);

  const stop = useCallback(() => {
    void roomRef.current?.disconnect();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  return { room, error, start, stop, clearError };
}
