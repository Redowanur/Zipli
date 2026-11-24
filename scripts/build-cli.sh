#!/usr/bin/env sh
# Cross-compile the zipli CLI into ./dist using Docker (no local Go needed).
set -eu
cd "$(dirname "$0")/.."
VERSION="${VERSION:-$(git describe --tags --always 2>/dev/null || echo dev)}"
mkdir -p dist
for t in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64; do
  os=${t%/*}; arch=${t#*/}; ext=""; [ "$os" = windows ] && ext=".exe"
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/w -w /w/api -e HOME=/tmp -e GOCACHE=/tmp/gc -e GOPATH=/tmp/gp \
    -e CGO_ENABLED=0 -e GOOS="$os" -e GOARCH="$arch" golang:1.26-alpine \
    go build -trimpath -ldflags="-s -w -X main.version=$VERSION" -o "/w/dist/zipli-$os-$arch$ext" ./cmd/zipli
  echo "built dist/zipli-$os-$arch$ext"
done
