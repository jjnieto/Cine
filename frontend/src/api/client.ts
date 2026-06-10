// Cliente HTTP fino contra el backend. El proxy de vite envía /api/* a :3000.

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  listProposals: () => request<unknown[]>('GET', '/proposals'),
  createProposal: (body: Record<string, unknown>) => request('POST', '/proposals', body),
  vote: (id: string, choice: boolean) => request('POST', `/proposals/${id}/vote`, { choice }),
  closeProposal: (id: string) => request('POST', `/proposals/${id}/close`),
  listBonds: () => request<unknown[]>('GET', '/bonds'),
  balance: (bondId: string, investorId: string) =>
    request<{ balance: string }>('GET', `/bonds/${bondId}/balance/${investorId}`),
};
