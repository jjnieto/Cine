# Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Inversores (cinéfilos)                        │
│                   ── web (React) ── login email/pass                │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ HTTP/JSON
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Backend Node.js (Asociación)                                       │
│  ├─ KYC stub  ──► proveedor externo (Onfido/Veriff)                 │
│  ├─ HSM       ── claves de inversores (Modelo A custodia)           │
│  └─ Fabric Gateway (gRPC)                                           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌────────────────┐       ┌────────────────┐       ┌────────────────┐
│ peer0          │       │ peer0          │       │ peer0          │
│ Asociacion     │◄──────│ Productora1    │──────►│ Productora2/3  │
│ (Asociacion-   │       │ (Productora1-  │       │                │
│  MSP)          │       │  MSP)          │       │                │
└───────┬────────┘       └───────┬────────┘       └───────┬────────┘
        └────────────────────────┴────────────────────────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │ Orderer Raft  │
                          │ (OrdererMSP)  │
                          └───────────────┘

Canal: "productoras"
Chaincodes:  governance ── bond-issuance ── bond-lifecycle
              (mismo canal, sin private data; el estado de cada uno está aislado por chaincode)
```

## Flujo de una emisión completa

```
Productora1 ──CreateProposal──► governance
                                   │
                       (7 días de votación)
                                   │
otras productoras ──CastVote──► governance
                                   │
cualquiera ──CloseProposal──► governance
                                   │
                            Evento: ProposalApproved
                                   │
backend (listener) ──CreateBond──► bond-issuance
                                   │
inversor con KYC ──compra(SEPA)──► backend ──Mint──► bond-issuance
                                                       │
                                              (token en su cuenta)
                                                       │
                              ┌────────────────────────┴────────────┐
                              │                                     │
            cron asociación ──ScheduleCoupon──► bond-lifecycle      │
                                                       │            │
                                              Evento: PaymentDue    │
                                                       │            │
                              pasarela SEPA paga ──ConfirmPayment──►│
                                                       │            │
                                              Evento: PaymentConfirmed
                                                                    │
                                                                    │
                                  (a vencimiento, amortización)     │
                                                                    │
                                                inversor ──Transfer──┘
                                                  ↕ (mercado secundario)
                                                otro inversor
```

## Identidades y atributos de certificado

| Caller              | MSP             | Atributos cert      | Puede invocar                                                |
|---------------------|-----------------|---------------------|--------------------------------------------------------------|
| Productora          | Productora{N}MSP| -                   | governance.{CreateProposal,CastVote,CloseProposal}           |
| Admin asociación    | AsociacionMSP   | -                   | governance.{Add,Remove}Productora, issuance.CreateBond, Mint |
| Oficial KYC         | AsociacionMSP   | role=kyc.officer    | issuance.{AllowInvestor,RevokeInvestor}                      |
| Oráculo pagos       | AsociacionMSP   | role=payments.oracle| lifecycle.{ConfirmPayment,MarkDefault}                       |
| Inversor            | AsociacionMSP   | role=investor, investorId=<hash> | issuance.Transfer                                |
