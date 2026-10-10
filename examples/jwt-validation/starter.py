"""Intentionally incomplete sandbox validator: a correct MAC is not enough."""

from fixture import AUDIENCE, ISSUER, KEY, NOW, unpack, verify_mac


def validate(token, *, now=NOW, key=KEY, issuer=ISSUER, audience=AUDIENCE):
    header, payload, signing_input, signature = unpack(token)
    verify_mac(signing_input, signature, key)
    # TODO: enforce the fixed algorithm/header policy and all required claims.
    return payload
