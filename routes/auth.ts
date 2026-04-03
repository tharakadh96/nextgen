/**
 * routes/auth.ts — Staff authentication using JWT + bcrypt.
 *
 * POST /api/auth/login          — verify credentials against DB, return JWT
 * GET  /api/auth/verify         — verify an existing staff JWT
 * POST /api/auth/reset-password — update stored username/password (no UI)
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDb } from '../db/database.js';

const router = Router();
const STAFF_TOKEN_TTL = '12h';

function getSecret(): string {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error('APP_JWT_SECRET is not set in environment');
  return secret;
}

async function getStaffCredentials(): Promise<{ username: string; passwordHash: string } | null> {
  const db = await getDb();
  const [usernameRow, hashRow] = await Promise.all([
    db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'staff_username'"),
    db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'staff_password_hash'"),
  ]);
  if (!usernameRow || !hashRow || !hashRow.value) return null;
  return { username: usernameRow.value, passwordHash: hashRow.value };
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const credentials = await getStaffCredentials();
    if (!credentials) {
      res.status(500).json({ error: 'Staff credentials not configured' });
      return;
    }

    const usernameMatch = username === credentials.username;
    const passwordMatch = await bcrypt.compare(password, credentials.passwordHash);

    if (!usernameMatch || !passwordMatch) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = jwt.sign({ role: 'staff' }, getSecret(), { expiresIn: STAFF_TOKEN_TTL });
    res.json({ success: true, token });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/verify
router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ valid: false });
    return;
  }
  try {
    jwt.verify(authHeader.slice(7), getSecret());
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// POST /api/auth/reset-password
// Body: { username?: string, password: string }
// Not exposed in the UI — call directly via curl/Postman.
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body ?? {};
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const db = await getDb();
    const hash = await bcrypt.hash(password, 10);

    await db.run("UPDATE settings SET value = ? WHERE key = 'staff_password_hash'", hash);

    if (username && typeof username === 'string' && username.trim()) {
      await db.run("UPDATE settings SET value = ? WHERE key = 'staff_username'", username.trim());
    }

    res.json({ success: true, message: 'Credentials updated' });
  } catch (err) {
    console.error('[POST /api/auth/reset-password]', err);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
});

export default router;
