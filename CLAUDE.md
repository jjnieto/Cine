# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Plataforma para que una **asociación de productoras de cine** financie películas mediante **bonos tokenizados** sobre Hyperledger Fabric.

Flujo principal:
1. Una productora del censo propone una emisión (película, principal, cupón, nº de participaciones, plazo, whitepaper).
2. El resto de productoras vota durante 7 días.
3. Si pasa quórum 33% + mayoría simple, el bono se tokeniza (1 participación = 1 token fungible).
4. Inversores con KYC compran participaciones; pueden transferirlas entre sí (mercado secundario interno).
5. Cupones e intereses se pagan por SEPA off-chain con confirmación on-chain.

## Estructura del repo

- `chaincodes/` — Tres chaincodes Go independientes desplegados en el mismo canal.
  - `governance/` — Censo de productoras, propuestas, votación. Emite `ProposalApproved`/`ProposalRejected`.
  - `bond-issuance/` — Tokenización, allowlist KYC, balances, transferencias. Patrón ERC-20-like adaptado.
  - `bond-lifecycle/` — Calendario de cupones, obligaciones de pago, confirmación SEPA, amortización.
- `network/` — Red Fabric local de desarrollo (4 orgs: Asociacion + Productora1/2/3, 1 orderer Raft).
- `backend/` — API REST Node.js + TypeScript que habla con la red via `@hyperledger/fabric-gateway`.
- `frontend/` — SPA React + Vite (placeholder).

## Comandos

### Primer arranque

```bash
# 1. Descargar binarios e imágenes de Fabric (~500MB, una sola vez)
./network/scripts/install-fabric.sh

# 2. Levantar red, crear canal y desplegar los 3 chaincodes
cd network
./scripts/network.sh up
./scripts/network.sh createChannel
./scripts/network.sh deployCC governance     ../chaincodes/governance
./scripts/network.sh deployCC bond-issuance  ../chaincodes/bond-issuance
./scripts/network.sh deployCC bond-lifecycle ../chaincodes/bond-lifecycle

# 3. Backend
cd ../backend && npm install && cp .env.example .env && npm run dev

# 4. Frontend (otra terminal)
cd ../frontend && npm install && npm run dev
```

### Día a día

```bash
# Reiniciar la red en limpio
./network/scripts/network.sh reset && ./network/scripts/network.sh up && ./network/scripts/network.sh createChannel

# Redesplegar un chaincode tras cambios (incrementa la secuencia)
./network/scripts/network.sh deployCC governance ../chaincodes/governance 1.0 2

# Type-check sin construir
(cd backend && npm run typecheck)
(cd frontend && npm run typecheck)

# Tests de chaincode (Go)
(cd chaincodes/governance && go test ./...)
```

## Decisiones clave (no obvias leyendo solo el código)

### Red
- **Una org peer estable por productora "operadora"** (asociación + 3 productoras grandes voluntarias). La "rotación de 3 productoras" del enunciado original es **lógica** (un comité on-chain en `governance`), **no física** — rotar orgs en `configtx` es operativamente caro y se evita salvo necesidad.
- Un solo canal: las productoras se ven los bonos entre sí (no es problema de privacidad para este negocio).

### Votación (en `governance`)
- Sólo **productoras del censo** votan. Una productora = un voto.
- **Quórum 33%**, mayoría simple. **Empate NO aprueba**.
- Duración fija: **7 días** (`VotingDurationS=604800`). Configurable via `GovernanceParams`.
- El cierre lo invoca cualquier productora tras el plazo; emite `ProposalApproved` y un listener en backend desencadena `bond-issuance.CreateBond`.

### Tokenización (en `bond-issuance`)
- 1 participación = 1 token fungible. Importes en **céntimos de euro** (`int64`), nunca floats.
- `principalCents` debe ser divisible exacto entre `numParticipations`.
- **Allowlist obligatoria** (KYC). Mint y Transfer fallan si origen/destino no están en la lista.
- Identidad del inversor: atributo `investorId` del cert x509 emitido por la CA tras KYC. El chaincode lee `ctx.GetClientIdentity().GetAttributeValue("investorId")`.

### Pagos (en `bond-lifecycle`)
- Dinero real va por **SEPA off-chain**; on-chain solo viven obligaciones y confirmaciones.
- `ScheduleCoupon` recibe el **snapshot de tenedores** como parámetro (calculado off-chain leyendo `bond-issuance`) en vez de hacer cross-chaincode invocation, porque Fabric no tiene "cron" propio.
- `ConfirmPayment` requiere atributo de cert `role=payments.oracle`. Guarda solo el **hash** de la referencia SEPA.

### Custodia (Modelo A — centralizada)
- La asociación es **CASP custodio bajo MiCA**. Requiere autorización formal antes de producción.
- Backend mantiene un pool de identidades Fabric (cert + key) en HSM. Cuando un inversor opera, el backend firma con su clave.
- `backend/src/identity/hsm.ts` es un stub; en producción usar PKCS#11 contra HSM real (CloudHSM, Luna…).

### Identidades MSP
- `OrdererMSP`: orderer Raft (dev: 1 nodo; prod: 3+ para HA).
- `AsociacionMSP`: opera el peer "ancla", el backend admin y el oráculo de pagos. Únicas operaciones admin: `AddProductora`, `RemoveProductora`, `CreateBond`, `Mint`, `ScheduleCoupon`.
- `Productora{1,2,3}MSP`: peers de las productoras del comité actual. Pueden invocar `CreateProposal`, `CastVote`, `CloseProposal`.
- Inversores: certs emitidos por la CA de Asociacion con atributos `role=investor` + `investorId=<hash>`.

## Cosas a saber antes de tocar código

- **Endorsement policy por defecto del canal**: mayoría simple de orgs (`MAJORITY Endorsement`). Para chaincodes que mueven dinero conviene una política más estricta vía `--signature-policy` en `deployCC`.
- **Timestamps deterministas**: usar `ctx.GetStub().GetTxTimestamp()`, nunca `time.Now()` — los peers tienen relojes distintos y el chaincode debe ser determinista.
- **Errores de chaincode**: devolver `error` desde el método; el SDK lo propaga al cliente con el mensaje. No usar `panic` excepto en `main.go`.
- **Re-deploys**: incrementar el `sequence` en cada cambio (`deployCC <name> <path> <version> <seq>`). Si solo cambia código, sube secuencia; si cambian endorsement/collections, sube versión.

## Lo que NO está terminado en este esqueleto

- Tests unitarios de los chaincodes (Go) — solo hay estructura.
- Implementación real del HSM (`backend/src/identity/hsm.ts` es stub).
- Implementación real del KYC (`backend/src/identity/kyc.ts` simula).
- El backend usa la identidad **admin de AsociacionMSP** para todo; aún no hay pool por inversor.
- Listener de eventos `ProposalApproved` → `CreateBond` automático.
- Frontend es esqueleto sin formularios reales.
- No hay autenticación en el backend.
- El `network.sh deployCC` requiere `jq` instalado.

## Stack

- Chaincodes: **Go 1.22** + `fabric-contract-api-go v2`.
- Backend: **Node 18+**, TypeScript ESM, Express, `@hyperledger/fabric-gateway`, zod.
- Frontend: **React 18** + Vite + React Router.
- Infra: **Hyperledger Fabric 2.5**, Docker Compose, Raft orderer.
