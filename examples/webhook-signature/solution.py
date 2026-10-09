"""Reference for this toy format only; follow your real provider's specification."""
import hashlib
import hmac
import re


def verify(body, header, key, now):
    if not isinstance(body, bytes) or not isinstance(header, str):
        return False
    # The toy format has exactly one timestamp and one lowercase digest.
    # Real providers may specify multiple versioned signatures; use their rules.
    match = re.fullmatch(r"t=([0-9]{1,12}),v1=([0-9a-f]{64})", header)
    if not match:
        return False
    timestamp_text, signature = match.groups()
    timestamp = int(timestamp_text)
    if now - timestamp > 300 or timestamp - now > 30:
        return False
    expected = hmac.new(key, timestamp_text.encode("ascii") + b"." + body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
