import type { AuthPayload } from '../auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export {};
