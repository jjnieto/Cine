# Productoras / Cine

Plataforma sobre **Hyperledger Fabric** para que una asociación de productoras de cine financie películas mediante **bonos tokenizados** dirigidos a inversores cinéfilos. Las productoras del censo proponen y votan emisiones; al aprobarse, el bono se tokeniza en participaciones fungibles que los inversores —tras KYC— pueden comprar y transferir entre sí. Cupones e intereses se liquidan por SEPA off-chain con confirmación on-chain.

> **Estado:** esqueleto funcional verificado end-to-end. Red Fabric local + 3 chaincodes Go + backend Node/TS + frontend React. El flujo `crear propuesta → votar → consultar` se prueba en menos de 5 minutos siguiendo el [Quick start](#quick-start). Hay piezas marcadas como stub (HSM, KYC, listener `ProposalApproved → CreateBond`, autenticación) — ver [Estado real](#estado-real).

## Flujo de negocio

```
1. Una productora del censo propone una emisión:
     película · principal · cupón · nº participaciones · plazo · whitepaper.
2. El resto de productoras vota durante 7 días.
3. Quórum ≥ 33% del censo + mayoría simple. Empate NO aprueba.
4. Si pasa: el bono se tokeniza (1 participación = 1 token fungible).
5. Inversores con KYC compran participaciones (Mint).
6. Mercado secundario: transferencia libre entre inversores allowlisted.
7. Cupones programados → obligaciones de pago on-chain → SEPA off-chain
   → oráculo confirma con hash de referencia bancaria.
8. Vencimiento: amortización contra el saldo de cada tenedor.
```

## Quick start

Probado en **Ubuntu 24.04**. Asume que tienes `git`, `curl`, `bash` y permisos de sudo o pertenencia al grupo `docker`.

### 1. Requisitos del sistema

```bash
# Comprueba versiones (todas deben aparecer):
go version        # ≥ 1.22
node --version    # ≥ 18  (la app avisa si no es 20+, pero arranca)
docker --version  # cualquiera moderna
jq --version      # 1.6+

# Y que tu usuario pertenezca al grupo docker:
groups | tr ' ' '\n' | grep -x docker || echo "FALTA: añadirte al grupo docker"
```

Si no estás en el grupo `docker`, o quieres una sesión limpia, prefija los comandos `docker`/`network.sh` con `sg docker -c '…'`. Es lo que hacen los ejemplos de este README porque es lo más reproducible.

### 2. Clonar y descargar Fabric

```bash
git clone https://github.com/jjnieto/Cine.git
cd Cine

# Descarga binarios (peer, configtxgen, cryptogen…) e imágenes Docker
# de Hyperledger Fabric 2.5. Una sola vez; ~500MB.
./network/scripts/install-fabric.sh
```

### 3. Levantar la red

```bash
sg docker -c "./network/scripts/network.sh up"
sg docker -c "./network/scripts/network.sh createChannel"
```

Esto:
- Genera material crypto (cryptogen) para 4 orgs: `Asociacion`, `Productora1`, `Productora2`, `Productora3`, más `Orderer`.
- Arranca 1 orderer Raft + 4 peers vía `docker compose`.
- Crea el canal `productoras` y une los 4 peers.

Verifica:
```bash
sg docker -c "docker ps --format 'table {{.Names}}\t{{.Status}}'"
# Deberías ver 5 contenedores Up.
```

### 4. Desplegar los 3 chaincodes

```bash
# Vendor de dependencias Go (necesario antes del primer deploy)
for cc in governance bond-issuance bond-lifecycle; do
  (cd chaincodes/$cc && go mod tidy && go mod vendor)
done

# Deploy (package + install en 4 peers + 4 approves + commit)
sg docker -c "./network/scripts/network.sh deployCC governance     ./chaincodes/governance"
sg docker -c "./network/scripts/network.sh deployCC bond-issuance  ./chaincodes/bond-issuance"
sg docker -c "./network/scripts/network.sh deployCC bond-lifecycle ./chaincodes/bond-lifecycle"
```

Cada `deployCC` tarda ~1-2 min la primera vez (compila el chaincode en el builder del peer).

### 5. Arrancar el backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev    # tsx watch — recarga al editar
# → "backend listening on :3000"
```

Y opcionalmente el frontend:
```bash
cd ../frontend
npm install
npm run dev    # vite → http://localhost:5173
```

### 6. Smoke test end-to-end (1 comando)

Con el backend corriendo, ejecuta el script empaquetado. Cubre el flujo completo:

```bash
./scripts/smoke-test.sh
```

Hace, en orden:
1. Asegura el censo con `Productora1/2/3MSP`.
2. Baja la duración de votación a **30 segundos** para que la demo sea ágil (`SetParams`).
3. `Productora1` crea una propuesta.
4. `Productora2` y `Productora3` votan SÍ.
5. Tras 30 s, cierra la votación → `APPROVED`.
6. Materializa el bono (`CreateBond`).
7. KYC + alta de **Juan** y **María**.
8. Juan compra 100 participaciones en **primario** (`Mint`).
9. Juan publica una orden de 30 participaciones a 12 €/u en el **secundario**.
10. María acepta la orden → `Transfer` on-chain.
11. Balances finales: Juan 70, María 30.

Los errores del chaincode aparecen en la respuesta del backend con el mensaje real:
```json
{ "error": "10 ABORTED: failed to endorse transaction, …",
  "chaincode": ["caller AsociacionMSP already voted on PROP-001"] }
```

### 7. La UI

```bash
cd frontend && npm install && npm run dev  # http://localhost:5173
```

Tres vistas, todas con un **selector "Actuando como"** en la cabecera (Asociación / Productora 1-3):

- **`/productoras`** — la productora activa crea propuestas (formulario) y vota Sí/No en las de otras. Las propuestas propias se separan en su sección.
- **`/inversores`** — KYC de nuevos inversores, selector del inversor activo, tres subvistas:
  - *Marketplace primario*: tarjetas de bonos activos con `Disponibles = numParticipations - totalSupply`. Botón **Comprar** → mintea contra el inversor.
  - *Mi cartera*: tabla de balances por bono. Botón **Vender en secundario** crea una orden.
  - *Mercado secundario*: órdenes abiertas. Aceptar una ejecuta `Transfer` on-chain.
- **`/admin`** — visible para Asociación: gestiona el censo, cierra propuestas vencidas, materializa propuestas APROBADAS en bonos, lista de inversores y operaciones avanzadas (`Init`, ajustar `quorumBps` / `votingDurationS`).

## Estado real

### Lo que está implementado y verificado end-to-end

- **Red Fabric 2.5** local con 4 orgs peer + 1 org orderer (Raft 1-nodo). `network.sh up/down/reset/createChannel/deployCC` idempotente.
- **3 chaincodes Go** desplegados en un único canal:
  - **`governance`** — censo de productoras, propuestas, votación (1 productora = 1 voto, quórum 33%, mayoría simple, empate no aprueba, ventana 7 días). Emite `ProposalApproved`/`ProposalRejected`.
  - **`bond-issuance`** — emisión de bonos, tokenización fungible (1 participación = 1 token), allowlist KYC, balances, transferencias. Importes en céntimos `int64`. Identidad del inversor por atributo de cert `investorId`.
  - **`bond-lifecycle`** — calendario de cupones, obligaciones de pago, confirmación con hash de referencia SEPA, marcado de impagos.
- **Backend Express + TypeScript** con rutas REST que invocan los chaincodes vía `@hyperledger/fabric-gateway`:
  - Identity pool: un Gateway por org (Asociación + 3 productoras). Header `X-Acting-As` selecciona la identidad activa.
  - `/proposals`, `/proposals/:id/vote|close`
  - `/admin/productoras` (alta/baja censo), `/admin/proposals/:id/materialize`, `/admin/params` (quórum y duración votación)
  - `/investors/onboard`, `/investors`
  - `/bonds`, `/bonds/:id/purchase` (primario simulado), `/bonds/:id/holders|balance/:investorId`
  - `/orders` (CRUD orderbook secundario off-chain) → `/orders/:id/fill` ejecuta `Transfer` on-chain
  - `/portfolio/:investorId`
  - `/payments/schedule-coupon|confirm` (sólo backend, sin UI todavía)
  - Middleware que propaga el mensaje real del chaincode en la respuesta JSON.
- **Frontend React + Vite + Tailwind** con tres vistas funcionales:
  - `/productoras`: crear propuestas y votar como la productora seleccionada.
  - `/inversores`: KYC, primario, cartera, secundario.
  - `/admin`: gestión del censo, cierre y materialización de propuestas, ajuste de parámetros.
- **Verificación end-to-end** con `scripts/smoke-test.sh`: censo → propuesta → votos → cierre → materializar → primario → secundario.

### Lo que es stub o falta

| Componente | Estado | Dónde |
|---|---|---|
| HSM real (firma por inversor) | Stub que tira `Error` si se invoca | `backend/src/identity/hsm.ts` |
| Proveedor KYC | Mock: hashea el `documentId` | `backend/src/identity/kyc.ts` |
| Pool de identidades por inversor | El backend usa el admin de `AsociacionMSP` por inversor (custodia Modelo A); las productoras sí tienen su propio gateway | `backend/src/fabric/gateway.ts` |
| Listener `ProposalApproved → CreateBond` automático | Hay endpoint `/admin/proposals/:id/materialize` manual; no hay watcher de eventos | `backend/src/routes/admin.ts` |
| Autenticación en el backend | Ninguna (la UI tiene "actuar como" sin credenciales) | — |
| Pago SEPA | El endpoint `/bonds/:id/purchase` mintea directamente; en producción sería un webhook bancario | `backend/src/routes/bonds.ts` |
| Tests unitarios | Ninguno en ningún sitio | — |
| Endorsement policies estrictas | Se usa la default `MAJORITY` del canal. Para chaincodes que mueven dinero conviene `--signature-policy` por chaincode | `network/scripts/network.sh` |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                  Inversores (cinéfilos)                         │
│            web (React) — login email/contraseña                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/JSON
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Node.js (Asociación)                                   │
│  ├─ KYC stub  ──► proveedor externo (Onfido/Veriff)             │
│  ├─ HSM       ── claves de inversores (custodia Modelo A)       │
│  └─ Fabric Gateway (gRPC)                                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    ▼                         ▼                         ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ peer0        │       │ peer0        │       │ peer0        │
│ Asociacion   │◄─────►│ Productora1  │◄─────►│ Productora2/3│
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       └──────────────────────┴──────────────────────┘
                              ▼
                      ┌───────────────┐
                      │ Orderer Raft  │
                      └───────────────┘

Canal: "productoras"
Chaincodes: governance ─ bond-issuance ─ bond-lifecycle
```

Diagrama detallado del flujo completo (propuesta → emisión → cupón → amortización) y tabla de identidades MSP en [`docs/architecture.md`](./docs/architecture.md).

### Identidades

| Caller              | MSP                | Atributos cert                     | Puede invocar                                                |
|---------------------|--------------------|------------------------------------|--------------------------------------------------------------|
| Productora          | `Productora{N}MSP` | —                                  | `governance.{CreateProposal,CastVote,CloseProposal}`         |
| Admin asociación    | `AsociacionMSP`    | —                                  | `governance.{Add,Remove}Productora`, `issuance.CreateBond/Mint` |
| Oficial KYC         | `AsociacionMSP`    | `role=kyc.officer`                 | `issuance.{AllowInvestor,RevokeInvestor}`                    |
| Oráculo pagos       | `AsociacionMSP`    | `role=payments.oracle`             | `lifecycle.{ConfirmPayment,MarkDefault}`                     |
| Inversor            | `AsociacionMSP`    | `role=investor`, `investorId=hash` | `issuance.Transfer`                                          |

## Estructura del repo

```
chaincodes/
├── governance/           Go — propuestas, votación, censo, parámetros
├── bond-issuance/        Go — tokenización, allowlist, balances, transferencias (modo custodial)
└── bond-lifecycle/       Go — cupones, pagos, amortización
network/
├── cryptogen/            Configs cryptogen por org
├── configtx/             configtx.yaml del canal y orgs
├── compose/              docker-compose.yaml + peer-base.yaml
└── scripts/
    ├── install-fabric.sh Descarga binarios e imágenes Fabric
    └── network.sh        up | down | reset | createChannel | deployCC
backend/
├── src/
│   ├── fabric/           gateway.ts (pool por identidad), contracts.ts (wrappers tipados)
│   ├── middleware/       actor.ts (lee X-Acting-As)
│   ├── routes/           proposals · bonds · investors · admin · orders · portfolio · payments
│   ├── store/            investors.ts y orders.ts (persistencia JSON)
│   ├── identity/         hsm.ts (stub), kyc.ts (mock)
│   └── index.ts          Express + middleware de errores
└── package.json
frontend/
├── src/
│   ├── App.tsx           Routing y layout
│   ├── components/Layout.tsx   topbar con selector "Actuando como"
│   ├── state/ActorContext.tsx  identidad Fabric + inversor activo
│   ├── api/client.ts     fetch (inyecta header X-Acting-As)
│   ├── lib/format.ts     helpers eur/bps/dateFmt/timeUntil
│   └── pages/            Productoras · Inversores · Admin
├── tailwind.config.js
└── package.json
scripts/
├── smoke-test.sh         Flujo completo end-to-end (gobierno + primario + secundario)
├── add-productora.sh     Atajo para AddProductora (admin)
└── _peer-env.sh          Helpers para invocar peer CLI con identidad de una org
docs/
└── architecture.md       Diagrama detallado + matriz de identidades
CLAUDE.md                 Guía para Claude Code (ver decisiones de diseño)
```

## Comandos del día a día

```bash
# Reiniciar la red en limpio
sg docker -c "./network/scripts/network.sh reset"
sg docker -c "./network/scripts/network.sh up"
sg docker -c "./network/scripts/network.sh createChannel"

# Redesplegar un chaincode tras cambios (incrementa la SEQUENCIA al menos)
sg docker -c "./network/scripts/network.sh deployCC governance ./chaincodes/governance 1.0 2"

# Type-check
(cd backend  && npm run typecheck)
(cd frontend && npm run typecheck)

# Compilar chaincodes locales (sanity check antes de desplegar)
for cc in governance bond-issuance bond-lifecycle; do
  (cd chaincodes/$cc && go build ./...)
done

# Logs de un peer
sg docker -c "docker logs -f peer0.asociacion.productoras.local"

# Invocar un chaincode con peer CLI (necesita las 4 firmas para el endorsement MAJORITY)
./scripts/add-productora.sh AsociacionMSP   # ejemplo
```

## Decisiones de diseño relevantes

Resumen — explicación completa y rationale en [`CLAUDE.md`](./CLAUDE.md).

- **Una org peer estable por productora "operadora"** (asociación + 3 productoras grandes). La "rotación de 3 productoras" del enunciado original es **lógica** (un comité on-chain en `governance`), **no física** en `configtx`.
- **Tres chaincodes** en lugar de uno solo: endorsement policies y versionado independientes; `governance` cambia de reglas sin tocar el libro de tenedores; `bond-lifecycle` evoluciona más rápido y se aísla.
- **Custodia centralizada** (Modelo A): la asociación es CASP custodio bajo MiCA — UX más cómoda para el inversor (login email/contraseña), a cambio de carga regulatoria. Las claves van en HSM.
- **Pagos off-chain (SEPA)** con confirmación on-chain por oráculo. El chaincode guarda el hash de la referencia bancaria, nunca datos sensibles.
- **Importes en céntimos** `int64`. Nunca floats. `principalCents` debe ser divisible por `numParticipations`.
- **Timestamps deterministas**: `ctx.GetStub().GetTxTimestamp()`, nunca `time.Now()` — el chaincode debe ser determinista entre peers.

## Roadmap

Lo siguiente, en orden sensato:

1. **Tests de chaincode** (Go) — empezando por `governance` que es el más determinista.
2. **Listener `ProposalApproved → bond-issuance.CreateBond`** automático en el backend.
3. **Pool de identidades por inversor** en el backend con firma vía HSM/PKCS#11.
4. **Autenticación en el backend** (sesiones o JWT) acoplada al onboarding KYC.
5. **Formularios reales en el frontend** y consumo de eventos del chaincode (push).
6. **Endorsement policy por chaincode** (`--signature-policy` estricta para `bond-issuance`).
7. **Migrar a CouchDB** como state DB si necesitamos queries ricas (rich queries).

## Licencia

Sin definir todavía. Repo público para desarrollo; no usar en producción sin auditoría legal (CASP MiCA) y técnica (smart-contract audit, pentest del backend, integración HSM real).
