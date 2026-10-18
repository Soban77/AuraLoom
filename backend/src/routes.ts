import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, transaction } from './db.js';
import { authenticate, authorize, jwtSecret, type AuthRequest } from './middleware.js';

export const router = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const createProductSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  category: z.string().trim().min(2).max(100),
  basePrice: z.number().finite().nonnegative(),
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(2).max(50),
  stock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  supplierId: z.number().int().positive().nullable().optional()
});
const movementSchema = z.object({ variantId: z.number().int().positive(), type: z.enum(['STOCK_IN', 'STOCK_OUT', 'RETURN', 'ADJUSTMENT']), quantity: z.number().int().refine(value => value !== 0, 'Quantity cannot be zero'), unitPrice: z.number().finite().nonnegative(), reason: z.string().trim().min(3).max(500), supplierId: z.number().int().positive().nullable().optional() }).superRefine((movement, context) => {
  if (movement.type !== 'ADJUSTMENT' && movement.quantity < 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Quantity must be positive for this movement type', path: ['quantity'] });
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const { rows } = await pool.query('SELECT id,name,email,password_hash,role FROM staff_users WHERE email=$1', [parsed.data.email]);
    const staff = rows[0];
    if (!staff || !(await bcrypt.compare(parsed.data.password, staff.password_hash))) { res.status(401).json({ error: 'Email or password is incorrect' }); return; }
    const user = { id: staff.id, name: staff.name, role: staff.role };
    res.json({ token: jwt.sign(user, jwtSecret, { expiresIn: '12h' }), user });
  } catch (error) { next(error); }
});

router.use((req, res, next) => {
  if (req.path === '/webhooks/order-placed' || req.path === '/health') { next(); return; }
  authenticate(req as AuthRequest, res, next);
});

router.get('/auth/demo', async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT id,name,email,role FROM staff_users ORDER BY id'); res.json(rows); } catch (error) { next(error); }
});

router.get('/products', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '');
    const result = await pool.query(`SELECT p.id product_id,p.name product_name,p.description,p.base_price,p.image_url,c.name category,
      v.id variant_id,v.sku,v.size,v.color,v.current_stock,v.low_stock_threshold,s.name supplier
      FROM products p LEFT JOIN categories c ON c.id=p.category_id JOIN product_variants v ON v.product_id=p.id
      LEFT JOIN suppliers s ON s.id=p.supplier_id
      WHERE ($1='' OR p.name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%' OR v.sku ILIKE '%'||$1||'%' OR v.size ILIKE '%'||$1||'%' OR v.color ILIKE '%'||$1||'%')
      AND ($2='' OR ($2='out' AND v.current_stock=0) OR ($2='low' AND v.current_stock<=v.low_stock_threshold))
      ORDER BY p.name,v.color,v.size`, [search, status]);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/products', authorize('MANAGER', 'ADMIN'), async (req, res, next) => {
  try {
    const parsed = createProductSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const payload = parsed.data;

    const record = await transaction(async client => {
      const categoryRow = await client.query(`INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING RETURNING id`, [payload.category]);
      const categoryId = categoryRow.rows[0]?.id ?? (await client.query('SELECT id FROM categories WHERE name=$1', [payload.category])).rows[0].id;

      const productResult = await client.query(
        `INSERT INTO products(name, description, category_id, supplier_id, base_price) VALUES($1, $2, $3, $4, $5) RETURNING id, name, base_price`,
        [payload.name, payload.description || null, categoryId, payload.supplierId ?? null, payload.basePrice]
      );

      const snippet = payload.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 5).toUpperCase() || 'AL';
      const sku = `${snippet}-${Date.now()}-${payload.size.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4)}-${payload.color.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4)}`;
      const variantResult = await client.query(
        `INSERT INTO product_variants(product_id, sku, size, color, current_stock, low_stock_threshold) VALUES($1, $2, $3, $4, $5, $6) RETURNING id, sku, size, color`,
        [productResult.rows[0].id, sku, payload.size, payload.color, payload.stock, payload.lowStockThreshold]
      );

      return {
        id: productResult.rows[0].id,
        variantId: variantResult.rows[0].id,
        sku: variantResult.rows[0].sku,
        productName: productResult.rows[0].name,
        color: variantResult.rows[0].color,
        size: variantResult.rows[0].size
      };
    });

    res.status(201).json(record);
  } catch (error) { next(error); }
});

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [stats, activity] = await Promise.all([
      pool.query(`WITH inventory AS (
        SELECT COALESCE(SUM(v.current_stock),0)::int AS units,COALESCE(SUM(v.current_stock*p.base_price),0)::numeric(12,2) AS valuation,
          COUNT(*) FILTER(WHERE v.current_stock<=v.low_stock_threshold AND v.current_stock>0)::int AS low_stock,
          COUNT(*) FILTER(WHERE v.current_stock=0)::int AS out_of_stock
        FROM product_variants v JOIN products p ON p.id=v.product_id
      ), movement_totals AS (
        SELECT COALESCE(SUM(ABS(quantity)*unit_price) FILTER(WHERE type='STOCK_OUT'),0)::numeric(14,2) AS total_sales,
          COALESCE(SUM(ABS(quantity)*unit_price) FILTER(WHERE type='RETURN'),0)::numeric(14,2) AS total_returns,
          COALESCE(SUM(ABS(quantity)*unit_price) FILTER(WHERE type='STOCK_IN'),0)::numeric(14,2) AS total_purchases
        FROM transactions
      ) SELECT * FROM inventory CROSS JOIN movement_totals`),
      pool.query(`SELECT t.id,t.type,t.quantity,t.unit_price,(ABS(t.quantity)*t.unit_price)::numeric(14,2) AS amount,t.reference_note,t.performed_by,t.created_at,v.sku,p.name product_name,v.size,v.color FROM transactions t JOIN product_variants v ON v.id=t.variant_id JOIN products p ON p.id=v.product_id ORDER BY t.created_at DESC LIMIT 8`)
    ]);
    res.json({ ...stats.rows[0], activity: activity.rows });
  } catch (error) { next(error); }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await pool.query(`SELECT t.id,t.type,t.quantity,t.unit_price,(ABS(t.quantity)*t.unit_price)::numeric(14,2) AS amount,t.reference_note,t.performed_by,t.created_at,v.sku,v.size,v.color,p.name product_name,s.name supplier
      FROM transactions t JOIN product_variants v ON v.id=t.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN suppliers s ON s.id=t.supplier_id
      ORDER BY t.created_at DESC LIMIT $1`, [limit]); res.json(rows);
  } catch (error) { next(error); }
});

router.post('/transactions', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const parsed = movementSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const movement = parsed.data;
    if (movement.type === 'ADJUSTMENT' && !['MANAGER', 'ADMIN'].includes(req.staff!.role)) { res.status(403).json({ error: 'Only managers and administrators can adjust stock' }); return; }
    const delta = movement.type === 'STOCK_OUT' ? -movement.quantity : movement.quantity;
    const record = await transaction(async client => {
      const adjusted = await client.query(`UPDATE product_variants v SET current_stock=v.current_stock+$1 FROM products p WHERE v.id=$2 AND v.current_stock+$1>=0 AND p.id=v.product_id RETURNING v.id,v.current_stock,p.base_price`, [delta, movement.variantId]);
      if (!adjusted.rowCount) throw Object.assign(new Error('Variant not found or quantity exceeds available stock'), { status: 409 });
      const inserted = await client.query(`INSERT INTO transactions(variant_id,supplier_id,type,quantity,unit_price,reference_note,performed_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *, (ABS(quantity)*unit_price)::numeric(14,2) AS amount`, [movement.variantId, movement.supplierId ?? null, movement.type, delta, movement.unitPrice, movement.reason, req.staff!.name]);
      return { transaction: inserted.rows[0], stock: adjusted.rows[0].current_stock, unitPrice: movement.unitPrice };
    });
    res.status(201).json(record);
  } catch (error) { next(error); }
});

const orderSchema = z.object({ orderId: z.string().trim().min(1).max(100), customer: z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().optional() }), items: z.array(z.object({ sku: z.string().trim().min(1), quantity: z.number().int().positive() })).min(1) });
router.post('/webhooks/order-placed', async (req, res, next) => {
  try {
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected) { res.status(503).json({ error: 'Webhook authentication is not configured' }); return; }
    if (req.headers['x-webhook-secret'] !== expected) { res.status(401).json({ error: 'Invalid webhook secret' }); return; }
    const parsed = orderSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const order = parsed.data;
    const output = await transaction(async client => {
      const claimed = await client.query(`INSERT INTO webhook_orders(order_id) VALUES($1) ON CONFLICT(order_id) DO NOTHING RETURNING order_id`, [order.orderId]);
      if (!claimed.rowCount) {
        const previous = await client.query('SELECT response FROM webhook_orders WHERE order_id=$1', [order.orderId]);
        return { ...(previous.rows[0]?.response ?? { orderId: order.orderId, items: [] }), duplicate: true };
      }
      const details = [];
      for (const item of order.items) {
        const result = await client.query(`UPDATE product_variants v SET current_stock=v.current_stock-$1 FROM products p WHERE v.sku=$2 AND v.current_stock >= $1 AND p.id=v.product_id RETURNING v.id,v.sku,v.size,v.color,v.current_stock,v.product_id,p.base_price`, [item.quantity, item.sku]);
        if (!result.rowCount) throw Object.assign(new Error(`Insufficient stock or unknown SKU: ${item.sku}`), { status: 409 });
        const variant = result.rows[0];
        const product = await client.query('SELECT name FROM products WHERE id=$1', [variant.product_id]);
        await client.query(`INSERT INTO transactions(variant_id,type,quantity,unit_price,reference_note,performed_by) VALUES($1,'STOCK_OUT',$2,$3,$4,'E-Commerce API')`, [variant.id, -item.quantity, variant.base_price, `Online order ${order.orderId} — ${order.customer.name}`]);
        details.push({ sku: variant.sku, product: product.rows[0]?.name, size: variant.size, color: variant.color, quantity: item.quantity, unitPrice: variant.base_price, amount: Number(variant.base_price) * item.quantity });
      }
      const names = details.map(item => `${item.quantity} × ${item.sku}`).join(', ');
      await client.query(`INSERT INTO notifications(title,message,type,product_details) VALUES($1,$2,'ONLINE_ORDER',$3::jsonb)`, [`Online order ${order.orderId}`, `${order.customer.name} placed an order for ${names}.`, JSON.stringify({ orderId: order.orderId, customer: order.customer, items: details })]);
      const result = { orderId: order.orderId, items: details };
      await client.query('UPDATE webhook_orders SET response=$2::jsonb WHERE order_id=$1', [order.orderId, JSON.stringify(result)]);
      return { ...result, duplicate: false };
    });
    res.status(output.duplicate ? 200 : 201).json({ success: true, ...output });
  } catch (error) { next(error); }
});

router.get('/notifications', async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT id,title,message,type,product_details,is_read,created_at FROM notifications ORDER BY created_at DESC LIMIT 50'); res.json(rows); } catch (error) { next(error); }
});
router.patch('/notifications/:id/read', async (req, res, next) => {
  try { const { rows } = await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 RETURNING id,is_read', [Number(req.params.id)]); if (!rows[0]) { res.status(404).json({ error: 'Notification not found' }); return; } res.json(rows[0]); } catch (error) { next(error); }
});
router.patch('/notifications/read-all', async (_req, res, next) => {
  try { await pool.query('UPDATE notifications SET is_read=true WHERE is_read=false'); res.json({ success: true }); } catch (error) { next(error); }
});
router.get('/suppliers', async (_req, res, next) => { try { const { rows } = await pool.query('SELECT id,name FROM suppliers ORDER BY name'); res.json(rows); } catch (error) { next(error); } });
router.get('/staff', async (_req, res, next) => { try { const { rows } = await pool.query('SELECT id,name,role FROM staff_users ORDER BY id'); res.json(rows); } catch (error) { next(error); } });
router.get('/health', (_req, res) => res.json({ status: 'ok' }));
