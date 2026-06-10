// Cliente HTTP fino. Inyecta automáticamente el header X-Acting-As
// con la identidad Fabric activa.

import type { ProductoraActor } from '../state/ActorContext.js';

let currentActor: ProductoraActor = 'asociacion';
export function setCurrentActor(a: ProductoraActor) { currentActor = a; }

async function request<T>(method: string, path: string, body?: unknown, opts?: { actor?: ProductoraActor }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-acting-as': opts?.actor ?? currentActor,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let err: { error?: string; chaincode?: string[] } = {};
    try { err = JSON.parse(text); } catch { err = { error: text }; }
    const msg = err.chaincode?.[0] ?? err.error ?? text;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

// ---- tipos ----

export interface Proposal {
  id: string;
  filmTitle: string;
  proposerMsp: string;
  principalCents: number;
  couponBps: number;
  termMonths: number;
  numParticipations: number;
  whitepaperHash: string;
  whitepaperUrl: string;
  createdAt: number;
  votingEnd: number;
  status: 'OPEN' | 'APPROVED' | 'REJECTED';
  yesVotes: number;
  noVotes: number;
}

export interface Bond {
  id: string;
  proposalId: string;
  filmTitle: string;
  productoraMsp: string;
  principalCents: number;
  couponBps: number;
  termMonths: number;
  numParticipations: number;
  participationValueCents: number;
  whitepaperHash: string;
  issuedAt: number;
  maturityAt: number;
  status: 'ACTIVE' | 'AMORTIZED' | 'DEFAULTED';
  totalSupply: number;
}

export interface Investor {
  investorId: string;
  email: string;
  fullName: string;
  documentId: string;
  enrollmentRef: string;
  onboardedAt: number;
}

export interface Order {
  id: string;
  bondId: string;
  sellerInvestorId: string;
  amount: number;
  pricePerParticipationCents: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  createdAt: number;
  filledBy?: string;
  filledAt?: number;
}

export interface Holder {
  investorId: string;
  amount: number;
  email?: string;
  fullName?: string;
}

export interface PortfolioEntry extends Bond { balance: number; }

// ---- endpoints ----

export const api = {
  // proposals
  listProposals: () => request<Proposal[]>('GET', '/proposals'),
  getProposal: (id: string) => request<Proposal>('GET', `/proposals/${id}`),
  createProposal: (body: {
    id: string; filmTitle: string;
    principalCents: string; couponBps: number; termMonths: number;
    numParticipations: string; whitepaperHash: string; whitepaperUrl: string;
  }) => request('POST', '/proposals', body),
  vote: (id: string, choice: boolean) => request('POST', `/proposals/${id}/vote`, { choice }),
  closeProposal: (id: string) => request('POST', `/proposals/${id}/close`),

  // admin
  listProductoras: () => request<string[]>('GET', '/admin/productoras'),
  addProductora: (mspId: string) => request('POST', '/admin/productoras', { mspId }),
  removeProductora: (mspId: string) => request('DELETE', `/admin/productoras/${mspId}`),
  initGovernance: () => request('POST', '/admin/init-governance'),
  getParams: () => request<{ quorumBps: number; votingDurationS: number }>('GET', '/admin/params'),
  setParams: (quorumBps: number, votingDurationS: number) =>
    request('POST', '/admin/params', { quorumBps, votingDurationS }),
  materialize: (proposalId: string) => request<{ bondId: string }>('POST', `/admin/proposals/${proposalId}/materialize`),

  // bonds
  listBonds: () => request<Bond[]>('GET', '/bonds'),
  getBond: (id: string) => request<Bond>('GET', `/bonds/${id}`),
  bondHolders: (id: string) => request<Holder[]>('GET', `/bonds/${id}/holders`),
  purchase: (bondId: string, investorId: string, amount: string) =>
    request('POST', `/bonds/${bondId}/purchase`, { investorId, amount }),

  // investors
  listInvestors: () => request<Investor[]>('GET', '/investors'),
  onboard: (body: { email: string; fullName: string; documentId: string }) =>
    request<Investor>('POST', '/investors/onboard', body),

  // orders (secondary market)
  listOrders: (filter?: { bondId?: string; status?: string; sellerInvestorId?: string }) => {
    const qs = new URLSearchParams(filter as Record<string, string>).toString();
    return request<Order[]>('GET', `/orders${qs ? '?' + qs : ''}`);
  },
  createOrder: (body: { bondId: string; sellerInvestorId: string; amount: number; pricePerParticipationCents: number }) =>
    request<Order>('POST', '/orders', body),
  fillOrder: (orderId: string, buyerInvestorId: string) =>
    request<Order>('POST', `/orders/${orderId}/fill`, { buyerInvestorId }),
  cancelOrder: (orderId: string) => request<Order>('DELETE', `/orders/${orderId}`),

  // portfolio
  portfolio: (investorId: string) => request<PortfolioEntry[]>('GET', `/portfolio/${investorId}`),
};
