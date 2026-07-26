#!/usr/bin/env bash
# Release kim: bump the version, commit + tag, push to origin, and publish
# to npm — in one step.
#
# Usage:
#   pnpm release <patch|minor|major|<semver>> [--dry-run] [--yes]
#
#   --dry-run   Run build/test/lint and preview the packed tarball contents.
#               Makes no git commits/tags/pushes and does not publish.
#   --yes, -y   Skip the interactive confirmation prompt (for CI/non-interactive use).
#
# Publishing itself happens in CI: pushing the tag triggers
# .github/workflows/release.yml, which republishes from a clean checkout with npm
# provenance. This script never runs `npm publish` for real.
#
# Requires: a clean working tree on `main`, in sync with origin/main.
# Refuses to run otherwise.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

BUMP=""
DRY_RUN=false
ASSUME_YES=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --yes|-y) ASSUME_YES=true ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) BUMP="$arg" ;;
  esac
done

if [[ -z "$BUMP" ]]; then
  echo "Usage: pnpm release <patch|minor|major|<semver>> [--dry-run] [--yes]" >&2
  exit 1
fi

# Use whatever pnpm the repo's `packageManager` field resolves to, so the script
# behaves the same on any machine and in CI.
PNPM="pnpm"

# Keep npm cache writes out of a machine-wide cache that may be owned by a
# different user, while still reading the caller's normal ~/.npmrc credentials.
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-${TMPDIR:-/tmp}/kim-npm-cache}"

echo "==> Checking branch and working tree"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "Refusing to release from branch '$CURRENT_BRANCH' (expected 'main')." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash your changes before releasing:" >&2
  git status --short >&2
  exit 1
fi

if [[ "$DRY_RUN" != true ]]; then
  echo "==> Checking origin/main is in sync"
  git fetch origin main
  LOCAL_SHA="$(git rev-parse HEAD)"
  REMOTE_SHA="$(git rev-parse origin/main)"
  if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    echo "Local main is not in sync with origin/main. Pull/rebase first." >&2
    exit 1
  fi

  echo "==> Checking the release workflow is present"
  if [[ ! -f .github/workflows/release.yml ]]; then
    echo "Missing .github/workflows/release.yml — the tag would never publish." >&2
    exit 1
  fi
fi

echo "==> Build"
"$PNPM" build
echo "==> Test"
"$PNPM" test
echo "==> Lint"
"$PNPM" lint

CURRENT_VERSION="$(node -p "require('./package.json').version")"
# Informational only — `npm version "$BUMP"` below performs the real bump.
# Note: `npm version --dry-run` is NOT safe here; it rewrites package.json anyway.
# The previous split(".").map(Number) produced NaN on any prerelease version, so
# prerelease bumps are handled explicitly (npm semantics: a patch bump on
# 2.1.0-beta.1 releases 2.1.0 rather than moving to 2.1.1).
NEXT_VERSION="$(node -e '
  const bump = process.argv[1];
  const current = require("./package.json").version;
  const parsed = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(current);
  if (!parsed) { console.log(bump.replace(/^v/, "")); process.exit(0); }
  const [major, minor, patch] = parsed.slice(1, 4).map(Number);
  const prerelease = parsed[4];
  if (bump === "major") console.log(prerelease && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`);
  else if (bump === "minor") console.log(prerelease && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`);
  else if (bump === "patch") console.log(prerelease ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`);
  else console.log(bump.replace(/^v/, ""));
' "$BUMP")"

if [[ "$DRY_RUN" == true ]]; then
  echo "==> [dry-run] Would bump $CURRENT_VERSION -> $NEXT_VERSION, commit, tag, and push."
  echo "==> [dry-run] CI would then publish v$NEXT_VERSION from the tag."
  echo "==> [dry-run] Previewing npm package contents (no git/npm mutation)"
  # `npm publish --dry-run` checks the registry and fails with "cannot publish
  # over the previously published versions" because the bump has not happened
  # yet, which makes a healthy dry run look broken. `npm pack --dry-run` lists
  # the exact same tarball contents without contacting the registry.
  npm pack --dry-run
  echo "==> [dry-run] Done. Re-run without --dry-run to actually release."
  exit 0
fi

echo ""
echo "This will:"
echo "  1. Bump version $CURRENT_VERSION -> $NEXT_VERSION"
echo "  2. Commit and tag v$NEXT_VERSION"
echo "  3. Push main + tags to origin"
echo "  4. Trigger the release workflow, which publishes $NEXT_VERSION to npm"
echo ""

if [[ "$ASSUME_YES" != true ]]; then
  read -r -p "Proceed? [y/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted. No changes made."
    exit 1
  fi
fi

echo "==> Bumping version, committing, and tagging"
npm version "$BUMP" -m "release: v%s"

echo "==> Pushing to origin"
git push origin main --follow-tags

echo "==> Tagged v$NEXT_VERSION and pushed."
echo "    CI publishes from the tag with provenance. Watch it here:"
echo "    https://github.com/garrettsiegel/keepitmovin/actions/workflows/release.yml"
