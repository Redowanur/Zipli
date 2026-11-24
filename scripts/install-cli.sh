#!/usr/bin/env sh
# Install the zipli CLI for this machine (default: ~/.local/bin).
#   sh scripts/install-cli.sh                 # build if needed, then install
#   PREFIX=/usr/local/bin sh scripts/install-cli.sh   # may need sudo
set -eu
cd "$(dirname "$0")/.."

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in linux|darwin) ;; *) echo "Unsupported OS: $os (on Windows use dist/zipli-windows-amd64.exe)" >&2; exit 1;; esac
case "$(uname -m)" in
  x86_64|amd64) arch=amd64;;
  aarch64|arm64) arch=arm64;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1;;
esac

bin="dist/zipli-$os-$arch"
if [ ! -x "$bin" ] || [ -n "$(find api/cmd/zipli -newer "$bin" -name '*.go' 2>/dev/null)" ]; then
  echo "Building the CLI (needs Docker)..."
  sh scripts/build-cli.sh >/dev/null
fi

dest="${PREFIX:-$HOME/.local/bin}"
mkdir -p "$dest"
install -m 0755 "$bin" "$dest/zipli"
echo "Installed $dest/zipli ($("$dest/zipli" version))"

case ":$PATH:" in
  *":$dest:"*) echo "Try:  zipli 'https://example.com/a/long/link'";;
  *) echo "NOTE: $dest is not on your PATH. Add this to your shell profile:"
     echo "  export PATH=\"$dest:\$PATH\"";;
esac
