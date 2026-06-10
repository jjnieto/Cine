import type { Request, Response, NextFunction } from 'express';
import type { ActorKey } from '../fabric/gateway.js';

const ACTORS: readonly ActorKey[] = ['asociacion', 'productora1', 'productora2', 'productora3'];

// Lee el header X-Acting-As y lo valida. Si no viene, default 'asociacion'.
// El handler lee el actor desde `req.actor` (tipado abajo).
export function actorMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = (req.header('x-acting-as') ?? 'asociacion').toLowerCase() as ActorKey;
  if (!ACTORS.includes(raw)) {
    return res.status(400).json({ error: `invalid X-Acting-As: ${raw}` });
  }
  req.actor = raw;
  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: ActorKey;
    }
  }
}
