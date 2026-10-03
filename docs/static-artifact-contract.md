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

The v1.2.15 tag at `be197035b156346d9871442b354e321359657be3` and v1.2.16
tag at `0cf9fbbde3f38d12b39ffcbd4e038e622bb7080b` failed Linux release
gates and have no approved artifact bundles. Neither is deployable; neither
tag may be moved or reused. The next candidate must pass under its own
immutable tag.

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

The separate `test-attested-promotion.sh` runs the installed promoter inside a
disposable UID0 user namespace. It checks the exact original v1.2.12 CI archive
and both pinned manifest profiles before capture. The host-build fixture
reconstructs the actual serving public inventory from that archive and the five
public-file differences recorded in `test/fixtures/legacy-v1212/host-build/`;
the reconstructed manifest matches the independently reported protected host
copy byte-for-byte by SHA-256 and length. Each profile separately exercises
successful activation, rejected health, rollback, mutable-source and mutable-base
rejection, protected-input rejection, nested rollback-target rejection, and
failed rollback acceptance. It checks the prior pointer, exact policy bytes,
dual-stack probes, and retained recovery evidence. It makes no requests to
production and runs no real systemd or host Nginx commands. The fixture
attestation is a stub, not published-release provenance; the tagged workflow
independently attests the exact archive bytes.
The CI fixture uses a disposable root-owned `/tmp` mirror only for Bubblewrap
bind inputs because the hosted runner's home directory is not traversable from
the isolated namespace; repository scratch remains under `.ai-work/` and both
copies are removed after the test.

## Promotion, persistent state and recovery

The checked-in checkout-based preparation and promotion scripts now fail closed.
The new promoter requires a separately installed, root-owned copy of
`deploy/direct/promote-attested-release.sh`,
`deploy/direct/verified-static-artifact.py`,
`deploy/direct/verify-nginx-snippet-dump.sh`, the reviewed contract, and both
reviewed Nginx policy files under `/usr/local/libexec/avasan.org`. The host must
also provide `/usr/bin/gh`, protected `/srv/avasan.org/artifact-incoming` (0700),
`artifact-releases` (0755), and `.deployment-recovery` (0700). The privileged
host adapter must invoke the installed promoter with a clean environment and
must not delegate that root command directly to an untrusted build account.
The caller stages
the exact CI archive and attestation bundle as root-owned regular files beneath
`artifact-incoming`; the installed promoter verifies the Actions attestation,
source commit, tag, archive digest, contract, static hashes, and policy bytes
before installing a sealed tree. No script from the candidate is executed.

The one-time host transition must first seal the serving release as a direct
protected child of `artifact-releases`, with its own verified manifest and exact
active Nginx snippets. The promoter rejects a mutable or nested rollback target.
Only the original v1.2.12 release at
`d696406b0531224f5ec734f61334890b8c5ba7c5` may use the legacy-retained
path. The CI-built `static-artifact.json` GitHub release asset has SHA-256
`9c46331f51490878a607293a021ce40123f4df6b8b335d1c91be6b93e6bc22af`.
The separately built, actual serving manifest is 5,072 bytes with SHA-256
`61405f4b02757629d1cebd84054ecaee15b966779e32a2b9749d4057c6d0538d`.
The CI archive has SHA-256
`d2ceb57706c1b5f163a723353a2f8af594a754a0ef2b7c2114b435a4b0c502f9`.
The retained verifier accepts only those two exact original manifest digests,
the historical contract and provenance, and the exact commit and version. Each
capture name includes the approved manifest digest to keep the profiles
distinct. It still checks every inventoried public file, original sidecar,
identity, file type and sealed mode, and both Nginx policy hashes. Candidate
verification continues to require the current deployment contract and exact
installed policy.

For the reviewed one-time capture of this host, the operator must use the
protected actual serving manifest, not the CI-built asset. The reviewed
read-only server copy is
`/opt/server-tools/deploy-repair-20261002/avasan-live-v1.2.12-manifest.json`;
independently verify its exact 5,072 bytes and host-build SHA-256 above before
staging it root-owned at
`/srv/avasan.org/artifact-incoming/v1.2.12-static-artifact.json`. The installed,
root-owned `verified-static-artifact.py` exposes
`capture-retained-v1.2.12 d696406b0531224f5ec734f61334890b8c5ba7c5`.
It accepts only the exact `current` target
`/srv/avasan.org/releases/v1.2.12`, with a protected `releases` parent. It
reads that target through no-follow file descriptors,
compares its original manifest byte-for-byte with that independently trusted
asset, rejects unlisted public files, checks every listed public file and the
original provenance bytes, and requires
the exact active snippet bytes to match the old manifest. It copies only those
listed files and sidecars to a protected temporary directory, seals files and
directories, verifies the entire sealed tree against the original inventory,
and moves it into a direct child of `artifact-releases`. It does not regenerate
the manifest, add `deployment` metadata, change `current`, reload Nginx, or
modify the original serving tree. Any mismatch must stop the transition.
The host must hold its deployment lock and quiesce the old serving tree during
capture; the helper rechecks its directory identity, public inventory, file
bytes, provenance, and active policies before sealing.
Before capture, the operator must pause Avasan's old checkout builder and
automatic promotion while leaving Nginx serving, then hold the deployment lock
through capture and pointer transition. Record the current pointer, file modes,
ownership, setgid bits, and complete access/default ACLs in a root-only backup
for `/srv/avasan.org`, its `releases` and exact `v1.2.12` path, every traversed
public and policy directory, the manifest-listed files, and the active Nginx
snippets. The existing group-writable/setgid/ACL layout is not safe to capture
as-is. Under that backup and lock, revoke non-root write access on only the
reviewed path chain and listed inputs, including ACL grants, and make the base,
`releases` parent, staging and artifact roots root-owned and non-writable by
other users. Keep the existing Nginx read/traverse access intact. Verify the
protected path and exact original manifest, provenance, public inventory, and
active policy before invoking the helper; stop and restore the recorded metadata
if any preflight fails. Do not broadly chmod unrelated `/srv` trees or copy an
unreviewed candidate manifest into the protected staging area.
The host adapter must separately preserve its original pointer and policy,
verify the installed helper and active `nginx -T` snippet inclusion, then switch
`current` to the sealed copy under its deployment lock with restoration on
failure. Recheck `/release.json`, the branded 404, headers, and both address
families before allowing a candidate promotion. Do not treat the source
fixture or a self-calculated digest of a mutable checkout as approval.
Retain the mode/ACL backup and old checkout until rollback acceptance completes;
never restore write permissions to the captured artifact or its parent. Restore
legacy checkout metadata only after it is no longer the active or rollback
target and the operator has reviewed the effect on Nginx and deploy tooling.

The historical v1.2.12 `server-policy.conf` in that original release has
`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, and
`X-Content-Type-Options: nosniff` as `always` headers. The rollback probe
uses that exact legacy policy profile rather than applying an unverified
new-release policy assumption. The isolated fault-injection fixture uses the
genuine v1.2.12 contract and policy bytes from the annotated tag plus the
independently checked original archive and manifest, captures the latter,
promotes a synthetic current-format artifact, forces acceptance failure,
and verifies both address-family probes plus the exact retained pointer,
manifest, branded 404 and snippet bytes.

Retain the surrounding TLS/IPv4/IPv6/HTTP2/HTTP3 configuration and existing
public routing. Do not change the host-wide Node installation, private
configuration, DNS, or certificates. Until the host adapter is reviewed and
passes acceptance, the source release remains blocked from production.

The adapter should classify temporary registry/network trouble for bounded
retry, missing host capabilities as `host update required`, invalid identity,
audit, migration, or artifact checks as `release rejected`, and a failed
post-mutation probe as `rolled back` only after the old artifact actually passes
readiness. Waiting for CI and a scheduled retry must not be reported as a
successful deployment. Persistent authentication failures require investigation,
not unbounded retries.
The installed helper's handled unsuccessful exits and HUP/INT/TERM restore the prior state. Failed rollback
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
