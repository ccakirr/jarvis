from fastapi import APIRouter, HTTPException

from ..services.session_service import (
    create_session,
    get_session,
    set_active_dataset
)

from ..services.chat_service import send_message
from ..schemas.session import SetActiveDatasetRequest, SendMessageRequest

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", status_code=201)
def create_session_endpoint() -> dict:
    return create_session()


@router.get("/{session_id}")
def get_session_endpoint(session_id: str) -> dict:
    try:
        return get_session(session_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Oturum bulunamadı"
        )


@router.put("/{session_id}/dataset")
def set_active_dataset_endpoint(
    session_id: str,
    body: SetActiveDatasetRequest,
) -> dict:
    try:
        get_session(session_id)
        try:
            return set_active_dataset(session_id, body.dataset_id)
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail="Dosya bulunamadı"
            )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{body.dataset_id}' geçerli bir CSV dosyası "
                    "olarak okunamadı."
                )
            )

    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Oturum bulunamadı"
        )


@router.post("/{session_id}/messages")
def send_message_endpoint(
    session_id: str,
    body: SendMessageRequest,
) -> dict:
    try:
        get_session(session_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Oturum bulunamadı"
        )

    message = body.message.strip()
    if not message:
        raise HTTPException(
            status_code=400,
            detail="Lütfen geçerli bir mesaj giriniz"
        )

    answer = send_message(session_id, message, body.mode)
    return {
        "session_id": session_id,
        "answer": answer,
    }
