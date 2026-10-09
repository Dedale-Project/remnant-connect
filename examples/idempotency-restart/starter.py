"""Intentionally flawed. Make the contract in verify.py pass without editing it."""
from common import connect, crash_if, validate


class Service:
    def __init__(self, path):
        self.db = connect(path)
        self.cache = {}

    def apply(self, request, fault=None):
        validate(request)
        key = request["key"]
        if key in self.cache:
            return self.cache[key]
        row = self.db.execute(
            "INSERT INTO effects(tenant, request_key, units) VALUES (?, ?, ?)",
            (request["tenant"], key, request["units"]),
        )
        crash_if(fault, "after_effect_before_receipt")
        response = {"effect_id": row.lastrowid, **request}
        self.cache[key] = response
        crash_if(fault, "after_commit_before_reply")
        return response

    def close(self):
        self.db.close()
