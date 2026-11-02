"""Explicit, no-model trial of OCR Toolkit's anonymous Remnant federation.

Uses internal toolkit APIs pinned in requirements.txt; not a full OCR review.
Only fixed public inputs leave this process. No environment or repository scan.
"""
import argparse
import asyncio
import copy
import hashlib
import importlib.metadata
import json
import platform
import tempfile
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from pathlib import Path

import mcp_types as types
from ocr_toolkit.federation.contracts import FederationError
from ocr_toolkit.federation.gateway import Gateway
from ocr_toolkit.federation.registry import parse_registry

ROOT = Path(__file__).resolve().parent
MEMORY_ID = "mem_7fc3ea3e99b911105453b62048248015"
SENTINEL = "synthetic-private-marker-ocr-remnant-0230"


def offline():
    raw = (ROOT / "registry.json").read_text(encoding="utf-8")
    parsed = json.loads(raw)
    checks = []
    for profile in ("local", "gitlab_mr"):
        registry = parse_registry(raw, profile)
        assert len(registry.servers) == 1
        assert registry.servers[0].token_from is None
        assert all(t.assurance == "advisory" for t in registry.servers[0].tools)
        checks.append(profile + "_registry_accepted")
    cases = {"legacy_shape": {"remnant": {"url": "https://example.invalid"}}}
    for name in ("unknown_field", "reserved_alias", "userinfo"):
        value = copy.deepcopy(parsed)
        if name == "unknown_field":
            value["servers"]["remnant"]["auto_approve"] = True
        elif name == "reserved_alias":
            value["servers"]["ocr_toolkit_evidence"] = value["servers"].pop("remnant")
        else:
            value["servers"]["remnant"]["transport"]["url"] = "https://synthetic@example.invalid/mcp"
        cases[name] = value
    for name, value in cases.items():
        try:
            parse_registry(json.dumps(value))
        except FederationError as error:
            assert error.code == "registry_invalid"
            checks.append(name + "_rejected")
        else:
            raise AssertionError(name + " unexpectedly accepted")
    return raw, checks


async def live(raw):
    with tempfile.TemporaryDirectory(prefix="remnant-ocr-smoke-") as directory:
        gateway = Gateway(parse_registry(raw), {}, (SENTINEL,), "public-smoke", directory)
        async with AsyncExitStack() as stack:
            try:
                async with asyncio.timeout(90):
                    await gateway.prepare(stack)
                    assert set(gateway.tools) == {"remnant__search_memories", "remnant__inspect_memory"}
                    search = await gateway.call_tool(None, types.CallToolRequestParams(
                        name="remnant__search_memories",
                        arguments={"query": "SQLite WAL", "detail": "compact", "limit": 3, "offset": 0},
                    ))
                    if search.is_error:
                        raise RuntimeError("public_search_not_admitted")
                    inspected = await gateway.call_tool(None, types.CallToolRequestParams(
                        name="remnant__inspect_memory",
                        arguments={"memoryId": MEMORY_ID, "detail": "evidence", "limit": 5, "offset": 0},
                    ))
                    if inspected.is_error:
                        raise RuntimeError("public_inspection_not_admitted")
                    texts = [item.text for item in inspected.content if item.type == "text"]
                    assert len(texts) == 1
                    evidence = json.loads(texts[0])
                    assert evidence["id"] == MEMORY_ID
                    assert evidence["contentAccess"]["fullContentAvailable"] is True
                    assert evidence["content"]["conditions"]
                    # A registered synthetic private marker must fail locally, before dispatch.
                    requests_before = gateway.budget.requests
                    denied = await gateway.call_tool(None, types.CallToolRequestParams(
                        name="remnant__search_memories",
                        arguments={"query": SENTINEL, "detail": "compact", "limit": 3, "offset": 0},
                    ))
                    assert denied.is_error
                    assert gateway.budget.requests == requests_before
                    assert gateway.counts["remnant__search_memories"]["dlp_rejected"] == 1
                    unknown = await gateway.call_tool(None, types.CallToolRequestParams(
                        name="remnant__publish_memory", arguments={},
                    ))
                    assert unknown.is_error
                    assert gateway.budget.requests == requests_before
                    result = {
                        "tools": sorted(gateway.tools),
                        "source_url": evidence["url"],
                        "memory_id": evidence["id"], "memory_version": evidence.get("version"),
                        "response_sha256": hashlib.sha256(texts[0].encode()).hexdigest(),
                        "evidence": evidence,
                        "counts": gateway.counts,
                        "synthetic_dlp_blocked_before_network": True,
                        "unlisted_write_tool_blocked_before_network": True,
                    }
            finally:
                await gateway.stop()
        assert not gateway.budget.cleanup_failed
        result["transport_cleanup_failed"] = gateway.budget.cleanup_failed
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Send two fixed anonymous public reads through the toolkit gateway")
    args = parser.parse_args()
    raw, checks = offline()
    result = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "operator_trial": True, "external_activation": False,
        "python": platform.python_version(), "platform": platform.system(),
        "versions": {name: importlib.metadata.version(name) for name in ("open-code-review-toolkit", "mcp", "httpx2")},
        "offline_checks": checks, "live": None,
        "scope": "Registry parser and in-process gateway only; no OCR binary, model, GitLab publication, receipt or end-to-end review.",
    }
    if args.live:
        result["live"] = asyncio.run(live(raw))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
