import type { Activity, Dashboard, Notification, Staff, Supplier, Variant } from './types';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const token = () => localStorage.getItem('aura-token');
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}
export const api = {
  login: (email: string, password: string) => request<{ token: string; user: Staff }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  demoUsers: () => request<Array<Staff & { email: string }>>('/auth/demo'),
  dashboard: () => request<Dashboard>('/dashboard'),
  products: (search = '', status = '') => request<Variant[]>(`/products?search=${encodeURIComponent(search)}&status=${status}`),
  createProduct: (body: { name: string; description?: string; category: string; basePrice: number; size: string; color: string; stock: number; lowStockThreshold: number; supplierId?: number | null }) => request<{ id: number; variantId: number; sku: string; productName: string; color: string; size: string }>('/products', { method: 'POST', body: JSON.stringify(body) }),
  transactions: () => request<Activity[]>('/transactions'),
  notifications: () => request<Notification[]>('/notifications'),
  readNotification: (id: number) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  readAll: () => request('/notifications/read-all', { method: 'PATCH' }),
  suppliers: () => request<Supplier[]>('/suppliers'),
  movement: (body: { variantId: number; type: string; quantity: number; unitPrice: number; reason: string; supplierId?: number | null }) => request('/transactions', { method: 'POST', body: JSON.stringify(body) })
};
