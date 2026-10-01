# Static artifact and recovery contract

Avasan remains a single public teacher homepage served directly by Nginx. There
is no authentication, role change, database, provider, queue, background worker,
tracking endpoint or application Node process to optimize. CS and Math links
are independent sites; this release neither inspects nor modifies them.

## Artifact and identity

`deploy/static-artifact.json` independently declares required public files and
the two source Nginx snippets. Its versioned `deployment` section specifies the
static artifact format, Linux ARM64 build platform, minimum host capabilities,
dual-stack release-identity readiness, absence of migrations, and retained
artifact rollback requirement. Host-specific ports, credentials, ownership,
certificates, and listener policy remain server-controlled. The manifest records
every public file hash/size, full source commit, version, clean annotated-tag
provenance, and snippet hashes.
The public `/release.json` retains exactly `revision` and `version`. Its writer
rejects unrelated commit overrides. Internal provenance stays outside the public
root in `.avasan-static-release.json`; `.avasan-static-artifact.json` is likewise
not served. Do not add credentials, private configuration, writable state or
source/dependency directories to the archive.

On Linux ARM64 with Node24.18.1/npm12.0.2, after clean locked source validation
and an annotated version tag at HEAD:

```bash
mkdir -p .ai-work/runs/release-output
bash scripts/package-static-release.sh .ai-work/runs/release-output
```

The preferred release producer is the tagged Linux ARM64 workflow in
`.github/workflows/release-source.yml`. It requires the annotated version tag
at the exact `origin/main` commit, repeats source audits and tests, then
packages and accepts the exact archive in isolation. A separate permissioned
job compares the downloaded archive and policy snippets with the exact tagged
source, then attests all four source-release assets with GitHub Actions
provenance for that workflow. Publish the archive,
SHA256SUMS, static-artifact.json, acceptance.json, and attestation bundle only
after checking their exact CI bytes. A successful tagged build is source-release
evidence, not proof of production activation or approval to bypass the host
promotion boundary.

The output directory must be empty and locally ignored. The package contains
only the public tree, two snippets and two sidecars. The checked-in verifier
rejects missing independently required paths, missing HTML-referenced assets,
tampering, symlinks, hidden public files and extra runtime root entries. Archive
extraction rejects non-files and non-directories. The packager verifies original,
unpacked and copier-produced trees against the trusted manifest, and proves a
missing favicon cannot be accepted. Use the separately downloaded and verified
release manifest after any production copier, not a manifest regenerated from
whatever the copier happened to retain:

```bash
node scripts/static-artifact.mjs runtime /path/to/unpacked /path/to/trusted-static-artifact.json FULL_COMMIT
```

The receipt binds archive bytes, source identity, deployment contract, and exact
harness hashes. It explicitly records source-artifact acceptance, not host
capability verification or production deployment. The host must independently
verify the archive and sidecar attestations for
the exact canonical repository, annotated tag, commit, and pinned release
workflow. The trusted, root-owned host adapter then compares its supported
capabilities to the artifact's requirements before any production mutation.
Neither the candidate's own Git refs nor its self-generated manifest is an
independent trust anchor. The archive is a verified static artifact, not
permission to replace the host topology.

## Host capability handshake

The `deployment.requiredHostCapabilities` names in the attested manifest are
minimum requirements, not self-reported claims by the build account:

| Capability | Required host behavior |
| --- | --- |
| `github-actions-attestation-v1` | Independently verify the archive subject against `anderson-webops/avasan.org`, the exact commit and annotated `v<version>` ref, and `.github/workflows/release-source.yml`; reject self-hosted provenance. |
| `protected-immutable-staging-v1` | Safely unpack only regular files and directories into a root-owned tree whose files and ancestors cannot be replaced by the builder; recheck the trusted manifest after copying. |
| `trusted-nginx-policy-assets-v1` | Install the two snippets only from that verified, sealed tree using root-owned helpers, never scripts or self-generated hashes supplied by a candidate checkout. |
| `dual-stack-release-identity-v1` | Confirm the exact `/release.json` bytes, homepage status and policy headers, and true branded 404 over loopback IPv4 and IPv6. |
| `retained-artifact-rollback-v1` | Validate and keep the old artifact plus its exact Nginx policy, record the mutation boundary, and restore those retained bytes with the old release's own readiness checks after a failed activation. |

An adapter must compare its installed capability set and supported contract
version before unpacking or changing production. If either is missing, report
`host update required` and leave the serving release untouched. Do not infer
support from the candidate's receipt or from a successful source build.

## Isolated acceptance

The unpacked-artifact harness runs actual Nginx inside an unprivileged Bubblewrap
namespace with a read-only artifact, no source checkout/development dependencies,
no network other than its own loopback and no real providers. It checks IPv4 and
IPv6, links, CSP, cookie absence, fresh release identity, HEAD, immutable assets,
strict branded404s including fake health APIs, unsupported methods and graceful
Nginx shutdown. It repeats against the copied artifact. This tests the standalone
HTTP reference; production TLS, HTTP2/3, certificates and redirects remain operator
acceptance responsibilities. Static sites do not acquire artificial health APIs.

The separate `test-promotion-recovery.sh` runs the actual promotion script inside
a disposable UID0 user namespace. Synthetic Git/tag identities, paths and command
stubs exercise successful activation, rejected health, partial snippet installation,
termination, Nginx validation failure, failed rollback, a contended lock, an invalid
current pointer and artifact tampering. It checks previous snippet bytes, ownership
and modes, previous pointer restoration and protected backup retention. It makes
no requests to production and runs no real systemd or host Nginx commands. The
fixture identity is not published-release provenance.

## Promotion, persistent state and recovery

The reviewed operator contract remains `/srv/avasan.org/releases`, its existing
`current` symlink, and the two `/etc/nginx/snippets/avasan.org-*.conf` files. Retain
the existing outer TLS/IPv4/IPv6/HTTP2/HTTP3 configuration. Select the approved
existing runtime with `NODE_BIN_DIR`; do not change the host-wide Node installation.
Source preparation is unprivileged and requires the canonical origin, fetched main,
clean checkout and exact annotated tag. Keep private environment files outside it.

The checked-in legacy promoter remains for compatibility and recovery tests,
not as production authorization. It can execute candidate scripts as root, trust candidate-owned
Nginx configuration, and point `current` at a builder-writable tree. The host
must install a separately reviewed root-owned promoter and verifier, validate
the attested archive, seal a real root-owned artifact tree with no builder-write
path, and independently verify the staged tree and policy bytes before
activation. A protected, immutable prior artifact and its exact Nginx policy
must be ready for version-aware rollback. Until that host adapter exists and
passes acceptance, the source release remains blocked from production.

The adapter should classify temporary registry/network trouble for bounded
retry, missing host capabilities as `host update required`, invalid identity,
audit, migration, or artifact checks as `release rejected`, and a failed
post-mutation probe as `rolled back` only after the old artifact actually passes
readiness. Waiting for CI and a scheduled retry must not be reported as a
successful deployment. Persistent authentication failures require investigation,
not unbounded retries.
The legacy helper's handled unsuccessful exits and HUP/INT/TERM restore the prior state. Failed rollback
returns failure and preserves protected backups with their path reported for the
operator; do not delete that directory until recovery has been verified.

No durable application writable paths or migrations exist. Nginx operational logs
and the temporary root recovery area remain outside immutable releases. Never
synchronize a writable state directory into a new release.

The snippet pair and pointer are individually atomic, not one filesystem transaction.
SIGKILL, power loss, host storage failure and concurrent manual configuration edits
cannot be repaired by a shell EXIT trap. Preserve the prior release and protected
backups; an operator must compare the trusted release/snippet identities, restore
consistent reviewed files and pointer, run Nginx validation, reload and repeat both
address-family checks. The promotion lock coordinates this helper only. These
limits are not grounds for changing DNS, moving an existing service or weakening
the exact-source guard.
