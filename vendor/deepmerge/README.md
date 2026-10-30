# Guarded deepmerge fork

This local package is based on upstream `deepmerge@4.3.1` (MIT; see `LICENSE`). Upstream has not published a fix for [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

The fork rejects `__proto__` from both source and target during object merging. The root npm override applies the fix to transitive consumers. `test/deepmerge-compat.test.mjs` covers the reported prototype-poisoning cases and ordinary merge behavior.

Replace this fork only after upstream publishes a verified compatible fix and the same compatibility and audit checks pass against it.
