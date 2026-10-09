"""Reference solution. Read after attempting the challenge."""
import hashlib
import json
from common import Conflict, canonical, connect, crash_if, validate


class Service:
    def __init__(self, path):
        self.db = connect(path)

    def apply(self, request, fault=None):
        validate(request)
        tenant, key = request["tenant"], request["key"]
        # This fixture has one operation. Real APIs must include operation/version
        # and every meaningful input in their documented fingerprint contract.
        fingerprint = hashlib.sha256(canonical(request).encode()).hexdigest()
        self.db.execute("BEGIN IMMEDIATE")
        try:
            receipt = self.db.execute(
                "SELECT fingerprint, response FROM receipts WHERE tenant=? AND request_key=?",
                (tenant, key),
            ).fetchone()
            if receipt:
                if receipt[0] != fingerprint:
                    raise Conflict("key reused with different input")
                response = json.loads(receipt[1])
            else:
                row = self.db.execute(
                    "INSERT INTO effects(tenant, request_key, units) VALUES (?, ?, ?)",
                    (tenant, key, request["units"]),
                )
                crash_if(fault, "after_effect_before_receipt")
                response = {"effect_id": row.lastrowid, **request}
                self.db.execute(
                    "INSERT INTO receipts VALUES (?, ?, ?, ?)",
                    (tenant, key, fingerprint, canonical(response)),
                )
            self.db.execute("COMMIT")
        except Exception:
            if self.db.in_transaction:
                self.db.execute("ROLLBACK")
            raise
        crash_if(fault, "after_commit_before_reply")
        return response

    def close(self):
        self.db.close()
