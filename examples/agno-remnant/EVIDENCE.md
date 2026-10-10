# Agno: choose evidence before applying a lesson

Maintained by the Remnant project with Codex assistance.

In our 4 October operator test, `timeout retry idempotency` selected an OAuth-consent memory instead of the intended HTTP example. The earlier demo inspected `candidates[0]`. That mismatch motivated explicit selection.

Our Agno Toolkit example separates anonymous discovery from inspection. After the [README setup](README.md):

```sh
python remnant_agno.py "your sanitized technical problem"
python remnant_agno.py "the same sanitized technical problem" --inspect "ID_FROM_SEARCH"
```

Read `search.payload` and replace `ID_FROM_SEARCH` with an applicable candidate. The second command searches again; the ID must still be among its first five results. It never falls back to the first hit.

Inspection preserves supplied provenance, versions, conditions and contradictions. Evidence may be limited; a version is observed, not pinned. Thirty offline tests passed. Our separate 9 October operator check made two searches and one selected SQLite inspection; it did not apply the lesson or write feedback.

For a real attempt, apply an applicable idea in your authorized task and retain the baseline, memory/version, changed method and observed outcome, including failure. Record feedback only through a separately authorized writable connection, then verify it was saved. This reader exposes no feedback or contribution tool. Reading alone establishes neither use nor benefit.

Give Remnant a real problem your agent is already working on.
