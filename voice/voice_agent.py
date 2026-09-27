import asyncio
import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, get_job_context
from livekit.plugins import silero

import backend_client
from backend_client import BackendError

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

REQUIRED_ENV = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
missing = [name for name in REQUIRED_ENV if not os.getenv(name)]
if missing:
    raise RuntimeError(f"Eksik env değişkenleri: {', '.join(missing)}")

logger = logging.getLogger("jarvis-voice")

# Frontend odaları "jarvis-<session_id>-<nonce>" adıyla açıyor
ROOM_NAME_PATTERN = re.compile(r"jarvis-([0-9a-f]{32})-[0-9a-f]+")
# Frontend bu attribute ile backend'in çalıştığını gösteriyor
BUSY_ATTRIBUTE = "jarvis.busy"
# Sohbet geçmişi bu kanaldan gidiyor; ses kesilse de metin kaybolmuyor
CHAT_TOPIC = "jarvis.chat"
ROLE_ATTRIBUTE = "jarvis.role"


class JarvisVoiceAgent(Agent):
    def __init__(self, backend_session_id: str) -> None:
        super().__init__(instructions="")
        self._backend_session_id = backend_session_id
        self._pending_reply: asyncio.Task | None = None
        self._queued: list[str] = []

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        text = (new_message.text_content or "").strip()
        if not text:
            return

        logger.info("TURN: %s", text)
        await _publish_chat("user", text)

        if self._pending_reply and not self._pending_reply.done():
            self._queued.append(text)
            self.session.say("Not aldım, bitince ona da bakacağım.")
            await _publish_chat("notice", "Önceki istek sürüyor; bu mesaj sıraya alındı.")
            return

        await self._begin(text)

    async def _begin(self, text: str, announce: bool = True) -> None:
        if announce:
            self.session.say("Bakıyorum.")
        await _set_busy(True)
        self._pending_reply = asyncio.create_task(self._reply(text))

    async def _reply(self, text: str) -> None:
        answer = None
        try:
            answer = await backend_client.send_message(self._backend_session_id, text)
        except BackendError as exc:
            logger.error("Backend hatası: %s", exc)
            self.session.say("Şu anda isteğini işleyemedim, lütfen tekrar dene.")
            await _publish_chat("error", f"İstek işlenemedi: {exc}")
        except Exception:
            logger.exception("Beklenmeyen hata")
            self.session.say("Beklenmeyen bir hata oluştu.")
            await _publish_chat("error", "Beklenmeyen bir hata oluştu.")
        finally:
            await _set_busy(False)

        if answer is not None:
            logger.info("JARVIS: %s", answer)
            await _publish_chat("assistant", answer)
            self.session.say(answer)

        if self._queued:
            follow_up = " ".join(self._queued)
            self._queued.clear()
            await self._begin(follow_up, announce=False)


async def _set_busy(busy: bool) -> None:
    try:
        room = get_job_context().room
        await room.local_participant.set_attributes({BUSY_ATTRIBUTE: "true" if busy else "false"})
    except Exception:
        # Console modunda gerçek bir oda yok; durum yayını opsiyonel
        logger.debug("busy durumu yayınlanamadı", exc_info=True)


async def _publish_chat(role: str, text: str) -> None:
    try:
        room = get_job_context().room
        await room.local_participant.send_text(text, topic=CHAT_TOPIC, attributes={ROLE_ATTRIBUTE: role})
    except Exception:
        logger.debug("sohbet mesajı yayınlanamadı", exc_info=True)


async def resolve_backend_session(room_name: str) -> str:
    match = ROOM_NAME_PATTERN.fullmatch(room_name)
    if match:
        session_id = match.group(1)
        try:
            await backend_client.get_session(session_id)
            return session_id
        except BackendError:
            logger.warning("Odadaki backend session bulunamadı: %s", session_id)

    # Console modu veya eşleşmeyen oda: yeni session
    return await backend_client.create_session()


server = AgentServer()


@server.rtc_session()
async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        vad=silero.VAD.load(),
        stt="deepgram/nova-3:tr",
        tts="cartesia/sonic-3",
        turn_handling={"endpointing": {"min_delay": 0.8, "max_delay": 4.0}},
    )

    @session.on("user_input_transcribed")
    def on_transcript(ev):
        if ev.is_final:
            logger.info("USER: %s", ev.transcript)

    backend_session_id = await resolve_backend_session(ctx.room.name)
    logger.info("backend session: %s", backend_session_id)

    await session.start(room=ctx.room, agent=JarvisVoiceAgent(backend_session_id))
    await session.say("Merhaba, ben Jarvis.")


if __name__ == "__main__":
    agents.cli.run_app(server)
