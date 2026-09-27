from smolagents import ToolCallingAgent

from .tools.inspect_dataset_tool import InspectDatasetTool
from .tools.aggregate_dataset_tool import AggregateDatasetTool
from .llm import create_llm_model
from .prompts import AGENT_INSTRUCTIONS


def create_agent():
    model = create_llm_model()

    return ToolCallingAgent(
        tools=[
            InspectDatasetTool(),
            AggregateDatasetTool(),
        ],
        model=model,
        instructions=AGENT_INSTRUCTIONS,
        max_steps=7
    )
