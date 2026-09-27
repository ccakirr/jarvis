from pathlib import Path
from dotenv import load_dotenv
import os


PROJECT_ROOT = Path(__file__).resolve().parents[3]

load_dotenv(PROJECT_ROOT / ".env")

LLM_MODEL_ID = os.getenv("LLM_MODEL_ID")
LLM_API_KEY = os.getenv("LLM_API_KEY") or None
LLM_API_BASE = os.getenv("LLM_API_BASE") or None
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage" / "datasets"
