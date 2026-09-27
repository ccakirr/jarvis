from ..agent.agent import create_agent
from .session_service import get_session

agents = {}


def get_session_agent(session_id: str):
    get_session(session_id)

    if session_id not in agents:
        agents[session_id] = create_agent()

    return agents[session_id]


def send_message(session_id: str, message: str) -> str:
    message = message.strip()
    if not message:
        raise ValueError("Geçerli bir mesaj giriniz")

    session = get_session(session_id)
    agent = get_session_agent(session_id)

    task = (
        "Application context for this turn:\n"
        f"active_dataset_id: {session['active_dataset_id']}\n"
        "Use this ID when the user refers to the current dataset. "
        "It replaces any previous active dataset selection. "
        "If it is None and the request requires a dataset, ask the user "
        "to select one. Do not read dataset IDs aloud.\n\n"
        f"User message:\n{message}"
    )

    return agent.run(task, reset=False)
