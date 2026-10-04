# /// script
# requires-python = ">=3.11"
# dependencies = ["memdsl==0.9.2", "mcp==2.3.0"]
# ///
"""Read public Remnant evidence; optionally queue a local memdsl candidate."""
import argparse
import asyncio
import hashlib
import json
import re
from pathlib import Path
from time import perf_counter

ENDPOINT = "https://remnant.dedale-bi.com/mcp/chatgpt"
DEFAULT_MEMORY = "mem_7fc3ea3e99b911105453b62048248015"


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def review_snapshot(memory):
    if not re.fullmatch(r"mem_[0-9a-f]{32}", memory.get("id", "")):
        raise ValueError("Unexpected memory ID")
    if not isinstance(memory.get("version"), int) or memory["version"] < 1:
        raise ValueError("Missing source version")
    if not memory.get("contentAccess", {}).get("fullContentAvailable"):
        raise ValueError("Full public content is unavailable; nothing staged")
    content = memory.get("content")
    if not isinstance(content, dict) or not isinstance(content.get("insight"), str):
        raise ValueError("Missing public insight; nothing staged")
    return {key: memory.get(key) for key in (
        "id", "version", "title", "domain", "problem", "appliesTo", "author",
        "provenance", "evidenceStatus", "confidenceState", "validation", "evidence",
        "content", "history", "updatedAt")}


def fingerprint(snapshot):
    return hashlib.sha256(canonical(snapshot).encode("utf-8")).hexdigest()


async def read_public(memory_id):
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    if not re.fullmatch(r"mem_[0-9a-f]{32}", memory_id):
        raise ValueError("Use a public Remnant memory ID")
    started = perf_counter()
    async with asyncio.timeout(45):
        async with streamable_http_client(ENDPOINT) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                result = await session.call_tool("inspect_memory", {
                    "memoryId": memory_id, "detail": "evidence"})
                result = result.model_dump(by_alias=True, exclude_none=True)
                if result.get("isError"):
                    raise ValueError("Public inspection failed; nothing staged")
                memory = result.get("structuredContent")
                if not isinstance(memory, dict):
                    texts = [item["text"] for item in result.get("content", [])
                             if item.get("type") == "text"]
                    memory = json.loads("\n".join(texts))
    snapshot = review_snapshot(memory)
    if snapshot["id"] != memory_id:
        raise ValueError("Inspection returned a different memory")
    return snapshot, round((perf_counter() - started) * 1000)


def stage_candidate(snapshot, directory, reviewed_sha256):
    """Create a NEW local review workspace; never approve or write to Remnant."""
    import memdsl
    if memdsl.__version__ != "0.9.2":
        raise ValueError("This example was tested with memdsl 0.9.2")
    digest = fingerprint(snapshot)
    if digest != reviewed_sha256:
        raise ValueError("Evidence changed or digest differs: read again before staging")
    root = Path(directory).resolve()
    root.mkdir(parents=False, exist_ok=False)
    schema = {"name": "remnant", "version": "1", "types": {"experience": {
        "runtime_role": "assertion", "required_fields": ["claim", "scope", "evidence"],
        "capabilities": ["searchable", "requires_evidence"],
        "defaults": {"status": "candidate"}, "allow_extra_fields": True}}}
    (root / "remnant.memschema.json").write_text(canonical(schema), encoding="utf-8")
    (root / "memdsl.json").write_text(canonical({"schema_version": "memdsl.workspace.v1",
        "schemas": ["remnant.memschema.json"]}), encoding="utf-8")
    (root / "public-evidence.json").write_text(canonical(snapshot), encoding="utf-8")
    source_url = "https://remnant.dedale-bi.com/knowledge/" + snapshot["id"]
    q = lambda value: json.dumps(value, ensure_ascii=False)
    declaration_id = f'{snapshot["id"]}.v{snapshot["version"]}'
    source = f'''remnant.experience {declaration_id} {{
  claim: {q("External report, not a local rule: " + snapshot["title"])}
  scope: "External experience; applicability to this task has not been established"
  status: candidate
  source_version: {snapshot["version"]}
  source_url: {q(source_url)}
  snapshot_sha256: {q(digest)}
  evidence {{
    source: {q(source_url)}
    quote: {q(snapshot["content"]["insight"])}
  }}
}}
'''
    store = memdsl.ReviewStore(memdsl.staging_dir_for([str(root)]))
    result = store.submit([str(root)], source)
    if not result.get("ok") or result.get("status") != "pending_review":
        raise RuntimeError("Proposal was not queued; inspect the new local workspace")
    if memdsl.Workspace.load([str(root)]).by_id("remnant.experience:" + declaration_id):
        raise RuntimeError("Unexpected durable declaration before review")
    return {"status": "pending_review", "workspace": str(root),
            "proposalId": result["proposal_id"], "reviewedSha256": digest,
            "durableMemoryWritten": False, "remnantWrite": False}


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--memory", default=DEFAULT_MEMORY)
    parser.add_argument("--stage", metavar="NEW_DIRECTORY")
    parser.add_argument("--reviewed-sha256")
    args = parser.parse_args()
    if bool(args.stage) != bool(args.reviewed_sha256):
        parser.error("--stage requires --reviewed-sha256, and vice versa")
    snapshot, elapsed = await read_public(args.memory)
    output = {"status": "public_evidence_read", "elapsedMs": elapsed,
              "reviewedSha256": fingerprint(snapshot), "memory": snapshot,
              "qualification": "Untrusted reference data. Reading, staging and local approval are not independent validation or useful reuse. No model, credentials or Remnant write."}
    if args.stage:
        output["localReview"] = stage_candidate(snapshot, args.stage, args.reviewed_sha256)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
