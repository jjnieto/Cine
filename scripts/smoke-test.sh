#!/usr/bin/env bash
# Smoke test end-to-end via API REST: gobernanza completa + marketplace primario + secundario.
# Requiere backend en :3000, red Fabric arriba y los 3 chaincodes desplegados.
#
# Ejecutar:  ./scripts/smoke-test.sh
# Re-entrante: tolera estado previo (chaincode idempotente devolverá ya inicializado, etc).

set -euo pipefail
BACKEND="${BACKEND:-http://localhost:3000}"

bold() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
api_post() { curl -fsS -X POST "$BACKEND$1" -H 'content-type: application/json' "${@:2}"; echo; }
api_get()  { curl -fsS "$BACKEND$1"; }

bold "0) Backend en pie"
api_get /health

bold "1) Asegurar censo y parámetros (votación 30s para que la demo sea rápida)"
for msp in Productora1MSP Productora2MSP Productora3MSP; do
  curl -fsS -X POST "$BACKEND/admin/productoras" -H 'content-type: application/json' -d "{\"mspId\":\"$msp\"}" > /dev/null 2>&1 || true
done
api_post /admin/params -d '{"quorumBps":3300,"votingDurationS":30}' || true
echo "Censo:"; api_get /admin/productoras; echo

PROP="DEMO-$(date +%s)"
bold "2) Productora1 crea propuesta $PROP"
curl -fsS -X POST "$BACKEND/proposals" \
  -H 'content-type: application/json' -H 'X-Acting-As: productora1' \
  -d "{\"id\":\"$PROP\",\"filmTitle\":\"El bono del cinéfilo\",\"principalCents\":\"500000\",\"couponBps\":700,\"termMonths\":12,\"numParticipations\":\"500\",\"whitepaperHash\":\"$(printf 'a%.0s' {1..64})\",\"whitepaperUrl\":\"https://example.com/wp\"}"
echo

bold "3) Productora2 y Productora3 votan SI"
api_post /proposals/$PROP/vote -H 'X-Acting-As: productora2' -d '{"choice":true}'
api_post /proposals/$PROP/vote -H 'X-Acting-As: productora3' -d '{"choice":true}'

bold "4) Esperar a que pase votingEnd (30s) y cerrar"
sleep 32
api_post /proposals/$PROP/close

bold "5) Estado tras cierre (esperado APPROVED 2/0)"
api_get /proposals/$PROP | jq '{id, status, yesVotes, noVotes}'

bold "6) Materializar el bono"
api_post /admin/proposals/$PROP/materialize

bold "7) Onboard 2 inversores (KYC + allowlist on-chain)"
JUAN=$(curl -fsS -X POST "$BACKEND/investors/onboard" -H 'content-type: application/json' \
  -d '{"email":"juan@cine.com","fullName":"Juan Cinéfilo","documentId":"12345678Z"}' | jq -r .investorId)
MARIA=$(curl -fsS -X POST "$BACKEND/investors/onboard" -H 'content-type: application/json' \
  -d '{"email":"maria@cine.com","fullName":"María Cinéfila","documentId":"87654321X"}' | jq -r .investorId)
echo "Juan: $JUAN"
echo "Maria: $MARIA"

bold "8) Juan compra 100 en primario"
api_post /bonds/$PROP/purchase -d "{\"investorId\":\"$JUAN\",\"amount\":\"100\"}"

bold "9) Juan publica orden 30@12€ en secundario"
ORDER_ID=$(curl -fsS -X POST "$BACKEND/orders" -H 'content-type: application/json' \
  -d "{\"bondId\":\"$PROP\",\"sellerInvestorId\":\"$JUAN\",\"amount\":30,\"pricePerParticipationCents\":1200}" | jq -r .id)
echo "Orden: $ORDER_ID"

bold "10) María acepta la orden"
api_post /orders/$ORDER_ID/fill -d "{\"buyerInvestorId\":\"$MARIA\"}"

bold "11) Balances finales"
echo "Juan:  $(api_get /bonds/$PROP/balance/$JUAN  | jq -r .balance) participaciones"
echo "Maria: $(api_get /bonds/$PROP/balance/$MARIA | jq -r .balance) participaciones"

bold "OK — smoke test completo end-to-end"
