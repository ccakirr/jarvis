import numpy as np
import pandas as pd

RETURN_LAGS = (1, 3, 6, 12, 24)
ROLLING_WINDOWS = (12, 48)
RSI_PERIOD = 14
MAX_HORIZON = 500
MIN_ROWS = 200
FUTURE_PREFIXES = ("target_", "future_")


def require_numeric_column(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        raise ValueError(f"Sütun bulunamadı: {column}")

    series = df[column]
    if (
        not pd.api.types.is_numeric_dtype(series)
        or pd.api.types.is_bool_dtype(series)
    ):
        raise ValueError(f"Sütun sayısal olmalı: {column}")

    return series


def prepare_price_frame(
    df: pd.DataFrame,
    time_column: str,
    price_column: str,
) -> pd.DataFrame:
    if time_column not in df.columns:
        raise ValueError(f"Sütun bulunamadı: {time_column}")

    price = require_numeric_column(df, price_column)
    if (price.dropna() <= 0).any():
        raise ValueError(f"'{price_column}' sütunundaki fiyatlar pozitif olmalı.")

    times = pd.to_datetime(df[time_column], errors="coerce", utc=True)
    invalid_times = int(times.isna().sum())
    if invalid_times:
        raise ValueError(
            f"'{time_column}' sütununda tarihe çevrilemeyen "
            f"{invalid_times} değer var."
        )

    frame = (
        df.assign(**{time_column: times})
        .sort_values(time_column, kind="stable")
        .reset_index(drop=True)
    )

    if frame[time_column].duplicated().any():
        raise ValueError(
            "Aynı zaman damgası birden fazla satırda var; "
            "veri tek bir sembolün fiyat serisi olmalı."
        )

    return frame


def relative_strength_index(price: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    change = price.diff()
    average_gain = change.clip(lower=0).ewm(
        alpha=1 / period, min_periods=period, adjust=False
    ).mean()
    average_loss = (-change.clip(upper=0)).ewm(
        alpha=1 / period, min_periods=period, adjust=False
    ).mean()

    return 100 - 100 / (1 + average_gain / average_loss)


def build_time_series_features(
    df: pd.DataFrame,
    time_column: str,
    price_column: str,
    horizon: int,
    high_column: str | None = None,
    low_column: str | None = None,
    volume_column: str | None = None,
) -> tuple[pd.DataFrame, dict]:
    if isinstance(horizon, bool) or not isinstance(horizon, int):
        raise ValueError("horizon bir tam sayı olmalı.")
    if not 1 <= horizon <= MAX_HORIZON:
        raise ValueError(f"horizon 1 ile {MAX_HORIZON} arasında olmalı.")
    if (high_column is None) != (low_column is None):
        raise ValueError("high_column ve low_column birlikte verilmeli.")

    frame = prepare_price_frame(df, time_column, price_column)
    price = frame[price_column]

    features = {
        f"return_{lag}": price.pct_change(lag, fill_method=None)
        for lag in RETURN_LAGS
    }
    for window in ROLLING_WINDOWS:
        features[f"volatility_{window}"] = features["return_1"].rolling(window).std()
        features[f"trend_{window}"] = price / price.rolling(window).mean() - 1
    features[f"rsi_{RSI_PERIOD}"] = relative_strength_index(price)

    if high_column is not None:
        bar_range = (
            require_numeric_column(frame, high_column)
            - require_numeric_column(frame, low_column)
        ) / price
        features["range_1"] = bar_range
        features[f"range_{ROLLING_WINDOWS[0]}"] = bar_range.rolling(ROLLING_WINDOWS[0]).mean()

    if volume_column is not None:
        volume = require_numeric_column(frame, volume_column)
        features[f"volume_ratio_{ROLLING_WINDOWS[0]}"] = (
            volume / volume.rolling(ROLLING_WINDOWS[0]).mean() - 1
        )

    hour = frame[time_column].dt.hour + frame[time_column].dt.minute / 60
    features["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    features["hour_cos"] = np.cos(2 * np.pi * hour / 24)

    return_column = f"future_return_{horizon}"
    target_column = f"target_up_{horizon}"
    future_return = price.shift(-horizon) / price - 1

    result = frame.assign(**features)
    result[return_column] = future_return
    result[target_column] = (future_return > 0).astype(int)
    result = result.replace([np.inf, -np.inf], np.nan)

    feature_columns = list(features)
    complete = result[feature_columns + [return_column]].notna().all(axis=1)
    result = result[complete].reset_index(drop=True)

    if len(result) < MIN_ROWS:
        raise ValueError(
            f"Özellikler oluşturulduktan sonra {len(result)} satır kaldı; "
            f"en az {MIN_ROWS} satır gerekli."
        )

    bar_minutes = frame[time_column].diff().median().total_seconds() / 60
    summary = {
        "rows_before": int(len(df)),
        "rows_after": int(len(result)),
        "removed_rows": int(len(df) - len(result)),
        "horizon": horizon,
        "bar_minutes": bar_minutes,
        "horizon_minutes": bar_minutes * horizon,
        "time_column": time_column,
        "feature_columns": feature_columns,
        "target_column": target_column,
        "return_column": return_column,
        "up_share": float(result[target_column].mean()),
        "start": result[time_column].iloc[0].isoformat(),
        "end": result[time_column].iloc[-1].isoformat(),
    }

    return result, summary
