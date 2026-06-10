package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// LifecycleContract: cupones, pagos y amortización del bono.
// Genera obligaciones de pago como entradas on-chain y emite eventos PaymentDue.
// Un servicio externo (pasarela SEPA) las paga y reporta back con ConfirmPayment.
type LifecycleContract struct {
	contractapi.Contract
}

const (
	prefixPayment = "PAY" // PAY/<bondId>/<periodIdx>/<investorId>
)

// ScheduleCoupon: la asociación lo llama al cumplirse un periodo. Recibe el
// snapshot de tenedores (calculado off-chain leyendo bond-issuance) y crea
// una obligación por inversor.
//
// Nota: pasar el snapshot como parámetro evita hacer cross-chaincode invocation
// en cada tick (Fabric no tiene "cron" propio; un servicio externo dispara esto).
// Los peers validan que los importes cuadran con el cupón teórico.
func (c *LifecycleContract) ScheduleCoupon(
	ctx contractapi.TransactionContextInterface,
	bondID string,
	periodIndex int32,
	dueAt int64,
	holdersJSON string,
	couponPerParticipationCents int64,
) error {
	if err := requireMSP(ctx, "AsociacionMSP"); err != nil {
		return err
	}
	var holders map[string]int64
	if err := json.Unmarshal([]byte(holdersJSON), &holders); err != nil {
		return fmt.Errorf("invalid holders snapshot: %w", err)
	}
	for investorID, balance := range holders {
		if balance <= 0 {
			continue
		}
		id := fmt.Sprintf("%s:%d:%s", bondID, periodIndex, investorID)
		obligation := PaymentObligation{
			ID:          id,
			BondID:      bondID,
			PeriodIndex: periodIndex,
			Kind:        PaymentCoupon,
			InvestorID:  investorID,
			AmountCents: balance * couponPerParticipationCents,
			DueAt:       dueAt,
			Status:      PaymentDue,
		}
		key, _ := ctx.GetStub().CreateCompositeKey(prefixPayment, []string{bondID, fmt.Sprintf("%010d", periodIndex), investorID})
		if err := putJSON(ctx, key, obligation); err != nil {
			return err
		}
		evt, _ := json.Marshal(obligation)
		_ = ctx.GetStub().SetEvent("PaymentDue", evt)
	}
	return nil
}

// ConfirmPayment: marca una obligación como pagada. Solo el oráculo bancario.
// sepaRefHash es el hash de la referencia SEPA (no se almacena la referencia en claro).
func (c *LifecycleContract) ConfirmPayment(
	ctx contractapi.TransactionContextInterface,
	bondID string,
	periodIndex int32,
	investorID string,
	sepaRefHash string,
) error {
	if err := requireRole(ctx, "payments.oracle"); err != nil {
		return err
	}
	key, _ := ctx.GetStub().CreateCompositeKey(prefixPayment, []string{bondID, fmt.Sprintf("%010d", periodIndex), investorID})
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return err
	}
	if data == nil {
		return fmt.Errorf("payment obligation not found")
	}
	var o PaymentObligation
	if err := json.Unmarshal(data, &o); err != nil {
		return err
	}
	if o.Status == PaymentConfirmed {
		return fmt.Errorf("already confirmed")
	}
	now, err := nowSeconds(ctx)
	if err != nil {
		return err
	}
	o.Status = PaymentConfirmed
	o.ConfirmedAt = now
	o.SepaRefHash = sepaRefHash
	if err := putJSON(ctx, key, o); err != nil {
		return err
	}
	evt, _ := json.Marshal(o)
	_ = ctx.GetStub().SetEvent("PaymentConfirmed", evt)
	return nil
}

// MarkDefault: marca una obligación como impagada. Solo el oráculo bancario,
// típicamente tras un tiempo de gracia configurado off-chain.
func (c *LifecycleContract) MarkDefault(
	ctx contractapi.TransactionContextInterface,
	bondID string,
	periodIndex int32,
	investorID string,
) error {
	if err := requireRole(ctx, "payments.oracle"); err != nil {
		return err
	}
	key, _ := ctx.GetStub().CreateCompositeKey(prefixPayment, []string{bondID, fmt.Sprintf("%010d", periodIndex), investorID})
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return err
	}
	if data == nil {
		return fmt.Errorf("payment obligation not found")
	}
	var o PaymentObligation
	if err := json.Unmarshal(data, &o); err != nil {
		return err
	}
	o.Status = PaymentDefaulted
	if err := putJSON(ctx, key, o); err != nil {
		return err
	}
	evt, _ := json.Marshal(o)
	_ = ctx.GetStub().SetEvent("PaymentDefaulted", evt)
	return nil
}

// ListObligationsByBond: devuelve todas las obligaciones de un bono. Para reporting.
func (c *LifecycleContract) ListObligationsByBond(ctx contractapi.TransactionContextInterface, bondID string) ([]PaymentObligation, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(prefixPayment, []string{bondID})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	var out []PaymentObligation
	for it.HasNext() {
		r, err := it.Next()
		if err != nil {
			return nil, err
		}
		var o PaymentObligation
		if err := json.Unmarshal(r.Value, &o); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

// --- helpers ---

func requireMSP(ctx contractapi.TransactionContextInterface, mspId string) error {
	got, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if !strings.EqualFold(got, mspId) {
		return fmt.Errorf("requires %s; got %s", mspId, got)
	}
	return nil
}

func requireRole(ctx contractapi.TransactionContextInterface, role string) error {
	v, ok, err := ctx.GetClientIdentity().GetAttributeValue("role")
	if err != nil {
		return err
	}
	if !ok || v != role {
		return fmt.Errorf("requires role %s", role)
	}
	return nil
}
