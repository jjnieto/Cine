import { Contract } from '@hyperledger/fabric-gateway';
import { getContract } from './gateway.js';

const decoder = new TextDecoder();

function parseResult<T>(bytes: Uint8Array): T {
  const text = decoder.decode(bytes);
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

// Wrappers tipados. Cada chaincode expone su superficie aquí.

export const Governance = {
  async createProposal(args: {
    id: string; filmTitle: string; principalCents: string; couponBps: number;
    termMonths: number; numParticipations: string; whitepaperHash: string; whitepaperURL: string;
  }) {
    const c = await getContract('governance');
    await c.submitTransaction(
      'CreateProposal',
      args.id, args.filmTitle, args.principalCents, String(args.couponBps),
      String(args.termMonths), args.numParticipations, args.whitepaperHash, args.whitepaperURL,
    );
  },
  async castVote(proposalId: string, choice: boolean) {
    const c = await getContract('governance');
    await c.submitTransaction('CastVote', proposalId, String(choice));
  },
  async closeProposal(proposalId: string) {
    const c = await getContract('governance');
    await c.submitTransaction('CloseProposal', proposalId);
  },
  async getProposal<T = unknown>(id: string): Promise<T> {
    const c = await getContract('governance');
    return parseResult<T>(await c.evaluateTransaction('GetProposal', id));
  },
  async listProposals<T = unknown>(): Promise<T> {
    const c = await getContract('governance');
    return parseResult<T>(await c.evaluateTransaction('ListProposals'));
  },
};

export const Issuance = {
  async createBond(args: {
    id: string; proposalId: string; filmTitle: string; productoraMSP: string;
    principalCents: string; couponBps: number; termMonths: number;
    numParticipations: string; whitepaperHash: string;
  }) {
    const c = await getContract('bond-issuance');
    await c.submitTransaction(
      'CreateBond',
      args.id, args.proposalId, args.filmTitle, args.productoraMSP,
      args.principalCents, String(args.couponBps), String(args.termMonths),
      args.numParticipations, args.whitepaperHash,
    );
  },
  async allowInvestor(investorId: string) {
    const c = await getContract('bond-issuance');
    await c.submitTransaction('AllowInvestor', investorId);
  },
  async mint(bondId: string, investorId: string, amount: string) {
    const c = await getContract('bond-issuance');
    await c.submitTransaction('Mint', bondId, investorId, amount);
  },
  async balanceOf(bondId: string, investorId: string): Promise<bigint> {
    const c = await getContract('bond-issuance');
    return BigInt(decoder.decode(await c.evaluateTransaction('BalanceOf', bondId, investorId)));
  },
};

export const Lifecycle = {
  async scheduleCoupon(args: {
    bondId: string; periodIndex: number; dueAt: number;
    holders: Record<string, number>; couponPerParticipationCents: string;
  }) {
    const c = await getContract('bond-lifecycle');
    await c.submitTransaction(
      'ScheduleCoupon',
      args.bondId, String(args.periodIndex), String(args.dueAt),
      JSON.stringify(args.holders), args.couponPerParticipationCents,
    );
  },
  async confirmPayment(bondId: string, periodIndex: number, investorId: string, sepaRefHash: string) {
    const c = await getContract('bond-lifecycle');
    await c.submitTransaction('ConfirmPayment', bondId, String(periodIndex), investorId, sepaRefHash);
  },
};

export { Contract };
