#!/usr/bin/env bash
# network.sh — gestiona la red Fabric local del proyecto.
# Subcomandos: up | down | createChannel | deployCC <name> <path> | reset
#
# Requisitos previos: ejecutar scripts/install-fabric.sh una vez.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NETWORK_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
export PATH="$NETWORK_DIR/bin:$PATH"
export FABRIC_CFG_PATH="$NETWORK_DIR/configtx"

CHANNEL_NAME="productoras"

org_env() {
  local org="$1"
  case "$org" in
    asociacion)
      export CORE_PEER_LOCALMSPID="AsociacionMSP"
      export CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/asociacion.productoras.local/peers/peer0.asociacion.productoras.local/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/asociacion.productoras.local/users/Admin@asociacion.productoras.local/msp"
      export CORE_PEER_ADDRESS="localhost:7051"
      ;;
    productora1)
      export CORE_PEER_LOCALMSPID="Productora1MSP"
      export CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/productora1.productoras.local/peers/peer0.productora1.productoras.local/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/productora1.productoras.local/users/Admin@productora1.productoras.local/msp"
      export CORE_PEER_ADDRESS="localhost:8051"
      ;;
    productora2)
      export CORE_PEER_LOCALMSPID="Productora2MSP"
      export CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/productora2.productoras.local/peers/peer0.productora2.productoras.local/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/productora2.productoras.local/users/Admin@productora2.productoras.local/msp"
      export CORE_PEER_ADDRESS="localhost:9051"
      ;;
    productora3)
      export CORE_PEER_LOCALMSPID="Productora3MSP"
      export CORE_PEER_TLS_ROOTCERT_FILE="$NETWORK_DIR/organizations/peerOrganizations/productora3.productoras.local/peers/peer0.productora3.productoras.local/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="$NETWORK_DIR/organizations/peerOrganizations/productora3.productoras.local/users/Admin@productora3.productoras.local/msp"
      export CORE_PEER_ADDRESS="localhost:10051"
      ;;
    *) echo "org desconocido: $org" >&2; exit 1 ;;
  esac
  export CORE_PEER_TLS_ENABLED=true
}

cmd_crypto() {
  rm -rf "$NETWORK_DIR/organizations"
  mkdir -p "$NETWORK_DIR/organizations"
  for f in "$NETWORK_DIR/cryptogen"/crypto-config-*.yaml; do
    cryptogen generate --config="$f" --output="$NETWORK_DIR/organizations"
  done
}

cmd_genesis() {
  mkdir -p "$NETWORK_DIR/channel-artifacts"
  configtxgen \
    -profile ProductorasChannel \
    -outputBlock "$NETWORK_DIR/channel-artifacts/${CHANNEL_NAME}.block" \
    -channelID "$CHANNEL_NAME"
}

cmd_up() {
  cmd_crypto
  cmd_genesis
  docker compose -f "$NETWORK_DIR/compose/docker-compose.yaml" up -d
  echo "Esperando 5s a que orderer y peers arranquen..."
  sleep 5
}

cmd_down() {
  docker compose -f "$NETWORK_DIR/compose/docker-compose.yaml" down -v
}

cmd_reset() {
  cmd_down
  rm -rf "$NETWORK_DIR/organizations" "$NETWORK_DIR/channel-artifacts"
}

cmd_create_channel() {
  org_env asociacion
  osnadmin channel join \
    --channelID "$CHANNEL_NAME" \
    --config-block "$NETWORK_DIR/channel-artifacts/${CHANNEL_NAME}.block" \
    -o localhost:7053 \
    --ca-file "$NETWORK_DIR/organizations/ordererOrganizations/productoras.local/orderers/orderer.productoras.local/tls/server.crt" \
    --client-cert "$NETWORK_DIR/organizations/ordererOrganizations/productoras.local/users/Admin@productoras.local/tls/client.crt" \
    --client-key "$NETWORK_DIR/organizations/ordererOrganizations/productoras.local/users/Admin@productoras.local/tls/client.key"

  for org in asociacion productora1 productora2 productora3; do
    org_env "$org"
    peer channel join -b "$NETWORK_DIR/channel-artifacts/${CHANNEL_NAME}.block"
  done
}

# Despliega un chaincode con la política de endorsement por defecto (mayoría simple
# del comité del canal). Para producción ajustar --signature-policy por chaincode.
cmd_deploy_cc() {
  local name="${1:?chaincode name}"
  local src="${2:?chaincode source dir}"
  local version="${3:-1.0}"
  local seq="${4:-1}"

  local pkg="$NETWORK_DIR/channel-artifacts/${name}.tar.gz"
  peer lifecycle chaincode package "$pkg" --path "$src" --lang golang --label "${name}_${version}"

  local pkg_id=""
  for org in asociacion productora1 productora2 productora3; do
    org_env "$org"
    peer lifecycle chaincode install "$pkg"
    if [ -z "$pkg_id" ]; then
      pkg_id=$(peer lifecycle chaincode queryinstalled --output json | jq -r ".installed_chaincodes[] | select(.label==\"${name}_${version}\") | .package_id")
    fi
    peer lifecycle chaincode approveformyorg \
      -o localhost:7050 --ordererTLSHostnameOverride orderer.productoras.local \
      --tls --cafile "$NETWORK_DIR/organizations/ordererOrganizations/productoras.local/orderers/orderer.productoras.local/tls/server.crt" \
      --channelID "$CHANNEL_NAME" --name "$name" --version "$version" --sequence "$seq" \
      --package-id "$pkg_id"
  done

  org_env asociacion
  peer lifecycle chaincode commit \
    -o localhost:7050 --ordererTLSHostnameOverride orderer.productoras.local \
    --tls --cafile "$NETWORK_DIR/organizations/ordererOrganizations/productoras.local/orderers/orderer.productoras.local/tls/server.crt" \
    --channelID "$CHANNEL_NAME" --name "$name" --version "$version" --sequence "$seq" \
    --peerAddresses localhost:7051  --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/asociacion.productoras.local/peers/peer0.asociacion.productoras.local/tls/ca.crt" \
    --peerAddresses localhost:8051  --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/productora1.productoras.local/peers/peer0.productora1.productoras.local/tls/ca.crt" \
    --peerAddresses localhost:9051  --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/productora2.productoras.local/peers/peer0.productora2.productoras.local/tls/ca.crt" \
    --peerAddresses localhost:10051 --tlsRootCertFiles "$NETWORK_DIR/organizations/peerOrganizations/productora3.productoras.local/peers/peer0.productora3.productoras.local/tls/ca.crt"
}

case "${1:-}" in
  up)            cmd_up ;;
  down)          cmd_down ;;
  reset)         cmd_reset ;;
  createChannel) cmd_create_channel ;;
  deployCC)      shift; cmd_deploy_cc "$@" ;;
  *)
    cat <<EOF
uso: $0 <comando>
  up                        Genera material crypto, genesis y arranca contenedores
  down                      Para los contenedores y borra volumenes
  reset                     down + borra organizations/ y channel-artifacts/
  createChannel             Crea el canal 'productoras' y une los peers
  deployCC <name> <path>    Empaqueta, instala, aprueba y commitea un chaincode
                            ej: deployCC governance ../chaincodes/governance
EOF
    exit 1
    ;;
esac
