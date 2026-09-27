import json
import re
from pathlib import Path

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
