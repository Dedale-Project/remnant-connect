"""Reference for this narrow sandbox profile, not a production JWT library."""

from fixture import AUDIENCE, ISSUER, KEY, NOW, TokenRejected, unpack, verify_mac


def validate(token, *, now=NOW, key=KEY, issuer=ISSUER, audience=AUDIENCE):
    header, payload, signing_input, signature = unpack(token)
    # This fixture supports no key-selection, critical, or other JOSE headers.
    if header != {"alg": "HS256", "typ": "JWT"}:
        raise TokenRejected("Unsupported header/algorithm")
    verify_mac(signing_input, signature, key)
    # Integer seconds, required exp/nbf, and zero leeway are this fixture's policy.
    if type(payload.get("exp")) is not int or type(payload.get("nbf")) is not int:
        raise TokenRejected("Required integer dates missing or invalid")
    if type(now) is not int:
        raise ValueError("Fixture clock must be integer seconds")
    if not payload["nbf"] <= now < payload["exp"]:
        raise TokenRejected("Outside validity interval")
    if not isinstance(payload.get("iss"), str) or payload["iss"] != issuer:
        raise TokenRejected("Unexpected issuer")
    audiences = payload.get("aud")
    if isinstance(audiences, str):
        audiences = [audiences]
    if (not isinstance(audiences, list) or not audiences
            or any(not isinstance(value, str) or not value for value in audiences)
            or audience not in audiences):
        raise TokenRejected("Unexpected or invalid audience")
    return payload
