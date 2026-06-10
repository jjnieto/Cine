package main

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func callerMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return "", fmt.Errorf("getting caller MSP: %w", err)
	}
	return msp, nil
}

func nowSeconds(ctx contractapi.TransactionContextInterface) (int64, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return 0, fmt.Errorf("getting tx timestamp: %w", err)
	}
	return ts.Seconds, nil
}

func putJSON(ctx contractapi.TransactionContextInterface, key string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, b)
}

func proposalKey(id string) string {
	return prefixProposal + "_" + id
}

func getParams(ctx contractapi.TransactionContextInterface) (*GovernanceParams, error) {
	data, err := ctx.GetStub().GetState(keyParams)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("governance not initialized; call Init first")
	}
	var p GovernanceParams
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
