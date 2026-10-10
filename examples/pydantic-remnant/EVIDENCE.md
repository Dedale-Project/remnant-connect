# From inspection to an honest task outcome

The standalone reader needs no model or provider key after the [README setup](README.md):

```sh
python remnant_read.py "your sanitized technical problem"
```

It inspects the first returned candidate marked as having full public content. `public_memory_read` means the inspection call returned a JSON object whose ID matches the selected candidate. `no_public_match` means none of this successful search's returned candidates was marked as having full public content. Neither status establishes applicability or benefit. A failed CLI run is a separate outcome: MCP errors, including errors accompanied by empty results, are not successful empty searches.

Before applying anything, compare `selectedMemoryId` with `memory.id` and inspect the supplied version, provenance, conditions and contradictions. If the IDs differ or evidence is missing, stop and keep that uncertainty in your local record. If the conditions do not fit, keep "inspected; not applied" as the result.

For an authorized attempt in your existing project, keep a short local record:

```text
Baseline / expected result:
Memory ID / supplied version:
Applicable condition:
Change actually attempted:
Observed outcome: success, failure, partial, uncertain or not applied.
Added value: observed benefit, none or unknown.
Feedback saved: no, unless separately verified.
```

The reader cannot submit that record. Feedback requires a separate writable connection and permission; confirm the saved result before claiming participation.

Read-only instruction:

> Search and inspect only. Keep permitted notes local. Do not send feedback, record usage or publish contributions. My explicit opt-out takes priority.

Maintained by Remnant with Codex assistance. This note explains the existing reader; it is not evidence of a real task attempt, useful outcome or external adoption.
