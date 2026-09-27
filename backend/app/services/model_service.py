from inspect import signature

from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
)


catalog = {
    "classification": {
        "logistic_regression": {
            "class": LogisticRegression,
            "defaults": {"max_iter": 1000, "random_state": 42},
        },
        "random_forest": {
            "class": RandomForestClassifier,
            "defaults": {"n_estimators": 100, "random_state": 42, "n_jobs": 1},
        },
        "extra_trees": {
            "class": ExtraTreesClassifier,
            "defaults": {"n_estimators": 100, "random_state": 42, "n_jobs": 1},
        },
        "decision_tree": {
            "class": DecisionTreeClassifier,
            "defaults": {"random_state": 42},
        },
        "hist_gradient_boosting": {
            "class": HistGradientBoostingClassifier,
            "defaults": {"max_iter": 100, "random_state": 42},
        },
    },
    "regression": {
        "ridge": {
            "class": Ridge,
            "defaults": {"alpha": 1.0},
        },
        "random_forest": {
            "class": RandomForestRegressor,
            "defaults": {"n_estimators": 100, "random_state": 42, "n_jobs": 1},
        },
        "extra_trees": {
            "class": ExtraTreesRegressor,
            "defaults": {"n_estimators": 100, "random_state": 42, "n_jobs": 1},
        },
        "decision_tree": {
            "class": DecisionTreeRegressor,
            "defaults": {"random_state": 42},
        },
        "hist_gradient_boosting": {
            "class": HistGradientBoostingRegressor,
            "defaults": {"max_iter": 100, "random_state": 42},
        },
    },
}


def validate_model_params(params: dict | None) -> dict:
    if params is None:
        return {}

    if not isinstance(params, dict):
        raise ValueError(
            "Parametreler bir sözlük olmalı."
        )

    if "n_jobs" in params:
        raise ValueError(
            "n_jobs backend tarafından yönetilir."
        )

    if "n_estimators" in params:
        value = params["n_estimators"]
        if type(value) is not int or not 1 <= value <= 500:
            raise ValueError(
                "n_estimators, 1–500 arasında tam sayı olmalı."
            )

    if "max_iter" in params:
        value = params["max_iter"]
        if type(value) is not int or not 1 <= value <= 2000:
            raise ValueError(
                "max_iter, 1–2000 arasında tam sayı olmalı."
            )

    if "max_depth" in params:
        value = params["max_depth"]
        if value is not None:
            if type(value) is not int or not 1 <= value <= 50:
                raise ValueError(
                    "max_depth, None veya 1–50 arasında tam sayı olmalı."
                )

    return params.copy()


def create_model(
    task_type: str,
    model_name: str,
    params: dict | None = None,
):
    if task_type not in catalog:
        raise ValueError(
            f"Desteklenmeyen görev türü: {task_type}"
        )

    models = catalog[task_type]

    if model_name not in models:
        raise ValueError(
            f"Desteklenmeyen model: {model_name}. "
            f"Desteklenenler: {', '.join(models)}"
        )

    config = models[model_name]

    model_class = config["class"]
    approved_params = signature(model_class).parameters

    params = validate_model_params(params)

    invalid_params = set(params) - set(approved_params)

    if invalid_params:
        raise ValueError(
            f"Geçersiz parametreler: {', '.join(invalid_params)}. "
            f"Geçerli parametreler: {', '.join(approved_params)}"
        )

    final_params = {
        **config["defaults"],
        **params,
    }

    return model_class(**final_params)
