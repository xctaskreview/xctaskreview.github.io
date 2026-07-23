#!/usr/bin/env bash
set -euo pipefail

REPO="xctaskreview/xctaskreview.github.io"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install from https://cli.github.com/ then run: gh auth login"
  exit 1
fi

gh auth status >/dev/null 2>&1 || {
  echo "Run: gh auth login"
  exit 1
}

create_pr() {
  local branch="$1"
  local title="$2"
  local issue="$3"
  local body="$4"

  if gh pr view "$branch" --repo "$REPO" >/dev/null 2>&1; then
    echo "PR already exists for $branch"
    gh pr view "$branch" --repo "$REPO" --json url -q .url
    return
  fi

  gh pr create \
    --repo "$REPO" \
    --base main \
    --head "$branch" \
    --title "$title" \
    --body "$(cat <<EOF
## Summary
$body

Closes #$issue

## Preview
After this PR is opened, GitHub Actions deploys a preview to:
\`https://xctaskreview.github.io/pr-preview/{PR_NUMBER}/\`

## Test plan
- [ ] Wait for the **PR Preview** workflow to finish
- [ ] Open the preview link posted in the PR comments
- [ ] Verify the feature works in the browser
EOF
)"
}

create_pr "ci/pr-previews" "Add GitHub Pages PR preview deployments" "0" \
  "Switch production deploy to the \`gh-pages\` branch and add a PR preview workflow that publishes each pull request to \`/pr-preview/{number}/\`."

create_pr "issue-1-leg-statistics" "Add leg statistics table (#1)" "1" \
  "Precompute per-pilot leg start/finish times and global leg metrics; show a table at the bottom of the review page."

create_pr "issue-2-start-end-tp" "Detect SS/ES turnpoints and grey out excluded legs (#2)" "2" \
  "Use SS/ES turnpoint suffixes to bound task metrics, time bar, and altitude chart; grey out pre-SS and post-ES map elements."

create_pr "issue-3-civl-import" "Add CIVL Comps import (#3)" "3" \
  "Import tasks and IGC tracks from civlcomps.org with year, event, and task selection."

create_pr "issue-4-edit-task" "Add editable turnpoint table and start time (#4)" "4" \
  "Let users edit turnpoint details and start time after loading a task."

create_pr "issue-5-export-import" "Add session bundle export and import (#5)" "5" \
  "Export and import task + tracks as a ZIP bundle with session metadata."

create_pr "issue-6-drag-drop" "Add drag-and-drop file loading to welcome screen (#6)" "6" \
  "Drag-and-drop support for task and track files on the welcome screen."

create_pr "issue-7-air-stats" "Add thermal and wind map overlays (#7)" "7" \
  "Compute thermal strength and wind from track logs; optional map overlays at playback time."

echo "Done. Configure GitHub Pages: Settings → Pages → Build from branch → gh-pages → /"
