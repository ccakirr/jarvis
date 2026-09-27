from fastapi import APIRouter, UploadFile, HTTPException
from io import BytesIO

import pandas as pd

from ..services.dataset_service import summarize_dataset, save_dataset

router = APIRouter(
    prefix="/datasets",
    tags=["datasets"]
)


@router.post("", status_code=201)
async def upload_dataset(file: UploadFile):
    if file.filename[-4:].lower() != ".csv":
        raise HTTPException(
            status_code=415,
            detail="Dosya CSV dosyası olmalı."
        )

    max_size = 250 * 1024 * 1024
    chunk_size = 1024 * 1024

    total_size = 0
    chunks = []

    while chunk := await file.read(chunk_size):
        total_size += len(chunk)

        if total_size > max_size:
            raise HTTPException(
                status_code=413,
                detail="Dosya en fazla 250 MB olabilir.",
            )
        chunks.append(chunk)

    content = b"".join(chunks)

    try:
        df = pd.read_csv(BytesIO(content), encoding="utf-8")

    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=400,
            detail="Dosya okuma hatası."
        )

    except pd.errors.ParserError:
        raise HTTPException(
            status_code=400,
            detail="Dosya okuma hatası."
        )

    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Dosya okuma hatası."
        )

    if df.empty:
        raise HTTPException(
            status_code=400,
            detail="Dosya okunamadı."
        )

    dataset_id = save_dataset(content)

    return {
        "original_filename": file.filename,
        "size": total_size,
        "summary": summarize_dataset(df),
        "dataset_id": dataset_id,
    }
