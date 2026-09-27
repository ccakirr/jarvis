from smolagents import Tool

from ...services.dataset_service import load_dataset
from ...services.analysis_service import aggregate_dataset


class AggregateDatasetTool(Tool):
    name = "aggregate_dataset"

    description = (
        "Group a dataset by one column and calculate mean, sum, or count "
        "for another column across the full dataset. "
        "Inspect the dataset first to verify column names. "
        "Mean and sum require a numeric column. "
        "Count counts non-missing values in the selected column, not all rows."
        "Missing group values are included. This tool does not modify data."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": "The dataset identifier: "
            "'sample' or an uploaded dataset ID.",
        },
        "group_by": {
            "type": "string",
            "description": "The exact column name to group by.",
        },
        "column": {
            "type": "string",
            "description": "The exact column name to aggregate.",
        },
        "operation": {
            "type": "string",
            "description": "The aggregation operation: mean, sum, or count.",
        },
    }

    output_type = "object"

    def forward(
        self,
        dataset_id: str,
        group_by: str,
        column: str,
        operation: str,
    ) -> dict:
        df = load_dataset(dataset_id)
        return aggregate_dataset(
            df,
            group_by,
            column,
            operation
        )
