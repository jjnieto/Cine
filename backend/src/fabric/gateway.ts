import { connect, signers } from '@hyperledger/fabric-gateway';
import type { Contract, Gateway, Identity, Signer } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey } from 'node:crypto';

// Identidades disponibles. Cada una mapea a un MSP y a un cert/key de admin.
// 'asociacion' es la identidad por defecto y la que firma operaciones custodiales
// (en nombre de inversores, alta de censo, etc.). 'productora{1,2,3}' actúan
// como esas productoras concretas para proponer y votar.
export type ActorKey = 'asociacion' | 'productora1' | 'productora2' | 'productora3';

const ACTORS: Record<ActorKey, { mspId: string; org: string; user: string }> = {
  asociacion:  { mspId: 'AsociacionMSP',  org: 'asociacion',  user: 'Admin' },
  productora1: { mspId: 'Productora1MSP', org: 'productora1', user: 'Admin' },
  productora2: { mspId: 'Productora2MSP', org: 'productora2', user: 'Admin' },
  productora3: { mspId: 'Productora3MSP', org: 'productora3', user: 'Admin' },
};

function envOr(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function orgDir(org: string): string {
  const base = envOr('FABRIC_ORGS_DIR', '../network/organizations/peerOrganizations');
  return join(base, `${org}.productoras.local`);
}

function peerEndpointFor(org: ActorKey): { endpoint: string; hostname: string } {
  // Mismos puertos que docker-compose.yaml. El backend conecta al peer de la
  // org cuyo gateway necesitamos para gather de endorsements en su nombre.
  const map: Record<ActorKey, { endpoint: string; hostname: string }> = {
    asociacion:  { endpoint: 'localhost:7051',  hostname: 'peer0.asociacion.productoras.local'  },
    productora1: { endpoint: 'localhost:8051',  hostname: 'peer0.productora1.productoras.local' },
    productora2: { endpoint: 'localhost:9051',  hostname: 'peer0.productora2.productoras.local' },
    productora3: { endpoint: 'localhost:10051', hostname: 'peer0.productora3.productoras.local' },
  };
  return map[org];
}

function loadIdentity(actor: ActorKey): { identity: Identity; signer: Signer } {
  const { mspId, org, user } = ACTORS[actor];
  const userDir = join(orgDir(org), 'users', `${user}@${org}.productoras.local`, 'msp');
  const certDir = join(userDir, 'signcerts');
  const keyDir = join(userDir, 'keystore');

  const certFile = readdirSync(certDir).find((f) => f.endsWith('.pem'));
  if (!certFile) throw new Error(`no cert in ${certDir}`);
  const credentials = readFileSync(join(certDir, certFile));

  const keyFile = readdirSync(keyDir)[0];
  if (!keyFile) throw new Error(`no key in ${keyDir}`);
  const key = createPrivateKey(readFileSync(join(keyDir, keyFile)));
  const signer = signers.newPrivateKeySigner(key);

  return { identity: { mspId, credentials }, signer };
}

function loadTlsCa(actor: ActorKey): Uint8Array {
  const { org } = ACTORS[actor];
  const path = join(orgDir(org), 'peers', `peer0.${org}.productoras.local`, 'tls', 'ca.crt');
  return readFileSync(path);
}

const channel = envOr('FABRIC_CHANNEL', 'productoras');
const pool = new Map<ActorKey, { gateway: Gateway; client: grpc.Client }>();

function buildGateway(actor: ActorKey): { gateway: Gateway; client: grpc.Client } {
  const { endpoint, hostname } = peerEndpointFor(actor);
  const tlsCredentials = grpc.credentials.createSsl(Buffer.from(loadTlsCa(actor)));
  const client = new grpc.Client(endpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': hostname,
  });
  const { identity, signer } = loadIdentity(actor);
  const gateway = connect({ client, identity, signer });
  return { gateway, client };
}

export function getGatewayFor(actor: ActorKey): Gateway {
  let entry = pool.get(actor);
  if (!entry) {
    entry = buildGateway(actor);
    pool.set(actor, entry);
  }
  return entry.gateway;
}

export function getContractAs(actor: ActorKey, chaincode: string): Contract {
  return getGatewayFor(actor).getNetwork(channel).getContract(chaincode);
}

// Compat: por defecto, asociación.
export function getContract(chaincode: string): Contract {
  return getContractAs('asociacion', chaincode);
}

export function closeAll(): void {
  for (const { gateway, client } of pool.values()) {
    gateway.close();
    client.close();
  }
  pool.clear();
}
