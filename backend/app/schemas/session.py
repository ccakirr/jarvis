from typing import Literal

from pydantic import BaseModel


class SetActiveDatasetRequest(BaseModel):
    dataset_id: str


class SendMessageRequest(BaseModel):
    message: str
    mode: Literal["text", "voice"] = "text"
