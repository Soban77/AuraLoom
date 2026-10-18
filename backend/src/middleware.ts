import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'CLERK' | 'WAREHOUSE_OFFICER' | 'MANAGER' | 'ADMIN';
export interface AuthRequest extends Request { staff?: { id: number; name: string; role: Role } }
const secret = process.env.JWT_SECRET ?? 'development-only-change-me';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
  try { req.staff = jwt.verify(token, secret) as AuthRequest['staff']; next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.staff || !roles.includes(req.staff.role)) { res.status(403).json({ error: 'Insufficient permissions' }); return; }
    next();
  };
}
export { secret as jwtSecret };
