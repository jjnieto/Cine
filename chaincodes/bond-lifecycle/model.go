package main

type PaymentKind string

const (
	PaymentCoupon       PaymentKind = "COUPON"
	PaymentRedemption   PaymentKind = "REDEMPTION"
)

type PaymentStatus string

const (
	PaymentDue        PaymentStatus = "DUE"
	PaymentConfirmed  PaymentStatus = "CONFIRMED"
	PaymentDefaulted  PaymentStatus = "DEFAULTED"
)

// PaymentObligation: una obligación de pago a un inversor concreto.
// El reparto entre inversores se calcula al generarse cada hito, según los
// balances de bond-issuance en ese instante (snapshot). El pago físico es SEPA
// off-chain; cuando llega la confirmación, un oracle marca CONFIRMED.
type PaymentObligation struct {
	ID            string        `json:"id"`           // bondId:periodIdx:investorId
	BondID        string        `json:"bondId"`
	PeriodIndex   int32         `json:"periodIndex"`  // 0..N
	Kind          PaymentKind   `json:"kind"`
	InvestorID    string        `json:"investorId"`
	AmountCents   int64         `json:"amountCents"`
	DueAt         int64         `json:"dueAt"`
	Status        PaymentStatus `json:"status"`
	ConfirmedAt   int64         `json:"confirmedAt,omitempty"`
	SepaRefHash   string        `json:"sepaRefHash,omitempty"`
}
