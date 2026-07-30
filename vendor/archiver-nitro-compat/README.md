# Archiver 8 compatibility bridge

Nitro 2.13.4 imports Archiver through the default factory API removed by Archiver 8. This local package restores that
small factory surface while delegating archive creation to the supported Archiver 8 implementation.

Remove this bridge when Nitro directly supports Archiver 8 or later. Keep the dependency pinned and run the clean
install, audit, test, build, and ARM64 gates after any change.
