import string
from operator import methodcaller

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

MODEL_NAME = "tfidf_logistic_regression"
MIN_ROWS = 20
MAX_CLASSES = 50
MAX_FEATURES = 50_000
TOP_TERM_COUNT = 12

# Türkçe'ye duyarlı küçük harf + ASCII katlama:
# "ÇALIŞMIYOR", "çalışmıyor" ve "calismiyor" aynı terime iner.
# str.translate + methodcaller saf pickle ile saklanır; indirilen model
# Jarvis kodu olmadan, yalnızca scikit-learn ile yüklenebilir.
TURKISH_FOLD = str.maketrans(
    string.ascii_uppercase + "İıÇçĞğÖöŞşÜü",
    string.ascii_lowercase + "iiccggoossuu",
)
normalize_text = methodcaller("translate", TURKISH_FOLD)


def validate_text_columns(
    df: pd.DataFrame,
    text_column: str,
    target_column: str,
) -> None:
    for column in (text_column, target_column):
        if column not in df.columns:
            raise ValueError(f"Sütun bulunamadı: {column}")

    if text_column == target_column:
        raise ValueError("Metin sütunu ile hedef sütun aynı olamaz.")

    text = df[text_column]
    if pd.api.types.is_numeric_dtype(text) or pd.api.types.is_bool_dtype(text):
        raise ValueError(
            f"'{text_column}' sayısal bir sütun; metin sınıflandırma "
            "serbest metin içeren bir sütun gerektirir."
        )


def prepare_text_data(
    df: pd.DataFrame,
    text_column: str,
    target_column: str,
) -> tuple[pd.Series, pd.Series, dict]:
    missing_target = df[target_column].isna()
    empty_text = (
        df[text_column].isna()
        | df[text_column].astype(str).str.strip().eq("")
    )
    keep = ~missing_target & ~empty_text

    texts = df.loc[keep, text_column].astype(str)
    labels = df.loc[keep, target_column]
    dropped = {
        "rows_dropped_missing_target": int(missing_target.sum()),
        "rows_dropped_empty_text": int((empty_text & ~missing_target).sum()),
    }

    return texts, labels, dropped


def validate_labels(labels: pd.Series) -> None:
    if len(labels) < MIN_ROWS:
        raise ValueError(
            f"Eğitim için en az {MIN_ROWS} geçerli satır gerekli; "
            f"şu an {len(labels)} satır var."
        )

    counts = labels.value_counts()
    if len(counts) < 2:
        raise ValueError("Hedef sütunda en az iki farklı sınıf olmalı.")

    if len(counts) > MAX_CLASSES:
        raise ValueError(
            f"Hedef sütunda {len(counts)} farklı değer var; metin "
            f"sınıflandırma için en fazla {MAX_CLASSES} sınıf destekleniyor. "
            "Hedef bir etiket sütunu olmalı."
        )

    if counts.min() < 2:
        raise ValueError(
            "Her sınıfta en az 2 örnek olmalı; "
            f"'{counts.idxmin()}' sınıfında {counts.min()} örnek var."
        )


def build_text_pipeline(train_rows: int) -> Pipeline:
    return Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                preprocessor=normalize_text,
                ngram_range=(1, 2),
                # Küçük veride tek geçen kelimeyi de tut
                min_df=2 if train_rows >= 1000 else 1,
                max_features=MAX_FEATURES,
                sublinear_tf=True,
            ),
        ),
        ("model", LogisticRegression(max_iter=1000, class_weight="balanced")),
    ])


def top_terms_by_class(pipeline: Pipeline) -> list[dict]:
    terms = pipeline.named_steps["tfidf"].get_feature_names_out()
    model = pipeline.named_steps["model"]
    labels = model.classes_.tolist()
    coefficients = model.coef_

    # İkili sınıflamada tek katsayı vektörü var: pozitif ağırlık 2. sınıfı,
    # negatif ağırlık 1. sınıfı işaret eder
    if coefficients.shape[0] == 1:
        order = np.argsort(coefficients[0])
        return [
            {"label": labels[1], "terms": terms[order[::-1][:TOP_TERM_COUNT]].tolist()},
            {"label": labels[0], "terms": terms[order[:TOP_TERM_COUNT]].tolist()},
        ]

    return [
        {
            "label": label,
            "terms": terms[np.argsort(coefficients[index])[::-1][:TOP_TERM_COUNT]].tolist(),
        }
        for index, label in enumerate(labels)
    ]


def train_text_classifier(
    df: pd.DataFrame,
    text_column: str,
    target_column: str,
    test_size: float = 0.2,
    random_state: int = 42,
) -> tuple[Pipeline, dict]:
    if isinstance(test_size, bool) or not isinstance(test_size, (int, float)) or not 0 < test_size < 1:
        raise ValueError("test_size 0 ile 1 arasında olmalı.")
    if isinstance(random_state, bool) or not isinstance(random_state, int):
        raise ValueError("random_state bir tam sayı olmalı.")

    validate_text_columns(df, text_column, target_column)
    texts, labels, dropped = prepare_text_data(df, text_column, target_column)
    validate_labels(labels)

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            texts,
            labels,
            test_size=test_size,
            random_state=random_state,
            stratify=labels,
        )
    except ValueError as exc:
        raise ValueError(f"Veri eğitim/test olarak bölünemedi: {exc}") from exc

    pipeline = build_text_pipeline(len(X_train))
    try:
        pipeline.fit(X_train, y_train)
    except ValueError as exc:
        if "empty vocabulary" in str(exc):
            raise ValueError(
                f"'{text_column}' sütununda öğrenilebilecek kelime bulunamadı."
            ) from exc
        raise

    predictions = pipeline.predict(X_test)
    class_labels = pipeline.named_steps["model"].classes_
    counts = labels.value_counts()

    report = {
        "metrics": {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "f1": float(f1_score(y_test, predictions, average="weighted")),
            "labels": class_labels.tolist(),
            "confusion_matrix": confusion_matrix(
                y_test, predictions, labels=class_labels
            ).tolist(),
        },
        "rows_total": int(len(df)),
        **dropped,
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "target_column": target_column,
        "feature_columns": [text_column],
        "text_column": text_column,
        "test_size": test_size,
        "random_state": random_state,
        "vocabulary_size": len(pipeline.named_steps["tfidf"].vocabulary_),
        "class_distribution": [
            {"label": label, "count": int(counts[label])}
            for label in class_labels.tolist()
        ],
        "top_terms": top_terms_by_class(pipeline),
    }

    return pipeline, report
