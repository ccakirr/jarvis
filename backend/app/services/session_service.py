import uuid

from .dataset_service import load_dataset


sessions = {}


def create_session() -> dict:
    session = {
        "session_id": uuid.uuid4().hex,
        "active_dataset_id": None,
    }

    sessions[session["session_id"]] = session

    return session


def get_session(session_id: str) -> dict:
    if session_id not in sessions:
        raise ValueError(f"Oturum bulunamadı: {session_id}")

    return sessions[session_id]


def set_active_dataset(session_id: str, dataset_id: str) -> dict:
    session = get_session(session_id)

    load_dataset(dataset_id)

    session["active_dataset_id"] = dataset_id

    return session
