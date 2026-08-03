#!/usr/bin/env bash
set -euo pipefail

echo "Installing manga-cli..."
echo ""

# Color helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

MISSING_DEPS=0

# 1. Dependency Checks
echo "Checking system dependencies..."

# Node.js check (>= 18.0.0)
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/^v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    echo -e "  [${GREEN}PASS${NC}] Node.js v$NODE_VER (>= 18.0.0)"
  else
    echo -e "  [${RED}FAIL${NC}] Node.js v$NODE_VER detected. Node.js 18+ is required."
    echo "         Update Node.js via your package manager or nvm."
    MISSING_DEPS=$((MISSING_DEPS + 1))
  fi
else
  echo -e "  [${RED}FAIL${NC}] Node.js is not installed."
  echo "         Install with: sudo pacman -S nodejs (Arch) / sudo apt install nodejs (Debian/Ubuntu) / sudo dnf install nodejs (Fedora)"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

# python3 check
if command -v python3 >/dev/null 2>&1; then
  echo -e "  [${GREEN}PASS${NC}] python3"
else
  echo -e "  [${RED}FAIL${NC}] python3 is not installed."
  echo "         Install with: sudo pacman -S python (Arch) / sudo apt install python3 (Debian/Ubuntu) / sudo dnf install python3 (Fedora)"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

# fzf check
if command -v fzf >/dev/null 2>&1; then
  echo -e "  [${GREEN}PASS${NC}] fzf"
else
  echo -e "  [${RED}FAIL${NC}] fzf is not installed."
  echo "         Install with: sudo pacman -S fzf (Arch) / sudo apt install fzf (Debian/Ubuntu) / sudo dnf install fzf (Fedora)"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

# GTK4 Python bindings check
if python3 -c "import gi; gi.require_version('Gtk', '4.0'); from gi.repository import Gtk" >/dev/null 2>&1; then
  echo -e "  [${GREEN}PASS${NC}] GTK4 Python bindings (Gtk 4.0 & PyGObject)"
else
  echo -e "  [${RED}FAIL${NC}] GTK4 Python bindings not found."
  echo "         Install with: sudo pacman -S python-gobject gtk4 (Arch) / sudo apt install python3-gi python3-gi-cairo libgtk-4-dev (Debian/Ubuntu) / sudo dnf install python3-gobject gtk4 (Fedora)"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

# git check
if command -v git >/dev/null 2>&1; then
  echo -e "  [${GREEN}PASS${NC}] git"
else
  echo -e "  [${RED}FAIL${NC}] git is not installed."
  echo "         Install with: sudo pacman -S git (Arch) / sudo apt install git (Debian/Ubuntu) / sudo dnf install git (Fedora)"
  MISSING_DEPS=$((MISSING_DEPS + 1))
fi

if [ "$MISSING_DEPS" -gt 0 ]; then
  echo ""
  echo -e "${RED}Error: Missing $MISSING_DEPS required dependency/dependencies. Please install them and re-run install.sh.${NC}"
  exit 1
fi

echo ""
echo "All dependencies satisfied!"
echo ""

# 2. Clone or Update Repository
INSTALL_DIR="${MANGA_CLI_DIR:-$HOME/.local/share/manga-cli}"
REPO_URL="${MANGA_CLI_REPO:-https://github.com/nishant1195/manga-cli.git}"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing manga-cli installation at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull
else
  echo "Cloning manga-cli to $INSTALL_DIR..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# 3. Install NPM Dependencies
echo "Installing npm dependencies..."
(cd "$INSTALL_DIR" && npm install --quiet)

# 4. Create Binary Wrapper
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

WRAPPER_PATH="$BIN_DIR/manga-cli"

echo "Creating binary wrapper at $WRAPPER_PATH..."
cat << EOF > "$WRAPPER_PATH"
#!/usr/bin/env bash
exec "$INSTALL_DIR/node_modules/.bin/tsx" "$INSTALL_DIR/src/index.ts" "\$@"
EOF

chmod +x "$WRAPPER_PATH"

# 5. PATH Verification Warning
echo ""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo -e "${YELLOW}Warning: $BIN_DIR is not in your PATH.${NC}"
  echo "Add the following line to your ~/.bashrc or ~/.zshrc:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
fi

# 6. Final Health Verification
echo "Running post-install health check..."
echo "--------------------------------------------------"
"$WRAPPER_PATH" --health
