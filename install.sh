#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# NestJS Agent Pipeline — Installer
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ankursoni-dev/claude-agent-pipeline/main/install.sh)
#
# Or clone + run:
#   git clone https://github.com/ankursoni-dev/claude-agent-pipeline.git /tmp/cap
#   bash /tmp/cap/install.sh
#
# What it does:
#   1. Backs up existing .claude/ if present (asks first)
#   2. Downloads .claude/ from the GitHub repo into the current directory
#   3. Installs Repowise (pip or uv) if not already installed
#   4. Prints next steps
# ─────────────────────────────────────────────────────────────

REPO="ankursoni-dev/claude-agent-pipeline"     # <-- CHANGE THIS to your GitHub repo
BRANCH="master"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
ARCHIVE_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*"; }

# ── Pre-checks ──────────────────────────────────────────────

# Must be in a directory with package.json (NestJS project)
if [[ ! -f "package.json" ]]; then
    err "No package.json found in current directory."
    echo "    Run this script from the root of your NestJS project."
    exit 1
fi

# Check for NestJS
if ! grep -q '"@nestjs/core"' package.json 2>/dev/null; then
    warn "This doesn't look like a NestJS project (@nestjs/core not in package.json)."
    read -rp "    Continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy] ]] || exit 0
fi

echo ""
echo -e "${GREEN}NestJS Agent Pipeline Installer${NC}"
echo "─────────────────────────────────────────"
echo ""

# ── Backup existing .claude/ ────────────────────────────────

if [[ -d ".claude" ]]; then
    warn "Existing .claude/ directory found."
    echo ""
    echo "    This installer will REPLACE your .claude/ folder with the"
    echo "    NestJS agent pipeline. Your current .claude/ will be backed"
    echo "    up to .claude.backup.<timestamp>/"
    echo ""
    read -rp "    Proceed with backup and replace? [y/N] " yn
    if [[ ! "$yn" =~ ^[Yy] ]]; then
        info "Aborted. No changes made."
        exit 0
    fi

    BACKUP_DIR=".claude.backup.$(date +%Y%m%d-%H%M%S)"
    mv ".claude" "$BACKUP_DIR"
    ok "Backed up .claude/ → ${BACKUP_DIR}/"
fi

# ── Download .claude/ from GitHub ───────────────────────────

info "Downloading pipeline from ${REPO}..."

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

if command -v curl &>/dev/null; then
    curl -fsSL "$ARCHIVE_URL" -o "$TMPDIR/archive.tar.gz"
elif command -v wget &>/dev/null; then
    wget -q "$ARCHIVE_URL" -O "$TMPDIR/archive.tar.gz"
else
    err "Neither curl nor wget found. Install one and retry."
    exit 1
fi

# Extract just the .claude/ directory from the archive
tar -xzf "$TMPDIR/archive.tar.gz" -C "$TMPDIR"
EXTRACTED_DIR=$(ls "$TMPDIR" | grep -v archive.tar.gz | head -n1)

if [[ ! -d "$TMPDIR/$EXTRACTED_DIR/.claude" ]]; then
    err ".claude/ directory not found in the downloaded archive."
    exit 1
fi

cp -r "$TMPDIR/$EXTRACTED_DIR/.claude" ".claude"
ok "Installed .claude/ pipeline"

# Make hooks executable
chmod +x .claude/hooks/*.sh .claude/hooks/*.py 2>/dev/null || true
ok "Made hooks executable"

# ── Install Repowise ───────────────────────────────────────

echo ""
info "Checking for Repowise..."

if command -v repowise &>/dev/null; then
    ok "Repowise already installed: $(repowise --version 2>/dev/null || echo 'version unknown')"
else
    info "Installing Repowise..."

    if command -v uv &>/dev/null; then
        uv tool install repowise
        ok "Installed Repowise via uv"
    elif command -v pipx &>/dev/null; then
        pipx install repowise
        ok "Installed Repowise via pipx"
    elif command -v pip &>/dev/null; then
        pip install repowise
        ok "Installed Repowise via pip"
    else
        warn "Could not install Repowise (no pip, pipx, or uv found)."
        echo "    Install manually: pip install repowise"
    fi
fi

# ── .gitignore additions ────────────────────────────────────

if [[ -f ".gitignore" ]]; then
    ADDITIONS=""
    grep -qxF ".repowise/" .gitignore 2>/dev/null || ADDITIONS+=".repowise/"$'\n'
    grep -qxF ".claude/openrouter-status.json" .gitignore 2>/dev/null || ADDITIONS+=".claude/openrouter-status.json"$'\n'
    grep -qxF ".claude/context/git-hotspots.json" .gitignore 2>/dev/null || ADDITIONS+=".claude/context/git-hotspots.json"$'\n'
    grep -qxF ".claude/audits/" .gitignore 2>/dev/null || ADDITIONS+=".claude/audits/"$'\n'

    if [[ -n "$ADDITIONS" ]]; then
        echo "" >> .gitignore
        echo "# NestJS Agent Pipeline" >> .gitignore
        echo "$ADDITIONS" >> .gitignore
        ok "Added pipeline entries to .gitignore"
    fi
fi

# ── Done ────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────"
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Open Claude Code in this project directory"
echo ""
echo "  2. Run the /INIT command to complete setup:"
echo "     - Initializes Repowise with your preferred LLM provider"
echo "     - Generates codebase wikis"
echo "     - Validates the pipeline configuration"
echo ""
echo "  3. Start using the pipeline:"
echo "     - Just describe what you want to build"
echo "     - Use /QUICK for small changes"
echo "     - Use /AUDIT for codebase audits"
echo ""
if [[ -n "${BACKUP_DIR:-}" ]]; then
    echo -e "  ${YELLOW}Your previous .claude/ was backed up to: ${BACKUP_DIR}/${NC}"
    echo ""
fi
