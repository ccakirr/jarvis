from fastapi import APIRouter, HTTPException

from ..schemas.analysis import AggregationRequest
from ..services.analysis_service import (
    aggregate_operations,
    get_operation_catalog
    )
from ..services.dataset_service import load_dataset

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/operations")
def list_operations() -> dict:
    return get_operation_catalog()


@router.post("/aggregate")
def run_aggregations(body: AggregationRequest) -> dict:
    try:
        df = load_dataset(body.dataset_id)
        results = aggregate_operations(
            df, body.group_by,
            [item.model_dump() for item in body.operations],
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="Veri seti bulunamadı."
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        ) from exc

    return {"dataset_id": body.dataset_id, "analyses": results}
