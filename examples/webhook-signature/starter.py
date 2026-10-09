"""Intentionally flawed verifier for the toy fixture, never a production SDK."""
import hashlib
import hmac
import json


def verify(body, header, key, now):
    try:
        fields = dict(piece.split("=", 1) for piece in header.split(","))
        normalized = json.dumps(json.loads(body), sort_keys=True, separators=(",", ":")).encode()
        expected = hmac.new(key, fields["t"].encode("ascii") + b"." + normalized,
                            hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, fields["v1"])
    except (ValueError, KeyError, UnicodeError):
        return False
