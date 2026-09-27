from pydantic import BaseModel, ConfigDict, Field


class AggregationOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column: str = Field(min_length=1)
    operation: str = Field(min_length=1)


class AggregationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str = Field(min_length=1)
    group_by: str = Field(min_length=1)
    operations: list[AggregationOperation] = Field(min_length=1, max_length=50)
