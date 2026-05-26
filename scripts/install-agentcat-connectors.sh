#!/usr/bin/env bash
set -euo pipefail

if [[ "${OMK_SKIP_AGENTCAT_INSTALL:-0}" == "1" ]]; then
  echo "[omk] skipping Agent Cat Connectors install (OMK_SKIP_AGENTCAT_INSTALL=1)"
  exit 0
fi

if command -v agentcat >/dev/null 2>&1; then
  echo "[omk] Agent Cat Connectors already installed: $(command -v agentcat)"
  exit 0
fi

if [[ -x "${AGENTCAT_CONNECTORS_DIR:-}/install.sh" ]]; then
  exec bash "${AGENTCAT_CONNECTORS_DIR}/install.sh"
fi

if [[ -x "$HOME/Trappist/agentcat-connectors/install.sh" ]]; then
  exec bash "$HOME/Trappist/agentcat-connectors/install.sh"
fi

echo "[omk] installing Agent Cat Connectors from GitHub"
curl -fsSL https://raw.githubusercontent.com/yong076/agentcat-connectors/main/install.sh | bash
