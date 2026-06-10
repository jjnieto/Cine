# Sourceable: define helpers para invocar peer CLI con la identidad del Admin de cada org.
# Uso: source scripts/_peer-env.sh && peer_env asociacion && peer_invoke governance Init

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
PEER_BIN="$REPO_DIR/network/bin/peer"
ORD_HOST="orderer.productoras.local"
ORD_ENDPOINT="localhost:7050"
ORD_CA="$REPO_DIR/network/organizations/ordererOrganizations/productoras.local/orderers/orderer.productoras.local/tls/server.crt"
CHANNEL="productoras"

# Paths a TLS root cert por org, para construir --peerAddresses en endorsements.
PEER_TLS_ASO="$REPO_DIR/network/organizations/peerOrganizations/asociacion.productoras.local/peers/peer0.asociacion.productoras.local/tls/ca.crt"
PEER_TLS_P1="$REPO_DIR/network/organizations/peerOrganizations/productora1.productoras.local/peers/peer0.productora1.productoras.local/tls/ca.crt"
PEER_TLS_P2="$REPO_DIR/network/organizations/peerOrganizations/productora2.productoras.local/peers/peer0.productora2.productoras.local/tls/ca.crt"
PEER_TLS_P3="$REPO_DIR/network/organizations/peerOrganizations/productora3.productoras.local/peers/peer0.productora3.productoras.local/tls/ca.crt"

# Banderas --peerAddresses para las 4 orgs. Necesario para endorsement MAJORITY (3 de 4).
ALL_PEERS="--peerAddresses localhost:7051  --tlsRootCertFiles $PEER_TLS_ASO \
           --peerAddresses localhost:8051  --tlsRootCertFiles $PEER_TLS_P1 \
           --peerAddresses localhost:9051  --tlsRootCertFiles $PEER_TLS_P2 \
           --peerAddresses localhost:10051 --tlsRootCertFiles $PEER_TLS_P3"

# Setea las env vars del peer CLI para actuar como Admin de la org dada.
peer_env() {
  local org="$1"
  export FABRIC_CFG_PATH="$REPO_DIR/network/config"
  export CORE_PEER_TLS_ENABLED=true
  case "$org" in
    asociacion)
      export CORE_PEER_LOCALMSPID=AsociacionMSP
      export CORE_PEER_TLS_ROOTCERT_FILE="$PEER_TLS_ASO"
      export CORE_PEER_MSPCONFIGPATH="$REPO_DIR/network/organizations/peerOrganizations/asociacion.productoras.local/users/Admin@asociacion.productoras.local/msp"
      export CORE_PEER_ADDRESS=localhost:7051 ;;
    productora1)
      export CORE_PEER_LOCALMSPID=Productora1MSP
      export CORE_PEER_TLS_ROOTCERT_FILE="$PEER_TLS_P1"
      export CORE_PEER_MSPCONFIGPATH="$REPO_DIR/network/organizations/peerOrganizations/productora1.productoras.local/users/Admin@productora1.productoras.local/msp"
      export CORE_PEER_ADDRESS=localhost:8051 ;;
    productora2)
      export CORE_PEER_LOCALMSPID=Productora2MSP
      export CORE_PEER_TLS_ROOTCERT_FILE="$PEER_TLS_P2"
      export CORE_PEER_MSPCONFIGPATH="$REPO_DIR/network/organizations/peerOrganizations/productora2.productoras.local/users/Admin@productora2.productoras.local/msp"
      export CORE_PEER_ADDRESS=localhost:9051 ;;
    productora3)
      export CORE_PEER_LOCALMSPID=Productora3MSP
      export CORE_PEER_TLS_ROOTCERT_FILE="$PEER_TLS_P3"
      export CORE_PEER_MSPCONFIGPATH="$REPO_DIR/network/organizations/peerOrganizations/productora3.productoras.local/users/Admin@productora3.productoras.local/msp"
      export CORE_PEER_ADDRESS=localhost:10051 ;;
    *) echo "peer_env: org desconocido '$org'" >&2; return 1 ;;
  esac
}

# Invoca un método (con endorsement de las 4 orgs).
# uso: peer_invoke <chaincode> <function> [arg1 arg2 ...]
peer_invoke() {
  local cc="$1"; shift
  local fn="$1"; shift
  local args_json
  args_json=$(printf ',"%s"' "$@")
  "$PEER_BIN" chaincode invoke \
    -o "$ORD_ENDPOINT" --ordererTLSHostnameOverride "$ORD_HOST" \
    --tls --cafile "$ORD_CA" \
    --channelID "$CHANNEL" --name "$cc" \
    $ALL_PEERS \
    -c "{\"function\":\"$fn\",\"Args\":[${args_json#,}]}" \
    --waitForEvent
}

# Query (evaluación, sin orderer).
# uso: peer_query <chaincode> <function> [arg1 arg2 ...]
peer_query() {
  local cc="$1"; shift
  local fn="$1"; shift
  local args_json
  args_json=$(printf ',"%s"' "$@")
  "$PEER_BIN" chaincode query \
    -C "$CHANNEL" -n "$cc" \
    -c "{\"function\":\"$fn\",\"Args\":[${args_json#,}]}"
}
