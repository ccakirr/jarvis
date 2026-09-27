from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..services.artifact_service import get_model_path, get_model_metadata_path

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/{model_id}/download", response_class=FileResponse)
def download_model(model_id: str):
    try:
        file_path = get_model_path(model_id)
    except ValueError:
        raise HTTPException(
            detail="Bir hata oluştu",
            status_code=400,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Dosya bulunamadı"
        )

    return FileResponse(
        path=file_path,
        filename=f"{model_id}.joblib",
        media_type="application/octet-stream",
    )


@router.get("/{model_id}/report/download", response_class=FileResponse)
def download_model_report(model_id: str):
    try:
        file_path = get_model_metadata_path(model_id)
    except ValueError:
        raise HTTPException(
            detail="Bir hata oluştu",
            status_code=400,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Dosya bulunamadı"
        )

    return FileResponse(
        path=file_path,
        filename=f"{model_id}.json",
        media_type="application/json",
    )
