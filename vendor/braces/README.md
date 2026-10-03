# Guarded braces fork

This local package is based on upstream `braces@3.0.3` (MIT; see `LICENSE`). It exists because upstream has not published a patched release for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

The fork limits structural nesting in the parser and each recursive compile, expand, and stringify walker. The root npm override makes transitive `micromatch` consumers use this fork. `test/braces-compat.test.mjs` checks the lockfile, the reported exhaustion patterns, direct AST entry points, and ordinary expansion behavior.

Replace this fork only after upstream publishes a verified fix and the same compatibility and audit checks pass against it.
