import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    confusion_matrix,
    mean_squared_error,
    r2_score
)

from .model_service import create_model

TASK_TYPES = [
    "regression",
    "classification",
]


def validate_training_data(
    df: pd.DataFrame,
    target_column: str,
    feature_columns: list[str],
    task_type: str,
) -> None:
    if target_column not in df.columns:
        raise ValueError(
            "Hedef sütun veri setinde bulunmamakta"
        )

    if task_type not in TASK_TYPES:
        raise ValueError(
            "Geçersiz görev türü"
        )

    if not feature_columns:
        raise ValueError(
            "Özellik listesi boş olamaz"
        )

    for column in feature_columns:
        if column not in df.columns:
            raise ValueError(
                f"Özellik sütunu bulunamadı: {column}"
            )

    if len(feature_columns) != len(set(feature_columns)):
        raise ValueError(
            "Bir özellik en fazla bir kere eklenebilir."
        )

    if target_column in feature_columns:
        raise ValueError(
            "Hedef sütun özellik listesinde olmamalı"
        )

    if df[target_column].nunique() < 2:
        raise ValueError(
            "Hedef sütunda en az iki farklı değer olmalı."
        )

    if task_type == "regression":
        target = df[target_column]

        if (
            not pd.api.types.is_numeric_dtype(target)
            or pd.api.types.is_bool_dtype(target)
        ):
            raise ValueError("Regresyon hedefi sayısal olmalı; bool olamaz.")

    return None


def prepare_training_data(
    df: pd.DataFrame,
    target_column: str,
    feature_columns: list[str],
    task_type: str,
) -> tuple[pd.DataFrame, pd.Series, int]:
    validate_training_data(df, target_column, feature_columns, task_type)
    labeled_df = df.loc[df[target_column].notna()]
    dropped_rows = len(df) - len(labeled_df)
    X = labeled_df[feature_columns].copy()
    y = labeled_df[target_column].copy()

    return X, y, dropped_rows


def split_training_data(
    X: pd.DataFrame,
    y: pd.Series,
    task_type: str,
    test_size: float = 0.2,
    random_state: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    if task_type not in TASK_TYPES:
        raise ValueError(
            "Geçersiz görev türü"
        )

    if not (0 < test_size < 1):
        raise ValueError(
            "Test boyutu 0 ile 1 arasında olmalıdır"
        )

    stratify = y if task_type == "classification" else None

    try:
        return train_test_split(
            X,
            y,
            test_size=test_size,
            stratify=stratify,
            random_state=random_state,
        )
    except ValueError as exc:
        raise ValueError(
            f"Eğitim/test ayrımı yapılamadı. "
            f"Örnek sayısını, sınıf dağılımını ve test_size "
            "değerini kontrol edin. "
            f"Ayrıntı: {exc}"
        ) from exc


def build_preprocessor(X_train: pd.DataFrame) -> ColumnTransformer:
    numerical_columns = (
        X_train
        .select_dtypes(include="number")
        .columns
        .tolist()
    )
    categorical_columns = (
        X_train
        .drop(columns=numerical_columns)
        .columns
        .tolist()
    )

    numeric_pipeline = Pipeline([
        (
            "imputer",
            SimpleImputer(strategy="median")
        ),
        (
            "scaler",
            StandardScaler()
        ),
    ])

    categoric_pipeline = Pipeline([
        (
            "imputer",
            SimpleImputer(strategy="most_frequent")
        ),
        (
            "encoder",
            OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        )
    ])

    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numerical_columns),
            ("cat", categoric_pipeline, categorical_columns)
        ]
    )


def build_training_pipeline(
    preprocessor: ColumnTransformer,
    model,
) -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model)
        ]
    )


def train_model(
    df: pd.DataFrame,
    target_column: str,
    feature_columns: list[str],
    task_type: str,
    test_size: float,
    random_state: int,
    model_name: str,
    params: dict | None = None,
) -> tuple:
    X, y, dropped_rows = prepare_training_data(
        df,
        target_column,
        feature_columns,
        task_type
    )

    X_train, X_test, y_train, y_test = split_training_data(
        X,
        y,
        task_type,
        test_size,
        random_state,
    )

    if task_type == "regression" and len(y_test) < 2:
        raise ValueError(
            "Regresyon değerlendirmesi için test kümesinde en az "
            "2 satır olmalı. Daha fazla veri kullanın veya test_size "
            "değerini artırın."
        )

    preprocessor = build_preprocessor(X_train)
    model = create_model(task_type, model_name, params)

    training_pipeline = build_training_pipeline(
        preprocessor,
        model
    )

    training_pipeline.fit(X_train, y_train)
    y_head = training_pipeline.predict(X_test)

    if task_type == "classification":
        labels = training_pipeline.named_steps["model"].classes_.tolist()

        metrics = {
            "accuracy": accuracy_score(y_test, y_head),
            "f1": f1_score(y_test, y_head, average='weighted'),
            "labels": labels,
            "confusion_matrix": confusion_matrix(
                y_test, y_head, labels=labels
            ).tolist(),
        }

    if task_type == "regression":
        metrics = {
            "mse": mean_squared_error(y_test, y_head),
            "r2": r2_score(y_test, y_head)
        }

    report = {
        "metrics": metrics,
        "rows_total": len(df),
        "rows_dropped_missing_target": dropped_rows,
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "target_column": target_column,
        "feature_columns": feature_columns,
        "test_size": test_size,
        "random_state": random_state,
    }

    return training_pipeline, report
