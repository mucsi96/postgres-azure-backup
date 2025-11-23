#!/usr/bin/env python3

from os import environ
import sys
from pathlib import Path
from publish_tools import ansible_utils, docker_utils, version_utils

root_directory = Path(__file__).parent.parent
secrets = ansible_utils.load_vars(
    sys.argv[2], root_directory / "vars/vault.yaml")
username = environ.get("GITHUB_REPOSITORY_OWNER")

if username == None:
    print("GitHub username is missing", flush=True, file=sys.stderr)
    exit(1)

# Get version for server
server_version = version_utils.get_version(
    src=root_directory / "server",
    ignore=[],
    tag_prefix="server"
)

# Get version for client
client_version = version_utils.get_version(
    src=root_directory / "client",
    ignore=[],
    tag_prefix="client"
)

print(f"Building and pushing server image version: {server_version}", flush=True)
docker_utils.build_and_push_docker_img(
    src=root_directory / "server",
    version=server_version,
    tag_prefix="server",
    image_name="postgres-azure-backup-server",
    docker_username=username,
    docker_password=secrets["docker_password"],
    github_access_token=sys.argv[1],
)

print(f"Building and pushing client image version: {client_version}", flush=True)
docker_utils.build_and_push_docker_img(
    src=root_directory / "client",
    version=client_version,
    tag_prefix="client",
    image_name="postgres-azure-backup-client",
    docker_username=username,
    docker_password=secrets["docker_password"],
    github_access_token=sys.argv[1],
)
