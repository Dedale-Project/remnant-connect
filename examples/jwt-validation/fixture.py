"""Public, synthetic, local JWT fixture helpers. Never use this key for trust."""

import base64
import hashlib
import hmac
import json
import math
import re

NOW = 1_700_000_000
KEY = b"PUBLIC-SANDBOX-KEY-NOT-A-SECRET-00000000"
ISSUER = "urn:jwt-sandbox:issuer"
AUDIENCE = "urn:jwt-sandbox:application"
MAX_TOKEN_BYTES = 8192


class TokenRejected(ValueError):
    pass


def encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def decode(segment):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", segment):
        raise TokenRejected("Invalid base64url")
    try:
        data = base64.b64decode(segment + "=" * (-len(segment) % 4), altchars=b"-_", validate=True)
    except ValueError as exc:
        raise TokenRejected("Invalid base64url") from exc
    if encode(data) != segment:
        raise TokenRejected("Noncanonical base64url")
    return data


def _unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise TokenRejected("Duplicate JSON member")
        result[name] = value
    return result


def _reject_constant(value):
    raise TokenRejected("Nonfinite JSON number")


def _finite_float(value):
    parsed = float(value)
    if not math.isfinite(parsed):
        raise TokenRejected("Nonfinite JSON number")
    return parsed


def _object(segment):
    try:
        value = json.loads(decode(segment).decode("utf-8"), object_pairs_hook=_unique_object,
                           parse_constant=_reject_constant, parse_float=_finite_float)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise TokenRejected("Invalid JSON object") from exc
    if not isinstance(value, dict):
        raise TokenRejected("Expected JSON object")
    return value


def unpack(token):
    if not isinstance(token, str) or not token.isascii() or len(token) > MAX_TOKEN_BYTES:
        raise TokenRejected("Token outside fixture size/encoding limits")
    parts = token.split(".")
    if len(parts) != 3:
        raise TokenRejected("Expected three compact segments")
    header, claims = _object(parts[0]), _object(parts[1])
    return header, claims, (parts[0] + "." + parts[1]).encode("ascii"), parts[2]


def verify_mac(signing_input, signature, key):
    actual = decode(signature)
    expected = hmac.new(key, signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(actual, expected):
        raise TokenRejected("Signature mismatch")


def claims(**changes):
    return {"iss": ISSUER, "aud": AUDIENCE, "exp": NOW + 60, "nbf": NOW - 60,
            "sub": "synthetic-subject", **changes}


def mint(payload=None, header=None, *, raw_payload=None, key=KEY):
    """Generate synthetic fixtures only; this is not a token issuance service."""
    header = {"alg": "HS256", "typ": "JWT"} if header is None else header
    payload = claims() if payload is None else payload
    encoded_header = encode(json.dumps(header, separators=(",", ":")).encode())
    payload_bytes = raw_payload if raw_payload is not None else json.dumps(payload, separators=(",", ":")).encode()
    signing_input = (encoded_header + "." + encode(payload_bytes)).encode("ascii")
    return signing_input.decode() + "." + encode(hmac.new(key, signing_input, hashlib.sha256).digest())
