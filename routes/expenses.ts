import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/database.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const VALID_CATEGORIES = ['internet', 'water', 'electricity', 'maintenance', 'game_dvd', 'psn', 'salary', 'other'] as const;
type Category = typeof VALID_CATEGORIES[number];

interface ExpenseRow {
  id: number;
  category: Category;
  description: string;
  amount: number;
  date: string;
  created_at: string;
}

// GET /api/expenses?month=YYYY-MM  (defaults to current month)
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const month =
      typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : new Date().toISOString().slice(0, 7);

    const rows = await db.all<ExpenseRow[]>(
      `SELECT id, category, description, amount, date, created_at
       FROM expenses
       WHERE date LIKE ?
       ORDER BY date DESC, id DESC`,
      [`${month}%`]
    );

    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    res.json({ data: rows, total });
  } catch (err) {
    console.error('[expenses] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST /api/expenses  (any logged-in staff)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { category, description = '', amount, date } = req.body as {
      category: string;
      description?: string;
      amount: unknown;
      date: string;
    };

    if (!VALID_CATEGORIES.includes(category as Category)) {
      res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
      return;
    }

    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      res.status(400).json({ error: 'amount must be a positive integer (whole LKR)' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      return;
    }

    const db = await getDb();
    const result = await db.run(
      `INSERT INTO expenses (category, description, amount, date) VALUES (?, ?, ?, ?)`,
      [category, String(description).trim(), amt, date]
    );

    const row = await db.get<ExpenseRow>(
      `SELECT id, category, description, amount, date, created_at FROM expenses WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json({ data: row });
  } catch (err) {
    console.error('[expenses] POST error:', err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// DELETE /api/expenses/:id  (admin only)
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);

    const existing = await db.get<{ id: number }>(`SELECT id FROM expenses WHERE id = ?`, [id]);
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    await db.run(`DELETE FROM expenses WHERE id = ?`, [id]);
    res.json({ data: { id, deleted: true } });
  } catch (err) {
    console.error('[expenses] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
