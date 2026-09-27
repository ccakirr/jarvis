from smolagents import Tool

from ...services.artifact_service import save_model_artifacts
from ...services.dataset_service import load_dataset
from ...services.nlp_service import MODEL_NAME, train_text_classifier
from ...services.session_service import add_session_model


class TextClassificationTool(Tool):
    name = "train_text_classifier"

    description = (
        "Train an NLP text classification model that predicts a label from "
        "a free-text column, for example review sentiment or topic. "
        "Uses TF-IDF word and word-pair features with Turkish-aware "
        "normalization and logistic regression, then reports held-out "
        "accuracy, weighted F1, a confusion matrix and the most indicative "
        "terms per class. Use this instead of train_model whenever the input "
        "is free text; train_model cannot handle free-text columns. "
        "The target must be an existing label column with 2 to 50 classes; "
        "create it with transform_dataset first if needed. Rows with empty "
        "text or a missing label are dropped. "
        "This tool does not modify the dataset."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": (
                "The dataset ID: 'sample' or an uploaded dataset ID."
            ),
        },
        "text_column": {
            "type": "string",
            "description": (
                "The free-text column to learn from, e.g. review content."
            ),
        },
        "target_column": {
            "type": "string",
            "description": (
                "The label column to predict. It must have 2 to 50 distinct "
                "values, e.g. a sentiment flag or a rating."
            ),
        },
        "test_size": {
            "type": "number",
            "nullable": True,
            "description": (
                "Fraction of rows held out for evaluation, "
                "strictly between 0 and 1. Defaults to 0.2."
            ),
        },
        "random_state": {
            "type": "integer",
            "nullable": True,
            "description": "Seed for the train/test split. Defaults to 42.",
        },
    }

    output_type = "object"

    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id

    def forward(
        self,
        dataset_id: str,
        text_column: str,
        target_column: str,
        test_size: float | None = None,
        random_state: int | None = None,
    ) -> dict:
        test_size = 0.2 if test_size is None else test_size
        random_state = 42 if random_state is None else random_state

        df = load_dataset(dataset_id)
        pipeline, report = train_text_classifier(
            df,
            text_column,
            target_column,
            test_size,
            random_state,
        )

        result = save_model_artifacts(pipeline, {
            "dataset_id": dataset_id,
            "model_name": MODEL_NAME,
            "task_type": "classification",
            "report": report,
        })
        add_session_model(self.session_id, result["model_id"])

        return result
