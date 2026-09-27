import asyncio
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

JARVIS_API_URL = os.getenv("JARVIS_API_URL", "http://localhost:8000").rstrip("/")

SESSION_TIMEOUT = 10.0
# Model eğitimi gibi uzun tool çağrıları için geniş tutuldu
MESSAGE_TIMEOUT = 180.0


class BackendError(Exception):
    pass


def _error_detail(response: httpx.Response) -> str:
    try:
        return response.json().get("detail", response.text)
    except ValueError:
        return response.text


async def _request(method: str, path: str, timeout: float, json: dict | None = None) -> dict:
    url = f"{JARVIS_API_URL}{path}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(method, url, json=json)
    except httpx.TimeoutException as exc:
        raise BackendError(f"Backend zaman aşımına uğradı ({timeout:.0f} sn): {url}") from exc
    except httpx.RequestError as exc:
        raise BackendError(f"Backend'e bağlanılamadı: {url}") from exc

    if not response.is_success:
        raise BackendError(f"Backend hatası {response.status_code}: {_error_detail(response)}")

    return response.json()


async def create_session() -> str:
    data = await _request("POST", "/api/sessions", timeout=SESSION_TIMEOUT)
    return data["session_id"]


async def get_session(session_id: str) -> dict:
    return await _request("GET", f"/api/sessions/{session_id}", timeout=SESSION_TIMEOUT)


async def send_message(session_id: str, message: str) -> str:
    data = await _request(
        "POST",
        f"/api/sessions/{session_id}/messages",
        timeout=MESSAGE_TIMEOUT,
        json={"message": message, "mode": "voice"},
    )
    return str(data["answer"])


async def _main() -> None:
    session_id = await create_session()
    print(f"session_id: {session_id}")

    answer = await send_message(session_id, "Hangi dataset'ler var?")
    print(f"answer: {answer}")


if __name__ == "__main__":
    asyncio.run(_main())
