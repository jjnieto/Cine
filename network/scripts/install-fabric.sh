#!/usr/bin/env bash
# install-fabric.sh — descarga binarios e imágenes Docker de Hyperledger Fabric.
# Wrapper sobre el instalador oficial. Los binarios van a network/bin/.

set -euo pipefail

FABRIC_VERSION="${FABRIC_VERSION:-2.5.10}"
FABRIC_CA_VERSION="${FABRIC_CA_VERSION:-1.5.13}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NETWORK_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$NETWORK_DIR"

# Si ya existen los binarios, no rehacemos.
if [ -x "$NETWORK_DIR/bin/peer" ] && [ -x "$NETWORK_DIR/bin/configtxgen" ]; then
  echo "Fabric binaries ya presentes en $NETWORK_DIR/bin"
  "$NETWORK_DIR/bin/peer" version | head -3
  exit 0
fi

echo "Descargando Fabric $FABRIC_VERSION / Fabric-CA $FABRIC_CA_VERSION..."
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh \
  -o /tmp/install-fabric.sh
chmod +x /tmp/install-fabric.sh

# El instalador deposita binarios en ./bin y config de muestra en ./config (no la usamos).
/tmp/install-fabric.sh --fabric-version "$FABRIC_VERSION" --ca-version "$FABRIC_CA_VERSION" binary docker

echo
echo "Listo. Comprueba:"
"$NETWORK_DIR/bin/peer" version | head -3
