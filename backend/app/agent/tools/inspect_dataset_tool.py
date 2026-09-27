from smolagents import Tool
from ...services.dataset_service import load_dataset, summarize_dataset


class InspectDatasetTool(Tool):
    name = "inspect_dataset"

    description = (
        "Inspect a built-in or uploaded CSV dataset and return its row and column counts, "
        "column names, data types, missing values per column, duplicate row "
        "count, and a preview of the first five rows. "
        "Use this tool before answering questions about a dataset's contents "
        "or preparing an analysis or training plan. "
        "This tool does not modify the dataset or train a model."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": (
                "Use 'sample' for the built-in example dataset, or the dataset_id "
                "returned by a successful CSV upload. Uploaded dataset IDs contain "
                "exactly 32 lowercase hexadecimal characters (0-9 and a-f). "
                "Provide the exact identifier, not the original filename or a file path. "
                "Do not invent an identifier; ask the user for it if unavailable."
            ),
        }
    }

    output_type = "object"

    def forward(self, dataset_id: str) -> dict:
        df = load_dataset(dataset_id)
        return summarize_dataset(df)
