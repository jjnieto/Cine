package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&GovernanceContract{})
	if err != nil {
		log.Panicf("error creating governance chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("error starting governance chaincode: %v", err)
	}
}
