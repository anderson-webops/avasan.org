"""Synthetic trust-boundary checks for the installed static artifact verifier."""

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
