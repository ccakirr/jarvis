from ..services.session_service import create_session
from ..services.chat_service import send_message

session = create_session()


def run_agent(prompt: str):
    response = send_message(session["session_id"], prompt)
    print(response)


if __name__ == "__main__":
    while True:
        prompt = input(">")

        if prompt == "/quit":
            print("Quitting...")
            break

        run_agent(prompt=prompt)
