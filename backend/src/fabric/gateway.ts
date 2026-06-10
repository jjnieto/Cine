import { connect, signers } from '@hyperledger/fabric-gateway';
import type { Contract, Gateway } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey } from 'node:crypto';

// Conexión al gateway gRPC del peer. Una conexión por instancia de identidad.
// En producción con custodia centralizada (Modelo A): el backend mantiene un pool
// de Gateways indexados por investorId, cada uno construido con el cert+key
// del inversor extraído del HSM.

type Env = {
  endpoint: string;
  hostnameOverride: string;
  mspId: string;
  tlsCertPath: string;
  certPath: string;
  keyDir: string;
};

function env(): Env {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env ${k}`);
    return v;
  };
  return {
    endpoint: need('FABRIC_PEER_ENDPOINT'),
    hostnameOverride: need('FABRIC_PEER_HOSTNAME_OVERRIDE'),
    mspId: need('FABRIC_MSP_ID'),
    tlsCertPath: need('FABRIC_TLS_CERT_PATH'),
    certPath: need('FABRIC_CERT_PATH'),
    keyDir: need('FABRIC_KEY_DIR'),
  };
}

function loadAdminCert(certDir: string): Uint8Array {
  const files = readdirSync(certDir).filter((f) => f.endsWith('.pem'));
  if (!files.length) throw new Error(`no cert in ${certDir}`);
  return readFileSync(join(certDir, files[0]));
}

function loadAdminKey(keyDir: string): ReturnType<typeof signers.newPrivateKeySigner> {
  const files = readdirSync(keyDir);
  if (!files.length) throw new Error(`no key in ${keyDir}`);
  const pem = readFileSync(join(keyDir, files[0]));
  const key = createPrivateKey(pem);
  return signers.newPrivateKeySigner(key);
}

let cached: { gateway: Gateway; client: grpc.Client } | null = null;

export async function getAdminGateway(): Promise<Gateway> {
  if (cached) return cached.gateway;
  const e = env();
  const tlsRoot = readFileSync(e.tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRoot);
  const client = new grpc.Client(e.endpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': e.hostnameOverride,
  });
  const gateway = connect({
    client,
    identity: { mspId: e.mspId, credentials: loadAdminCert(e.certPath) },
    signer: loadAdminKey(e.keyDir),
  });
  cached = { gateway, client };
  return gateway;
}

export async function getContract(chaincodeName: string, contractName?: string): Promise<Contract> {
  const gw = await getAdminGateway();
  const network = gw.getNetwork(process.env.FABRIC_CHANNEL ?? 'productoras');
  return contractName ? network.getContract(chaincodeName, contractName) : network.getContract(chaincodeName);
}
