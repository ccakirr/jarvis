from smolagents import Tool

from ...services.dataset_service import load_dataset, save_dataframe
from ...services.preprocessing_service import transform_dataset
from ...services.session_service import add_session_dataset


class TransformDatasetTool(Tool):
    name = "transform_dataset"

    description = (
        "Apply a supported transformation "
        "and save the result as a new dataset. "
        "The original dataset is preserved. "
        "Use only when the user requests the transformation; "
        "do not remove rows merely because an inspection found missing values "
        "or duplicates. This tool "
        "does not change the session's active dataset."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": (
                "The source dataset ID: 'sample' or an uploaded dataset ID."
            )
         },
        "operations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "operation": {"type": "string"},
                    "params": {"type": "object"},
                },
                "required": ["operation"],
                "additionalProperties": False,
            },
            "description": (
                "A non-empty list of transformations applied in order. "
                "Each item contains 'operation' and optional 'params'. "
                "'drop_duplicates' and 'drop_empty_rows' take no parameters. "
                "'fill_missing_values' requires 'column'"
                " and a constant 'value' "
                "(string or number). Use only the fill value"
                " requested or agreed "
                "by the user. Only the final dataset is saved. "
                "'derive_column' requires 'output_column' and 'expression'. "
                "The output column must be new. "
                "An expression contains 'operator', 'left', and 'right'. "
                "Supported operators are 'add', 'subtract', and 'multiply'. "
                "Each operand must be either "
                "{'column': 'existing_numeric_column'} "
                "or {'value': number}. Nested expressions are not supported. "
            ),
        },
    }

    output_type = "object"

    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id

    def forward(self, dataset_id: str, operations: list[dict]) -> dict:
        if not operations:
            raise ValueError("En az bir dönüşüm işlemi belirtilmeli.")

        df = load_dataset(dataset_id)
        transformed_df = df

        for step in operations:
            transformed_df = transform_dataset(
                transformed_df,
                step["operation"],
                step.get("params", {}),
            )

        new_dataset_id = save_dataframe(transformed_df)
        add_session_dataset(
            self.session_id,
            new_dataset_id,
            source_dataset_id=dataset_id,
            operations=operations,
        )

        return {
            "source_dataset_id": dataset_id,
            "dataset_id": new_dataset_id,
            "operations": operations,
            "rows_before": len(df),
            "rows_after": len(transformed_df),
            "removed_rows": len(df) - len(transformed_df)
        }
