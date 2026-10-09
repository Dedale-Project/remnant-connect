"""One short-lived child process, driven only by synthetic JSON on stdin."""
import argparse
import importlib
import json
from common import Conflict


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("implementation", choices=("starter", "solution"))
    parser.add_argument("database")
    parser.add_argument("--fault", choices=("after_effect_before_receipt", "after_commit_before_reply"))
    args = parser.parse_args()
    service = importlib.import_module(args.implementation).Service(args.database)
    try:
        requests = json.load(__import__("sys").stdin)
        responses = [service.apply(request, args.fault) for request in requests]
        print(json.dumps({"responses": responses}, sort_keys=True))
        return 0
    except Conflict as error:
        print(json.dumps({"error": "conflict", "reason": str(error)}))
        return 2
    finally:
        service.close()


if __name__ == "__main__":
    raise SystemExit(main())
