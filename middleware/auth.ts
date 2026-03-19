/**
 * middleware/auth.ts — PIN-based admin authentication using JWT.
 *
 * Flow:
 *   1. Client POSTs to /api/admin/verify-pin with { pin }.
 *   2. Server compares against the stored admin_pin setting.
 *   3. On match, signs a short-lived JWT and returns { success, token }.
 *   4. Client sends the token in the Authorization: Bearer <token> header.
 *   5. requireAdmin middleware validates the token before admin-only routes.
 *
 * The JWT secret is derived from the admin PIN itself.  This means that
 * changing the PIN automatically invalidates all previously issued tokens —
 * a useful property for an in-venue kiosk app.
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database.js';

// Token TTL: 8 hours — enough for a full shift without repeated re-auth.
const TOKEN_TTL = '8h';

// Prefix used to derive the JWT secret from the PIN.
// This prevents raw PINs from being used as bare secrets.
const SECRET_PREFIX = 'nextgen-admin-';

function buildSecret(pin: string): string {
  return `${SECRET_PREFIX}${pin}`;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves the current admin PIN from settings.
 */
export async function getAdminPin(): Promise<string> {
  const db  = await getDb();
  const row = await db.get<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'admin_pin'"
  );
  if (!row) throw new Error('admin_pin setting not found in database');
  return row.value;
}

/**
 * Verifies the supplied PIN and, if correct, returns a signed JWT.
 * Returns null if the PIN is wrong.
 */
export async function verifyPinAndSign(
  pin: string
): Promise<string | null> {
  if (!/^\d{4}$/.test(pin)) return null;

  const storedPin = await getAdminPin();
  if (pin !== storedPin) return null;

  const secret = buildSecret(storedPin);
  const token  = jwt.sign({ role: 'admin' }, secret, { expiresIn: TOKEN_TTL });
  return token;
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * requireAdmin — attach to any route that needs admin privileges.
 *
 * Validates the Bearer token.  Re-fetches the current PIN on every request
 * so that a PIN change immediately revokes outstanding tokens.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or malformed' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const currentPin = await getAdminPin();
    const secret     = buildSecret(currentPin);
    jwt.verify(token, secret);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Admin token expired — please re-authenticate' });
    } else {
      res.status(403).json({ error: 'Invalid admin token' });
    }
  }
}
