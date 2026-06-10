package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&IssuanceContract{})
	if err != nil {
		log.Panicf("error creating bond-issuance chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("error starting bond-issuance chaincode: %v", err)
	}
}
