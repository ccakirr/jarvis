from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from livekit import api

from ..core.config import LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
from ..services.session_service import get_session

router = APIRouter(prefix="/sessions", tags=["voice"])


@router.post("/{session_id}/voice-token")
def create_voice_token(session_id: str) -> dict:
    if not (LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET):
        raise HTTPException(
            status_code=503,
            detail="Ses servisi yapılandırılmamış."
        )

    try:
        get_session(session_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Oturum bulunamadı"
        )

    # Voice worker backend session'ını oda adından okuyor.
    # Her bağlantı yeni oda açar; böylece agent her seferinde yeniden katılır.
    room_name = f"jarvis-{session_id}-{uuid4().hex[:8]}"

    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(f"user-{uuid4().hex[:8]}")
        .with_name("Kullanıcı")
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .with_ttl(timedelta(hours=1))
        .to_jwt()
    )

    return {
        "server_url": LIVEKIT_URL,
        "room_name": room_name,
        "participant_token": token,
    }
