import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ProductoraActor = 'asociacion' | 'productora1' | 'productora2' | 'productora3';

export interface ActorState {
  // Identidad Fabric activa: condiciona el header X-Acting-As
  fabricActor: ProductoraActor;
  setFabricActor: (a: ProductoraActor) => void;
  // Inversor activo (custodial: la asociación firma por él). Sólo relevante
  // en la vista de inversores.
  investorId: string | null;
  setInvestorId: (id: string | null) => void;
}

const ActorCtx = createContext<ActorState | null>(null);

export function ActorProvider({ children }: { children: ReactNode }) {
  const [fabricActor, setFabricActor] = useState<ProductoraActor>(
    () => (localStorage.getItem('fabricActor') as ProductoraActor) ?? 'asociacion',
  );
  const [investorId, setInvestorId] = useState<string | null>(
    () => localStorage.getItem('investorId'),
  );

  useEffect(() => { localStorage.setItem('fabricActor', fabricActor); }, [fabricActor]);
  useEffect(() => {
    if (investorId) localStorage.setItem('investorId', investorId);
    else localStorage.removeItem('investorId');
  }, [investorId]);

  const value = useMemo<ActorState>(() => ({
    fabricActor, setFabricActor, investorId, setInvestorId,
  }), [fabricActor, investorId]);

  return <ActorCtx.Provider value={value}>{children}</ActorCtx.Provider>;
}

export function useActor(): ActorState {
  const v = useContext(ActorCtx);
  if (!v) throw new Error('useActor must be inside ActorProvider');
  return v;
}

// MSPID asociado al actor activo. Útil para la UI (resaltar mis propuestas, etc.)
export function mspIdOf(actor: ProductoraActor): string {
  return ({
    asociacion: 'AsociacionMSP',
    productora1: 'Productora1MSP',
    productora2: 'Productora2MSP',
    productora3: 'Productora3MSP',
  } as const)[actor];
}
