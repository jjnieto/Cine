#!/usr/bin/env bash
# Smoke test end-to-end: inicializa governance, da de alta una productora,
# crea una propuesta, vota y la consulta. Asume que la red está arriba,
# los 3 chaincodes desplegados y el backend en :3000.
#
# Ejecutar con:  ./scripts/smoke-test.sh
# Re-entrante: tolera estado previo (Init ya hecho, productora ya en censo, etc.).

set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/_peer-env.sh"

BACKEND="${BACKEND:-http://localhost:3000}"

# Permitir personalizar el ID de la propuesta para re-ejecutar sin colisión.
PROP_ID="${PROP_ID:-PROP-SMOKE-$(date +%s)}"

bold() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

bold "1) Backend en pie"
curl -fsS "$BACKEND/health" || { echo "Backend no responde — ¿arrancaste 'npm run dev' en backend/?" >&2; exit 1; }
echo

bold "2) Init de governance (idempotente — falla suave si ya estaba)"
peer_env asociacion
peer_invoke governance Init 2>&1 | tail -2 || true

bold "3) Añadir AsociacionMSP al censo (idempotente)"
peer_invoke governance AddProductora AsociacionMSP 2>&1 | tail -2 || true
echo "Censo:"; peer_query governance ListProductoras

bold "4) POST /proposals  (crea $PROP_ID)"
curl -fsS -X POST "$BACKEND/proposals" \
  -H 'content-type: application/json' \
  -d "$(cat <<EOF
{
  "id":"$PROP_ID",
  "filmTitle":"La pelicula imposible",
  "principalCents":"1000000000",
  "couponBps":600,
  "termMonths":36,
  "numParticipations":"10000",
  "whitepaperHash":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  "whitepaperURL":"https://example.com/wp.pdf"
}
EOF
)"
echo

bold "5) POST vote (yes) en $PROP_ID"
curl -fsS -X POST "$BACKEND/proposals/$PROP_ID/vote" \
  -H 'content-type: application/json' -d '{"choice":true}'
echo

bold "6) GET /proposals/$PROP_ID"
if command -v jq >/dev/null; then
  curl -fsS "$BACKEND/proposals/$PROP_ID" | jq .
else
  curl -fsS "$BACKEND/proposals/$PROP_ID"
  echo
fi

bold "OK — smoke test completo"
