import uuid

from .dataset_service import load_dataset


sessions = {}


def create_session() -> dict:
    session = {
        "session_id": uuid.uuid4().hex,
        "active_dataset_id": None,
        "datasets": [],
        "model_ids": [],
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
    add_session_dataset(session_id, dataset_id)

    return session


def add_session_dataset(
    session_id: str,
    dataset_id: str,
    source_dataset_id: str | None = None,
    operations: list[dict] | None = None,
) -> None:
    session = get_session(session_id)

    if any(item["dataset_id"] == dataset_id for item in session["datasets"]):
        return

    session["datasets"].append({
        "dataset_id": dataset_id,
        "source_dataset_id": source_dataset_id,
        "operations": operations or [],
    })


def add_session_model(session_id: str, model_id: str) -> None:
    session = get_session(session_id)

    if model_id not in session["model_ids"]:
        session["model_ids"].append(model_id)
