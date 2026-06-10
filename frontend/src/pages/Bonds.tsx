import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function Bonds() {
  const [items, setItems] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listBonds().then(setItems).catch((e) => setError(String(e)));
  }, []);

  return (
    <section>
      <h2>Bonos activos</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <pre style={{ background: '#f7f7f7', padding: '0.75rem' }}>{JSON.stringify(items, null, 2)}</pre>
    </section>
  );
}
