# Integration and plugin releases

The public repository is the Apache-2.0 integration layer. Its releases do not license or publish the private Remnant backend, hosted service, infrastructure or data.

## Version identities

| Artifact | Authoritative version | Meaning |
|---|---|---|
| This integration package | `package.json` and root entries in `package-lock.json` (0.2.0) | Local stdio bridge, examples and repository distribution; Git tag `v0.2.0` |
| Portable/Codex Read plugin | Both `plugins/remnant/plugin.json` and `.codex-plugin/plugin.json` (0.1.8) | Host-installable instructions, assets and remote connection; `remnant-plugin-0.1.8.zip` |
| Hosted Remnant service | Current live `initialize`/service metadata | Separately deployed private service; never bump its version to match this package |
| MCP Registry publication | `docs/server.registry.json` (0.1.0-beta.9.1, with applicationVersion 0.1.0-beta.9) | Existing independently published registry manifest; not the integration or plugin version |
| Glama release | Glama's release generated from a successfully built repository revision | Separate directory/runtime artifact; a GitHub release alone is not a Glama release |

The historical root package version 0.1.0-beta.3 belonged to the connection examples. Version 0.2.0 marks the expanded integration package. Older portable ZIPs remain immutable and carry their original version/checksum. Do not imply that the registry snapshot is the latest hosted server version without checking the live service.

## Prepare and verify

1. Review the actual changes and select the integration version. Keep `package.json` and both root lockfile versions equal. Keep `private: true` and `license: Apache-2.0`.
2. If portable package files change, bump both plugin manifests together and update its README. Do not reuse a published plugin version for changed bytes. Update `CHANGELOG.md` and `releases/README.md` with user-visible changes and compatibility notes.
3. Install the pinned dependencies with `npm ci --ignore-scripts`. Run `npm run build:plugin`; it copies the root legal files into the plugin, builds a deterministic ZIP, writes its SHA-256 and refuses to overwrite different bytes under an existing version.
4. Run `npm run validate:distribution`, `npm run validate:plugin`, `npm run test:bridge`, `npm run test:feedback`, and `npm run test:close-loop`. These tests use local fixtures/mocks and must not create production usage or feedback. Run applicable framework-specific tests when those examples change.
5. Review the diff and archive contents. Verify no private backend code, credentials, databases, dependency directory or executable hook enters the portable plugin. Check that the root README points to the current archive and that the license boundary remains clear.

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
