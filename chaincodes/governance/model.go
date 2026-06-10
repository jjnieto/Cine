package main

type ProposalStatus string

const (
	StatusOpen     ProposalStatus = "OPEN"
	StatusApproved ProposalStatus = "APPROVED"
	StatusRejected ProposalStatus = "REJECTED"
)

// Proposal: estructura del bono que se somete a votación.
// Importes en céntimos de euro para evitar floats.
type Proposal struct {
	ID                string         `json:"id"`
	FilmTitle         string         `json:"filmTitle"`
	ProposerMSP       string         `json:"proposerMsp"`
	PrincipalCents    int64          `json:"principalCents"`
	CouponBps         int32          `json:"couponBps"`     // 100 bps = 1%
	TermMonths        int32          `json:"termMonths"`
	NumParticipations int64          `json:"numParticipations"`
	WhitepaperHash    string         `json:"whitepaperHash"`
	WhitepaperURL     string         `json:"whitepaperUrl"`
	CreatedAt         int64          `json:"createdAt"` // unix seconds
	VotingEnd         int64          `json:"votingEnd"`
	Status            ProposalStatus `json:"status"`
	YesVotes          int32          `json:"yesVotes"`
	NoVotes           int32          `json:"noVotes"`
}

type Vote struct {
	ProposalID string `json:"proposalId"`
	VoterMSP   string `json:"voterMsp"`
	Choice     bool   `json:"choice"` // true = yes
	Timestamp  int64  `json:"timestamp"`
}

// GovernanceParams: parámetros del sistema. Se inicializan al desplegar.
type GovernanceParams struct {
	QuorumBps        int32 `json:"quorumBps"`        // 3300 = 33%
	VotingDurationS  int64 `json:"votingDurationS"`  // 604800 = 7 días
}
