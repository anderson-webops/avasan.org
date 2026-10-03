"""Synthetic trust-boundary checks for the installed static artifact verifier."""

import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
import tempfile
import unittest
from copy import deepcopy
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "verified_static_artifact", ROOT / "deploy/direct/verified-static-artifact.py"
)
ARTIFACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARTIFACT)
COMMIT = "a" * 40
VERSION = "1.2.13"


def encode(value):
    return (json.dumps(value, sort_keys=True) + "\n").encode()


class VerifiedStaticArtifactTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / ".ai-work/runs/artifact-verifier-tests"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.archive = self.root / f"avasan-v{VERSION}-{COMMIT[:12]}-static.tar.gz"
        self.contract = json.loads((ROOT / "deploy/static-artifact.json").read_text())
        self.identity = {"revision": COMMIT, "version": VERSION}
        self.provenance = {
            "commit": COMMIT, "version": VERSION, "branch": "main", "tag": f"v{VERSION}",
            "dirty": False, "releaseVerified": True,
        }
        self.public = {
            name: encode(self.identity) if name == "release.json" else f"Synthetic {name}".encode()
            for name in self.contract["required"]
        }
        self.policies = {
            name: (ROOT / name).read_bytes() for name in self.contract["adapterFiles"]
        }
        self.extra_members = []
        self.rebuild()

    def rebuild(self, manifest_mutator=None):
        manifest = {
            "format": 1,
            "contract": self.contract,
            "identity": self.identity,
            "provenance": self.provenance,
            "files": {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                      for name, data in self.public.items()},
            "adapterFiles": {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                             for name, data in self.policies.items()},
        }
        if manifest_mutator:
            manifest_mutator(manifest)
        payload = {
            ARTIFACT.MANIFEST_NAME: encode(manifest),
            ARTIFACT.PROVENANCE_NAME: encode(self.provenance),
            **{f"{self.contract['publicRoot']}/{name}": data for name, data in self.public.items()},
            **self.policies,
        }
        directories = {str(parent) for name in payload for parent in PurePosixPath(name).parents
                       if str(parent) != "."}
        with tarfile.open(self.archive, "w:gz") as bundle:
            for name in sorted(directories, key=lambda value: (value.count("/"), value)):
                member = tarfile.TarInfo(name + "/")
                member.type = tarfile.DIRTYPE
                bundle.addfile(member)
            for name, data in payload.items():
                member = tarfile.TarInfo(name)
                member.size = len(data)
                bundle.addfile(member, io.BytesIO(data))
            for member, data in self.extra_members:
                bundle.addfile(member, io.BytesIO(data) if data is not None else None)
        self.sha256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.manifest = manifest

    def inspect(self):
        return ARTIFACT.inspect_archive(self.archive, self.sha256, COMMIT, VERSION)

    def prepare_legacy(self):
        contract_bytes = subprocess.check_output(
            ["git", "show", "v1.2.12:deploy/static-artifact.json"], cwd=ROOT
        )
        self.assertEqual(hashlib.sha256(contract_bytes).hexdigest(),
                         "b1d26c68826b7f7034169a7acf13267f042f3a116181943cde75c6482895044b")
        self.contract = json.loads(contract_bytes)
        self.identity = {"revision": ARTIFACT.LEGACY_COMMIT, "version": ARTIFACT.LEGACY_VERSION}
        self.provenance = {
            "branch": "HEAD", "commit": ARTIFACT.LEGACY_COMMIT, "dirty": False,
            "releaseVerified": True, "tag": "v1.2.12", "version": ARTIFACT.LEGACY_VERSION,
        }
        self.public = {
            name: encode(self.identity) if name == "release.json" else f"Synthetic {name}".encode()
            for name in self.contract["required"]
        }
        self.public["404.html"] = b"Page not found"
        self.policies = {}
        for name in self.contract["adapterFiles"]:
            data = subprocess.check_output(["git", "show", f"v1.2.12:{name}"], cwd=ROOT)
            self.policies[name] = data
        self.assertEqual(hashlib.sha256(self.policies["deploy/nginx/server-policy.conf"]).hexdigest(),
                         "47543fa3a2efe19b0b514a9c028058ef28c955195e201308bcde0e31c0fa8eb0")
        self.assertIn(b'Cross-Origin-Opener-Policy "same-origin" always',
                      self.policies["deploy/nginx/server-policy.conf"])
        self.assertIn(b'Cross-Origin-Resource-Policy "same-origin" always',
                      self.policies["deploy/nginx/server-policy.conf"])
        self.rebuild()

    def legacy_source(self):
        self.prepare_legacy()
        provenance_patcher = patch.object(
            ARTIFACT, "LEGACY_PROVENANCE_SHA256", hashlib.sha256(encode(self.provenance)).hexdigest()
        )
        provenance_patcher.start()
        self.addCleanup(provenance_patcher.stop)
        source = self.root / "serving"
        source.mkdir(mode=0o755)
        payload = {
            ARTIFACT.MANIFEST_NAME: encode(self.manifest),
            ARTIFACT.PROVENANCE_NAME: encode(self.provenance),
            **{f"{self.contract['publicRoot']}/{name}": data for name, data in self.public.items()},
            **self.policies,
        }
        for name, data in payload.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            path.chmod(0o644)
        for directory, children, files in os.walk(source):
            Path(directory).chmod(0o755)
        current = self.root / "current"
        current.symlink_to(source, target_is_directory=True)
        active_root = self.root / "active"
        active_root.mkdir()
        active = {}
        for name, data in self.policies.items():
            path = active_root / PurePosixPath(name).name
            path.write_bytes(data)
            active[path.name] = path
        releases = self.root / "artifact-releases"
        releases.mkdir(mode=0o755)
        return source, current, active, releases, encode(self.manifest)

    def test_genuine_v1212_contract_is_accepted_only_for_exact_retained_identity(self):
        self.prepare_legacy()
        contract, expected = ARTIFACT.expected_inventory(
            self.manifest, ARTIFACT.LEGACY_COMMIT, ARTIFACT.LEGACY_VERSION, retained=True
        )
        self.assertEqual(contract, self.contract)
        self.assertEqual(len(expected), len(self.public) + len(self.policies) + 2)
        with self.assertRaisesRegex(ValueError, "host adapter update required"):
            ARTIFACT.expected_inventory(
                self.manifest, ARTIFACT.LEGACY_COMMIT, ARTIFACT.LEGACY_VERSION
            )
        with self.assertRaisesRegex(ValueError, "host adapter update required"):
            ARTIFACT.expected_inventory(
                self.manifest, COMMIT, ARTIFACT.LEGACY_VERSION, retained=True
            )
        changed = deepcopy(self.manifest)
        changed["contract"]["excluded"] += " Unreviewed addition."
        with self.assertRaisesRegex(ValueError, "unsupported original"):
            ARTIFACT.expected_inventory(
                changed, ARTIFACT.LEGACY_COMMIT, ARTIFACT.LEGACY_VERSION, retained=True
            )
        changed = deepcopy(self.manifest)
        changed["provenance"]["branch"] = "main"
        with self.assertRaisesRegex(ValueError, "original v1.2.12 provenance"):
            ARTIFACT.expected_inventory(
                changed, ARTIFACT.LEGACY_COMMIT, ARTIFACT.LEGACY_VERSION, retained=True
            )

    def test_host_built_v1212_inventory_is_exactly_pinned(self):
        fixture_root = ROOT / "test/fixtures/legacy-v1212"
        ci_bytes = (fixture_root / "static-artifact.json").read_bytes()
        host_bytes = (fixture_root / "host-build/static-artifact.json").read_bytes()
        self.assertEqual(ARTIFACT.legacy_manifest_digest(ci_bytes), ARTIFACT.LEGACY_MANIFEST_SHA256)
        self.assertEqual(ARTIFACT.legacy_manifest_digest(host_bytes), ARTIFACT.LEGACY_HOST_MANIFEST_SHA256)
        self.assertEqual(len(host_bytes), 5072)
        with self.assertRaisesRegex(ValueError, "manifest digest mismatch"):
            ARTIFACT.legacy_manifest_digest(host_bytes + b"\n")
        ci_manifest = ARTIFACT.load_json(ci_bytes)
        host_manifest = ARTIFACT.load_json(host_bytes)
        self.assertEqual(host_manifest["contract"], ci_manifest["contract"])
        self.assertEqual(host_manifest["identity"], ci_manifest["identity"])
        self.assertEqual(host_manifest["provenance"], ci_manifest["provenance"])
        self.assertEqual(host_manifest["adapterFiles"], ci_manifest["adapterFiles"])
        ARTIFACT.expected_inventory(
            host_manifest, ARTIFACT.LEGACY_COMMIT, ARTIFACT.LEGACY_VERSION, retained=True
        )
        old_meta = next(name for name in ci_manifest["files"] if name.startswith("_nuxt/builds/meta/"))
        new_meta = "_nuxt/builds/meta/7580dabd-e428-4891-8ec5-026921a2ecdf.json"
        delta = ARTIFACT.load_json((fixture_root / "host-build/public-delta.json").read_bytes())
        self.assertEqual(set(delta), {
            "index.html", "200.html", "_payload.json", "_nuxt/builds/latest.json", new_meta,
        })
        self.assertEqual(set(ci_manifest["files"]) - set(host_manifest["files"]), {old_meta})
        self.assertEqual(set(host_manifest["files"]) - set(ci_manifest["files"]), {new_meta})
        self.assertEqual(len(host_manifest["files"]), 26)
        for name, details in host_manifest["files"].items():
            if name not in delta:
                self.assertEqual(details, ci_manifest["files"][name])
            else:
                data = base64.b64decode(delta[name], validate=True)
                self.assertEqual(details, {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})

    def test_actual_host_build_fixture_captures_without_rewriting_manifest(self):
        fixture_root = ROOT / "test/fixtures/legacy-v1212"
        manifest_bytes = (fixture_root / "host-build/static-artifact.json").read_bytes()
        manifest = ARTIFACT.load_json(manifest_bytes)
        source = self.root / "releases/v1.2.12"
        source.mkdir(parents=True, mode=0o755)
        archive = fixture_root / "avasan-v1.2.12-d696406b0531-static.tar.gz"
        with tarfile.open(archive) as bundle:
            bundle.extractall(source, filter="data")
        ci_manifest = ARTIFACT.load_json((fixture_root / "static-artifact.json").read_bytes())
        old_meta = next(name for name in ci_manifest["files"] if name.startswith("_nuxt/builds/meta/"))
        public = source / manifest["contract"]["publicRoot"]
        (public / old_meta).unlink()
        delta = ARTIFACT.load_json((fixture_root / "host-build/public-delta.json").read_bytes())
        for name, encoded in delta.items():
            (public / name).write_bytes(base64.b64decode(encoded, validate=True))
        (source / ARTIFACT.MANIFEST_NAME).write_bytes(manifest_bytes)
        self.assertEqual(hashlib.sha256((source / ARTIFACT.PROVENANCE_NAME).read_bytes()).hexdigest(),
                         ARTIFACT.LEGACY_PROVENANCE_SHA256)
        current = self.root / "current"
        current.symlink_to(source, target_is_directory=True)
        active_root = self.root / "active"
        active_root.mkdir()
        active = {}
        for name in manifest["adapterFiles"]:
            path = active_root / PurePosixPath(name).name
            path.write_bytes((source / name).read_bytes())
            active[path.name] = path
        releases = self.root / "artifact-releases"
        releases.mkdir(mode=0o755)
        captured = ARTIFACT.capture_legacy_release(source, manifest_bytes, active, releases, current)
        self.assertEqual(captured.name[-16:], ARTIFACT.LEGACY_HOST_MANIFEST_SHA256[:16])
        self.assertEqual((captured / ARTIFACT.MANIFEST_NAME).read_bytes(), manifest_bytes)
        self.assertEqual((source / ARTIFACT.MANIFEST_NAME).read_bytes(), manifest_bytes)
        ARTIFACT.verify_tree(captured, manifest, retained=True)

    def test_legacy_capture_preserves_original_bytes_and_rejects_rewrites(self):
        source, current, active, releases, trusted = self.legacy_source()
        (source / "unrelated.txt").write_text("never copy this")
        approved = hashlib.sha256(trusted).hexdigest()
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        patcher = patch.object(ARTIFACT, "LEGACY_MANIFEST_SHA256", approved)
        patcher.start()
        self.addCleanup(patcher.stop)
        policy_path = active["server-policy.conf"]
        original_policy = policy_path.read_bytes()
        policy_path.write_bytes(original_policy + b"\n# changed\n")
        with self.assertRaisesRegex(ValueError, "active Nginx policy differs"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        policy_path.write_bytes(original_policy)
        destination = ARTIFACT.capture_legacy_release(
            source, trusted, active, releases, current
        )
        self.assertEqual(destination.parent, releases)
        self.assertEqual(current.resolve(), source)
        self.assertFalse((destination / "unrelated.txt").exists())
        self.assertEqual((destination / ARTIFACT.MANIFEST_NAME).read_bytes(), trusted)
        self.assertEqual((destination / ARTIFACT.PROVENANCE_NAME).read_bytes(),
                         (source / ARTIFACT.PROVENANCE_NAME).read_bytes())
        ARTIFACT.verify_tree(destination, self.manifest, retained=True)
        with self.assertRaisesRegex(ValueError, "already exists"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        public = source / self.contract["publicRoot"] / "index.html"
        public.write_text("tampered")
        tamper_releases = self.root / "tamper-releases"
        tamper_releases.mkdir(mode=0o755)
        with self.assertRaisesRegex(ValueError, "original public file differs"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, tamper_releases, current
            )

    def test_legacy_capture_rejects_changed_provenance_and_linked_public_files(self):
        source, current, active, releases, trusted = self.legacy_source()
        approved = hashlib.sha256(trusted).hexdigest()
        patcher = patch.object(ARTIFACT, "LEGACY_MANIFEST_SHA256", approved)
        patcher.start()
        self.addCleanup(patcher.stop)
        provenance = source / ARTIFACT.PROVENANCE_NAME
        provenance.write_bytes(encode({**self.provenance, "branch": "main"}))
        with self.assertRaisesRegex(ValueError, "original provenance differs"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        provenance.write_text(json.dumps(self.provenance, indent=2))
        with self.assertRaisesRegex(ValueError, "original provenance differs"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        provenance.write_bytes(encode(self.provenance))
        public = source / self.contract["publicRoot"] / "index.html"
        data = public.read_bytes()
        public.unlink()
        outside = self.root / "outside.html"
        outside.write_bytes(data)
        public.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "link or special file"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        self.assertFalse(any(releases.iterdir()))

    def test_legacy_capture_rejects_unlisted_public_files(self):
        source, current, active, releases, trusted = self.legacy_source()
        manifest_patcher = patch.object(
            ARTIFACT, "LEGACY_MANIFEST_SHA256", hashlib.sha256(trusted).hexdigest()
        )
        manifest_patcher.start()
        self.addCleanup(manifest_patcher.stop)
        extra = source / self.contract["publicRoot"] / "unlisted.html"
        extra.write_text("not in the original inventory")
        with self.assertRaisesRegex(ValueError, "serving public inventory differs"):
            ARTIFACT.capture_legacy_release(
                source, trusted, active, releases, current
            )
        self.assertFalse(any(releases.iterdir()))

    def test_exact_archive_is_sealed_and_remains_verifiable(self):
        self.inspect()
        destination = self.root / "sealed"
        destination.mkdir(mode=0o700)
        ARTIFACT.unpack_verified(self.archive, self.sha256, COMMIT, VERSION, destination)
        ARTIFACT.verify_tree(destination, self.manifest)
        self.assertEqual((destination / self.contract["publicRoot"] / "release.json").read_bytes(),
                         encode(self.identity))
        result = subprocess.run(
            [sys.executable, "-I", "-B", str(ROOT / "deploy/direct/verified-static-artifact.py"),
             "verify", str(destination), COMMIT],
            capture_output=True, text=True, timeout=3, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), VERSION)

    def test_altered_policy_is_rejected_even_with_matching_self_manifest(self):
        name = self.contract["adapterFiles"][0]
        self.policies[name] += b"\n# unreviewed rewrite\n"
        self.rebuild()
        with self.assertRaisesRegex(ValueError, "host adapter update required for Nginx policy"):
            self.inspect()

    def test_weakened_contract_is_rejected_even_with_matching_self_manifest(self):
        self.contract["deployment"]["requiredHostCapabilities"].pop()
        self.rebuild()
        with self.assertRaisesRegex(ValueError, "host adapter update required"):
            self.inspect()

    def test_duplicate_member_is_rejected(self):
        data = b"replacement"
        member = tarfile.TarInfo(f"{self.contract['publicRoot']}/index.html")
        member.size = len(data)
        self.extra_members.append((member, data))
        self.rebuild()
        with self.assertRaisesRegex(ValueError, "duplicate or unsafe archive path"):
            self.inspect()

    def test_symlink_member_is_rejected(self):
        member = tarfile.TarInfo(f"{self.contract['publicRoot']}/leak.txt")
        member.type = tarfile.SYMTYPE
        member.linkname = "/etc/passwd"
        self.extra_members.append((member, None))
        self.rebuild()
        with self.assertRaisesRegex(ValueError, "archive contains a link"):
            self.inspect()

    def test_traversal_member_is_rejected(self):
        data = b"outside"
        member = tarfile.TarInfo("../outside")
        member.size = len(data)
        self.extra_members.append((member, data))
        self.rebuild()
        with self.assertRaisesRegex(ValueError, "duplicate or unsafe archive path"):
            self.inspect()

    def test_public_hash_drift_is_rejected(self):
        self.rebuild(lambda manifest: manifest["files"]["index.html"].update({"sha256": "b" * 64}))
        with self.assertRaisesRegex(ValueError, "public artifact hash"):
            self.inspect()

    def test_retained_contract_and_policy_can_survive_a_reviewed_host_upgrade(self):
        destination = self.root / "sealed"
        destination.mkdir(mode=0o700)
        ARTIFACT.unpack_verified(self.archive, self.sha256, COMMIT, VERSION, destination)
        retained_manifest = deepcopy(self.manifest)
        self.contract = deepcopy(self.contract)
        self.contract["excluded"] += " Reviewed policy update."
        policy_name = self.contract["adapterFiles"][0]
        self.policies[policy_name] += b"\n# reviewed replacement\n"
        self.rebuild()
        installed = self.root / "new-install/deploy"
        policies = installed / "nginx"
        policies.mkdir(parents=True)
        (installed / "static-artifact.json").write_bytes(encode(self.contract))
        for name, data in self.policies.items():
            (policies / PurePosixPath(name).name).write_bytes(data)
        original_contract = ARTIFACT.CONTRACT_PATH
        original_policies = ARTIFACT.POLICY_ROOT
        ARTIFACT.CONTRACT_PATH = installed / "static-artifact.json"
        ARTIFACT.POLICY_ROOT = policies
        try:
            self.inspect()
            ARTIFACT.verify_tree(destination, retained_manifest, retained=True)
            with self.assertRaisesRegex(ValueError, "host adapter update required"):
                ARTIFACT.verify_tree(destination, retained_manifest)
        finally:
            ARTIFACT.CONTRACT_PATH = original_contract
            ARTIFACT.POLICY_ROOT = original_policies

    def test_sealed_tree_rejects_post_install_link_and_mutation(self):
        destination = self.root / "sealed"
        destination.mkdir(mode=0o700)
        ARTIFACT.unpack_verified(self.archive, self.sha256, COMMIT, VERSION, destination)
        public = destination / self.contract["publicRoot"]
        public.chmod(0o755)
        (public / "leak.txt").symlink_to("/etc/passwd")
        public.chmod(0o555)
        with self.assertRaisesRegex(ValueError, "link or special file"):
            ARTIFACT.verify_tree(destination, self.manifest)
        public.chmod(0o755)
        (public / "leak.txt").unlink()
        public.chmod(0o555)
        index = public / "index.html"
        index.chmod(0o644)
        index.write_text("altered")
        with self.assertRaisesRegex(ValueError, "file mode differs"):
            ARTIFACT.verify_tree(destination, self.manifest)
        index.chmod(0o444)
        with self.assertRaisesRegex(ValueError, "public file changed"):
            ARTIFACT.verify_tree(destination, self.manifest)

    def test_cli_rejects_fifo_manifest_without_blocking(self):
        destination = self.root / "sealed"
        destination.mkdir(mode=0o700)
        ARTIFACT.unpack_verified(self.archive, self.sha256, COMMIT, VERSION, destination)
        manifest = destination / ARTIFACT.MANIFEST_NAME
        destination.chmod(0o755)
        manifest.chmod(0o644)
        manifest.unlink()
        os.mkfifo(manifest)
        destination.chmod(0o555)
        result = subprocess.run(
            [sys.executable, "-I", "-B", str(ROOT / "deploy/direct/verified-static-artifact.py"),
             "verify", str(destination), COMMIT],
            capture_output=True, text=True, timeout=3, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("regular file", result.stderr)

    def test_cli_rejects_symlinked_release_root(self):
        destination = self.root / "sealed"
        destination.mkdir(mode=0o700)
        ARTIFACT.unpack_verified(self.archive, self.sha256, COMMIT, VERSION, destination)
        alias = self.root / "alias"
        alias.symlink_to(destination, target_is_directory=True)
        result = subprocess.run(
            [sys.executable, "-I", "-B", str(ROOT / "deploy/direct/verified-static-artifact.py"),
             "verify", str(alias), COMMIT],
            capture_output=True, text=True, timeout=3, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("real directory", result.stderr)


if __name__ == "__main__":
    unittest.main()
