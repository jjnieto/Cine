package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&LifecycleContract{})
	if err != nil {
		log.Panicf("error creating bond-lifecycle chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("error starting bond-lifecycle chaincode: %v", err)
	}
}
