package main

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

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

func parseInt64(b []byte) (int64, error) {
	return strconv.ParseInt(string(b), 10, 64)
}

func formatInt64(v int64) string {
	return strconv.FormatInt(v, 10)
}
