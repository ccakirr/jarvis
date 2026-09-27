from fastapi import APIRouter, UploadFile


router = APIRouter(
    prefix="/datasets",
    tags=["datasets"]
)


@router.post("")
async def upload_dataset(file: UploadFile):
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": file.size,
    }
