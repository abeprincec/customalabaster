import os
from dataclasses import dataclass

MAX_RETRIES = 3


@dataclass
class Job:
    name: str
    retries: int = 0

    def run(self, verbose: bool = False) -> str:
        """Run the job and return a status line."""
        path = os.path.join("/tmp", self.name)
        if verbose and self.retries < MAX_RETRIES:
            print(f"running {self.name} in {path}")
        return "ok" if os.path.exists(path) else "missing"


def main(jobs: list[Job]) -> None:
    for job in jobs:
        status = job.run(verbose=True)
        print(job.name, status, len(jobs), None)  # report


if __name__ == "__main__":
    main([Job("build"), Job("test", retries=1)])
