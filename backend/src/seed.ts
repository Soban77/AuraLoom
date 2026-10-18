import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, transaction } from './db.js';

const categories = ['Dresses', 'Tops', 'Knitwear', 'Bottoms', 'Outerwear'];
const suppliers = [
  { name: 'Atelier Sourcing Co.', contact: 'Maya Chen', email: 'maya@atelier.example', phone: '+1 212 555 0141' },
  { name: 'Northstar Textiles', contact: 'Olivia Reed', email: 'olivia@northstar.example', phone: '+1 212 555 0185' },
  { name: 'Maison Fabric House', contact: 'Sofia Laurent', email: 'sofia@maison.example', phone: '+1 212 555 0192' }
];
const products = [
  { name: 'The Solstice Midi', category: 'Dresses', supplier: 0, price: 248, colors: ['Ivory', 'Sage'] },
  { name: 'Luna Slip Dress', category: 'Dresses', supplier: 2, price: 198, colors: ['Black', 'Blush'] },
  { name: 'Petal Wrap Blouse', category: 'Tops', supplier: 0, price: 128, colors: ['Cream', 'Rose'] },
  { name: 'Everyday Silk Shirt', category: 'Tops', supplier: 1, price: 168, colors: ['White', 'Sage'] },
  { name: 'Cloud Cashmere Crew', category: 'Knitwear', supplier: 2, price: 298, colors: ['Oat', 'Charcoal'] },
  { name: 'Ribbed Weekend Knit', category: 'Knitwear', supplier: 1, price: 148, colors: ['Camel', 'Ivory'] },
  { name: 'Sculpted Wide-Leg Trouser', category: 'Bottoms', supplier: 0, price: 188, colors: ['Black', 'Stone'] },
  { name: 'The Tailored Midi Skirt', category: 'Bottoms', supplier: 1, price: 158, colors: ['Navy', 'Blush'] },
  { name: 'Cocoon Wool Coat', category: 'Outerwear', supplier: 2, price: 498, colors: ['Camel', 'Charcoal'] },
  { name: 'City Trench Jacket', category: 'Outerwear', supplier: 1, price: 368, colors: ['Sand', 'Olive'] }
];
const staff = [
  { name: 'Amelia Hart', email: 'amelia@auraloom.com', role: 'ADMIN' },
  { name: 'Noah Bennett', email: 'noah@auraloom.com', role: 'MANAGER' },
  { name: 'Mia Sullivan', email: 'mia@auraloom.com', role: 'WAREHOUSE_OFFICER' },
  { name: 'Ethan Brooks', email: 'ethan@auraloom.com', role: 'CLERK' }
];

async function seed(): Promise<void> {
  await transaction(async client => {
    const categoryIds = new Map<string, number>();
    for (const name of categories) {
      const result = await client.query('INSERT INTO categories(name,description) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description RETURNING id', [name, `${name} collection`]);
      categoryIds.set(name, result.rows[0].id);
    }
    const supplierIds: number[] = [];
    for (const supplier of suppliers) {
      const result = await client.query(`INSERT INTO suppliers(name,contact_person,email,phone) SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM suppliers WHERE name=$1::varchar(150)) RETURNING id`, [supplier.name, supplier.contact, supplier.email, supplier.phone]);
      const existing = result.rows[0] ?? (await client.query('SELECT id FROM suppliers WHERE name=$1', [supplier.name])).rows[0];
      supplierIds.push(existing.id);
    }
    const passwordHash = await bcrypt.hash('AuraLoom2026!', 10);
    for (const person of staff) await client.query(`INSERT INTO staff_users(name,email,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role`, [person.name, person.email, passwordHash, person.role]);
    const sizes = ['XS', 'S', 'M', 'L', 'XL'];
    for (let productIndex = 0; productIndex < products.length; productIndex++) {
      const product = products[productIndex]!;
      const productResult = await client.query(`INSERT INTO products(name,description,category_id,supplier_id,base_price) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM products WHERE name=$1::varchar(150)) RETURNING id`, [product.name, `A considered essential from the Aura & Loom ${product.category.toLowerCase()} collection.`, categoryIds.get(product.category), supplierIds[product.supplier], product.price]);
      const productId = productResult.rows[0]?.id ?? (await client.query('SELECT id FROM products WHERE name=$1', [product.name])).rows[0].id;
      for (let colorIndex = 0; colorIndex < product.colors.length; colorIndex++) {
        for (let sizeIndex = 0; sizeIndex < sizes.length; sizeIndex++) {
          const color = product.colors[colorIndex]!;
          const size = sizes[sizeIndex]!;
          const sku = `AL-${String(productIndex + 1).padStart(3, '0')}-${color.slice(0, 3).toUpperCase()}-${size}`;
          const stock = (productIndex * 3 + colorIndex * 5 + sizeIndex * 4) % 22;
          await client.query(`INSERT INTO product_variants(product_id,sku,size,color,current_stock,low_stock_threshold) VALUES($1,$2,$3,$4,$5,5) ON CONFLICT(sku) DO NOTHING`, [productId, sku, size, color, stock]);
        }
      }
    }
  });
  console.log('Seeded 5 categories, 3 suppliers, 10 products, size/color variants, and 4 demo staff users.');
  console.log('Demo password for all staff: AuraLoom2026!');
  await pool.end();
}
seed().catch(async error => { console.error(error); await pool.end(); process.exitCode = 1; });
