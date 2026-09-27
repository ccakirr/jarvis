import json
import re
import uuid
from pathlib import Path

import joblib

from ..core.config import MODELS_DIR, METADATA_DIR


def get_model_path(model_id: str) -> Path:
    if (
        not isinstance(model_id, str)
        or not re.fullmatch(r"[0-9a-f]{32}", model_id)
    ):
        raise ValueError(f"Geçersiz model kimliği: {model_id}")

    file_path = MODELS_DIR / f"{model_id}.joblib"
    if not file_path.is_file():
        raise FileNotFoundError(f"Model dosyası bulunamadı: {model_id}")

    return file_path


def get_model_metadata_path(model_id: str) -> Path:
    if (
            not isinstance(model_id, str)
            or not re.fullmatch(r"[0-9a-f]{32}", model_id)
    ):
        raise ValueError(f"Geçersiz model kimliği: {model_id}")

    file_path = METADATA_DIR / f"{model_id}.json"
    if not file_path.is_file():
        raise FileNotFoundError(f"Metadata dosyası bulunamadı: {model_id}")

    return file_path


def load_model_metadata(model_id: str) -> dict:
    file_path = get_model_metadata_path(model_id)

    return json.loads(file_path.read_text(encoding="utf-8"))


def save_model_artifacts(model, metadata: dict) -> dict:
    """Modeli .joblib, raporu .json olarak kaydeder; indirme linkleriyle döner."""
    model_id = uuid.uuid4().hex

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODELS_DIR / f"{model_id}.joblib")

    result = {
        "model_id": model_id,
        **metadata,
        "model_download_url": f"/api/models/{model_id}/download",
        "report_download_url": f"/api/models/{model_id}/report/download",
    }

    (METADATA_DIR / f"{model_id}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )

    return result
