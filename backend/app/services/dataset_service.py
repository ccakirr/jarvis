from pathlib import Path
from uuid import uuid4

import pandas as pd
import json
import re

from ..core.config import STORAGE_DIR


DATASETS = {
    "sample": Path(__file__).resolve().parents[2] / "data" / "sample.csv",
}


def load_dataset(dataset_id: str) -> pd.DataFrame:
    """Load a registered CSV dataset by its identifier."""
    if dataset_id in DATASETS:
        file_path = DATASETS[dataset_id]
    else:
        if re.fullmatch(r"[0-9a-f]{32}", dataset_id) is None:
            raise ValueError(f"Geçersiz veri seti kimliği: {dataset_id}")
        file_path = STORAGE_DIR / f"{dataset_id}.csv"

    if not file_path.is_file():
        raise FileNotFoundError(f"Veri seti dosyası bulunamadı: {dataset_id}")

    try:
        return pd.read_csv(file_path, encoding="utf-8")
    except (
        pd.errors.EmptyDataError,
        pd.errors.ParserError,
        UnicodeDecodeError
    ) as exc:
        raise ValueError(
            f"'{dataset_id}' geçerli bir UTF-8 CSV dosyası olarak okunamadı."
        ) from exc


def summarize_dataset(df: pd.DataFrame) -> dict:
    """Return a JSON-compatible summary without modifying the dataframe."""
    preview = json.loads(
        df.head(5).to_json(
            orient="records",
            date_format="iso"
        )
    )

    return {
        "row_count": int(df.shape[0]),
        "column_count": int(df.shape[1]),
        "columns": df.columns.tolist(),
        "data_types": df.dtypes.astype(str).to_dict(),
        "null_value_count": {
            column: int(count) for column, count in df.isna().sum().items()
        },
        "duplicated_rows": int(df.duplicated().sum()),
        "preview": preview,
    }


def save_dataset(content: bytes) -> str:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    dataset_id = uuid4().hex
    file_path = STORAGE_DIR / f"{dataset_id}.csv"

    file_path.write_bytes(content)

    return dataset_id
