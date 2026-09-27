from smolagents import ToolCallingAgent

from .tools.inspect_dataset_tool import InspectDatasetTool
from .tools.aggregate_dataset_tool import AggregateDatasetTool
from .tools.transform_dataset_tool import TransformDatasetTool
from .tools.select_dataset_tool import SelectDatasetTool
from .tools.training_tool import TrainingTool
from .llm import create_llm_model
from .prompts import AGENT_INSTRUCTIONS


def create_agent(session_id: str):
    model = create_llm_model()

    return ToolCallingAgent(
        tools=[
            InspectDatasetTool(),
            AggregateDatasetTool(),
            TransformDatasetTool(session_id),
            SelectDatasetTool(session_id),
            TrainingTool(session_id)
        ],
        model=model,
        instructions=AGENT_INSTRUCTIONS,
        max_steps=7
    )
