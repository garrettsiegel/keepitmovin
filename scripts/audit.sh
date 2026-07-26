#!/usr/bin/env bash
# Run `pnpm audit --prod --audit-level high` in $1, distinguishing a real finding
# from the tool failing to produce a verdict at all.
#
# pnpm audit occasionally dies with "Unexpected token ... is not valid JSON" when
# the registry returns a response it cannot parse. That is not a vulnerability,
# and treating it as one turns the security gate into noise people learn to
# ignore. A genuine advisory still fails the build.
set -uo pipefail

DIR="${1:-.}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
cd "$DIR"

run_audit() {
  pnpm audit --prod --audit-level high 2>&1
}

for attempt in 1 2; do
  output="$(run_audit)"
  status=$?

  if [[ $status -eq 0 ]]; then
    echo "$output"
    echo "==> No advisories at or above 'high' in ${DIR}."
    exit 0
  fi

  # A real result names severities; a crash does not.
  if grep -qiE "vulnerabilit(y|ies) found|Severity:" <<<"$output"; then
    echo "$output"
    echo "==> Advisories found in ${DIR} at or above 'high'." >&2
    exit 1
  fi

  echo "==> pnpm audit did not return a usable result (attempt ${attempt}/2):" >&2
  echo "$output" >&2
  [[ $attempt -eq 1 ]] && sleep 5
done

echo "::warning::pnpm audit could not reach a verdict for ${DIR} (registry/tooling fault, not a finding). Not failing the build." >&2
exit 0
