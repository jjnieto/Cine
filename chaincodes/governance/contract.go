package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// GovernanceContract gestiona el censo de productoras, propuestas y votación.
type GovernanceContract struct {
	contractapi.Contract
}

const (
	keyParams        = "PARAMS"
	prefixProductora = "PRODUCTORA"
	prefixProposal   = "PROPOSAL"
	prefixVote       = "VOTE"
)

// Init establece los parámetros por defecto. Se invoca una vez tras el deploy.
// quorumBps=3300 (33%), votingDurationS=604800 (7 días).
func (c *GovernanceContract) Init(ctx contractapi.TransactionContextInterface) error {
	if existing, _ := ctx.GetStub().GetState(keyParams); existing != nil {
		return fmt.Errorf("governance already initialized")
	}
	params := GovernanceParams{QuorumBps: 3300, VotingDurationS: 7 * 24 * 3600}
	return putJSON(ctx, keyParams, params)
}

// --- Censo de productoras ---

// AddProductora añade una productora al censo. Solo invocable por la org admin
// (se valida que el caller pertenece al MSP de la asociación).
func (c *GovernanceContract) AddProductora(ctx contractapi.TransactionContextInterface, mspId string) error {
	if err := requireAssociationAdmin(ctx); err != nil {
		return err
	}
	key, _ := ctx.GetStub().CreateCompositeKey(prefixProductora, []string{mspId})
	return ctx.GetStub().PutState(key, []byte("1"))
}

func (c *GovernanceContract) RemoveProductora(ctx contractapi.TransactionContextInterface, mspId string) error {
	if err := requireAssociationAdmin(ctx); err != nil {
		return err
	}
	key, _ := ctx.GetStub().CreateCompositeKey(prefixProductora, []string{mspId})
	return ctx.GetStub().DelState(key)
}

func (c *GovernanceContract) ListProductoras(ctx contractapi.TransactionContextInterface) ([]string, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(prefixProductora, []string{})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	var out []string
	for it.HasNext() {
		r, err := it.Next()
		if err != nil {
			return nil, err
		}
		_, parts, err := ctx.GetStub().SplitCompositeKey(r.Key)
		if err != nil {
			return nil, err
		}
		if len(parts) == 1 {
			out = append(out, parts[0])
		}
	}
	return out, nil
}

// --- Propuestas ---

// CreateProposal crea una propuesta. Caller debe ser productora del censo.
func (c *GovernanceContract) CreateProposal(
	ctx contractapi.TransactionContextInterface,
	id string,
	filmTitle string,
	principalCents int64,
	couponBps int32,
	termMonths int32,
	numParticipations int64,
	whitepaperHash string,
	whitepaperURL string,
) error {
	caller, err := callerMSP(ctx)
	if err != nil {
		return err
	}
	in, err := c.isProductora(ctx, caller)
	if err != nil {
		return err
	}
	if !in {
		return fmt.Errorf("caller %s is not a productora", caller)
	}
	if principalCents <= 0 || numParticipations <= 0 || termMonths <= 0 {
		return fmt.Errorf("invalid economic parameters")
	}
	params, err := getParams(ctx)
	if err != nil {
		return err
	}
	now, err := nowSeconds(ctx)
	if err != nil {
		return err
	}
	p := Proposal{
		ID:                id,
		FilmTitle:         filmTitle,
		ProposerMSP:       caller,
		PrincipalCents:    principalCents,
		CouponBps:         couponBps,
		TermMonths:        termMonths,
		NumParticipations: numParticipations,
		WhitepaperHash:    whitepaperHash,
		WhitepaperURL:     whitepaperURL,
		CreatedAt:         now,
		VotingEnd:         now + params.VotingDurationS,
		Status:            StatusOpen,
	}
	key := proposalKey(id)
	if existing, _ := ctx.GetStub().GetState(key); existing != nil {
		return fmt.Errorf("proposal %s already exists", id)
	}
	return putJSON(ctx, key, p)
}

// CastVote registra el voto de la productora caller. Una productora un voto.
func (c *GovernanceContract) CastVote(ctx contractapi.TransactionContextInterface, proposalID string, choice bool) error {
	caller, err := callerMSP(ctx)
	if err != nil {
		return err
	}
	in, err := c.isProductora(ctx, caller)
	if err != nil {
		return err
	}
	if !in {
		return fmt.Errorf("caller %s is not a productora", caller)
	}
	p, err := c.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}
	if p.Status != StatusOpen {
		return fmt.Errorf("proposal %s is not open", proposalID)
	}
	now, err := nowSeconds(ctx)
	if err != nil {
		return err
	}
	if now > p.VotingEnd {
		return fmt.Errorf("voting period has ended")
	}
	vKey, _ := ctx.GetStub().CreateCompositeKey(prefixVote, []string{proposalID, caller})
	if existing, _ := ctx.GetStub().GetState(vKey); existing != nil {
		return fmt.Errorf("caller %s already voted on %s", caller, proposalID)
	}
	v := Vote{ProposalID: proposalID, VoterMSP: caller, Choice: choice, Timestamp: now}
	if err := putJSON(ctx, vKey, v); err != nil {
		return err
	}
	if choice {
		p.YesVotes++
	} else {
		p.NoVotes++
	}
	return putJSON(ctx, proposalKey(proposalID), *p)
}

// CloseProposal cierra la votación tras el plazo y calcula el resultado.
// Cualquier productora del censo puede invocarlo.
// Reglas: quórum 33%, mayoría simple, empate NO aprueba.
func (c *GovernanceContract) CloseProposal(ctx contractapi.TransactionContextInterface, proposalID string) error {
	p, err := c.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}
	if p.Status != StatusOpen {
		return fmt.Errorf("proposal %s is already closed", proposalID)
	}
	now, err := nowSeconds(ctx)
	if err != nil {
		return err
	}
	if now <= p.VotingEnd {
		return fmt.Errorf("voting period not finished")
	}
	productoras, err := c.ListProductoras(ctx)
	if err != nil {
		return err
	}
	totalCensus := int32(len(productoras))
	params, err := getParams(ctx)
	if err != nil {
		return err
	}
	cast := p.YesVotes + p.NoVotes
	// quórum: votos emitidos * 10000 / censo >= quorumBps
	if totalCensus == 0 || int32((int64(cast)*10000)/int64(totalCensus)) < params.QuorumBps {
		p.Status = StatusRejected
	} else if p.YesVotes > p.NoVotes {
		p.Status = StatusApproved
	} else {
		p.Status = StatusRejected // mayoría simple; empate NO aprueba
	}
	if err := putJSON(ctx, proposalKey(proposalID), *p); err != nil {
		return err
	}
	evt := map[string]any{"proposalId": p.ID, "status": p.Status, "yes": p.YesVotes, "no": p.NoVotes}
	evtBytes, _ := json.Marshal(evt)
	if p.Status == StatusApproved {
		// bond-issuance escuchará este evento (vía gateway) para crear el bono tokenizado.
		_ = ctx.GetStub().SetEvent("ProposalApproved", evtBytes)
	} else {
		_ = ctx.GetStub().SetEvent("ProposalRejected", evtBytes)
	}
	return nil
}

func (c *GovernanceContract) GetProposal(ctx contractapi.TransactionContextInterface, id string) (*Proposal, error) {
	data, err := ctx.GetStub().GetState(proposalKey(id))
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("proposal %s not found", id)
	}
	var p Proposal
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (c *GovernanceContract) ListProposals(ctx contractapi.TransactionContextInterface) ([]Proposal, error) {
	it, err := ctx.GetStub().GetStateByRange(prefixProposal+"_", prefixProposal+"`")
	if err != nil {
		return nil, err
	}
	defer it.Close()
	var out []Proposal
	for it.HasNext() {
		r, err := it.Next()
		if err != nil {
			return nil, err
		}
		var p Proposal
		if err := json.Unmarshal(r.Value, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// --- helpers ---

func (c *GovernanceContract) isProductora(ctx contractapi.TransactionContextInterface, mspId string) (bool, error) {
	key, _ := ctx.GetStub().CreateCompositeKey(prefixProductora, []string{mspId})
	data, err := ctx.GetStub().GetState(key)
	if err != nil {
		return false, err
	}
	return data != nil, nil
}

// requireAssociationAdmin: el admin del MSP "Asociacion" es el único que gestiona el censo.
// Si necesitamos rotación lógica, esto pasará a leer un comité on-chain.
func requireAssociationAdmin(ctx contractapi.TransactionContextInterface) error {
	msp, err := callerMSP(ctx)
	if err != nil {
		return err
	}
	if !strings.EqualFold(msp, "AsociacionMSP") {
		return fmt.Errorf("only AsociacionMSP can manage census; caller=%s", msp)
	}
	return nil
}
