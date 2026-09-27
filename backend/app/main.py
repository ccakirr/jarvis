from fastapi import FastAPI

from .api.analysis import router as analysis_router
from .api.health import router as health_router
from .api.datasets import router as datasets_router
from .api.sessions import router as sessions_router
from .api.models import router as models_router


app = FastAPI(
    title="Jarvis API",
    version="0.1.0"
)


app.include_router(
    health_router,
    prefix="/api"
)

app.include_router(
    datasets_router,
    prefix="/api"
)

app.include_router(
    sessions_router,
    prefix="/api"
)

app.include_router(
    analysis_router,
    prefix="/api"
)

app.include_router(
    models_router,
    prefix="/api"
)
