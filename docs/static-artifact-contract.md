# Static artifact and recovery contract

Avasan remains a single public teacher homepage served directly by Nginx. There
is no authentication, role change, database, provider, queue, background worker,
tracking endpoint or application Node process to optimize. CS and Math links
are independent sites; this release neither inspects nor modifies them.

## Artifact and identity

`deploy/static-artifact.json` independently declares required public files and
the two source Nginx snippets. The manifest records every public file hash/size,
full source commit, version, clean annotated-tag provenance, and snippet hashes.
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

Published assets are the archive, SHA256SUMS, static-artifact.json and acceptance.json.
The receipt binds archive bytes, source identity and the exact harness hashes.
The current production helper still prepares a complete reviewed source checkout;
the archive is a verified static artifact, not a replacement host topology.

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

Promotion requires a complete prior release, verifies artifact hashes against its
manifest and Git commit, locks a root-owned0700 `.deployment-recovery` directory
beside `current`, backs up snippets including their modes/ownership, atomically
replaces each snippet and pointer, verifies the effective snippet includes,
validates/reloads Nginx, and verifies the candidate on both loopback families.
Artifact files are opened with no-follow descriptors and checked before and after
each read, so a mutable preparation tree cannot replace a checked path during
hashing without making promotion fail closed.
Handled unsuccessful exits and HUP/INT/TERM restore the prior state. Failed rollback
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
