from smolagents import Tool

from ...services.dataset_service import load_dataset, save_dataframe
from ...services.expression_service import derive_features
from ...services.session_service import add_session_dataset


class DeriveFeaturesTool(Tool):
    name = "derive_features"

    description = (
        "Create new columns from safe expressions over existing columns, "
        "for indicators, market-structure rules, flags and labels "
        "(e.g. swing highs, breakouts, liquidity sweeps, fair value gaps, "
        "session windows, return thresholds). Rows are processed in their "
        "current order; pass time_column to sort by time first. Each feature "
        "is {\"name\": ..., \"expression\": ...}; later features may use "
        "earlier ones. Saves a new dataset; the original is preserved and "
        "the active dataset does not change.\n"
        "Expression nodes: {\"column\": \"close\"}, {\"value\": 2.5} or "
        "{\"op\": NAME, \"args\": [nodes...], plus params}.\n"
        "Ops: add, sub, mul, div, neg, abs, log, sqrt, sign, max, min "
        "(elementwise); gt, ge, lt, le, eq, ne; and, or, not; where "
        "[condition, then, else]; on one series: shift {periods} (positive = "
        "past bars, negative = future bars), diff {periods}, pct_change "
        "{periods}, rolling {window, stat: mean|sum|std|min|max|median} "
        "(trailing), ewm {span}, cumsum, cummax, cummin; on a datetime "
        "column: hour, minute, dayofweek.\n"
        "Comparisons and logic return 1/0 flags; rows without enough "
        "history stay empty. A feature that uses future bars is a label: its "
        "name must start with target_ or future_, and such columns can "
        "never be model features.\n"
        "Previous 20-bar high: {\"op\": \"shift\", \"periods\": 1, \"args\": "
        "[{\"op\": \"rolling\", \"window\": 20, \"stat\": \"max\", \"args\": "
        "[{\"column\": \"high\"}]}]}.\n"
        "Label, price up at least 0.2% after 12 bars (pct_change is "
        "past-only, so divide a negative shift): {\"op\": \"ge\", "
        "\"args\": [{\"op\": \"sub\", \"args\": [{\"op\": \"div\", \"args\": [{\"op\": "
        "\"shift\", \"periods\": -12, \"args\": [{\"column\": \"close\"}]}, "
        "{\"column\": \"close\"}]}, {\"value\": 1}]}, {\"value\": 0.002}]}."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": "The dataset ID to derive columns from.",
        },
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "expression": {"type": "object"},
                },
                "required": ["name", "expression"],
                "additionalProperties": False,
            },
            "description": "1 to 20 new columns to create, in order.",
        },
        "time_column": {
            "type": "string",
            "nullable": True,
            "description": "Optional timestamp column to sort by before computing.",
        },
    }

    output_type = "object"

    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id

    def forward(
        self,
        dataset_id: str,
        features: list[dict],
        time_column: str | None = None,
    ) -> dict:
        df = load_dataset(dataset_id)
        result, created = derive_features(df, features, time_column)

        new_dataset_id = save_dataframe(result)
        add_session_dataset(
            self.session_id,
            new_dataset_id,
            source_dataset_id=dataset_id,
            operations=[{
                "operation": "derive_features",
                "params": {"time_column": time_column, "features": features},
            }],
        )

        return {
            "source_dataset_id": dataset_id,
            "dataset_id": new_dataset_id,
            "rows": int(len(result)),
            "created_columns": created,
        }
