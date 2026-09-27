import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.pipeline import Pipeline

from .model_service import create_model
from .training_service import build_preprocessor, build_training_pipeline

STRATEGIES = ("long_short", "long_only")
MIN_TRAIN_ROWS = 200
MIN_TEST_PERIODS = 20
MAX_COST_BPS = 100
EQUITY_POINTS = 160


def validate_backtest_inputs(
    df: pd.DataFrame,
    time_column: str,
    target_column: str,
    return_column: str,
    feature_columns: list[str],
    horizon: int,
    test_size: float,
    cost_bps: float,
    strategy: str,
) -> None:
    for column in (time_column, target_column, return_column):
        if column not in df.columns:
            raise ValueError(f"Sütun bulunamadı: {column}")

    if not isinstance(feature_columns, list) or not feature_columns:
        raise ValueError("feature_columns boş olmayan bir liste olmalı.")
    if len(set(feature_columns)) != len(feature_columns):
        raise ValueError("feature_columns tekrar eden sütun içeremez.")

    forbidden = {time_column, target_column, return_column} & set(feature_columns)
    if forbidden:
        raise ValueError(
            "Hedef, getiri ve zaman sütunları özellik olamaz; gelecek bilgisi "
            f"modele sızar: {', '.join(sorted(forbidden))}"
        )

    for column in feature_columns:
        if column not in df.columns:
            raise ValueError(f"Sütun bulunamadı: {column}")
        if (
            not pd.api.types.is_numeric_dtype(df[column])
            or pd.api.types.is_bool_dtype(df[column])
        ):
            raise ValueError(f"Özellik sütunu sayısal olmalı: {column}")

    if not set(df[target_column].dropna().unique()) <= {0, 1}:
        raise ValueError(f"'{target_column}' yalnızca 0 ve 1 değerleri içermeli.")

    if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon < 1:
        raise ValueError("horizon pozitif bir tam sayı olmalı.")
    if isinstance(test_size, bool) or not isinstance(test_size, (int, float)) or not 0 < test_size < 1:
        raise ValueError("test_size 0 ile 1 arasında olmalı.")
    if isinstance(cost_bps, bool) or not isinstance(cost_bps, (int, float)) or not 0 <= cost_bps <= MAX_COST_BPS:
        raise ValueError(f"cost_bps 0 ile {MAX_COST_BPS} arasında olmalı.")
    if strategy not in STRATEGIES:
        raise ValueError(
            f"Desteklenmeyen strateji: {strategy}. "
            f"Desteklenenler: {', '.join(STRATEGIES)}"
        )


def chronological_split(
    frame: pd.DataFrame,
    test_size: float,
    horizon: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    split = int(len(frame) * (1 - test_size))
    train = frame.iloc[: split - horizon]
    test = frame.iloc[split:]

    if len(train) < MIN_TRAIN_ROWS:
        raise ValueError(
            f"Eğitim kümesinde {len(train)} satır kaldı; en az "
            f"{MIN_TRAIN_ROWS} satır gerekli. test_size değerini düşürün."
        )
    if len(test) // horizon < MIN_TEST_PERIODS:
        raise ValueError(
            f"Test döneminde yalnızca {len(test) // horizon} bağımsız işlem "
            f"dönemi var; en az {MIN_TEST_PERIODS} gerekli. test_size "
            "değerini artırın veya horizon değerini düşürün."
        )

    return train, test


def strategy_positions(predictions: np.ndarray, strategy: str) -> np.ndarray:
    short_position = -1.0 if strategy == "long_short" else 0.0
    return np.where(predictions == 1, 1.0, short_position)


def downsample_curve(times: pd.Series, *series: np.ndarray) -> list[dict]:
    indexes = np.unique(np.linspace(0, len(times) - 1, min(len(times), EQUITY_POINTS)).round().astype(int))
    return [
        {
            "time": times.iloc[i].isoformat(),
            "strategy": float(series[0][i]),
            "buy_hold": float(series[1][i]),
        }
        for i in indexes
    ]


def run_backtest(
    test: pd.DataFrame,
    time_column: str,
    return_column: str,
    positions: np.ndarray,
    horizon: int,
    cost_bps: float,
    strategy: str,
) -> dict:
    periods = test.iloc[::horizon]
    period_positions = positions[::horizon]
    returns = periods[return_column].to_numpy()

    turnover = np.abs(np.diff(period_positions, prepend=0.0))
    gross = period_positions * returns
    net = gross - turnover * cost_bps / 10_000

    equity = np.cumprod(1 + net)
    buy_hold = np.cumprod(1 + returns)
    drawdown = equity / np.maximum.accumulate(equity) - 1

    times = periods[time_column]
    years = (times.iloc[-1] - times.iloc[0]).total_seconds() / (365.25 * 24 * 3600)
    periods_per_year = len(net) / years if years > 0 else 0
    volatility = net.std(ddof=1)
    sharpe = (
        float(net.mean() / volatility * np.sqrt(periods_per_year))
        if volatility > 0 and periods_per_year > 0
        else 0.0
    )

    active = period_positions != 0

    return {
        "strategy": strategy,
        "cost_bps": cost_bps,
        "horizon": horizon,
        "periods": int(len(net)),
        "trades": int((turnover > 0).sum()),
        "exposure": float(active.mean()),
        "hit_rate": float((gross[active] > 0).mean()) if active.any() else 0.0,
        "total_return": float(equity[-1] - 1),
        "gross_return": float(np.prod(1 + gross) - 1),
        "buy_hold_return": float(buy_hold[-1] - 1),
        "sharpe": sharpe,
        "max_drawdown": float(drawdown.min()),
        "equity_curve": downsample_curve(times, equity, buy_hold),
    }


def train_direction_model(
    df: pd.DataFrame,
    time_column: str,
    target_column: str,
    return_column: str,
    feature_columns: list[str],
    horizon: int,
    model_name: str = "logistic_regression",
    params: dict | None = None,
    test_size: float = 0.3,
    cost_bps: float = 1.0,
    strategy: str = "long_short",
) -> tuple[Pipeline, dict]:
    validate_backtest_inputs(
        df, time_column, target_column, return_column,
        feature_columns, horizon, test_size, cost_bps, strategy,
    )

    times = pd.to_datetime(df[time_column], errors="coerce", utc=True)
    if times.isna().any():
        raise ValueError(f"'{time_column}' sütununda tarihe çevrilemeyen değerler var.")

    required = feature_columns + [target_column, return_column]
    frame = (
        df.assign(**{time_column: times})
        .dropna(subset=required)
        .sort_values(time_column, kind="stable")
        .reset_index(drop=True)
    )
    dropped_rows = int(len(df) - len(frame))

    train, test = chronological_split(frame, test_size, horizon)
    if train[target_column].nunique() < 2:
        raise ValueError("Eğitim döneminde hedef tek sınıftan oluşuyor.")

    pipeline = build_training_pipeline(
        build_preprocessor(train[feature_columns]),
        create_model("classification", model_name, params),
    )
    pipeline.fit(train[feature_columns], train[target_column])

    predictions = pipeline.predict(test[feature_columns])
    y_test = test[target_column]
    labels = pipeline.named_steps["model"].classes_.tolist()
    up_share = float(y_test.mean())

    report = {
        "metrics": {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "f1": float(f1_score(y_test, predictions, average="weighted")),
            "baseline_accuracy": max(up_share, 1 - up_share),
            "labels": labels,
            "confusion_matrix": confusion_matrix(y_test, predictions, labels=labels).tolist(),
        },
        "rows_total": int(len(df)),
        "rows_dropped_missing_target": dropped_rows,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "purged_rows": horizon,
        "target_column": target_column,
        "return_column": return_column,
        "feature_columns": feature_columns,
        "split": "chronological",
        "test_size": test_size,
        "horizon": horizon,
        "train_period": {
            "start": train[time_column].iloc[0].isoformat(),
            "end": train[time_column].iloc[-1].isoformat(),
        },
        "test_period": {
            "start": test[time_column].iloc[0].isoformat(),
            "end": test[time_column].iloc[-1].isoformat(),
        },
        "backtest": run_backtest(
            test,
            time_column,
            return_column,
            strategy_positions(predictions, strategy),
            horizon,
            cost_bps,
            strategy,
        ),
    }

    return pipeline, report
