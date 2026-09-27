import pandas as pd
from inspect import signature


def drop_duplicate_rows(df: pd.DataFrame) -> pd.DataFrame:
    return df.drop_duplicates(inplace=False)


def drop_empty_rows(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(how="all", inplace=False)


def fill_missing_values(
    df: pd.DataFrame,
    column: str,
    value: str | int | float
) -> pd.DataFrame:
    if column not in df.columns:
        raise ValueError(f"Sütun bulunamadı: {column}")

    df_copy = df.copy()
    df_copy[column] = df_copy[column].fillna(value)

    return df_copy


TRANSFORMATIONS = {
    "drop_duplicates": drop_duplicate_rows,
    "drop_empty_rows": drop_empty_rows,
    "fill_missing_values": fill_missing_values,
}


def transform_dataset(
    df: pd.DataFrame,
    operation: str,
    params: dict | None = None
) -> pd.DataFrame:
    if operation not in TRANSFORMATIONS:
        raise ValueError(f"Desteklenmeyen dönüşüm: {operation}")

    transform_function = TRANSFORMATIONS[operation]

    if params is None:
        params = {}

    if not isinstance(params, dict):
        raise ValueError("Dönüşüm parametreleri bir sözlük olmalı.")

    try:
        signature(transform_function).bind(df, **params)
    except TypeError as exc:
        raise ValueError(
            f"'{operation}' işlemi için geçersiz parametreler: {exc}"
        ) from exc

    return transform_function(df, **params)
