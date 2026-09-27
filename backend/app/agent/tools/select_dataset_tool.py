from smolagents import Tool

from ...services.session_service import set_active_dataset


class SelectDatasetTool(Tool):
    name = "select_dataset"

    description = (
        "Select the active dataset for the current conversation. "
        "Use when the user asks to switch datasets or continue with a "
        "transformed dataset. Do not switch merely because a new dataset "
        "was created. Use an existing dataset ID from application context "
        "or a tool result."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": "The existing dataset "
            "ID to select for this conversation.",
        },
    }

    output_type = "object"

    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id

    def forward(self, dataset_id: str) -> dict:
        session = set_active_dataset(self.session_id, dataset_id)

        return {
            "session_id": session["session_id"],
            "active_dataset_id": session["active_dataset_id"],
        }
