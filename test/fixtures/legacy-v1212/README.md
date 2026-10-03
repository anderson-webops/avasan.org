# Exact v1.2.12 public static fixture

The archive and manifest in this directory are unchanged assets from the
repository's draft v1.2.12 release at commit
`d696406b0531224f5ec734f61334890b8c5ba7c5`. They contain only the public
static site, published deployment policies, and release sidecars. Their pinned
SHA-256 digests are:

- `avasan-v1.2.12-d696406b0531-static.tar.gz`:
  `d2ceb57706c1b5f163a723353a2f8af594a754a0ef2b7c2114b435a4b0c502f9`
- `static-artifact.json`:
  `9c46331f51490878a607293a021ce40123f4df6b8b335d1c91be6b93e6bc22af`

The source test verifies these hashes again before using the files. Preserve
the original bytes and do not regenerate or amend the historical manifest.
The fixture lets Linux CI test legacy capture and rollback without a privileged
token for a draft GitHub release. It is test evidence, not an authorization to
install the old release or activate a new one.
