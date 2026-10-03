#!/usr/bin/env python3
"""Verify and seal an attested Avasan static archive from a trusted installation."""

import argparse
import hashlib
from itertools import chain
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tarfile
import tempfile


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
LEGACY_COMMIT = "d696406b0531224f5ec734f61334890b8c5ba7c5"
LEGACY_VERSION = "1.2.12"
LEGACY_CONTRACT_SHA256 = "43050738984394e257241ab8c29508d79f6d9b22a75e0fe57c7c3321d828bdef"
LEGACY_MANIFEST_SHA256 = "9c46331f51490878a607293a021ce40123f4df6b8b335d1c91be6b93e6bc22af"
LEGACY_PROVENANCE_SHA256 = "6b65e785d88fc284b55d070b2b4fc49292617e593eeebc533b3bceb9053e87d8"
LEGACY_CAPTURE_NAME = f"legacy-v{LEGACY_VERSION}-{LEGACY_COMMIT[:12]}-{LEGACY_MANIFEST_SHA256[:16]}"


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


def read_stable_file(descriptor, maximum):
    before = os.fstat(descriptor)
    if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
            or before.st_mode & 0o022 or before.st_size > maximum):
        raise ValueError("capture input is not a bounded protected regular file")
    data = os.read(descriptor, before.st_size + 1)
    after = os.fstat(descriptor)
    if len(data) != before.st_size or (before.st_dev, before.st_ino, before.st_mtime_ns,
                                       before.st_ctime_ns, before.st_size) != (
        after.st_dev, after.st_ino, after.st_mtime_ns, after.st_ctime_ns, after.st_size
    ):
        raise ValueError("capture input changed during inspection")
    return data


def require_protected_root_path(path, regular=False):
    path = Path(path)
    for item in (path, *path.parents):
        metadata = item.lstat()
        expected_type = stat.S_ISREG(metadata.st_mode) if item == path and regular else stat.S_ISDIR(metadata.st_mode)
        if (not expected_type or metadata.st_uid != 0 or metadata.st_mode & 0o022
                or item == path and regular and metadata.st_nlink != 1):
            raise ValueError("root-owned protected capture input is required")


def read_beneath(directory, name, maximum):
    if not safe_name(name):
        raise ValueError("unsafe capture input path")
    descriptor = os.dup(directory)
    try:
        for part in name.split("/")[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
            metadata = os.fstat(descriptor)
            if not stat.S_ISDIR(metadata.st_mode) or metadata.st_mode & 0o022:
                raise ValueError("capture input directory is mutable")
        file_descriptor = os.open(
            name.split("/")[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor
        )
        try:
            return read_stable_file(file_descriptor, maximum)
        finally:
            os.close(file_descriptor)
    finally:
        os.close(descriptor)


def verify_public_inventory(directory, public_root, expected_files):
    descriptor = os.dup(directory)
    try:
        for part in public_root.split("/"):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
            metadata = os.fstat(descriptor)
            if not stat.S_ISDIR(metadata.st_mode) or metadata.st_mode & 0o022:
                raise ValueError("serving public directory is mutable")
        found_files = set()
        found_directories = set()
        stack = [(os.dup(descriptor), "")]
        try:
            while stack:
                current_descriptor, prefix = stack.pop()
                try:
                    with os.scandir(current_descriptor) as entries:
                        for entry in entries:
                            relative = f"{prefix}{entry.name}"
                            if not safe_name(relative) or len(found_files) + len(found_directories) >= MAX_MEMBERS:
                                raise ValueError("serving public inventory exceeds bounds")
                            metadata = os.stat(entry.name, dir_fd=current_descriptor, follow_symlinks=False)
                            if metadata.st_mode & 0o022:
                                raise ValueError("serving public inventory is mutable")
                            if stat.S_ISDIR(metadata.st_mode):
                                child = os.open(
                                    entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                    dir_fd=current_descriptor
                                )
                                child_metadata = os.fstat(child)
                                if (child_metadata.st_dev, child_metadata.st_ino) != (metadata.st_dev, metadata.st_ino):
                                    os.close(child)
                                    raise ValueError("serving public directory changed during capture")
                                found_directories.add(relative)
                                stack.append((child, f"{relative}/"))
                            elif stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1:
                                found_files.add(relative)
                            else:
                                raise ValueError("serving public inventory contains a link or special file")
                finally:
                    os.close(current_descriptor)
        finally:
            for pending_descriptor, _ in stack:
                os.close(pending_descriptor)
        expected_directories = {
            str(parent) for name in expected_files for parent in PurePosixPath(name).parents
            if str(parent) != "."
        }
        if found_files != set(expected_files) or found_directories != expected_directories:
            raise ValueError("serving public inventory differs from original manifest")
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
    legacy_retained = retained and commit == LEGACY_COMMIT and version == LEGACY_VERSION
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
    if legacy_retained:
        canonical_contract = json.dumps(contract, sort_keys=True, separators=(",", ":")).encode()
        if digest(canonical_contract) != LEGACY_CONTRACT_SHA256:
            raise ValueError("unsupported original v1.2.12 contract")
    else:
        deployment = contract.get("deployment")
        if not isinstance(deployment, dict):
            raise ValueError("host adapter update required for artifact format")
        if deployment.get("version") != 1 or deployment.get("artifactFormat") != "ci-built-static-archive-v1":
            raise ValueError("host adapter update required for artifact format")
        if deployment.get("runtime") != "static-nginx" or deployment.get("migrations") != "none":
            raise ValueError("unsupported static deployment contract")
        capabilities = deployment.get("requiredHostCapabilities")
        if not isinstance(capabilities, list) or any(not isinstance(value, str) for value in capabilities):
            raise ValueError("invalid static capability contract")
        if not retained and set(capabilities) != {
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
    if legacy_retained and provenance != {
        "branch": "HEAD", "commit": LEGACY_COMMIT, "dirty": False,
        "releaseVerified": True, "tag": "v1.2.12", "version": LEGACY_VERSION,
    }:
        raise ValueError("original v1.2.12 provenance mismatch")
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
        if path == destination:
            if not stat.S_ISDIR(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o555:
                raise ValueError("artifact root must be a sealed directory")
            if metadata.st_uid != os.geteuid() or metadata.st_mode & 0o022:
                raise ValueError("artifact tree is not protected")
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
        if metadata.st_uid != os.geteuid() or metadata.st_mode & 0o022:
            raise ValueError("artifact tree is not protected")
    required_directories = {str(parent) for name in expected for parent in PurePosixPath(name).parents if str(parent) != "."}
    if seen_files != expected or seen_directories != required_directories:
        raise ValueError("artifact tree inventory differs from manifest")
    manifest_path = destination / MANIFEST_NAME
    if manifest_path.stat().st_size > MAX_MANIFEST_BYTES:
        raise ValueError("artifact tree manifest exceeds bound")
    manifest_bytes = manifest_path.read_bytes()
    if (retained and trusted_manifest["identity"] == {"revision": LEGACY_COMMIT, "version": LEGACY_VERSION}
            and digest(manifest_bytes) != LEGACY_MANIFEST_SHA256):
        raise ValueError("retained original v1.2.12 manifest digest mismatch")
    if load_json(manifest_bytes) != trusted_manifest:
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


def capture_legacy_release(source, trusted_manifest_bytes, active_policies, release_root, current_link):
    if digest(trusted_manifest_bytes) != LEGACY_MANIFEST_SHA256:
        raise ValueError("original v1.2.12 manifest digest mismatch")
    manifest = load_json(trusted_manifest_bytes)
    contract, expected = expected_inventory(manifest, LEGACY_COMMIT, LEGACY_VERSION, retained=True)
    source = Path(source)
    release_root = Path(release_root)
    destination = release_root / LEGACY_CAPTURE_NAME
    if current_link.resolve(strict=True) != source.resolve(strict=True):
        raise ValueError("serving release changed before capture")
    if destination.exists() or destination.is_symlink():
        raise ValueError("retained capture already exists")
    root_metadata = release_root.lstat()
    if (not stat.S_ISDIR(root_metadata.st_mode) or root_metadata.st_uid != os.geteuid()
            or root_metadata.st_mode & 0o022):
        raise ValueError("retained release root is not protected")
    source_descriptor = os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        source_metadata = os.fstat(source_descriptor)
        if not stat.S_ISDIR(source_metadata.st_mode) or source_metadata.st_mode & 0o022:
            raise ValueError("serving release directory is mutable")
        if (source.lstat().st_dev, source.lstat().st_ino) != (source_metadata.st_dev, source_metadata.st_ino):
            raise ValueError("serving release changed before capture")
        verify_public_inventory(source_descriptor, contract["publicRoot"], manifest["files"])
        payload = {}
        expanded = 0
        for name in sorted(expected):
            data = read_beneath(source_descriptor, name, MAX_MANIFEST_BYTES if name == MANIFEST_NAME else MAX_EXPANDED_BYTES)
            expanded += len(data)
            if expanded > MAX_EXPANDED_BYTES:
                raise ValueError("retained capture exceeds expanded size bound")
            payload[name] = data
        if payload[MANIFEST_NAME] != trusted_manifest_bytes:
            raise ValueError("serving manifest differs from independently trusted original")
        if (digest(payload[PROVENANCE_NAME]) != LEGACY_PROVENANCE_SHA256
                or load_json(payload[PROVENANCE_NAME]) != manifest["provenance"]):
            raise ValueError("original provenance differs from manifest")
        if load_json(payload[f"{contract['publicRoot']}/release.json"]) != manifest["identity"]:
            raise ValueError("original public identity differs from manifest")
        for name, details in manifest["files"].items():
            data = payload[f"{contract['publicRoot']}/{name}"]
            if len(data) != details["size"] or digest(data) != details["sha256"]:
                raise ValueError("original public file differs from manifest")
        for name, details in manifest["adapterFiles"].items():
            data = payload[name]
            if len(data) != details["size"] or digest(data) != details["sha256"]:
                raise ValueError("original Nginx policy differs from manifest")
            active = Path(active_policies[PurePosixPath(name).name])
            active_descriptor = os.open(active, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                if read_stable_file(active_descriptor, MAX_MANIFEST_BYTES) != data:
                    raise ValueError("active Nginx policy differs from original inventory")
            finally:
                os.close(active_descriptor)
        temporary = Path(tempfile.mkdtemp(prefix=".legacy-capture-", dir=release_root))
        try:
            directories = {str(parent) for name in expected for parent in PurePosixPath(name).parents
                           if str(parent) != "."}
            for name in sorted(directories, key=lambda value: (value.count("/"), value)):
                (temporary / name).mkdir(mode=0o700)
            for name, data in payload.items():
                with (temporary / name).open("xb") as output:
                    output.write(data)
                (temporary / name).chmod(0o444)
            for name in sorted(directories, key=lambda value: (-value.count("/"), value)):
                (temporary / name).chmod(0o555)
            temporary.chmod(0o555)
            verify_tree(temporary, manifest, retained=True)
            if (current_link.resolve(strict=True) != source.resolve(strict=True)
                    or (source.lstat().st_dev, source.lstat().st_ino)
                    != (source_metadata.st_dev, source_metadata.st_ino)
                    or read_beneath(source_descriptor, MANIFEST_NAME, MAX_MANIFEST_BYTES) != trusted_manifest_bytes
                    or read_beneath(source_descriptor, PROVENANCE_NAME, MAX_MANIFEST_BYTES) != payload[PROVENANCE_NAME]):
                raise ValueError("serving release changed during capture")
            verify_public_inventory(source_descriptor, contract["publicRoot"], manifest["files"])
            for name in manifest["files"]:
                path = f"{contract['publicRoot']}/{name}"
                if read_beneath(source_descriptor, path, MAX_EXPANDED_BYTES) != payload[path]:
                    raise ValueError("serving public file changed during capture")
            for name in manifest["adapterFiles"]:
                if read_beneath(source_descriptor, name, MAX_MANIFEST_BYTES) != payload[name]:
                    raise ValueError("serving policy changed during capture")
                active = Path(active_policies[PurePosixPath(name).name])
                active_descriptor = os.open(active, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                try:
                    if read_stable_file(active_descriptor, MAX_MANIFEST_BYTES) != payload[name]:
                        raise ValueError("active Nginx policy changed during capture")
                finally:
                    os.close(active_descriptor)
            if destination.exists() or destination.is_symlink():
                raise ValueError("retained capture appeared during verification")
            temporary.rename(destination)
        finally:
            if temporary.exists():
                temporary.chmod(0o700)
                for directory, children, files in os.walk(temporary):
                    for name in children:
                        (Path(directory) / name).chmod(0o700)
                    for name in files:
                        (Path(directory) / name).chmod(0o600)
                shutil.rmtree(temporary)
        verify_tree(destination, manifest, retained=True)
        return destination
    finally:
        os.close(source_descriptor)


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
    capture = subcommands.add_parser("capture-retained-v1.2.12")
    capture.add_argument("expected_current_commit")
    arguments = parser.parse_args()
    if arguments.command == "unpack":
        manifest = unpack_verified(arguments.archive, arguments.sha256, arguments.commit,
                                   arguments.version, arguments.destination)
    elif arguments.command == "verify":
        destination = Path(arguments.destination)
        if not stat.S_ISDIR(destination.lstat().st_mode):
            raise ValueError("sealed artifact root must be a real directory")
        manifest = load_sealed_manifest(destination / MANIFEST_NAME)
        version = arguments.version or manifest["identity"]["version"]
        if manifest.get("identity") != {"revision": arguments.commit, "version": version}:
            raise ValueError("sealed artifact identity mismatch")
        verify_tree(destination, manifest, retained=arguments.retained)
    else:
        installed_helper = Path("/usr/local/libexec/avasan.org/deploy/direct/verified-static-artifact.py")
        if (os.geteuid() != 0 or Path(__file__).resolve() != installed_helper
                or arguments.expected_current_commit != LEGACY_COMMIT):
            raise ValueError("capture requires the installed root helper and exact original identity")
        base = Path("/srv/avasan.org")
        current = base / "current"
        incoming = base / "artifact-incoming/v1.2.12-static-artifact.json"
        require_protected_root_path(installed_helper, regular=True)
        require_protected_root_path(base)
        require_protected_root_path(base / "artifact-incoming")
        require_protected_root_path(base / "artifact-releases")
        require_protected_root_path(incoming, regular=True)
        if not current.is_symlink() or current.lstat().st_uid != 0:
            raise ValueError("serving release pointer is not a symlink")
        trusted_descriptor = os.open(incoming, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            trusted = read_stable_file(trusted_descriptor, MAX_MANIFEST_BYTES)
        finally:
            os.close(trusted_descriptor)
        source = current.resolve(strict=True)
        if not source.is_relative_to(base) or source.is_relative_to(base / "artifact-releases"):
            raise ValueError("original serving path is outside the legacy release area")
        policies = {
            "http-maps.conf": Path("/etc/nginx/snippets/avasan.org-http-maps.conf"),
            "server-policy.conf": Path("/etc/nginx/snippets/avasan.org-server-policy.conf"),
        }
        for path in policies.values():
            require_protected_root_path(path, regular=True)
        destination = capture_legacy_release(source, trusted, policies, base / "artifact-releases", current)
        print(destination)
        return
    print(manifest["identity"]["version"])


if __name__ == "__main__":
    main()
