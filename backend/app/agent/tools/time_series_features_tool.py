from smolagents import Tool

from ...services.dataset_service import load_dataset, save_dataframe
from ...services.session_service import add_session_dataset
from ...services.timeseries_service import build_time_series_features


class TimeSeriesFeaturesTool(Tool):
    name = "create_time_series_features"

    description = (
        "Prepare a price time series for direction forecasting. Sorts rows by "
        "time and adds past-only features: returns over 1, 3, 6, 12 and 24 "
        "bars, rolling volatility and trend over 12 and 48 bars, RSI 14, bar "
        "range (when high/low are given), volume ratio (when volume is given) "
        "and hour of day. Adds the label target_up_<horizon> (1 if the price "
        "is higher <horizon> bars later) and future_return_<horizon> for "
        "backtesting. Rows without enough history or without a future price "
        "are dropped. Saves the result as a new dataset; the original is "
        "preserved and the active dataset does not change. Use before "
        "train_direction_model."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": "The dataset ID of a single-symbol price series.",
        },
        "time_column": {
            "type": "string",
            "description": "The timestamp column.",
        },
        "price_column": {
            "type": "string",
            "description": "The price column to forecast, usually close.",
        },
        "horizon": {
            "type": "integer",
            "description": (
                "How many bars ahead to forecast, e.g. 12 for one hour of "
                "5-minute bars."
            ),
        },
        "high_column": {
            "type": "string",
            "nullable": True,
            "description": "Optional high price column; requires low_column.",
        },
        "low_column": {
            "type": "string",
            "nullable": True,
            "description": "Optional low price column; requires high_column.",
        },
        "volume_column": {
            "type": "string",
            "nullable": True,
            "description": "Optional volume column.",
        },
    }

    output_type = "object"

    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id

    def forward(
        self,
        dataset_id: str,
        time_column: str,
        price_column: str,
        horizon: int,
        high_column: str | None = None,
        low_column: str | None = None,
        volume_column: str | None = None,
    ) -> dict:
        df = load_dataset(dataset_id)
        features, summary = build_time_series_features(
            df,
            time_column,
            price_column,
            horizon,
            high_column,
            low_column,
            volume_column,
        )

        new_dataset_id = save_dataframe(features)
        add_session_dataset(
            self.session_id,
            new_dataset_id,
            source_dataset_id=dataset_id,
            operations=[{
                "operation": "time_series_features",
                "params": {
                    "time_column": time_column,
                    "price_column": price_column,
                    "horizon": horizon,
                },
            }],
        )

        return {
            "source_dataset_id": dataset_id,
            "dataset_id": new_dataset_id,
            **summary,
        }
