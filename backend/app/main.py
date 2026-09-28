from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .core.config import FRONTEND_DIST_DIR
from .api.analysis import router as analysis_router
from .api.health import router as health_router
from .api.datasets import router as datasets_router
from .api.sessions import router as sessions_router
from .api.models import router as models_router
from .api.voice import router as voice_router


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

app.include_router(
    voice_router,
    prefix="/api"
)

if FRONTEND_DIST_DIR.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_DIST_DIR, html=True),
        name="frontend"
    )
