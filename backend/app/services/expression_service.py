import re
from operator import add, mul, sub

import numpy as np
import pandas as pd

from .timeseries_service import FUTURE_PREFIXES

MAX_FEATURES = 20
MAX_DEPTH = 12
MAX_NODES = 80
MAX_PERIODS = 2000
NAME_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,63}")

ROLLING_STATS = ("mean", "sum", "std", "min", "max", "median")
DATETIME_PARTS = ("hour", "minute", "dayofweek")


def safe_divide(left, right):
    result = left / right
    if isinstance(result, pd.Series):
        return result.replace([np.inf, -np.inf], np.nan)
    return result if np.isfinite(result) else np.nan


ARITHMETIC = {"add": add, "sub": sub, "mul": mul, "div": safe_divide}
ELEMENTWISE = {"max": np.maximum, "min": np.minimum}
UNARY = {
    "neg": np.negative,
    "abs": np.abs,
    "sign": np.sign,
    "log": lambda a: np.log(np.where(a > 0, a, np.nan)),
    "sqrt": lambda a: np.sqrt(np.where(a >= 0, a, np.nan)),
}
COMPARISON = {
    "gt": lambda a, b: a > b,
    "ge": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "le": lambda a, b: a <= b,
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
}
LOGICAL = {
    "and": lambda a, b: (a == 1) & (b == 1),
    "or": lambda a, b: (a == 1) | (b == 1),
}
PAST_WINDOW_OPS = ("diff", "pct_change", "rolling", "ewm")
CUMULATIVE = ("cumsum", "cummax", "cummin")

ARITY = {
    **dict.fromkeys(ARITHMETIC, 2),
    **dict.fromkeys(ELEMENTWISE, 2),
    **dict.fromkeys(UNARY, 1),
    **dict.fromkeys(COMPARISON, 2),
    **dict.fromkeys(LOGICAL, 2),
    "not": 1,
    "where": 3,
    "shift": 1,
    **dict.fromkeys(PAST_WINDOW_OPS, 1),
    **dict.fromkeys(CUMULATIVE, 1),
    **dict.fromkeys(DATETIME_PARTS, 1),
}
PARAMS = {
    "shift": {"periods"},
    "diff": {"periods"},
    "pct_change": {"periods"},
    "rolling": {"window", "stat"},
    "ewm": {"span"},
}


class Evaluated:
    def __init__(self, value, uses_future: bool = False, is_flag: bool = False, is_text: bool = False):
        self.value = value
        self.uses_future = uses_future
        self.is_flag = is_flag
        self.is_text = is_text


def apply_unary(function, value):
    if isinstance(value, pd.Series):
        return pd.Series(function(value.to_numpy(dtype=float)), index=value.index)
    return float(function(np.array(value, dtype=float)))


def count_nodes(node, depth: int = 1) -> tuple[int, int]:
    if not isinstance(node, dict):
        raise ValueError("İfade düğümü bir sözlük olmalı.")

    children = node.get("args", [])
    if not isinstance(children, list):
        raise ValueError("'args' bir liste olmalı.")

    nodes, deepest = 1, depth
    for child in children:
        child_nodes, child_depth = count_nodes(child, depth + 1)
        nodes += child_nodes
        deepest = max(deepest, child_depth)
    return nodes, deepest


def require_int(node: dict, key: str, low: int, high: int) -> int:
    value = node.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ValueError(f"'{node['op']}' için '{key}' {low} ile {high} arasında bir tam sayı olmalı.")
    return value


def as_mask(result: pd.Series, *operands: Evaluated) -> pd.Series:
    mask = result.astype(float)
    for operand in operands:
        if isinstance(operand.value, pd.Series):
            mask[operand.value.isna()] = np.nan
    return mask


def require_numeric(item: Evaluated, op: str) -> None:
    if item.is_text:
        raise ValueError(f"'{op}' işlemi sayısal değer ister; metin sütunu kullanılamaz.")
    if isinstance(item.value, str):
        raise ValueError(f"'{op}' işlemi sayısal değer ister; metin sabiti kullanılamaz.")


def evaluate(df: pd.DataFrame, node: dict) -> Evaluated:
    if set(node) == {"column"}:
        column = node["column"]
        if not isinstance(column, str) or column not in df.columns:
            raise ValueError(f"Sütun bulunamadı: {column}")
        series = df[column]
        uses_future = column.startswith(FUTURE_PREFIXES)
        if pd.api.types.is_bool_dtype(series):
            return Evaluated(series.astype(float), uses_future, is_flag=True)
        if not pd.api.types.is_numeric_dtype(series):
            return Evaluated(series, uses_future, is_text=True)
        values = series.astype(float)
        return Evaluated(values, uses_future, is_flag=bool(values.dropna().isin([0, 1]).all()))

    if set(node) == {"value"}:
        value = node["value"]
        if isinstance(value, bool):
            return Evaluated(float(value), is_flag=True)
        if isinstance(value, (int, float)) and np.isfinite(value):
            return Evaluated(float(value))
        if isinstance(value, str):
            return Evaluated(value)
        raise ValueError("Sabit değer sayı, bool veya metin olmalı.")

    op = node.get("op")
    if op not in ARITY:
        raise ValueError(f"Desteklenmeyen işlem: {op}")

    allowed_keys = {"op", "args"} | PARAMS.get(op, set())
    unknown = set(node) - allowed_keys
    if unknown:
        raise ValueError(f"'{op}' işlemi için bilinmeyen parametre: {', '.join(sorted(unknown))}")

    args = node.get("args", [])
    if len(args) != ARITY[op]:
        raise ValueError(f"'{op}' işlemi {ARITY[op]} argüman alır; {len(args)} verildi.")

    if op in DATETIME_PARTS:
        if set(args[0]) != {"column"}:
            raise ValueError(f"'{op}' işlemi doğrudan bir tarih sütunu ister.")
        source = evaluate(df, args[0])
        times = pd.to_datetime(source.value, errors="coerce", utc=True)
        if times.isna().all():
            raise ValueError(f"'{args[0]['column']}' tarihe çevrilemiyor.")
        return Evaluated(getattr(times.dt, op).astype(float), uses_future=source.uses_future)

    items = [evaluate(df, arg) for arg in args]
    uses_future = any(item.uses_future for item in items)

    if op in COMPARISON:
        left, right = items
        text_comparison = left.is_text or right.is_text or isinstance(left.value, str) or isinstance(right.value, str)
        if text_comparison and op not in ("eq", "ne"):
            raise ValueError("Metin değerleri yalnızca 'eq' ve 'ne' ile karşılaştırılabilir.")
        result = COMPARISON[op](left.value, right.value)
        if not isinstance(result, pd.Series):
            raise ValueError("Karşılaştırmada en az bir taraf sütun olmalı.")
        return Evaluated(as_mask(result, left, right), uses_future, is_flag=True)

    for item in items:
        require_numeric(item, op)
    values = [item.value for item in items]

    if op in ARITHMETIC:
        return Evaluated(ARITHMETIC[op](*values), uses_future)

    if op in ELEMENTWISE:
        return Evaluated(ELEMENTWISE[op](*values), uses_future)

    if op in UNARY:
        return Evaluated(apply_unary(UNARY[op], values[0]), uses_future)

    if op in LOGICAL or op == "not":
        if not all(item.is_flag for item in items):
            raise ValueError(f"'{op}' işlemi karşılaştırma sonucu (1/0) ister.")
        result = (values[0] != 1) if op == "not" else LOGICAL[op](*values)
        return Evaluated(as_mask(result, *items), uses_future, is_flag=True)

    if op == "where":
        condition, then, otherwise = items
        if not condition.is_flag:
            raise ValueError("'where' işleminin ilk argümanı karşılaştırma sonucu olmalı.")
        result = pd.Series(np.where(condition.value == 1, then.value, otherwise.value), index=df.index, dtype=float)
        result[condition.value.isna()] = np.nan
        return Evaluated(result, uses_future, is_flag=then.is_flag and otherwise.is_flag)

    series = values[0]
    if not isinstance(series, pd.Series):
        raise ValueError(f"'{op}' işlemi sabit değere değil sütuna uygulanır.")

    if op == "shift":
        periods = require_int(node, "periods", -MAX_PERIODS, MAX_PERIODS)
        if periods == 0:
            raise ValueError("'shift' için periods 0 olamaz.")
        return Evaluated(series.shift(periods), uses_future or periods < 0, items[0].is_flag)

    if op in CUMULATIVE:
        return Evaluated(getattr(series, op)(), uses_future)

    if op == "diff":
        return Evaluated(series.diff(require_int(node, "periods", 1, MAX_PERIODS)), uses_future)

    if op == "pct_change":
        periods = require_int(node, "periods", 1, MAX_PERIODS)
        return Evaluated(safe_divide(series, series.shift(periods)) - 1, uses_future)

    if op == "rolling":
        window = require_int(node, "window", 2, MAX_PERIODS)
        stat = node.get("stat")
        if stat not in ROLLING_STATS:
            raise ValueError(f"'rolling' için stat şunlardan biri olmalı: {', '.join(ROLLING_STATS)}")
        return Evaluated(getattr(series.rolling(window, min_periods=window), stat)(), uses_future)

    span = require_int(node, "span", 2, MAX_PERIODS)
    return Evaluated(series.ewm(span=span, adjust=False, min_periods=span).mean(), uses_future)


def derive_features(
    df: pd.DataFrame,
    features: list[dict],
    time_column: str | None = None,
) -> tuple[pd.DataFrame, list[dict]]:
    if not isinstance(features, list) or not 1 <= len(features) <= MAX_FEATURES:
        raise ValueError(f"features 1 ile {MAX_FEATURES} arasında öğe içeren bir liste olmalı.")

    result = df.copy()
    if time_column is not None:
        if time_column not in result.columns:
            raise ValueError(f"Sütun bulunamadı: {time_column}")
        times = pd.to_datetime(result[time_column], errors="coerce", utc=True)
        if times.isna().any():
            raise ValueError(f"'{time_column}' sütununda tarihe çevrilemeyen değerler var.")
        result = result.assign(**{time_column: times}).sort_values(time_column, kind="stable").reset_index(drop=True)

    created = []
    for index, feature in enumerate(features):
        where = f"features[{index}]"
        if not isinstance(feature, dict) or set(feature) != {"name", "expression"}:
            raise ValueError(f"{where}: her öğe yalnızca 'name' ve 'expression' içermeli.")

        name = feature["name"]
        if not isinstance(name, str) or not NAME_PATTERN.fullmatch(name):
            raise ValueError(f"{where}: geçersiz sütun adı: {name}")
        if name in result.columns:
            raise ValueError(f"{where}: '{name}' sütunu zaten var.")

        nodes, depth = count_nodes(feature["expression"])
        if nodes > MAX_NODES or depth > MAX_DEPTH:
            raise ValueError(
                f"{where}: ifade çok büyük ({nodes} düğüm, derinlik {depth}); "
                f"en fazla {MAX_NODES} düğüm ve {MAX_DEPTH} derinlik."
            )

        try:
            evaluated = evaluate(result, feature["expression"])
        except ValueError as exc:
            raise ValueError(f"{where} ({name}): {exc}") from exc

        if not isinstance(evaluated.value, pd.Series) or evaluated.is_text:
            raise ValueError(f"{where} ({name}): sonuç sayısal bir sütun olmalı.")

        is_label = name.startswith(FUTURE_PREFIXES)
        if evaluated.uses_future and not is_label:
            raise ValueError(
                f"{where}: '{name}' gelecekteki barları kullanıyor; adı "
                f"{' veya '.join(FUTURE_PREFIXES)} ile başlamalı ve yalnızca hedef olarak kullanılabilir."
            )
        if is_label and not evaluated.uses_future:
            raise ValueError(
                f"{where}: {' ve '.join(FUTURE_PREFIXES)} önekleri gelecek bilgisi kullanan "
                "hedef sütunlara ayrılmıştır."
            )

        values = evaluated.value.astype(float)
        result[name] = values
        valid = values.dropna()
        summary = {
            "name": name,
            "uses_future": evaluated.uses_future,
            "non_null": int(valid.size),
        }
        if evaluated.is_flag:
            summary["positive_share"] = float(valid.mean()) if valid.size else None
        elif valid.size:
            summary.update(mean=float(valid.mean()), min=float(valid.min()), max=float(valid.max()))
        created.append(summary)

    return result, created
