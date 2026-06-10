# Demo walkthrough

Guion paso a paso para probar la plataforma en local: arranque, las tres vistas (Asociación, Productoras, Inversores) y el ciclo completo **propuesta → votación → bono → mercado primario → mercado secundario**. Tiempo objetivo: **10–15 minutos**.

Si todavía no has arrancado nada, ve antes a [README §Quick start](./README.md#quick-start). Esta guía asume la red Fabric arriba, los 3 chaincodes desplegados, `backend` en `:3000` y `frontend` en `:5173`.

## 0. Reset opcional para empezar limpio

Si vienes de pruebas anteriores y prefieres ledger virgen:

```bash
sg docker -c "./network/scripts/network.sh reset"
sg docker -c "./network/scripts/network.sh up"
sg docker -c "./network/scripts/network.sh createChannel"
sg docker -c "./network/scripts/network.sh deployCC governance     ./chaincodes/governance"
sg docker -c "./network/scripts/network.sh deployCC bond-issuance  ./chaincodes/bond-issuance"
sg docker -c "./network/scripts/network.sh deployCC bond-lifecycle ./chaincodes/bond-lifecycle"
rm -rf backend/.data   # borra inversores y órdenes locales
```

Y arranca backend + frontend:
```bash
(cd backend  && npm run dev)    # :3000
(cd frontend && npm run dev)    # :5173
```

Abre **http://localhost:5173**. Verás el selector **Actuando como** en la barra superior; eso es lo que cambia la identidad Fabric en cada acción. La selección persiste en `localStorage`.

> Si quieres saltarte la UI y ver el ciclo completo en 30 segundos por API: `./scripts/smoke-test.sh`.

---

## 1. Asociación — bootstrap del sistema

**Actuar como: Asociación.** Ir a **/admin**.

| Paso | Qué hacer en la UI | Qué pasa por debajo |
|---|---|---|
| 1.1 | Sección *Censo de productoras* → "Añadir al censo": `Productora1MSP` | `governance.AddProductora` invocado como `AsociacionMSP` |
| 1.2 | Repetir con `Productora2MSP` y `Productora3MSP` | el censo final debe mostrar 3 chips |
| 1.3 | *Operaciones avanzadas* → ajusta **Duración votación** a `60` segundos para no esperar 7 días | `governance.SetParams(3300, 60)` |

Equivalente por API:
```bash
for msp in Productora1MSP Productora2MSP Productora3MSP; do
  curl -X POST http://localhost:3000/admin/productoras \
    -H content-type:application/json -d "{\"mspId\":\"$msp\"}"
done
curl -X POST http://localhost:3000/admin/params \
  -H content-type:application/json -d '{"quorumBps":3300,"votingDurationS":60}'
```

> **Si te aparece un banner rojo `governance already initialized`** al hacer "Init governance", ignóralo: es idempotente y solo se ejecuta una vez por red.

---

## 2. Productora 1 — proponer una emisión

**Cambia el selector a "Productora 1".** Ir a **/productoras**.

| Paso | UI | Detalle |
|---|---|---|
| 2.1 | Sección *Nueva propuesta* — rellenar y enviar | Pe. **El bono del cinéfilo** · principal `5000.00` € · cupón `7.00`% · plazo `12` meses · participaciones `500` |
| 2.2 | Aparece en *Mis propuestas* con estado `OPEN`, sí/no `0/0` y un *cierra en* contando hacia atrás | `governance.CreateProposal` firma como `Productora1MSP`. `principalCents` debe ser divisible exacto por `numParticipations` (el front lo valida) |

Equivalente por API:
```bash
curl -X POST http://localhost:3000/proposals \
  -H content-type:application/json -H 'X-Acting-As: productora1' \
  -d '{"id":"DEMO-1","filmTitle":"El bono del cinéfilo",
       "principalCents":"500000","couponBps":700,"termMonths":12,
       "numParticipations":"500",
       "whitepaperHash":"'$(printf 'a%.0s' {1..64})'",
       "whitepaperUrl":"https://example.com/wp"}'
```

---

## 3. Productoras 2 y 3 — votar

**Cambia el selector a "Productora 2".** Ir a **/productoras**.

| Paso | UI | Detalle |
|---|---|---|
| 3.1 | Sección *Propuestas abiertas de otros* → fila de DEMO-1 → click **Sí** | `governance.CastVote(true)` firmado por `Productora2MSP`. Sí/No pasan a `1/0`. Los botones quedan deshabilitados (`voted` cacheado en localStorage). |
| 3.2 | **Cambia a "Productora 3"** y vota **Sí** otra vez | Sí/No → `2/0`. Quórum cumplido (2 de 4 = 50% > 33%). |

Si pruebas a re-votar como Productora 2, el chaincode lo rechaza: verás un banner rojo con el mensaje real
`caller Productora2MSP already voted on DEMO-1`.

```bash
# por API:
for org in productora2 productora3; do
  curl -X POST http://localhost:3000/proposals/DEMO-1/vote \
    -H content-type:application/json -H "X-Acting-As: $org" \
    -d '{"choice":true}'
done
```

---

## 4. Cerrar y materializar — Asociación

**Selector a "Asociación".** Espera a que `votingEnd` pase (la duración que pusieras en 1.3, p. ej. 60 s).

| Paso | UI | Detalle |
|---|---|---|
| 4.1 | **/admin** → *Propuestas pendientes de cerrar* → click **Cerrar** | `governance.CloseProposal` evalúa quórum (2/4 ≥ 33% ✓), mayoría (2>0 ✓) y emite evento `ProposalApproved`. Pasa a `APPROVED`. |
| 4.2 | *Propuestas aprobadas sin materializar* → click **Materializar** | El backend lee la propuesta y llama a `bond-issuance.CreateBond` con sus mismos campos. Se crea el bono con `totalSupply=0`. |

```bash
curl -X POST http://localhost:3000/proposals/DEMO-1/close
curl -X POST http://localhost:3000/admin/proposals/DEMO-1/materialize
```

> El listener `ProposalApproved → CreateBond` automático **aún no existe**; este paso manual es el placeholder hasta que se implemente.

---

## 5. Inversores — KYC y compra primaria

**Selector a "Asociación"** (la asociación firma por cuenta de los inversores; custodia Modelo A). Ir a **/inversores**.

| Paso | UI | Detalle |
|---|---|---|
| 5.1 | *Inversor activo* → **+ Nuevo inversor (KYC)** → rellena "Juan Cinéfilo" / `juan@cine.com` / DNI `12345678Z` → **Hacer KYC + alta** | KYC stub + `bond-issuance.AllowInvestor(<hash(dni)>)`. El inversor queda en allowlist on-chain y persistido en `backend/.data/investors.json`. |
| 5.2 | Repite para "María Cinéfila" / `maria@cine.com` / DNI `87654321X` | 2 inversores en el sistema. |
| 5.3 | Selector de inversor activo → elige a **Juan** | Marketplace primario muestra la card del bono `El bono del cinéfilo` con `Disponibles: 500/500`. |
| 5.4 | En la card del bono → input `100` → click **Comprar** | `bond-issuance.Mint(bondId, juanId, 100)`. `totalSupply` pasa a 100, balance Juan = 100. |

```bash
JUAN=$(curl -sX POST http://localhost:3000/investors/onboard \
  -H content-type:application/json \
  -d '{"email":"juan@cine.com","fullName":"Juan","documentId":"12345678Z"}' \
  | jq -r .investorId)
MARIA=$(curl -sX POST http://localhost:3000/investors/onboard \
  -H content-type:application/json \
  -d '{"email":"maria@cine.com","fullName":"Maria","documentId":"87654321X"}' \
  | jq -r .investorId)
curl -X POST http://localhost:3000/bonds/DEMO-1/purchase \
  -H content-type:application/json \
  -d "{\"investorId\":\"$JUAN\",\"amount\":\"100\"}"
```

---

## 6. Mercado secundario — Juan vende, María compra

| Paso | UI | Detalle |
|---|---|---|
| 6.1 | Con **Juan** activo → pestaña **Mi cartera** → en la fila del bono → click **Vender en secundario…** | Aparece el formulario con cantidad=balance y precio=valor nominal. |
| 6.2 | Cambia cantidad a `30`, precio a `12.00` (€/participación) → **Publicar** | Backend persiste la orden en `backend/.data/orders.json`. Verifica que Juan tiene saldo suficiente. **No** hay transferencia on-chain todavía. |
| 6.3 | Cambia el inversor activo a **María** → pestaña **Mercado secundario** | Sección *Órdenes abiertas* muestra la de Juan con total `360 €`. |
| 6.4 | Click **Comprar** | `bond-issuance.Transfer(bondId, juanId, mariaId, 30)`. La orden pasa a `FILLED`. |
| 6.5 | Comprueba balances: María → cartera muestra `30`. Juan → cartera muestra `70`. | El chaincode resta de uno y suma al otro en una sola transacción atómica. |

```bash
ORDER=$(curl -sX POST http://localhost:3000/orders \
  -H content-type:application/json \
  -d "{\"bondId\":\"DEMO-1\",\"sellerInvestorId\":\"$JUAN\",
       \"amount\":30,\"pricePerParticipationCents\":1200}" | jq -r .id)
curl -X POST http://localhost:3000/orders/$ORDER/fill \
  -H content-type:application/json -d "{\"buyerInvestorId\":\"$MARIA\"}"
# balances:
curl http://localhost:3000/bonds/DEMO-1/balance/$JUAN
curl http://localhost:3000/bonds/DEMO-1/balance/$MARIA
```

---

## 7. Comprobaciones cruzadas

**/admin** ahora muestra:
- Censo con 3 productoras
- *Todas las propuestas*: DEMO-1 en `APPROVED 2/0`
- *Inversores onboardados*: Juan y María con su `investorId`

**Directo en el chaincode** (sin pasar por el backend):
```bash
./scripts/_peer-env.sh  # carga helpers
source scripts/_peer-env.sh && peer_env asociacion
peer_query governance   ListProductoras
peer_query bond-issuance GetHolders   DEMO-1
peer_query bond-issuance ListBonds
```

Salida esperada de `GetHolders`:
```
{"<juanId>":70,"<mariaId>":30}
```

---

## 8. Errores intencionados (para ver el manejo)

| Acción | Mensaje esperado (banner rojo en la UI / `chaincode` en el JSON) |
|---|---|
| Votar dos veces como la misma productora | `caller Productora2MSP already voted on DEMO-1` |
| Crear una propuesta como **Asociación** (no está en el censo lógico) | `caller AsociacionMSP is not a productora` (si lo quitas del censo; por defecto la propia asociación se queda fuera) |
| Mintar más participaciones de las que quedan | `mint would exceed numParticipations` |
| Aceptar tu propia orden de venta | `cannot buy your own order` |
| Vender más participaciones que tu balance | `insufficient balance: have N, want to sell M` |

---

## 9. Limpiar al final

```bash
# Para los servidores:
pkill -f "tsx watch"
pkill -f "vite"

# Para la red Fabric:
sg docker -c "./network/scripts/network.sh down"
```

> Si quieres conservar el ledger para retomar la demo después, ejecuta solo `down` (preserva volúmenes con los datos). `reset` borra todo.
