import { getContractAs, type ActorKey } from './gateway.js';

const decoder = new TextDecoder();

function parseResult<T>(bytes: Uint8Array): T {
  const text = decoder.decode(bytes);
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

// Helpers tipados por chaincode. Las operaciones que requieren identidad
// específica de una productora aceptan `actor`; las admin van siempre como
// asociación.

export const Governance = {
  // --- admin (Asociacion) ---
  async addProductora(mspId: string) {
    await getContractAs('asociacion', 'governance').submitTransaction('AddProductora', mspId);
  },
  async removeProductora(mspId: string) {
    await getContractAs('asociacion', 'governance').submitTransaction('RemoveProductora', mspId);
  },
  async init() {
    await getContractAs('asociacion', 'governance').submitTransaction('Init');
  },
  async setParams(quorumBps: number, votingDurationS: number) {
    await getContractAs('asociacion', 'governance').submitTransaction('SetParams', String(quorumBps), String(votingDurationS));
  },
  async getParams<T = unknown>(): Promise<T> {
    return parseResult<T>(await getContractAs('asociacion', 'governance').evaluateTransaction('GetParams'));
  },

  // --- productora (acting as) ---
  async createProposal(actor: ActorKey, args: {
    id: string; filmTitle: string; principalCents: string; couponBps: number;
    termMonths: number; numParticipations: string; whitepaperHash: string; whitepaperUrl: string;
  }) {
    await getContractAs(actor, 'governance').submitTransaction(
      'CreateProposal',
      args.id, args.filmTitle, args.principalCents, String(args.couponBps),
      String(args.termMonths), args.numParticipations, args.whitepaperHash, args.whitepaperUrl,
    );
  },
  async castVote(actor: ActorKey, proposalId: string, choice: boolean) {
    await getContractAs(actor, 'governance').submitTransaction('CastVote', proposalId, String(choice));
  },
  async closeProposal(actor: ActorKey, proposalId: string) {
    await getContractAs(actor, 'governance').submitTransaction('CloseProposal', proposalId);
  },

  // --- reads (default asociacion) ---
  async getProposal<T = unknown>(id: string): Promise<T> {
    return parseResult<T>(await getContractAs('asociacion', 'governance').evaluateTransaction('GetProposal', id));
  },
  async listProposals<T = unknown>(): Promise<T> {
    return parseResult<T>(await getContractAs('asociacion', 'governance').evaluateTransaction('ListProposals'));
  },
  async listProductoras(): Promise<string[]> {
    return parseResult<string[]>(await getContractAs('asociacion', 'governance').evaluateTransaction('ListProductoras')) ?? [];
  },
};

export const Issuance = {
  async createBond(args: {
    id: string; proposalId: string; filmTitle: string; productoraMSP: string;
    principalCents: string; couponBps: number; termMonths: number;
    numParticipations: string; whitepaperHash: string;
  }) {
    await getContractAs('asociacion', 'bond-issuance').submitTransaction(
      'CreateBond',
      args.id, args.proposalId, args.filmTitle, args.productoraMSP,
      args.principalCents, String(args.couponBps), String(args.termMonths),
      args.numParticipations, args.whitepaperHash,
    );
  },
  async allowInvestor(investorId: string) {
    await getContractAs('asociacion', 'bond-issuance').submitTransaction('AllowInvestor', investorId);
  },
  async revokeInvestor(investorId: string) {
    await getContractAs('asociacion', 'bond-issuance').submitTransaction('RevokeInvestor', investorId);
  },
  async mint(bondId: string, investorId: string, amount: string) {
    await getContractAs('asociacion', 'bond-issuance').submitTransaction('Mint', bondId, investorId, amount);
  },
  // Custodial: la asociación transfiere por cuenta del inversor.
  async transfer(bondId: string, from: string, to: string, amount: string) {
    await getContractAs('asociacion', 'bond-issuance').submitTransaction('Transfer', bondId, from, to, amount);
  },
  async balanceOf(bondId: string, investorId: string): Promise<bigint> {
    return BigInt(decoder.decode(await getContractAs('asociacion', 'bond-issuance').evaluateTransaction('BalanceOf', bondId, investorId)));
  },
  async getBond<T = unknown>(id: string): Promise<T> {
    return parseResult<T>(await getContractAs('asociacion', 'bond-issuance').evaluateTransaction('GetBond', id));
  },
  async listBonds<T = unknown>(): Promise<T> {
    return parseResult<T>(await getContractAs('asociacion', 'bond-issuance').evaluateTransaction('ListBonds'));
  },
  async getHolders(bondId: string): Promise<Record<string, number>> {
    return parseResult<Record<string, number>>(
      await getContractAs('asociacion', 'bond-issuance').evaluateTransaction('GetHolders', bondId),
    ) ?? {};
  },
};

export const Lifecycle = {
  async scheduleCoupon(args: {
    bondId: string; periodIndex: number; dueAt: number;
    holders: Record<string, number>; couponPerParticipationCents: string;
  }) {
    await getContractAs('asociacion', 'bond-lifecycle').submitTransaction(
      'ScheduleCoupon',
      args.bondId, String(args.periodIndex), String(args.dueAt),
      JSON.stringify(args.holders), args.couponPerParticipationCents,
    );
  },
  async confirmPayment(bondId: string, periodIndex: number, investorId: string, sepaRefHash: string) {
    await getContractAs('asociacion', 'bond-lifecycle').submitTransaction('ConfirmPayment', bondId, String(periodIndex), investorId, sepaRefHash);
  },
};
