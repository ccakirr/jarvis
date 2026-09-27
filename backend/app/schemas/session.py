from pydantic import BaseModel


class SetActiveDatasetRequest(BaseModel):
    dataset_id: str


class SendMessageRequest(BaseModel):
    message: str
