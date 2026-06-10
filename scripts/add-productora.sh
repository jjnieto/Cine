#!/usr/bin/env bash
# Añade una productora al censo (AsociacionMSP admin op).
# uso: ./scripts/add-productora.sh <MSPID>

set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/_peer-env.sh"

mspid="${1:?MSP ID (ej. Productora1MSP)}"
peer_env asociacion
echo "→ AddProductora($mspid)"
peer_invoke governance AddProductora "$mspid"
echo
echo "Censo actual:"
peer_query governance ListProductoras
