# Original host-built v1.2.12 fixture

The serving v1.2.12 tree was built on the production host from the same
`d696406b0531224f5ec734f61334890b8c5ba7c5` source revision as the
separately built CI archive in the parent directory. Its original 5,072-byte
manifest has SHA-256
`61405f4b02757629d1cebd84054ecaee15b966779e32a2b9749d4057c6d0538d`.
That exact digest and length were independently reported from the protected
server copy on 2026-10-02/03.

The five changed, publicly served files were retrieved over HTTPS while
`/release.json` still identified v1.2.12. Their exact bytes are base64-encoded
in `public-delta.json` because the originals do not end with newlines. The
remaining 21 public file descriptors, the original provenance, and both
Nginx policy descriptors match the CI fixture. Replacing those five descriptors
and the build-specific meta path in the CI manifest produced the exact reported
manifest SHA-256, not merely an equivalent JSON object. The isolated test
reconstructs the full host-built tree from the verified CI archive plus this
delta and verifies every file against the original host manifest.

This public-only fixture is test evidence, not authority to replace the actual
serving files or their manifest. Production capture must compare the protected
original manifest and actual serving bytes under the root-owned host workflow.
