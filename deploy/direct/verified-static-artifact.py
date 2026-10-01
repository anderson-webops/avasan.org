#!/usr/bin/env python3
"""Verify and seal an attested Avasan static archive from a trusted installation."""

import argparse
import hashlib
from itertools import chain
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile


INSTALL_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = INSTALL_ROOT / "deploy/static-artifact.json"
POLICY_ROOT = INSTALL_ROOT / "deploy/nginx"
MANIFEST_NAME = ".avasan-static-artifact.json"
PROVENANCE_NAME = ".avasan-static-release.json"
MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_MANIFEST_BYTES = 1024 * 1024
MAX_MEMBERS = 10000
REQUIRED_STATIC_FILES = {"index.html", "200.html", "404.html", "release.json", "favicon.svg", "robots.txt"}
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def load_json(data):
    return json.loads(data.decode("utf-8"), object_pairs_hook=unique_object)


def load_sealed_manifest(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if (not stat.S_ISREG(before.st_mode) or before.st_size > MAX_MANIFEST_BYTES
                or before.st_uid != os.geteuid()):
            raise ValueError("sealed manifest must be a bounded owned regular file")
        data = os.read(descriptor, before.st_size + 1)
        after = os.fstat(descriptor)
        if len(data) != before.st_size or (before.st_dev, before.st_ino, before.st_mtime_ns,
                                             before.st_ctime_ns, before.st_size) != (
            after.st_dev, after.st_ino, after.st_mtime_ns, after.st_ctime_ns, after.st_size
        ):
            raise ValueError("sealed manifest changed during inspection")
        return load_json(data)
    finally:
        os.close(descriptor)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    path = PurePosixPath(name)
    if not name or len(name) > 1024 or name.startswith("/") or "//" in name or "\\" in name:
        return False
    if path.as_posix() != name or any(part in (".", "..") for part in name.split("/")):
        return False
    return True


def safe_public_name(name):
    return safe_name(name) and all(
        not part.startswith(".") and part != "node_modules"
        and not re.search(r"\.(?:pem|key|sqlite3?|node|so)\Z", part, re.IGNORECASE)
        for part in name.split("/")
    )


def expected_details(details):
    if set(details) != {"sha256", "size"}:
        raise ValueError("invalid artifact file descriptor")
    if not isinstance(details["sha256"], str) or not SHA256.fullmatch(details["sha256"]):
        raise ValueError("invalid artifact file digest")
    if type(details["size"]) is not int or not 0 <= details["size"] <= MAX_EXPANDED_BYTES:
        raise ValueError("invalid artifact file size")


def expected_inventory(manifest, commit, version, retained=False):
    installed_contract = load_json(CONTRACT_PATH.read_bytes())
    if set(manifest) != {"format", "contract", "identity", "provenance", "files", "adapterFiles"}:
        raise ValueError("invalid static manifest structure")
    contract = manifest["contract"]
    if manifest["format"] != 1 or not isinstance(contract, dict):
        raise ValueError("invalid static manifest format")
    if not retained and contract != installed_contract:
        raise ValueError("host adapter update required for deployment contract")
    if (contract.get("format") != 1 or contract.get("site") != "https://avasan.org"
            or contract.get("publicRoot") != "front-end/.output/public"
            or contract.get("writableState") != []
            or contract.get("adapterFiles") != [
                "deploy/nginx/http-maps.conf", "deploy/nginx/server-policy.conf"]):
        raise ValueError("unsupported retained static contract")
    if not isinstance(contract.get("required"), list) or not REQUIRED_STATIC_FILES.issubset(contract["required"]):
        raise ValueError("required static paths differ from host baseline")
    deployment = contract["deployment"]
    if deployment["version"] != 1 or deployment["artifactFormat"] != "ci-built-static-archive-v1":
        raise ValueError("host adapter update required for artifact format")
    if deployment["runtime"] != "static-nginx" or deployment["migrations"] != "none":
        raise ValueError("unsupported static deployment contract")
    capabilities = set(deployment["requiredHostCapabilities"])
    if not retained and capabilities != {
        "github-actions-attestation-v1",
        "protected-immutable-staging-v1",
        "trusted-nginx-policy-assets-v1",
        "dual-stack-release-identity-v1",
        "retained-artifact-rollback-v1",
    }:
        raise ValueError("host adapter update required for capability contract")
    if not COMMIT.fullmatch(commit) or not VERSION.fullmatch(version):
        raise ValueError("invalid exact source identity")
    identity = {"revision": commit, "version": version}
    if manifest["identity"] != identity:
        raise ValueError("static release identity mismatch")
    provenance = manifest["provenance"]
    if not isinstance(provenance, dict) or any(
        provenance.get(key) != value for key, value in {
            "commit": commit, "version": version, "tag": f"v{version}",
            "dirty": False, "releaseVerified": True,
        }.items()
    ):
        raise ValueError("static source provenance mismatch")
    if not isinstance(manifest["files"], dict) or not isinstance(manifest["adapterFiles"], dict):
        raise ValueError("invalid static file inventory")
    if not set(contract["required"]).issubset(manifest["files"]):
        raise ValueError("required static file missing")
    if set(manifest["adapterFiles"]) != set(contract["adapterFiles"]):
        raise ValueError("Nginx policy inventory mismatch")
    if len(manifest["files"]) + len(manifest["adapterFiles"]) > MAX_MEMBERS:
        raise ValueError("static file inventory exceeds bound")
    expected = {MANIFEST_NAME, PROVENANCE_NAME}
    for name, details in manifest["files"].items():
        if not safe_public_name(name):
            raise ValueError("unsafe public artifact path")
        expected_details(details)
        expected.add(f"{contract['publicRoot']}/{name}")
    for name, details in manifest["adapterFiles"].items():
        if not safe_name(name):
            raise ValueError("unsafe Nginx policy path")
        expected_details(details)
        expected.add(name)
    return contract, expected


def inspect_archive(archive_path, expected_sha256, commit, version):
    if not SHA256.fullmatch(expected_sha256):
        raise ValueError("invalid archive SHA-256")
    archive_path = Path(archive_path)
    if archive_path.name != f"avasan-v{version}-{commit[:12]}-static.tar.gz":
        raise ValueError("archive filename differs from exact source identity")
    metadata = archive_path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("archive must be a bounded regular file")
    checksum = hashlib.sha256()
    with archive_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    if checksum.hexdigest() != expected_sha256:
        raise ValueError("archive SHA-256 mismatch")
    payload = {}
    directories = set()
    expanded = 0
    with tarfile.open(archive_path, "r:gz") as bundle:
        for count, member in enumerate(bundle, 1):
            if count > MAX_MEMBERS:
                raise ValueError("archive member count exceeds bound")
            name = member.name.rstrip("/") if member.isdir() else member.name
            if member.name not in (name, f"{name}/") or not safe_name(name) or name in payload or name in directories:
                raise ValueError("duplicate or unsafe archive path")
            if member.isdir():
                directories.add(name)
                continue
            if not member.isfile() or member.size < 0:
                raise ValueError("archive contains a link or special file")
            expanded += member.size
            if expanded > MAX_EXPANDED_BYTES:
                raise ValueError("archive expanded size exceeds bound")
            stream = bundle.extractfile(member)
            if stream is None:
                raise ValueError("archive file cannot be read")
            data = stream.read(member.size + 1)
            if len(data) != member.size:
                raise ValueError("archive file size mismatch")
            payload[name] = data
    if MANIFEST_NAME not in payload or len(payload[MANIFEST_NAME]) > MAX_MANIFEST_BYTES:
        raise ValueError("bounded static manifest missing")
    manifest = load_json(payload[MANIFEST_NAME])
    contract, expected = expected_inventory(manifest, commit, version)
    if set(payload) != expected:
        raise ValueError("archive inventory differs from static manifest")
    expected_directories = {str(parent) for name in expected for parent in PurePosixPath(name).parents if str(parent) != "."}
    if directories != expected_directories:
        raise ValueError("archive directory inventory mismatch")
    if load_json(payload[PROVENANCE_NAME]) != manifest["provenance"]:
        raise ValueError("source provenance sidecar differs from manifest")
    if load_json(payload[f"{contract['publicRoot']}/release.json"]) != manifest["identity"]:
        raise ValueError("public release identity differs from manifest")
    for name, details in manifest["files"].items():
        data = payload[f"{contract['publicRoot']}/{name}"]
        if len(data) != details["size"] or digest(data) != details["sha256"]:
            raise ValueError("public artifact hash or size mismatch")
    for name, details in manifest["adapterFiles"].items():
        data = payload[name]
        if len(data) != details["size"] or digest(data) != details["sha256"]:
            raise ValueError("Nginx policy hash or size mismatch")
        if data != (POLICY_ROOT / PurePosixPath(name).name).read_bytes():
            raise ValueError("host adapter update required for Nginx policy")
    return manifest, payload, directories


def unpack_verified(archive_path, expected_sha256, commit, version, destination):
    manifest, payload, directories = inspect_archive(archive_path, expected_sha256, commit, version)
    destination = Path(destination)
    metadata = destination.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.geteuid() or any(destination.iterdir()):
        raise ValueError("destination must be an empty owned directory")
    for name in sorted(directories, key=lambda value: (value.count("/"), value)):
        (destination / name).mkdir(mode=0o700)
    for name, data in payload.items():
        path = destination / name
        with path.open("xb") as output:
            output.write(data)
        path.chmod(0o444)
    for name in sorted(directories, key=lambda value: (-value.count("/"), value)):
        (destination / name).chmod(0o555)
    destination.chmod(0o555)
    verify_tree(destination, manifest)
    return manifest


def verify_tree(destination, trusted_manifest, retained=False):
    destination = Path(destination)
    contract, expected = expected_inventory(
        trusted_manifest, trusted_manifest["identity"]["revision"],
        trusted_manifest["identity"]["version"], retained=retained
    )
    seen_files = set()
    seen_directories = set()
    for count, path in enumerate(chain((destination,), destination.rglob("*")), 1):
        if count > MAX_MEMBERS + 1:
            raise ValueError("artifact tree member count exceeds bound")
        metadata = path.lstat()
        if metadata.st_uid != os.geteuid() or metadata.st_mode & 0o022:
            raise ValueError("artifact tree is not protected")
        if path == destination:
            if not stat.S_ISDIR(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o555:
                raise ValueError("artifact root must be a sealed directory")
            continue
        name = path.relative_to(destination).as_posix()
        if stat.S_ISDIR(metadata.st_mode):
            if stat.S_IMODE(metadata.st_mode) != 0o555:
                raise ValueError("artifact directory mode differs from sealed mode")
            seen_directories.add(name)
        elif stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1:
            if stat.S_IMODE(metadata.st_mode) != 0o444:
                raise ValueError("artifact file mode differs from sealed mode")
            seen_files.add(name)
        else:
            raise ValueError("artifact tree contains a link or special file")
    required_directories = {str(parent) for name in expected for parent in PurePosixPath(name).parents if str(parent) != "."}
    if seen_files != expected or seen_directories != required_directories:
        raise ValueError("artifact tree inventory differs from manifest")
    if load_json((destination / MANIFEST_NAME).read_bytes()) != trusted_manifest:
        raise ValueError("artifact tree manifest changed")
    if load_json((destination / PROVENANCE_NAME).read_bytes()) != trusted_manifest["provenance"]:
        raise ValueError("artifact tree provenance changed")
    if load_json((destination / contract["publicRoot"] / "release.json").read_bytes()) != trusted_manifest["identity"]:
        raise ValueError("artifact tree public identity changed")
    for name, details in trusted_manifest["files"].items():
        data = (destination / contract["publicRoot"] / name).read_bytes()
        if len(data) != details["size"] or digest(data) != details["sha256"]:
            raise ValueError("artifact tree public file changed")
    for name, details in trusted_manifest["adapterFiles"].items():
        data = (destination / name).read_bytes()
        if len(data) != details["size"] or digest(data) != details["sha256"]:
            raise ValueError("artifact tree Nginx policy changed")
        if not retained and data != (POLICY_ROOT / PurePosixPath(name).name).read_bytes():
            raise ValueError("host adapter update required for Nginx policy")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    unpack = subcommands.add_parser("unpack")
    unpack.add_argument("archive")
    unpack.add_argument("sha256")
    unpack.add_argument("commit")
    unpack.add_argument("version")
    unpack.add_argument("destination")
    verify = subcommands.add_parser("verify")
    verify.add_argument("--retained", action="store_true")
    verify.add_argument("destination")
    verify.add_argument("commit")
    verify.add_argument("version", nargs="?")
    arguments = parser.parse_args()
    if arguments.command == "unpack":
        manifest = unpack_verified(arguments.archive, arguments.sha256, arguments.commit,
                                   arguments.version, arguments.destination)
    else:
        destination = Path(arguments.destination)
        if not stat.S_ISDIR(destination.lstat().st_mode):
            raise ValueError("sealed artifact root must be a real directory")
        manifest = load_sealed_manifest(destination / MANIFEST_NAME)
        version = arguments.version or manifest["identity"]["version"]
        if manifest.get("identity") != {"revision": arguments.commit, "version": version}:
            raise ValueError("sealed artifact identity mismatch")
        verify_tree(destination, manifest, retained=arguments.retained)
    print(manifest["identity"]["version"])


if __name__ == "__main__":
    main()
