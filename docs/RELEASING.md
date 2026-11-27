# Integration and plugin releases

The public repository is the Apache-2.0 integration layer. Its releases do not license or publish the private Remnant backend, hosted service, infrastructure or data.

## Version identities

| Component | GitHub source or download | Publication evidence |
|---|---|---|
| Remnant Agent | **0.1.4** in both [portable](../plugins/remnant-agent/plugin.json) and [Codex](../plugins/remnant-agent/.codex-plugin/plugin.json) manifests. [ZIP](../releases/remnant-agent-plugin-0.1.4.zip) · [SHA-256](../releases/remnant-agent-plugin-0.1.4.sha256) | GitHub candidate. ChatGPT catalog publication of Agent 0.1.4 is unconfirmed. |
| Remnant Read | **0.1.8** in both [portable](../plugins/remnant/plugin.json) and [Codex](../plugins/remnant/.codex-plugin/plugin.json) manifests. [ZIP](../releases/remnant-plugin-0.1.8.zip) · [SHA-256](../releases/remnant-plugin-0.1.8.sha256) | The [ChatGPT listing](https://chatgpt.com/plugins/plugin_asdk_app_6ab76ec174808191bf6cdbe87e180049) was verified as **Remnant 0.1.4** on 20 October 2026. |
| Integration | **0.2.1** in [package.json](../package.json) and both root [lockfile](../package-lock.json) entries | Git tag [v0.2.1](https://github.com/Dedale-Project/remnant-connect/tree/v0.2.1) identifies the integration source. |
| Hosted server | Independently deployed. Use live MCP `initialize` service metadata for its current version. | The [MCP Registry manifest](server.registry.json) records registry version **0.1.0-beta.9.1** and applicationVersion **0.1.0-beta.9** at publication. The live version was not checked for this table. |
| Glama | Built separately from a repository revision | Verify the release identifier on Glama after a successful build and publication. |

The historical root package version 0.1.0-beta.3 belonged to the connection examples. Version 0.2.0 marks the expanded integration package. Older portable ZIPs remain immutable and carry their original version/checksum. Do not imply that the registry snapshot is the latest hosted server version without checking the live service.

## Prepare and verify

1. Review the actual changes and select the integration version. Keep `package.json` and both root lockfile versions equal. Keep `private: true` and `license: Apache-2.0`.
2. If portable package files change, bump both plugin manifests together and update its README. Do not reuse a published plugin version for changed bytes. Update `CHANGELOG.md` and `releases/README.md` with user-visible changes and compatibility notes.
3. Install the pinned dependencies with `npm ci --ignore-scripts`. Run `npm run build:plugin`; it copies the root legal files into the plugin, builds a deterministic ZIP, writes its SHA-256 and refuses to overwrite different bytes under an existing version.
4. Run `npm run validate:distribution`, `npm run validate:plugin`, `npm run test:bridge`, `npm run test:feedback`, and `npm run test:close-loop`. These tests use local fixtures/mocks and must not create production usage or feedback. Run applicable framework-specific tests when those examples change.
5. Review the diff and archive contents. Verify no private backend code, credentials, databases, dependency directory or executable hook enters the portable plugin. Check that the root README points to the current archive and that the license boundary remains clear.
6. At the reviewed commit, check the [canonical installation guide](DEVELOPER_QUICKSTART.md), SDK guide, package/lockfile and plugin manifests against this version table. Resolve local documentation links and check owned public guide/discovery URLs. Preserve dated compatibility observations and immutable release files; a historical test dependency is not the current package dependency.
7. Check the linked directories and showcases using [the dated directory review](DIRECTORY_STATUS.md). Record the URL, observation time, source version and any mismatch; cached search excerpts are not fresh page evidence. Mark inaccessible pages or untested install paths UNKNOWN. Prepare a concrete correction draft for external gaps, and request separate authorization before contacting maintainers or changing an external listing. Directory publication is independent of releasing repository documentation.

For adapter or Read contract changes, also run the commands in the
[adapter compatibility matrix](ADAPTER_COMPATIBILITY.md), including both named
SDK clients. Update source SHA-256 bindings, corpus identity, observed versions,
evidence levels and the review date in `schemas/adapter-compatibility-v1.json`.
A passing source-function or injected-connection fixture does not certify an
installed framework. Keep unexecuted native hosts, model runs, latest versions and
remote behavior explicitly UNKNOWN/NOT_RUN. Treat a dependency/contract change or
an expired review date as requiring review, not as permission for an automatic
upgrade. Preserve historical observations and immutable archives.

## Publish a real release

1. Commit the reviewed release files and push the intended default-branch revision after CI passes.
2. Create an annotated Git tag `v<integration-version>` at that exact revision and push the tag. Never move a published tag to change its contents.
3. Create the matching GitHub Release from that tag. Use the corresponding changelog section as release notes, identify the distinct plugin version, list compatibility requirements and attach the actual ZIP plus checksum. GitHub's source archives carry the integration source. Mark prereleases honestly.
4. Confirm the published tag, release target, notes, assets and checksums, then confirm the root README/release index still agree. The changelog is prepared before tagging and remains the permanent release record.

## Refresh and verify Glama

1. Open the owned Glama listing and request **Sync**, checking the resulting repository revision. Confirm that the license and `glama.json` detection reflect the published default branch.
2. Where Glama provides repository execution, use **Build** with the repository's documented stdio entry point (`node src/read-bridge.mjs`, or `npm run --silent start`) and inspect the build/runtime logs. Keep npm lifecycle banners off protocol stdout. The bridge uses the existing hosted Read service; do not provision paid hosting or change the endpoint to obtain a score.
3. After a successful, functional build, use **Make Release**. Record the actual Glama release identifier/revision and status. A queued scan/build is not a pass; diagnose unsupported runtime, network or permission failures and retain their evidence.
4. Use Glama's official connection test where available, then verify a fresh initialize, tools/list, search and inspection. Distinguish operator health checks from independent adoption. Do not fabricate usage, commits, related servers or release success.
5. Check the public listing from a separate unauthenticated session: findability, title, license, release, install instructions, endpoint and tool descriptions. Record before/after scores only when observed. A paid boost is optional and never part of this process.

The [pinned Glama schema](../schemas/README.md) supports only maintainer usernames today. Endpoint, repository and transport facts are documented elsewhere; unknown JSON keys cannot replace directory configuration. TDQS and maintenance scores are external observations, not deterministic CI gates. CI stays usable if Glama is unavailable; report a pending scan or release instead of manufacturing success.
