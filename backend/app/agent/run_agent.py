from .agent import create_agent


agent = create_agent()


def run_agent(prompt: str):
    response = agent.run(task=prompt, reset=False)
    print(response)


if __name__ == "__main__":
    while True:
        prompt = input(">")

        if prompt == "/quit":
            print("Quitting...")
            break

        run_agent(prompt=prompt)
