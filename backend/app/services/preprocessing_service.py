import pandas as pd
from inspect import signature
from operator import add, sub, mul


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


def resolve_operand(
    df: pd.DataFrame,
    operand: dict,
) -> pd.Series | int | float:
    if not isinstance(operand, dict):
        raise ValueError(
            "İşlem girdisi bir sözlük olmalı."
        )

    if set(operand) == {"column"}:
        column = operand["column"]
        if not isinstance(column, str):
            raise ValueError(
                "Sütun adı bir string olmalı."
            )
        if column not in df.columns:
            raise ValueError(
                f"Sütun bulunamadı: {column}"
            )

        series = df[column]
        if not isinstance(series, pd.Series):
            raise ValueError(
                f"Sütun adı benzersiz olmalı: {column}"
            )
        if (
            not pd.api.types.is_numeric_dtype(series)
            or pd.api.types.is_bool_dtype(series)
        ):
            raise ValueError(
                f"Sütun sayısal olmalı: {column}"
            )
        return series

    if set(operand) == {"value"}:
        value = operand["value"]
        if type(value) not in (int, float):
            raise ValueError(
                "Sabit değer bir sayı olmalı; bool kabul edilmez."
            )
        return value

    raise ValueError(
        "İşlem girdisi yalnızca 'column' veya yalnızca 'value' içermeli."
    )


ARITHMETIC_OPERATIONS = {
    "add": add,
    "subtract": sub,
    "multiply": mul,
}


def evaluate_expression(
    df: pd.DataFrame,
    expression: dict,
) -> pd.Series | int | float:
    if not isinstance(expression, dict):
        raise ValueError(
            "Geçerli bir veri tipi giriniz."
        )

    if set(expression) != {"operator", "left", "right"}:
        raise ValueError(
           "Geçersiz ifade."
        )

    operation = expression["operator"]

    if not isinstance(operation, str):
        raise ValueError(
            "İşlem adı string olmalı."
        )

    if operation not in ARITHMETIC_OPERATIONS:
        raise ValueError(
            f"Desteklenmeyen işlem: {operation}"
        )

    left = resolve_operand(df, expression["left"])
    right = resolve_operand(df, expression["right"])
    calculate = ARITHMETIC_OPERATIONS[operation]

    return calculate(left, right)


def derive_column(
    df: pd.DataFrame,
    output_column: str,
    expression: dict,
) -> pd.DataFrame:
    if not isinstance(output_column, str) or not output_column.strip():
        raise ValueError(
            "output_column string ve boş olmayan bir isim olmalı"
        )

    if output_column in df.columns:
        raise ValueError(
            f"Zaten {output_column} isminde sütun var"
        )

    result = evaluate_expression(df, expression)
    df_copy = df.copy()

    df_copy[output_column] = result

    return df_copy


TRANSFORMATIONS = {
    "drop_duplicates": drop_duplicate_rows,
    "drop_empty_rows": drop_empty_rows,
    "fill_missing_values": fill_missing_values,
    "derive_column": derive_column,
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
