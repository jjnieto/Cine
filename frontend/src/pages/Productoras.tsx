import { useEffect, useState } from 'react';
import { api, type Proposal } from '../api/client.js';
import { useActor, mspIdOf } from '../state/ActorContext.js';
import { Banner, Empty, Section, StatusBadge } from './Admin.js';
import { bps, dateFmt, eur, shortId, timeUntil } from '../lib/format.js';

export function Productoras() {
  const { fabricActor } = useActor();
  const myMsp = mspIdOf(fabricActor);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      const list = await api.listProposals();
      setProposals(list ?? []);
    } catch (e) { setError(String(e)); }
  };
  useEffect(() => { refresh(); }, [fabricActor]);

  // El chaincode no expone "¿he votado ya?"; mantenemos memoria local optimista
  // por (actor, propuestaId). Si el chaincode rechaza un voto repetido, el
  // mensaje se muestra y reconciliamos.
  useEffect(() => {
    const raw = localStorage.getItem(`voted:${fabricActor}`);
    setVoted(new Set(raw ? JSON.parse(raw) : []));
  }, [fabricActor]);

  const markVoted = (id: string) => {
    setVoted((prev) => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem(`voted:${fabricActor}`, JSON.stringify([...next]));
      return next;
    });
  };

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };
  const vote = async (id: string, choice: boolean) => {
    try { await api.vote(id, choice); flash(`Voto registrado en ${id}`); markVoted(id); refresh(); }
    catch (e) { setError(String(e)); }
  };
  const close = async (id: string) => {
    try { await api.closeProposal(id); flash(`Cerrada ${id}`); refresh(); }
    catch (e) { setError(String(e)); }
  };

  const now = Math.floor(Date.now() / 1000);
  const mine = proposals.filter((p) => p.proposerMsp === myMsp);
  const others = proposals.filter((p) => p.proposerMsp !== myMsp && p.status === 'OPEN');

  return (
    <div className="space-y-8">
      {error && <Banner kind="error">{error}</Banner>}
      {msg && <Banner kind="ok">{msg}</Banner>}

      {fabricActor === 'asociacion' && (
        <Banner kind="error">
          Estás actuando como <strong>Asociación</strong>. Las productoras proponen y votan; la Asociación no.
          Cambia el selector arriba a "Productora 1/2/3".
        </Banner>
      )}

      <Section title="Nueva propuesta" subtitle={`Se enviará como ${myMsp}.`}>
        <ProposalForm
          disabled={fabricActor === 'asociacion'}
          onCreated={() => { flash('Propuesta creada'); refresh(); }}
          onError={setError}
        />
      </Section>

      <Section title={`Mis propuestas (${mine.length})`} subtitle="Las propuestas creadas por mí.">
        {mine.length === 0
          ? <Empty>Aún ninguna.</Empty>
          : <ProposalTable proposals={mine} now={now} />}
      </Section>

      <Section title={`Propuestas abiertas de otros (${others.length})`} subtitle="Puedes votar Sí o No. Una vez.">
        {others.length === 0
          ? <Empty>Ninguna propuesta abierta de otra productora.</Empty>
          : <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">ID</th><th>Película</th><th>Proponente</th>
                  <th>Principal</th><th>Cupón</th><th>Plazo</th><th>Sí/No</th>
                  <th>Cierra en</th><th></th>
                </tr>
              </thead>
              <tbody>
                {others.map((p) => {
                  const expired = p.votingEnd <= now;
                  const alreadyVoted = voted.has(p.id);
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2 mono">{shortId(p.id)}</td>
                      <td>{p.filmTitle}</td>
                      <td className="mono text-xs text-slate-500">{p.proposerMsp}</td>
                      <td>{eur(p.principalCents)}</td>
                      <td>{bps(p.couponBps)}</td>
                      <td>{p.termMonths}m</td>
                      <td><span className="text-emerald-600">{p.yesVotes}</span>/<span className="text-rose-600">{p.noVotes}</span></td>
                      <td className="text-slate-500">{timeUntil(p.votingEnd)}</td>
                      <td className="flex gap-2 py-2">
                        <button
                          onClick={() => vote(p.id, true)}
                          disabled={fabricActor === 'asociacion' || expired || alreadyVoted}
                          className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs hover:bg-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        >Sí</button>
                        <button
                          onClick={() => vote(p.id, false)}
                          disabled={fabricActor === 'asociacion' || expired || alreadyVoted}
                          className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs hover:bg-rose-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        >No</button>
                        {expired && <button onClick={() => close(p.id)} className="btn-ghost text-xs">Cerrar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}
      </Section>
    </div>
  );
}

function ProposalForm({ disabled, onCreated, onError }: {
  disabled: boolean; onCreated: () => void; onError: (s: string) => void;
}) {
  const [filmTitle, setFilm] = useState('');
  const [principal, setPrincipal] = useState('100000.00');
  const [couponPct, setCoupon] = useState('6.00');
  const [termMonths, setTerm] = useState('24');
  const [num, setNum] = useState('1000');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const principalCents = Math.round(parseFloat(principal) * 100);
      const couponBps = Math.round(parseFloat(couponPct) * 100);
      const numParticipations = parseInt(num);
      if (principalCents <= 0 || numParticipations <= 0) throw new Error('Importe / participaciones inválidos');
      if (principalCents % numParticipations !== 0) throw new Error('El principal debe ser divisible exacto entre el número de participaciones');
      await api.createProposal({
        id: `PROP-${Date.now()}`,
        filmTitle,
        principalCents: String(principalCents),
        couponBps,
        termMonths: parseInt(termMonths),
        numParticipations: String(numParticipations),
        whitepaperHash: 'a'.repeat(64),
        whitepaperUrl: 'https://example.com/whitepaper.pdf',
      });
      setFilm('');
      onCreated();
    } catch (e) { onError(String(e)); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Título de la película" full>
        <input className="input w-full" value={filmTitle} onChange={(e) => setFilm(e.target.value)} required disabled={disabled} />
      </Field>
      <Field label="Principal (€)">
        <input className="input w-full" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} required disabled={disabled} />
      </Field>
      <Field label="Cupón anual (%)">
        <input className="input w-full" inputMode="decimal" value={couponPct} onChange={(e) => setCoupon(e.target.value)} required disabled={disabled} />
      </Field>
      <Field label="Plazo (meses)">
        <input className="input w-full" type="number" min="1" value={termMonths} onChange={(e) => setTerm(e.target.value)} required disabled={disabled} />
      </Field>
      <Field label="Nº participaciones">
        <input className="input w-full" type="number" min="1" value={num} onChange={(e) => setNum(e.target.value)} required disabled={disabled} />
      </Field>
      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={disabled || submitting}>
          {submitting ? 'Enviando…' : 'Crear propuesta'}
        </button>
        {disabled && <span className="ml-3 text-sm text-slate-500">Cambia el selector arriba a una productora para poder crear.</span>}
      </div>
    </form>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${full ? 'sm:col-span-2' : ''}`}>
      <span className="text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function ProposalTable({ proposals, now }: { proposals: Proposal[]; now: number }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="text-left text-slate-500">
        <tr>
          <th className="py-2">ID</th><th>Película</th><th>Estado</th>
          <th>Sí/No</th><th>Cierra</th><th>Creada</th>
        </tr>
      </thead>
      <tbody>
        {proposals.map((p) => (
          <tr key={p.id} className="border-t border-slate-100">
            <td className="py-2 mono">{shortId(p.id)}</td>
            <td>{p.filmTitle}</td>
            <td><StatusBadge status={p.status} /></td>
            <td>{p.yesVotes}/{p.noVotes}</td>
            <td className="text-slate-500">
              {p.status === 'OPEN' ? (p.votingEnd > now ? timeUntil(p.votingEnd) : 'lista para cerrar') : dateFmt(p.votingEnd)}
            </td>
            <td className="text-slate-400 text-xs">{dateFmt(p.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
