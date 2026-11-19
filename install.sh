#!/usr/bin/env bash
# Instala ou remove o /cp no OpenCode (configuração global).
#   ./install.sh              instala
#   ./install.sh --uninstall  remove
# Variável CP_CONFIG_DIR troca o diretório de configuração (padrão ~/.config/opencode).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${CP_CONFIG_DIR:-$HOME/.config/opencode}"
DEST="$CONF/opencode-cp"
CMD_DIR="$CONF/commands"
JSON="$CONF/opencode.json"
PLUGIN_ENTRY="$DEST/cp-plugin.mjs"
TS="$(date +%Y%m%d-%H%M%S)"

edit_config() {
  local action="$1"
  mkdir -p "$CONF"
  if [[ ! -f "$JSON" ]]; then
    echo '{ "$schema": "https://opencode.ai/config.json" }' > "$JSON"
  fi
  cp "$JSON" "$JSON.bak-cp-$TS"
  python3 - "$JSON" "$action" "$PLUGIN_ENTRY" <<'PY'
import json, sys
path, action, entry = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(path, encoding="utf-8"))
plugins = data.get("plugin", [])
if isinstance(plugins, str):
    plugins = [plugins]
plugins = [p for p in plugins if p != entry]
if action == "install":
    plugins.append(entry)
if plugins:
    data["plugin"] = plugins
else:
    data.pop("plugin", None)
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
  echo "config: $JSON (backup: $JSON.bak-cp-$TS)"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  edit_config remove
  rm -rf "$DEST"
  rm -f "$CMD_DIR/cp.md"
  echo "removido: $DEST e $CMD_DIR/cp.md"
  exit 0
fi

mkdir -p "$DEST" "$CMD_DIR"
cp "$HERE/src/cp-core.mjs" "$HERE/src/cp-plugin.mjs" "$DEST/"
cp "$HERE/commands/cp.md" "$CMD_DIR/cp.md"
edit_config install
echo "instalado: $DEST e $CMD_DIR/cp.md"
echo "reinicie o OpenCode para carregar o plugin."
