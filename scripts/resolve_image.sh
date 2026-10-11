#!/bin/bash

set -euo pipefail

: "${COMPONENT:?Set server or client}"
: "${IMAGE_REPOSITORY:?Set the GHCR image repository}"
: "${HAS_NEXT_VERSION:?Set the get-next-version result}"

case "$COMPONENT" in
    server|client) ;;
    *) printf '%s\n' 'COMPONENT must be server or client.' >&2; exit 1 ;;
esac

case "$HAS_NEXT_VERSION" in
    true)
        : "${NEXT_VERSION:?get-next-version must supply the new version}"
        version=$NEXT_VERSION
        ;;
    false)
        tag=$(git describe --tags --match="$COMPONENT-[1-9]*" --abbrev=0)
        version=${tag#"$COMPONENT"-}
        ;;
    *) printf '%s\n' 'HAS_NEXT_VERSION must be true or false.' >&2; exit 1 ;;
esac

if [[ ! "$version" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s\n' 'The image version must be a positive integer.' >&2
    exit 1
fi

printf 'image=%s:%s\n' "$IMAGE_REPOSITORY" "$version"
