export type Role = 'CLERK' | 'WAREHOUSE_OFFICER' | 'MANAGER' | 'ADMIN';
export interface Staff { id: number; name: string; role: Role }
export interface Variant { product_id: number; product_name: string; description?: string; base_price: string; category: string; variant_id: number; sku: string; size: string; color: string; current_stock: number; low_stock_threshold: number; supplier?: string }
export interface Activity { id: number; type: string; quantity: number; unit_price: string | number; amount: string | number; reference_note: string; performed_by: string; created_at: string; sku: string; product_name: string; size: string; color: string }
export interface Dashboard { units: number; valuation: string; low_stock: number; out_of_stock: number; total_sales: string; total_returns: string; total_purchases: string; activity: Activity[] }
export interface Notification { id: number; title: string; message: string; type: string; product_details: { orderId?: string; customer?: { name: string; email?: string }; items?: Array<{ sku: string; product: string; size: string; color: string; quantity: number; unitPrice?: string | number; amount?: number }> } | null; is_read: boolean; created_at: string }
export interface Supplier { id: number; name: string }
