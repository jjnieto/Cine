package main

type BondStatus string

const (
	BondActive     BondStatus = "ACTIVE"
	BondAmortized  BondStatus = "AMORTIZED"
	BondDefaulted  BondStatus = "DEFAULTED"
)

// Bond representa el bono tokenizado emitido tras la aprobación de una propuesta.
// 1 participación = 1 token fungible. NumParticipations = supply total inicial.
type Bond struct {
	ID                       string     `json:"id"`
	ProposalID               string     `json:"proposalId"`
	FilmTitle                string     `json:"filmTitle"`
	ProductoraMSP            string     `json:"productoraMsp"`
	PrincipalCents           int64      `json:"principalCents"`
	CouponBps                int32      `json:"couponBps"`
	TermMonths               int32      `json:"termMonths"`
	NumParticipations        int64      `json:"numParticipations"`
	ParticipationValueCents  int64      `json:"participationValueCents"`
	WhitepaperHash           string     `json:"whitepaperHash"`
	IssuedAt                 int64      `json:"issuedAt"`
	MaturityAt               int64      `json:"maturityAt"`
	Status                   BondStatus `json:"status"`
	TotalSupply              int64      `json:"totalSupply"` // tokens en circulación; baja en amortización
}
