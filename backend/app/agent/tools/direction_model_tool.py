from smolagents import Tool

from ...services.artifact_service import save_model_artifacts
from ...services.backtest_service import train_direction_model
from ...services.dataset_service import load_dataset
from ...services.session_service import add_session_model


class DirectionModelTool(Tool):
    name = "train_direction_model"

    description = (
        "Train a classifier that forecasts price direction and backtest it as "
        "a trading strategy. Splits rows chronologically (the last test_size "
        "share is the test period) and purges the last <horizon> training "
        "rows so labels cannot overlap the test period. Reports accuracy "
        "against the majority-class baseline, then simulates one "
        "non-overlapping trade every <horizon> bars with costs: total and "
        "gross return, buy-and-hold return, annualized Sharpe, max drawdown "
        "and hit rate. With probability_threshold above 0.5 it trades only "
        "when the model is confident and stays flat otherwise, which cuts "
        "trades and costs. Use this, not train_model, for time-ordered data; "
        "train_model shuffles rows and leaks future information. Present the "
        "result as a historical out-of-sample test, never as expected future "
        "profit; short test periods make Sharpe noisy."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": (
                "A dataset created by create_time_series_features."
            ),
        },
        "time_column": {
            "type": "string",
            "description": "The timestamp column.",
        },
        "target_column": {
            "type": "string",
            "description": "The 0/1 direction label, e.g. target_up_12.",
        },
        "return_column": {
            "type": "string",
            "description": (
                "The future return column matching the label, "
                "e.g. future_return_12."
            ),
        },
        "feature_columns": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Numeric past-only feature columns, e.g. the feature_columns "
                "returned by create_time_series_features."
            ),
        },
        "horizon": {
            "type": "integer",
            "description": "The horizon used to create the label.",
        },
        "model_name": {
            "type": "string",
            "nullable": True,
            "description": (
                "Classification model: 'logistic_regression' (default), "
                "'random_forest', 'extra_trees', 'decision_tree', "
                "'hist_gradient_boosting'."
            ),
        },
        "params": {
            "type": "object",
            "nullable": True,
            "description": (
                "Optional scikit-learn constructor parameters for the model. "
                "Use only parameters requested or agreed by the user."
            ),
        },
        "test_size": {
            "type": "number",
            "nullable": True,
            "description": (
                "Share of the most recent rows used as the test period, "
                "strictly between 0 and 1. Defaults to 0.3."
            ),
        },
        "cost_bps": {
            "type": "number",
            "nullable": True,
            "description": (
                "Trading cost per unit of position change in basis points "
                "(commission plus slippage/spread). Defaults to 1.0."
            ),
        },
        "probability_threshold": {
            "type": "number",
            "nullable": True,
            "description": (
                "Minimum predicted probability to open a trade, between 0.5 "
                "and 0.95. Defaults to 0.5 (always in the market)."
            ),
        },
        "strategy": {
            "type": "string",
            "nullable": True,
            "description": (
                "'long_short' (default): long when up is predicted, otherwise "
                "short. 'long_only': long when up is predicted, otherwise flat."
            ),
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
        target_column: str,
        return_column: str,
        feature_columns: list[str],
        horizon: int,
        model_name: str | None = None,
        params: dict | None = None,
        test_size: float | None = None,
        cost_bps: float | None = None,
        strategy: str | None = None,
        probability_threshold: float | None = None,
    ) -> dict:
        model_name = model_name or "logistic_regression"

        df = load_dataset(dataset_id)
        pipeline, report = train_direction_model(
            df,
            time_column,
            target_column,
            return_column,
            feature_columns,
            horizon,
            model_name,
            params,
            0.3 if test_size is None else test_size,
            1.0 if cost_bps is None else cost_bps,
            strategy or "long_short",
            0.5 if probability_threshold is None else probability_threshold,
        )

        result = save_model_artifacts(pipeline, {
            "dataset_id": dataset_id,
            "model_name": model_name,
            "task_type": "classification",
            "report": report,
        })
        add_session_model(self.session_id, result["model_id"])

        backtest = {
            key: value
            for key, value in report["backtest"].items()
            if key != "equity_curve"
        }
        return {**result, "report": {**report, "backtest": backtest}}
