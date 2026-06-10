package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// IssuanceContract: emisión y movimiento de tokens (participaciones) del bono.
// Identidad del inversor: atributo de certificado "investorId" emitido tras KYC.
// La asociación (custodia centralizada) firma con el cert del inversor para sus operaciones.
type IssuanceContract struct {
	contractapi.Contract
}

const (
	prefixBond      = "BOND"
	prefixBalance   = "BAL"     // BAL/<bondId>/<investorId>
	prefixAllowed   = "ALLOWED" // ALLOWED/<investorId>
)

// --- KYC allowlist ---

// AllowInvestor añade un inversor a la lista blanca. Solo el oficial KYC de la asociación.
func (c *IssuanceContract) AllowInvestor(ctx contractapi.TransactionContextInterface, investorID string) error {
	if err := requireAsociacionOrRole(ctx, "kyc.officer"); err != nil {
		return err
	}
	key, _ := ctx.GetStub().CreateCompositeKey(prefixAllowed, []string{investorID})
	return ctx.GetStub().PutState(key, []byte("1"))
}

func (c *IssuanceContract) RevokeInvestor(ctx contractapi.TransactionContextInterface, investorID string) error {
	if err := requireAsociacionOrRole(ctx, "kyc.officer"); err != nil {
		return err
	}
	key, _ := ctx.GetStub().CreateCompositeKey(prefixAllowed, []string{investorID})
	return ctx.GetStub().DelState(key)
}

func (c *IssuanceContract) IsAllowed(ctx contractapi.TransactionContextInterface, investorID string) (bool, error) {
	key, _ := ctx.GetStub().CreateCompositeKey(prefixAllowed, []string{investorID})
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return false, err
	}
	return data != nil, nil
}

// --- Bond ---

// CreateBond se invoca desde el backend tras ProposalApproved en governance.
// Solo AsociacionMSP puede crearlo.
func (c *IssuanceContract) CreateBond(
	ctx contractapi.TransactionContextInterface,
	id string,
	proposalID string,
	filmTitle string,
	productoraMSP string,
	principalCents int64,
	couponBps int32,
	termMonths int32,
	numParticipations int64,
	whitepaperHash string,
) error {
	if err := requireMSP(ctx, "AsociacionMSP"); err != nil {
		return err
	}
	if existing, _ := ctx.GetStub().GetState(bondKey(id)); existing != nil {
		return fmt.Errorf("bond %s already exists", id)
	}
	if numParticipations <= 0 || principalCents%numParticipations != 0 {
		return fmt.Errorf("principal must be divisible by numParticipations")
	}
	now, err := nowSeconds(ctx)
	if err != nil {
		return err
	}
	b := Bond{
		ID:                      id,
		ProposalID:              proposalID,
		FilmTitle:               filmTitle,
		ProductoraMSP:           productoraMSP,
		PrincipalCents:          principalCents,
		CouponBps:               couponBps,
		TermMonths:              termMonths,
		NumParticipations:       numParticipations,
		ParticipationValueCents: principalCents / numParticipations,
		WhitepaperHash:          whitepaperHash,
		IssuedAt:                now,
		MaturityAt:              now + int64(termMonths)*30*24*3600, // aprox; en lifecycle refinaremos
		Status:                  BondActive,
		TotalSupply:             0,
	}
	return putJSON(ctx, bondKey(id), b)
}

func (c *IssuanceContract) GetBond(ctx contractapi.TransactionContextInterface, id string) (*Bond, error) {
	data, err := ctx.GetStub().GetState(bondKey(id))
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("bond %s not found", id)
	}
	var b Bond
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, err
	}
	return &b, nil
}

func (c *IssuanceContract) ListBonds(ctx contractapi.TransactionContextInterface) ([]Bond, error) {
	it, err := ctx.GetStub().GetStateByRange(prefixBond+"_", prefixBond+"`")
	if err != nil {
		return nil, err
	}
	defer it.Close()
	var out []Bond
	for it.HasNext() {
		r, err := it.Next()
		if err != nil {
			return nil, err
		}
		var b Bond
		if err := json.Unmarshal(r.Value, &b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

// --- Token operations ---

// Mint emite participaciones a un inversor en la fase de colocación primaria.
// Solo AsociacionMSP. No puede superar NumParticipations.
func (c *IssuanceContract) Mint(ctx contractapi.TransactionContextInterface, bondID string, investorID string, amount int64) error {
	if err := requireMSP(ctx, "AsociacionMSP"); err != nil {
		return err
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	ok, err := c.IsAllowed(ctx, investorID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("investor %s not in allowlist", investorID)
	}
	b, err := c.GetBond(ctx, bondID)
	if err != nil {
		return err
	}
	if b.Status != BondActive {
		return fmt.Errorf("bond %s is not active", bondID)
	}
	if b.TotalSupply+amount > b.NumParticipations {
		return fmt.Errorf("mint would exceed numParticipations")
	}
	if err := addBalance(ctx, bondID, investorID, amount); err != nil {
		return err
	}
	b.TotalSupply += amount
	return putJSON(ctx, bondKey(bondID), *b)
}

// Transfer entre dos inversores allowlisted.
// Dos modos de autorización:
//   - Custodial (Modelo A): caller es AsociacionMSP → confía en `from` (la
//     asociación tiene custodia de las claves y firma por el inversor).
//   - No-custodial: caller tiene atributo cert "investorId" → debe coincidir con `from`.
func (c *IssuanceContract) Transfer(ctx contractapi.TransactionContextInterface, bondID string, from string, to string, amount int64) error {
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if mspID != "AsociacionMSP" {
		// Modo no-custodial: solo aceptamos si el cert lleva investorId que coincide con from.
		caller, err := callerInvestorID(ctx)
		if err != nil {
			return err
		}
		if caller != from {
			return fmt.Errorf("caller %s cannot transfer from %s", caller, from)
		}
	}
	if from == to {
		return fmt.Errorf("from and to must differ")
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	for _, inv := range []string{from, to} {
		ok, err := c.IsAllowed(ctx, inv)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("investor %s not in allowlist", inv)
		}
	}
	b, err := c.GetBond(ctx, bondID)
	if err != nil {
		return err
	}
	if b.Status != BondActive {
		return fmt.Errorf("bond %s is not active", bondID)
	}
	if err := addBalance(ctx, bondID, from, -amount); err != nil {
		return err
	}
	return addBalance(ctx, bondID, to, amount)
}

func (c *IssuanceContract) BalanceOf(ctx contractapi.TransactionContextInterface, bondID string, investorID string) (int64, error) {
	return getBalance(ctx, bondID, investorID)
}

// GetHolders devuelve pares investorId→balance. Pensado para reporting; en producción
// con muchos tenedores conviene paginar.
func (c *IssuanceContract) GetHolders(ctx contractapi.TransactionContextInterface, bondID string) (map[string]int64, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(prefixBalance, []string{bondID})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := map[string]int64{}
	for it.HasNext() {
		r, err := it.Next()
		if err != nil {
			return nil, err
		}
		_, parts, err := ctx.GetStub().SplitCompositeKey(r.Key)
		if err != nil {
			return nil, err
		}
		if len(parts) != 2 {
			continue
		}
		v, err := parseInt64(r.Value)
		if err != nil {
			return nil, err
		}
		if v > 0 {
			out[parts[1]] = v
		}
	}
	return out, nil
}

// --- helpers ---

func bondKey(id string) string {
	return prefixBond + "_" + id
}

func balanceKey(ctx contractapi.TransactionContextInterface, bondID, investorID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(prefixBalance, []string{bondID, investorID})
}

func getBalance(ctx contractapi.TransactionContextInterface, bondID, investorID string) (int64, error) {
	key, err := balanceKey(ctx, bondID, investorID)
	if err != nil {
		return 0, err
	}
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return 0, err
	}
	if data == nil {
		return 0, nil
	}
	return parseInt64(data)
}

func addBalance(ctx contractapi.TransactionContextInterface, bondID, investorID string, delta int64) error {
	cur, err := getBalance(ctx, bondID, investorID)
	if err != nil {
		return err
	}
	next := cur + delta
	if next < 0 {
		return fmt.Errorf("insufficient balance for %s on bond %s", investorID, bondID)
	}
	key, err := balanceKey(ctx, bondID, investorID)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, []byte(formatInt64(next)))
}

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

// requireAsociacionOrRole: acepta si el caller es admin de AsociacionMSP
// (modelo de custodia centralizada) o si su cert lleva el atributo "role"
// con el valor esperado (modelo con separación de roles en certs).
func requireAsociacionOrRole(ctx contractapi.TransactionContextInterface, role string) error {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if msp == "AsociacionMSP" {
		return nil
	}
	v, ok, err := ctx.GetClientIdentity().GetAttributeValue("role")
	if err != nil {
		return err
	}
	if !ok || v != role {
		return fmt.Errorf("requires AsociacionMSP or role=%s", role)
	}
	return nil
}

// callerInvestorID: extrae el atributo "investorId" del cert del caller.
func callerInvestorID(ctx contractapi.TransactionContextInterface) (string, error) {
	v, ok, err := ctx.GetClientIdentity().GetAttributeValue("investorId")
	if err != nil {
		return "", err
	}
	if !ok || v == "" {
		return "", fmt.Errorf("caller has no investorId attribute")
	}
	return v, nil
}
