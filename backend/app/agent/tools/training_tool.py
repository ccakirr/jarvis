import joblib
import uuid
import json

from smolagents import Tool

from ...services.training_service import train_model
from ...services.dataset_service import load_dataset
from ...core.config import MODELS_DIR, METADATA_DIR


class TrainingTool(Tool):
    name = "train_model"

    description = (
        "Train a scikit-learn model on a dataset "
        "and return evaluation metrics on a held-out test split. "
        "Rows with a missing target value are dropped before training; "
        "missing feature values are imputed and categorical features "
        "are one-hot encoded automatically. "
        "Use only when the user requests model training. "
        "This tool does not modify the dataset."
    )

    inputs = {
        "dataset_id": {
            "type": "string",
            "description": (
                "The dataset ID: 'sample' or an uploaded dataset ID."
            ),
        },
        "target_column": {
            "type": "string",
            "description": (
                "The column to predict. It must exist in the dataset "
                "and contain at least two distinct values. "
                "For regression it must be numeric and not boolean."
            ),
        },
        "feature_columns": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "A non-empty list of unique existing columns used as inputs. "
                "Must not contain the target column."
            ),
        },
        "task_type": {
            "type": "string",
            "enum": ["classification", "regression"],
            "description": "Either 'classification' or 'regression'.",
        },
        "model_name": {
            "type": "string",
            "description": (
                "The model to train. Classification: 'logistic_regression', "
                "'random_forest', 'extra_trees', 'decision_tree', "
                "'hist_gradient_boosting'. Regression: 'ridge', "
                "'random_forest', 'extra_trees', 'decision_tree', "
                "'hist_gradient_boosting'."
            ),
        },
        "params": {
            "type": "object",
            "nullable": True,
            "description": (
                "Optional scikit-learn constructor parameters for the model, "
                "e.g. {'n_estimators': 200, 'max_depth': 5}. "
                "Use only parameters requested or agreed by the user; "
                "omit to use the defaults."
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
            "description": (
                "Seed for the train/test split. Defaults to 42."
            ),
        },
    }

    output_type = "object"

    def forward(
        self,
        dataset_id: str,
        target_column: str,
        feature_columns: list[str],
        task_type: str,
        model_name: str,
        test_size: float | None = None,
        random_state: int | None = None,
        params: dict | None = None,
    ) -> dict:
        test_size = 0.2 if test_size is None else test_size
        random_state = 42 if random_state is None else random_state

        df = load_dataset(dataset_id)

        trained_model, report = train_model(
            df,
            target_column,
            feature_columns,
            task_type,
            test_size,
            random_state,
            model_name,
            params
        )

        model_id = uuid.uuid4().hex
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = MODELS_DIR / f"{model_id}.joblib"

        METADATA_DIR.mkdir(parents=True, exist_ok=True)
        metadata_path = METADATA_DIR / f"{model_id}.json"

        joblib.dump(trained_model, file_path)

        result = {
            "model_id": model_id,
            "dataset_id": dataset_id,
            "model_name": model_name,
            "task_type": task_type,
            "report": report,
        }

        metadata_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False),
            encoding="utf-8",
        )

        return result
