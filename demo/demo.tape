# keepitmovin demo — records a real handoff between two (simulated) coding agents.
# Prereq: `brew install vhs`.  Run from the repo root:  vhs demo/demo.tape
# Renders public/kim-demo.gif.

Output public/kim-demo.gif

Require bash

Set Shell bash
Set FontSize 16
Set Width 1180
Set Height 720
Set Padding 26
Set Margin 14
Set BorderRadius 10
Set WindowBar Colorful
Set Theme "Dracula"
Set TypingSpeed 70ms
Set Framerate 22

# --- Setup (hidden): a clean, neutral working dir and a `kim` shim so the
#     recorded prompt shows a bare `kim` and on-screen paths stay neutral.
#     Also pre-trusts the demo config (its custom `bash agent.sh` tools would
#     otherwise trip the trust prompt) using a throwaway KEEPITMOVIN_HOME. ---
Hide
Type `export PS1='$ '` Enter
Type `REPO="$PWD"` Enter
Type `CLI="$REPO/dist/cli.js"` Enter
Type `kim() { node "$CLI" "$@"; }` Enter
Type `D=/tmp/kim-demo; rm -rf "$D"; mkdir -p "$D"` Enter
Type `export KEEPITMOVIN_HOME="$D/.cphome"` Enter
Type `cp demo/agent.sh "$D/agent.sh"; chmod +x "$D/agent.sh"` Enter
Type `cp demo/keepitmovin.config.json "$D/keepitmovin.config.json"` Enter
Type `node "$REPO/demo/trust-demo.mjs" "$D/keepitmovin.config.json"` Enter
Type `cd "$D"` Enter
Type `clear` Enter
Show

# --- Recorded session ---
Sleep 700ms
Type "kim"
Sleep 600ms
Enter

# keepitmovin starts the first tool; it works and hits its usage limit, keepitmovin
# shows the "Switching tools" notice, and the second tool reads the handoff and
# continues.
Sleep 15s

# Final hold on the "continuing" frame.
Sleep 1200ms
