import pandas as pd
import numpy as np

import json
from pathlib import Path

OPERATIONS = json.loads(
    (Path(__file__).resolve().parents[1] / "core" / "operations.json")
    .read_text()
)


def get_operation_catalog() -> dict:
    return {
        "defaults": [
            name for name, config in OPERATIONS.items() if config["default"]
        ],
        "available": [
            {"name": name, **config} for name, config in OPERATIONS.items()
        ],
    }


def to_python_scalar(value):
    if pd.isna(value):
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def aggregate_dataset(
    df: pd.DataFrame,
    group_by: str,
    column: str,
    operation: str,
) -> dict:
    if group_by not in df.columns:
        raise ValueError(
            f"Gruplama sütunu bulunamadı: {group_by}"
        )

    if column not in df.columns:
        raise ValueError(
            f"Sütun bulunamadı: {column}"
        )

    if operation not in OPERATIONS.keys():
        raise ValueError(
            f"Desteklenmeyen işlem isteği: {operation}."
            f"Desteklenenler: {', '.join(OPERATIONS.keys())}"
        )

    operation_config = OPERATIONS[operation]

    if (
        operation_config["requires_numeric"]
        and not pd.api.types.is_numeric_dtype(df[column])
    ):
        raise ValueError(
            f"'{operation}' işlemi için '{column}' sayısal olmalı."
        )

    grouped = df.groupby(group_by, dropna=False)[column]
    result = (
        grouped.sum(min_count=1)
        if operation == "sum"
        else grouped.agg(operation)
    )
    results = []

    for group, value in result.items():
        results.append({
            "group": to_python_scalar(group),
            "value": to_python_scalar(value),
        })

    return {
        "group_by": group_by,
        "column": column,
        "operation": operation,
        "results": results,
    }


def aggregate_operations(
    df: pd.DataFrame,
    group_by: str,
    operations: list[dict],
) -> list[dict]:
    return [
        aggregate_dataset(df, group_by, item["column"], item["operation"])
        for item in operations
    ]
