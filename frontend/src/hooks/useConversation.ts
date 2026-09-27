import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "../api";
import { readJSON, writeJSON } from "../lib/storage";
import type { ChatMessage, VoiceSegment } from "../types";

function storageKey(sessionId: string): string {
  return `jarvis.messages.${sessionId}`;
}

function newId(): string {
  return crypto.randomUUID();
}

function voiceMessage(id: string, segment: VoiceSegment): ChatMessage {
  const base = { id, text: segment.text, channel: "voice" as const, createdAt: Date.now() };
  switch (segment.role) {
    case "user":
      return { ...base, role: "user" };
    case "notice":
      return { ...base, role: "event" };
    case "error":
      return { ...base, role: "assistant", status: "error" };
    default:
      return { ...base, role: "assistant" };
  }
}

function answerToText(answer: unknown): string {
  if (typeof answer === "string") return answer;
  return "```json\n" + JSON.stringify(answer, null, 2) + "\n```";
}

/**
 * Yazılı ve sesli turların tek zaman çizelgesi.
 * Backend agent'ı iki kanalda da aynı; burada sadece gösterim birleşiyor.
 */
export function useConversation(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    // Yarım kalmış istekler yenilemeden sonra tamamlanamaz
    readJSON<ChatMessage[]>("session", storageKey(sessionId), []).filter((m) => m.status !== "pending"),
  );

  useEffect(() => {
    writeJSON("session", storageKey(sessionId), messages);
  }, [sessionId, messages]);

  const sendText = useCallback(
    async (text: string) => {
      const pendingId = newId();
      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text, channel: "text", createdAt: now },
        { id: pendingId, role: "assistant", text: "", channel: "text", createdAt: now, status: "pending" },
      ]);

      try {
        const result = await api.sendMessage(sessionId, text);
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingId ? { ...m, text: answerToText(result.answer), status: undefined } : m)),
        );
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingId ? { ...m, text: errorMessage(error), status: "error" } : m)),
        );
      }
    },
    [sessionId],
  );

  const addEvent = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: newId(), role: "event", text, channel: "text", createdAt: Date.now() }]);
  }, []);

  // Uzun metinler parça parça gelebilir; aynı stream aynı mesajı günceller
  const upsertVoiceSegments = useCallback((segments: VoiceSegment[]) => {
    setMessages((prev) => {
      let next = prev;
      for (const segment of segments) {
        const id = `voice-${segment.id}`;
        const index = next.findIndex((m) => m.id === id);
        if (index === -1) {
          next = [...next, voiceMessage(id, segment)];
        } else if (next[index].text !== segment.text) {
          next = next.map((m, i) => (i === index ? { ...m, text: segment.text } : m));
        }
      }
      return next;
    });
  }, []);

  const pending = messages.some((m) => m.status === "pending");

  return { messages, pending, sendText, addEvent, upsertVoiceSegments };
}
