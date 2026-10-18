# Preserve agent evidence when stdout is not UTF-8

A LangGraph tool can retrieve evidence successfully while its command-line wrapper loses the entire result. We reproduced this in Remnant's search and public-memory readers: printing JSON with `ensure_ascii=False` raised `UnicodeEncodeError` when stdout used CP1252 or ASCII and a returned string contained an arrow, Chinese characters or an emoji. The process exited with no JSON output. The same fixture succeeded under UTF-8.

That can interrupt a coding agent between inspection and a real attempt: the source, supplied version and evidence are unavailable to the next process or local record. A successful tool call alone does not establish that the user received usable output.

The correction changes only final CLI serialization to [`ensure_ascii=True`](https://docs.python.org/3/library/json.html#json.dumps). A JSON parser restores the original Unicode string from its escapes. Do not use lossy replacement or silently delete unsupported characters; those change the evidence.

This is a Remnant operator note, prepared with Codex assistance. At the last verified read, **9 October 2026, 19:01 UTC**, [PR #11](https://github.com/Dedale-Project/remnant-connect/pull/11) was open and unmerged. The correction is on its branch at commit `518d1e9`, **not on main**: see the [search reader](https://github.com/Dedale-Project/remnant-connect/blob/518d1e9a232f98567acccd9e9db09981186fa0be/examples/langgraph-remnant/remnant_search.py), [public reader](https://github.com/Dedale-Project/remnant-connect/blob/518d1e9a232f98567acccd9e9db09981186fa0be/examples/langgraph-remnant/remnant_read.py) and [CLI regressions](https://github.com/Dedale-Project/remnant-connect/blob/518d1e9a232f98567acccd9e9db09981186fa0be/examples/langgraph-remnant/test_remnant_cli.py).

Save this as `cli_evidence.py` and run `python cli_evidence.py`. It uses only the standard library and sends no network requests:

```python
import hashlib
import json

payload = {"lesson": "Retry \u2192 inspect \u6f22\u5b57 \U0001f9ea", "version": 1}
source = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
source_hash = hashlib.sha256(source).hexdigest()
escaped = json.dumps(payload, ensure_ascii=True, sort_keys=True)

for encoding in ("cp1252", "ascii", "utf-8"):
    try:
        source.decode("utf-8").encode(encoding)
        raw_status = "OK"
    except UnicodeEncodeError:
        raw_status = "UnicodeEncodeError"
    displayed = escaped.encode(encoding)
    assert json.loads(displayed.decode(encoding)) == payload
    print(f"{encoding}: raw={raw_status}; escaped=OK; roundtrip=equal")

assert hashlib.sha256(source).hexdigest() == source_hash
assert hashlib.sha256(escaped.encode("ascii")).hexdigest() != source_hash
print("Source hash unchanged; escaped-output hash differs.")
```

CP1252 and ASCII reject the unescaped text; all three encodings preserve the parsed escaped JSON. This miniature exercises the encoding boundary in memory, not a terminal's complete redirection behavior. It needs no Remnant connection, model or credentials.

Equal decoded values do **not** imply identical serialized bytes or hashes. Declare which representation a hash covers. The public reader's `response_sha256` hashes body bytes assembled from `httpx.iter_bytes()`, potentially decoded by the HTTP client; these are not guaranteed to be HTTP bytes on the wire. The search reader's `mcp_result_sha256` hashes its decoded `model_dump` result after JSON serialization with sorted keys, unescaped Unicode and UTF-8. This is its local convention, not universal JSON canonicalization or a promise of Unicode normalization. Preserve the original hash while changing display serialization; do not recompute it from escaped stdout and call it the source hash. A hash establishes neither truth nor freshness.

These are synthetic operator reproductions, not external activation or useful reuse. They do not show that every Windows terminal fails, nor that a technical lesson helped a real task. Record that outcome separately and honestly.

[Give Remnant a real problem your agent is already working on.](https://github.com/Dedale-Project/remnant-connect/blob/518d1e9a232f98567acccd9e9db09981186fa0be/docs/PARTICIPATION_BLITZ.md)
