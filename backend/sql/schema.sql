CREATE TABLE IF NOT EXISTS staff_users (
 id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL,
 password_hash VARCHAR(255) NOT NULL, role VARCHAR(50) CHECK(role IN ('CLERK','WAREHOUSE_OFFICER','MANAGER','ADMIN')) NOT NULL,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY,name VARCHAR(100) UNIQUE NOT NULL,description TEXT);
CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY,name VARCHAR(150) NOT NULL,contact_person VARCHAR(100),email VARCHAR(100),phone VARCHAR(50));
CREATE TABLE IF NOT EXISTS products (
 id SERIAL PRIMARY KEY,name VARCHAR(150) NOT NULL,description TEXT,category_id INT REFERENCES categories(id) ON DELETE SET NULL,
 supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,base_price NUMERIC(10,2) NOT NULL CHECK(base_price>=0),image_url TEXT,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_variants (
 id SERIAL PRIMARY KEY,product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,sku VARCHAR(50) UNIQUE NOT NULL,
 size VARCHAR(20) NOT NULL,color VARCHAR(50) NOT NULL,current_stock INT NOT NULL DEFAULT 0 CHECK(current_stock>=0),
 low_stock_threshold INT NOT NULL DEFAULT 5 CHECK(low_stock_threshold>=0),UNIQUE(product_id,size,color)
);
CREATE TABLE IF NOT EXISTS transactions (
 id SERIAL PRIMARY KEY,variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
 supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,type VARCHAR(20) CHECK(type IN ('STOCK_IN','STOCK_OUT','RETURN','ADJUSTMENT')) NOT NULL,
 quantity INT NOT NULL CHECK(quantity<>0),unit_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(unit_price>=0),
 reference_note TEXT NOT NULL,performed_by VARCHAR(100) NOT NULL,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(unit_price>=0);
UPDATE transactions t SET unit_price=p.base_price FROM product_variants v JOIN products p ON p.id=v.product_id WHERE t.variant_id=v.id AND t.unit_price=0;
CREATE TABLE IF NOT EXISTS notifications (
 id SERIAL PRIMARY KEY,title VARCHAR(150) NOT NULL,message TEXT NOT NULL,type VARCHAR(50) NOT NULL,
 product_details JSONB,is_read BOOLEAN DEFAULT FALSE,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS webhook_orders (
 order_id VARCHAR(100) PRIMARY KEY,response JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_variants_stock ON product_variants(current_stock);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
