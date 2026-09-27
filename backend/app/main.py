from fastapi import FastAPI

from .api.health import router as health_router
from .api.datasets import router as datasets_router
from .api.sessions import router as sessions_router


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
