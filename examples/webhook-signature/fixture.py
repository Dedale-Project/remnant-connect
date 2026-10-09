"""Toy protocol, synthetic public key and fixed clock. No network or service."""
import hashlib
import hmac

KEY = b"PUBLIC-SANDBOX-FIXTURE-KEY-NOT-A-SECRET"
NOW = 2_000_000_000


def sign(body, timestamp=NOW):
    payload = str(timestamp).encode("ascii") + b"." + body
    signature = hmac.new(KEY, payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={signature}"
