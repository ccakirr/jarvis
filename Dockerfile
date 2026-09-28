FROM node:24-slim AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    JARVIS_API_URL=http://127.0.0.1:8000

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
COPY voice/requirements.txt voice/requirements.txt
RUN pip install -r backend/requirements.txt -r voice/requirements.txt

COPY backend/ backend/
COPY voice/ voice/
COPY --from=frontend /frontend/dist frontend/dist
COPY docker/start.sh /usr/local/bin/start-jarvis

EXPOSE 8000

CMD ["start-jarvis"]
