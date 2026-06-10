// Helpers de formato compartidos. Importes en céntimos (int).

export function eur(cents: number | bigint): string {
  const n = typeof cents === 'bigint' ? Number(cents) : cents;
  return (n / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}

export function bps(b: number): string {
  return `${(b / 100).toFixed(2)} %`;
}

export function dateFmt(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('es-ES');
}

export function timeUntil(unixSeconds: number): string {
  const diff = unixSeconds - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'cerrado';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function shortId(id: string, n = 12): string {
  return id.length > n ? id.slice(0, n) + '…' : id;
}
