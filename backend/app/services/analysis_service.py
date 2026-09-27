import pandas as pd
import numpy as np

OPERATIONS = {
    "mean": {
        "calculate": lambda grouped: grouped.mean(),
        "requires_numeric": True,
    },
    "sum": {
        "calculate": lambda grouped: grouped.sum(min_count=1),
        "requires_numeric": True,
    },
    "count": {
        "calculate": lambda grouped: grouped.count(),
        "requires_numeric": False,
    },
}


def to_python_scalar(value):
    if pd.isna(value):
        return None
    if isinstance(value, np.generic):
        return value.item()
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
    result = operation_config["calculate"](grouped)

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
