import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity as ActivityIcon, ArrowDownLeft, ArrowDownRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, CloudDownload, Filter, LayoutDashboard, LogOut, Menu, MoreHorizontal, Package, Plus, Search, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from './api';
import type { Activity, Dashboard, Notification, Role, Staff, Supplier, Variant } from './types';

type View = 'overview' | 'catalog' | 'out' | 'low' | 'transactions';
type Movement = 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'ADJUSTMENT';
const nav = [
  { id: 'overview' as View, label: 'Overview', icon: LayoutDashboard },
  { id: 'catalog' as View, label: 'Inventory', icon: Boxes },
  { id: 'out' as View, label: 'Out of stock', icon: Package },
  { id: 'low' as View, label: 'Low stock', icon: CircleAlert },
  { id: 'transactions' as View, label: 'Transactions', icon: ClipboardList }
];
const roleNames: Record<Role, string> = { ADMIN: 'Administrator', MANAGER: 'Store manager', WAREHOUSE_OFFICER: 'Warehouse officer', CLERK: 'Store clerk' };
const money = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
const moneyExact = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const initials = (name: string) => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();

export default function App() {
  const [user, setUser] = useState<Staff | null>(() => { try { return JSON.parse(localStorage.getItem('aura-user') ?? 'null') as Staff | null; } catch { return null; } });
  const [view, setView] = useState<View>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [transactions, setTransactions] = useState<Activity[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<Array<Staff & { email?: string }>>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [movement, setMovement] = useState<{ variant: Variant; type: Movement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [summary, productRows, activity, alerts, supplierRows] = await Promise.all([api.dashboard(), api.products(), api.transactions(), api.notifications(), api.suppliers()]);
      setDashboard(summary); setVariants(productRows); setTransactions(activity); setNotifications(alerts); setSuppliers(supplierRows); setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to reach the inventory API'); }
  }, [user]);
  useEffect(() => { void refresh(); if (!user) return; const timer = window.setInterval(() => { void api.notifications().then(setNotifications).catch(() => undefined); }, 15000); return () => window.clearInterval(timer); }, [refresh, user]);
  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    void api.demoUsers().then(rows => setStaffDirectory(rows)).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (movement) setMovement(null);
      else if (newItemOpen) setNewItemOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else if (drawer) setDrawer(false);
      else setMobileNav(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [movement, newItemOpen, settingsOpen, drawer]);

  const filtered = useMemo(() => variants.filter(item => {
    if (view === 'out' && item.current_stock !== 0) return false;
    if (view === 'low' && item.current_stock > item.low_stock_threshold) return false;
    const text = `${item.product_name} ${item.category} ${item.sku} ${item.size} ${item.color}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }), [variants, view, query]);
  const groups = useMemo(() => {
    const map = new Map<number, { name: string; category: string; price: string; variants: Variant[] }>();
    filtered.forEach(item => { const group = map.get(item.product_id) ?? { name: item.product_name, category: item.category, price: item.base_price, variants: [] }; group.variants.push(item); map.set(item.product_id, group); });
    return [...map.entries()].map(([id, item]) => ({ id, ...item }));
  }, [filtered]);
  const unread = notifications.filter(item => !item.is_read).length;

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    try { const result = await api.login(email, password); localStorage.setItem('aura-token', result.token); localStorage.setItem('aura-user', JSON.stringify(result.user)); setUser(result.user); toast.success(`Welcome back, ${result.user.name.split(' ')[0]}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not sign in'); }
    finally { setBusy(false); }
  };
  const logout = () => { localStorage.removeItem('aura-token'); localStorage.removeItem('aura-user'); setUser(null); setDashboard(null); };
  const openMovement = (variant: Variant, type: Movement) => setMovement({ variant, type });
  const saveMovement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!movement) return;
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get('quantity'));
    const unitPrice = Number(form.get('unitPrice'));
    if (!Number.isInteger(quantity) || quantity === 0 || (movement.type !== 'ADJUSTMENT' && quantity < 0)) { toast.error(movement.type === 'ADJUSTMENT' ? 'Enter a non-zero whole number' : 'Enter a quantity greater than zero'); return; }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { toast.error('Enter a valid unit price'); return; }
    setBusy(true);
    try { await api.movement({ variantId: movement.variant.variant_id, type: movement.type, quantity, unitPrice, reason: String(form.get('reason') ?? ''), supplierId: form.get('supplierId') ? Number(form.get('supplierId')) : null }); toast.success('Stock updated successfully'); setMovement(null); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update stock'); }
    finally { setBusy(false); }
  };
  const markRead = async (item: Notification) => { if (item.is_read) return; try { await api.readNotification(item.id); setNotifications(current => current.map(row => row.id === item.id ? { ...row, is_read: true } : row)); } catch { /* retain the unread state until server confirmation */ } };
  const markAllRead = async () => { try { await api.readAll(); setNotifications(current => current.map(item => ({ ...item, is_read: true }))); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update notifications'); } };
  const exportCsv = () => {
    const headers = ['Date', 'Product', 'SKU', 'Size', 'Color', 'Type', 'Quantity', 'Unit price', 'Transaction total', 'Staff', 'Notes'];
    const rows = transactions.map(row => [row.created_at, row.product_name, row.sku, row.size, row.color, row.type, row.quantity, row.unit_price, row.amount, row.performed_by, row.reference_note]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `aura-loom-audit-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); toast.success('Audit trail exported');
  };

  if (!user) return <LoginScreen onSignIn={signIn} busy={busy} />;
  const titles: Record<View, string> = { overview: 'Good morning', catalog: 'Inventory', out: 'Out of stock', low: 'Low stock radar', transactions: 'Transaction history' };
  const subtitle: Record<View, string> = { overview: 'Here’s what’s happening across your store today.', catalog: 'A considered view of every piece in your collection.', out: 'Items that need your attention before the next sale.', low: 'Keep your best-loved pieces ready to ship.', transactions: 'A clear, complete record of every stock movement.' };
  const currentTitle = view === 'overview' ? `Good morning, ${user.name.split(' ')[0]}` : titles[view];

  return <div className="app-shell">
    <aside id="workspace-sidebar" className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#home" onClick={event => event.preventDefault()}><span className="brand-mark">a<span>.</span></span><span className="brand-copy"><strong>aura & loom</strong><small>INVENTORY STUDIO</small></span></a>
      <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19} /></button>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">{nav.map(item => { const Icon = item.icon; const count = item.id === 'out' ? dashboard?.out_of_stock : item.id === 'low' ? dashboard?.low_stock : 0; return <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => { setView(item.id); setMobileNav(false); }}><Icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{count ? <span className="nav-count">{count}</span> : null}</button>; })}</nav>
      <div className="sidebar-spacer" />
      <div className="season-card"><div className="season-icon"><Sparkles size={15} /></div><span>THE NEW SEASON</span><strong>Thoughtfully stocked.</strong><small>Your collection, in harmony.</small><div className="season-progress"><i /></div><div className="season-foot"><span>Collection readiness</span><b>78%</b></div></div>
      <button className="nav-item settings-link" onClick={() => {
        if (user.role !== 'ADMIN') {
          toast.message('Settings are managed by your administrator');
          return;
        }
        setSettingsOpen(true);
      }}><Settings2 size={18} strokeWidth={1.7} /><span>Settings</span></button>
      <div className="sidebar-footer"><div className="avatar avatar-green">{initials(user.name)}</div><div className="footer-user"><strong>{user.name}</strong><small>{roleNames[user.role]}</small></div><button className="icon-button logout-button" onClick={logout} title="Log out"><LogOut size={16} /></button></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label={mobileNav ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNav} aria-controls="workspace-sidebar"><Menu size={20} /></button><span className="breadcrumb">Aura & Loom <ChevronRight size={13} /> <b>{nav.find(item => item.id === view)?.label}</b></span></div><div className="topbar-right"><span className="sync-label"><i /> Inventory synced</span><button className="notification-button" onClick={() => setDrawer(true)} aria-label={`Notifications, ${unread} unread`}><Bell size={19} strokeWidth={1.7} />{unread > 0 && <span className="notification-dot">{unread > 9 ? '9+' : unread}</span>}</button><span className="topbar-divider" /><button className="top-user" onClick={logout} title="Switch account / sign out"><span className="avatar avatar-small">{initials(user.name)}</span><span>{user.name.split(' ')[0]}</span><ChevronDown size={14} /></button></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">SATURDAY, OCTOBER 17 <span>·</span> 2026</div><h1>{currentTitle}</h1><p>{subtitle[view]}</p></div><button className="button button-light" onClick={() => void refresh()}><ActivityIcon size={16} /> Refresh data</button></div>
        {loadError && <div className="error-banner"><CircleAlert size={17} /><span>{loadError}. Check that PostgreSQL is running and the API has been started.</span><button onClick={() => void refresh()}>Retry</button></div>}
        {view === 'overview' && <Overview dashboard={dashboard} variants={variants} onNavigate={setView} onMovement={openMovement} />}
      {view !== 'overview' && <InventoryPage view={view} groups={groups} filtered={filtered} query={query} setQuery={setQuery} expanded={expanded} setExpanded={setExpanded} transactions={transactions} onMovement={openMovement} onExport={exportCsv} canCreateItem={user.role === 'MANAGER' || user.role === 'ADMIN'} onCreateItem={() => setNewItemOpen(true)} />}
      </div>
      <footer className="page-footer"><span>© 2026 Aura & Loom</span><span>Made with care, for a more considered wardrobe <span className="footer-heart">♥</span></span></footer>
    </main>
    <AnimatePresence>{settingsOpen && user?.role === 'ADMIN' && <SettingsPanel staff={staffDirectory} close={() => setSettingsOpen(false)} onRoleChange={(id, role) => setStaffDirectory(current => current.map(item => item.id === id ? { ...item, role } : item))} />}</AnimatePresence>
    <AnimatePresence>{newItemOpen && (user.role === 'MANAGER' || user.role === 'ADMIN') && <NewItemModal suppliers={suppliers} busy={busy} close={() => setNewItemOpen(false)} onSubmit={async (payload) => { setBusy(true); try { await api.createProduct(payload); toast.success('New item added'); setNewItemOpen(false); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add item'); } finally { setBusy(false); } }} />}</AnimatePresence>
    <AnimatePresence>{drawer && <NotificationDrawer notifications={notifications} close={() => setDrawer(false)} onRead={markRead} onReadAll={markAllRead} />}</AnimatePresence>
    <AnimatePresence>{movement && <MovementModal movement={movement} suppliers={suppliers} busy={busy} close={() => setMovement(null)} submit={saveMovement} canAdjust={user.role === 'MANAGER' || user.role === 'ADMIN'} />}</AnimatePresence>
  </div>;
}

function LoginScreen({ onSignIn, busy }: { onSignIn: (email: string, password: string) => Promise<void>; busy: boolean }) {
  const [email, setEmail] = useState('amelia@auraloom.com'); const [password, setPassword] = useState('AuraLoom2026!');
  return <div className="login-page"><div className="login-image"><div className="login-image-overlay" /><div className="login-image-copy"><span>THE ART OF A WELL-KEPT WARDROBE</span><h2>Every detail,<br />in its right place.</h2><p>A quieter kind of inventory management.</p></div><div className="login-image-credit">AURA & LOOM · NEW YORK</div></div><div className="login-form-wrap"><div className="login-brand"><span className="brand-mark">a<span>.</span></span><span className="brand-copy"><strong>aura & loom</strong><small>INVENTORY STUDIO</small></span></div><form className="login-form" onSubmit={event => { event.preventDefault(); void onSignIn(email, password); }}><div className="eyebrow">STAFF PORTAL</div><h1>Welcome back.</h1><p>Sign in to your workspace to continue.</p><label>Email address<input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label><label>Password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><button className="button button-primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to workspace'}<ArrowUpRight size={16} /></button><div className="demo-note"><ShieldCheck size={15} /><span>Demo access is ready. Use one of the prefilled staff accounts.</span></div></form><span className="login-copyright">© 2026 Aura & Loom. For team use only.</span></div></div>;
}

function Overview({ dashboard, variants, onNavigate, onMovement }: { dashboard: Dashboard | null; variants: Variant[]; onNavigate: (view: View) => void; onMovement: (variant: Variant, type: Movement) => void }) {
  const highlights = variants.slice(0, 5); const maxActivity = Math.max(1, ...dashboard?.activity.map(item => Math.abs(item.quantity)) ?? [1]);
  return <div className="overview-content"><section className="stats-grid">
    <StatCard label="STOCK VALUATION" value={money(dashboard?.valuation ?? 0)} note="Across your active collection" icon={<ShoppingBag size={18} />} tone="sand" trend="+8.2%" />
    <StatCard label="UNITS IN WAREHOUSE" value={(dashboard?.units ?? 0).toLocaleString()} note="Pieces across all variants" icon={<Boxes size={18} />} tone="sage" trend="Live count" />
    <StatCard label="LOW STOCK ALERTS" value={String(dashboard?.low_stock ?? 0)} note="At or below reorder point" icon={<CircleAlert size={18} />} tone="gold" trend="Needs attention" onClick={() => onNavigate('low')} />
    <StatCard label="OUT OF STOCK" value={String(dashboard?.out_of_stock ?? 0)} note="Variants ready to replenish" icon={<Package size={18} />} tone="rose" trend="View radar" onClick={() => onNavigate('out')} />
  </section>
  <section className="financial-grid"><div className="financial-heading"><span className="eyebrow">LIFETIME MOVEMENT VALUE</span><span>Based on each transaction’s saved unit price</span></div><div className="financial-cards"><FinancialCard label="PRODUCTS SOLD" value={moneyExact(dashboard?.total_sales ?? 0)} icon={<ArrowUpRight size={17} />} tone="financial-sales" /><FinancialCard label="RETURNS PROCESSED" value={moneyExact(dashboard?.total_returns ?? 0)} icon={<ArrowDownLeft size={17} />} tone="financial-returns" /><FinancialCard label="STOCK PURCHASED" value={moneyExact(dashboard?.total_purchases ?? 0)} icon={<Truck size={17} />} tone="financial-purchases" /></div></section>
  <section className="insight-grid"><div className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">THE LATEST</span><h2>Recent activity</h2></div><button className="text-link" onClick={() => onNavigate('transactions')}>View all <ArrowUpRight size={14} /></button></div><div className="activity-list">{dashboard?.activity.length ? dashboard.activity.slice(0, 5).map((item, index) => <ActivityRow key={item.id} item={item} index={index} />) : <EmptyState title="A fresh start" text="Stock movements will appear here as they happen." />}</div></div>
  <div className="panel stock-panel"><div className="panel-heading"><div><span className="eyebrow">A MOMENT IN TIME</span><h2>Stock health</h2></div><button className="icon-button tiny-icon" onClick={() => onNavigate('catalog')}><MoreHorizontal size={19} /></button></div><div className="health-visual"><div className="donut-chart"><div className="donut-inner"><strong>{dashboard?.units ?? '—'}</strong><span>total units</span></div></div><div className="health-legend"><div><i className="legend-dot in-stock" /><span>In stock</span><strong>{Math.max(0, (dashboard?.units ?? 0) - (dashboard?.low_stock ?? 0) - (dashboard?.out_of_stock ?? 0))}</strong></div><div><i className="legend-dot low-stock" /><span>Low stock</span><strong>{dashboard?.low_stock ?? 0}</strong></div><div><i className="legend-dot out-stock" /><span>Out of stock</span><strong>{dashboard?.out_of_stock ?? 0}</strong></div></div></div><div className="health-foot"><span><span className="health-pulse" /> All locations reporting</span><span>Just now</span></div></div></section>
  <section className="bottom-grid"><div className="panel movement-panel"><div className="panel-heading"><div><span className="eyebrow">MOVEMENT OVERVIEW</span><h2>Weekly stock movement</h2></div><span className="period-chip">Last 7 days <ChevronDown size={13} /></span></div><div className="chart-legend"><span><i className="chart-dot chart-in" /> Stock in</span><span><i className="chart-dot chart-out" /> Stock out</span></div><div className="bar-chart">{[['M', 38, 22], ['T', 61, 34], ['W', 48, 30], ['T', 79, 47], ['F', 57, 38], ['S', 92, 50], ['S', 68, 28]].map(([day, inbound, outbound], i) => <div className="bar-day" key={`${day}-${i}`}><div className="bars"><i style={{ height: `${inbound}%` }} /><i style={{ height: `${outbound}%` }} /></div><span>{day}</span></div>)}</div><div className="chart-labels"><span>Mon, Oct 12</span><span>Sun, Oct 18</span></div></div>
  <div className="panel attention-panel"><div className="panel-heading"><div><span className="eyebrow">NEEDS A LITTLE LOVE</span><h2>Restock radar</h2></div><button className="text-link" onClick={() => onNavigate('low')}>See all <ArrowUpRight size={14} /></button></div><div className="radar-list">{highlights.filter(item => item.current_stock <= item.low_stock_threshold).slice(0, 3).map((item, index) => <div className="radar-item" key={item.variant_id}><div className={`product-swatch swatch-${index}`}>{item.color.slice(0, 1)}</div><div className="radar-name"><strong>{item.product_name}</strong><span>{item.color} · {item.size}</span></div><div className="radar-quantity"><strong>{item.current_stock}</strong><span>left</span></div><button className="quick-icon" title="Stock in" onClick={() => onMovement(item, 'STOCK_IN')}><Plus size={15} /></button></div>)}{highlights.filter(item => item.current_stock <= item.low_stock_threshold).length === 0 && <p className="all-good"><Check size={16} /> Your collection is in good shape.</p>}</div></div></section>
  <section className="bottom-banner"><div className="banner-mark"><Truck size={19} /></div><div><strong>Thoughtful replenishment starts here.</strong><span>Review your supplier relationships and keep the pieces your customers love in stock.</span></div><button className="button button-outline" onClick={() => onNavigate('catalog')}>Explore inventory <ArrowUpRight size={15} /></button><span className="banner-decoration">a.</span></section>
  <span className="sr-only">{maxActivity}</span></div>;
}

function StatCard({ label, value, note, icon, tone, trend, onClick }: { label: string; value: string; note: string; icon: React.ReactNode; tone: string; trend: string; onClick?: () => void }) {
  return <button className={`stat-card stat-${tone} ${onClick ? 'stat-clickable' : ''}`} onClick={onClick}><div className="stat-top"><span>{label}</span><i>{icon}</i></div><div className="stat-value">{value}</div><div className="stat-bottom"><span>{note}</span><b>{trend}</b></div></button>;
}

function FinancialCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return <div className={`financial-card ${tone}`}><span className="financial-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function ActivityRow({ item, index }: { item: Activity; index: number }) {
  const inbound = item.quantity > 0;
  return <div className="activity-row"><div className={`activity-symbol ${inbound ? 'symbol-in' : 'symbol-out'}`}>{inbound ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</div><div className="activity-description"><strong>{item.type === 'STOCK_OUT' && item.performed_by === 'E-Commerce API' ? 'Online order fulfilled' : item.type.replace('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase())}</strong><span>{item.product_name} <i>·</i> {item.color} / {item.size}</span></div><div className="activity-person"><span className="avatar avatar-tiny">{initials(item.performed_by)}</span><span>{item.performed_by}</span></div><div className="activity-amount"><strong className={inbound ? 'amount-positive' : ''}>{moneyExact(item.amount)}</strong><span>{inbound ? '+' : ''}{item.quantity} units</span></div><div className="activity-time">{index < 1 ? 'Now' : dateLabel(item.created_at)}</div></div>;
}

function InventoryPage({ view, groups, filtered, query, setQuery, expanded, setExpanded, transactions, onMovement, onExport, canCreateItem, onCreateItem }: { view: View; groups: Array<{ id: number; name: string; category: string; price: string; variants: Variant[] }>; filtered: Variant[]; query: string; setQuery: (query: string) => void; expanded: number[]; setExpanded: (ids: number[]) => void; transactions: Activity[]; onMovement: (variant: Variant, type: Movement) => void; onExport: () => void; canCreateItem: boolean; onCreateItem: () => void }) {
  const isAudit = view === 'transactions';
  const [category, setCategory] = useState('All categories');
  const filteredGroups = category === 'All categories' ? groups : groups.filter(group => group.category === category);
  const categories = ['All categories', 'Dresses', 'Tops', 'Knitwear', 'Bottoms', 'Outerwear'];
  return <section className="panel inventory-panel"><div className="inventory-toolbar"><div className="result-count"><strong>{isAudit ? transactions.length : filtered.length}</strong> {isAudit ? 'movements' : 'variants'} <span>·</span> {isAudit ? 'Showing recent activity' : view === 'out' ? 'Replenishment required' : view === 'low' ? 'Below reorder threshold' : 'Across the full collection'}</div><div className="toolbar-actions">{!isAudit && <label className="category-select"><Filter size={14} /><select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>}<label className="search-field"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search SKU, product…" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label>{canCreateItem && <button className="button button-primary" onClick={onCreateItem}><Plus size={15} /> Add New Item</button>}{isAudit && <button className="button button-primary export-button" onClick={onExport}><CloudDownload size={15} /> Export CSV</button>}</div></div>
  {isAudit ? <TransactionTable transactions={transactions} /> : <div className="inventory-table-scroll"><div className="table-head"><span>PRODUCT / VARIANT</span><span>SKU</span><span>COLOR / SIZE</span><span>STOCK LEVEL</span><span>STATUS</span><span>ACTIONS</span></div><div className="product-list">{filteredGroups.map(group => <ProductGroup key={group.id} group={group} expanded={expanded.includes(group.id)} toggle={() => setExpanded(expanded.includes(group.id) ? expanded.filter(id => id !== group.id) : [...expanded, group.id])} onMovement={onMovement} />)}{filteredGroups.length === 0 && <EmptyState title="Nothing to see here" text={view === 'out' ? 'All variants are currently in stock.' : 'Try another search or category.'} />}</div></div>}
  <div className="table-footer"><span>Showing <strong>{isAudit ? transactions.length : filtered.length}</strong> of <strong>{isAudit ? transactions.length : filtered.length}</strong> {isAudit ? 'movements' : 'variants'}</span><div className="pagination"><button disabled aria-label="Previous page"><ChevronLeft size={15} /></button><button className="page-active">1</button><button disabled aria-label="Next page"><ChevronRight size={15} /></button></div></div></section>;
}

function ProductGroup({ group, expanded, toggle, onMovement }: { group: { id: number; name: string; category: string; price: string; variants: Variant[] }; expanded: boolean; toggle: () => void; onMovement: (variant: Variant, type: Movement) => void }) {
  const count = group.variants.reduce((sum, item) => sum + item.current_stock, 0); const display = group.variants[0]!;
  return <div className="product-group"><div className="product-row"><button type="button" className="product-info" aria-expanded={expanded} onClick={toggle}><span className={`product-thumb thumb-${group.id % 5}`}><ShoppingBag size={18} strokeWidth={1.5} /></span><span><strong>{group.name}</strong><small>{group.category} <i>·</i> {money(group.price)}</small></span><ChevronDown className={`row-chevron ${expanded ? 'rotated' : ''}`} size={16} /></button><span className="sku-main">{display.sku}</span>
  <span className="color-size"><i className={`color-dot color-${display.color.toLowerCase().replaceAll(' ', '-')}`} />{display.color}<b>{display.size}</b></span>
  <span className="stock-cell"><span className="stock-number">{count}</span><span className="stock-bar"><i style={{ width: `${Math.min(100, count / Math.max(1, group.variants.length * 0.2))}%` }} /></span></span>
  <span><StatusPill stock={Math.min(...group.variants.map(item => item.current_stock))} threshold={display.low_stock_threshold} /></span>
  <span className="row-action" onClick={event => event.stopPropagation()}><button className="quick-icon" title={display.current_stock === 0 ? 'Quick restock' : 'Stock in'} aria-label={display.current_stock === 0 ? `Quick restock ${group.name}` : `Stock in ${group.name}`} onClick={() => onMovement(display, 'STOCK_IN')}><Plus size={15} /></button><button className="icon-button tiny-icon" aria-label="Open variant actions" onClick={toggle}><MoreHorizontal size={17} /></button></span></div>
  <AnimatePresence initial={false}>{expanded && <motion.div className="variant-table" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}><div className="variant-head"><span>VARIANT SKU</span><span>COLOR / SIZE</span><span>AVAILABLE</span><span>STATUS</span><span>QUICK ACTIONS</span></div>{group.variants.map(variant => <div className="variant-row" key={variant.variant_id}><span className="variant-sku">{variant.sku}</span><span className="color-size"><i className={`color-dot color-${variant.color.toLowerCase().replaceAll(' ', '-')}`} />{variant.color}<b>{variant.size}</b></span><span className="variant-stock">{variant.current_stock} <small>units</small></span><span><StatusPill stock={variant.current_stock} threshold={variant.low_stock_threshold} /></span><span className="variant-actions"><button onClick={() => onMovement(variant, 'STOCK_IN')} title="Stock in"><ArrowDownLeft size={14} /></button><button onClick={() => onMovement(variant, 'STOCK_OUT')} title="Stock out"><ArrowUpRight size={14} /></button><button onClick={() => onMovement(variant, 'RETURN')} title="Return"><ArrowDownRight size={14} /></button><button onClick={() => onMovement(variant, 'ADJUSTMENT')} title="Adjustment"><SlidersHorizontal size={14} /></button></span></div>)}</motion.div>}</AnimatePresence></div>;
}

function StatusPill({ stock, threshold }: { stock: number; threshold: number }) { const label = stock === 0 ? 'Out of stock' : stock <= threshold ? 'Low stock' : 'In stock'; return <span className={`status-pill ${stock === 0 ? 'status-out' : stock <= threshold ? 'status-low' : 'status-in'}`}><i />{label}</span>; }

function TransactionTable({ transactions }: { transactions: Activity[] }) {
  return <div className="audit-table-scroll"><div className="table-head audit-head"><span>DATE</span><span>PRODUCT / SKU</span><span>TYPE</span><span>QUANTITY</span><span>UNIT PRICE</span><span>TRANSACTION TOTAL</span><span>PERFORMED BY</span><span>NOTES</span></div><div className="audit-list">{transactions.map(item => <div className="audit-row" key={item.id}><span className="audit-date">{dateLabel(item.created_at)}</span><span className="audit-product"><strong>{item.product_name}</strong><small>{item.sku} <i>·</i> {item.color} / {item.size}</small></span><span><span className={`type-pill ${item.type === 'STOCK_IN' || item.type === 'RETURN' ? 'type-in' : 'type-out'}`}>{item.type.replace('_', ' ')}</span></span><span className={`audit-quantity ${item.quantity > 0 ? 'amount-positive' : ''}`}>{item.quantity > 0 ? '+' : ''}{item.quantity}</span><span className="audit-price">{moneyExact(item.unit_price)}</span><strong className={`audit-total ${item.type === 'STOCK_IN' || item.type === 'RETURN' ? 'amount-positive' : ''}`}>{moneyExact(item.amount)}</strong><span className="audit-person"><span className="avatar avatar-tiny">{initials(item.performed_by)}</span>{item.performed_by}</span><span className="audit-note" title={item.reference_note}>{item.reference_note}</span></div>)}{transactions.length === 0 && <EmptyState title="No transactions yet" text="Your audit trail will begin with the first stock movement." />}</div></div>;
}

function MovementModal({ movement, suppliers, busy, close, submit, canAdjust }: { movement: { variant: Variant; type: Movement }; suppliers: Supplier[]; busy: boolean; close: () => void; submit: (event: React.FormEvent<HTMLFormElement>) => void; canAdjust: boolean }) {
  const [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState(String(Number(movement.variant.base_price) || 0));
  const movementValue = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const title = movement.type === 'STOCK_IN' ? 'Stock in' : movement.type === 'STOCK_OUT' ? 'Stock out' : movement.type === 'RETURN' ? 'Process a return' : 'Adjust stock';
  const descriptions: Record<Movement, string> = { STOCK_IN: 'Record incoming pieces to your collection.', STOCK_OUT: 'Record pieces sold or removed from stock.', RETURN: 'Return pieces to available inventory.', ADJUSTMENT: 'Correct inventory to match a physical count.' };
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><motion.div className="movement-modal" initial={{ y: 16, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 12, opacity: 0, scale: .98 }} transition={{ duration: .18 }}><div className="modal-top"><span className="modal-icon"><Package size={19} /></span><button className="icon-button" onClick={close} aria-label="Close modal"><X size={18} /></button></div><div className="eyebrow">INVENTORY MOVEMENT</div><h2>{title}</h2><p className="modal-description">{descriptions[movement.type]}</p>
  <div className="modal-product"><div className="product-swatch swatch-0"><ShoppingBag size={18} /></div><div><strong>{movement.variant.product_name}</strong><span>{movement.variant.sku} <i>·</i> {movement.variant.color} / {movement.variant.size}</span></div><div className="modal-available"><strong>{movement.variant.current_stock}</strong><span>available</span></div></div>
  <form onSubmit={submit}>
    <label className="form-label">Quantity <span>*</span><input name="quantity" type="number" step="1" min={movement.type === 'ADJUSTMENT' ? undefined : 1} max={movement.type === 'STOCK_OUT' ? movement.variant.current_stock : undefined} placeholder={movement.type === 'ADJUSTMENT' ? 'Use − to reduce, + to increase' : 'Enter quantity'} value={quantity} onChange={event => setQuantity(event.target.value)} required autoFocus /></label>
    <label className="form-label">{movement.type === 'STOCK_IN' ? 'Purchase price per unit' : 'Price per unit'} <span>*</span><div className="price-input-wrap"><span>$</span><input name="unitPrice" type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} required /></div><small className="price-hint">Catalog price: {moneyExact(movement.variant.base_price)} per unit</small></label>
    {movement.type === 'STOCK_IN' && <label className="form-label">Supplier <select name="supplierId" defaultValue={suppliers.find(supplier => supplier.name === movement.variant.supplier)?.id ?? ''}><option value="">Select a supplier</option>{suppliers.map(supplier => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>}
    {movement.type === 'ADJUSTMENT' && <div className="adjustment-hint">{canAdjust ? 'Enter a signed quantity. Use a negative number to reduce stock.' : 'Manager permissions required for adjustments.'}</div>}
    <label className="form-label">Reason / notes <span>*</span><textarea name="reason" placeholder="Add a note for the audit trail…" rows={3} minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} required /></label>
    <div className="movement-total"><span>{movement.type === 'STOCK_IN' ? 'Purchase total' : movement.type === 'STOCK_OUT' ? 'Sale total' : movement.type === 'RETURN' ? 'Return value' : 'Adjustment value'}</span><strong>{moneyExact(movementValue)}</strong></div>
    <div className="modal-actions"><button type="button" className="button button-light" onClick={close}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || (movement.type === 'ADJUSTMENT' && !canAdjust)}>{busy ? 'Saving…' : 'Confirm movement'}<ArrowUpRight size={15} /></button></div>
  </form>
  </motion.div>
  </motion.div>;
}

function SettingsPanel({ staff, close, onRoleChange }: { staff: Array<Staff & { email?: string }>; close: () => void; onRoleChange: (id: number, role: Role) => void }) {
  return <motion.div className="drawer-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button className="drawer-scrim" onClick={close} aria-label="Close settings" /><motion.aside className="notification-drawer settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" initial={{ x: 440 }} animate={{ x: 0 }} exit={{ x: 440 }} transition={{ type: 'spring', damping: 30, stiffness: 280 }}><div className="drawer-header settings-header"><div><span className="eyebrow">SYSTEM CONTROL</span><h2 id="settings-title">Admin settings</h2></div><button className="icon-button" onClick={close} aria-label="Close settings"><X size={19} /></button></div><div className="settings-content"><div className="settings-grid"><div className="settings-card"><h3>Security overview</h3><ul className="settings-list"><li><span>JWT authentication</span><strong>Enabled</strong></li><li><span>Webhook validation</span><strong>Protected</strong></li><li><span>Audit exports</span><strong>Available</strong></li><li><span>Role enforcement</span><strong>Active</strong></li></ul></div><div className="settings-card"><h3>Access roles</h3>{staff.length ? <div className="settings-user-list">{staff.map(person => <div className="settings-user" key={person.id}><div><strong>{person.name}</strong><small>{person.email ?? 'Staff account'}</small></div><select value={person.role} onChange={event => onRoleChange(person.id, event.target.value as Role)} aria-label={`Role for ${person.name}`}><option value="CLERK">Clerk</option><option value="WAREHOUSE_OFFICER">Warehouse Officer</option><option value="MANAGER">Store Manager</option><option value="ADMIN">System Administrator</option></select></div>)} </div> : <p className="settings-empty">No staff records loaded.</p>}</div></div></div><div className="settings-footer"><span>Demo changes are session-local and do not persist to the database.</span><button className="button button-primary" onClick={() => { toast.success('Admin settings updated'); close(); }}>Save settings</button></div></motion.aside></motion.div>;
}

function NewItemModal({ suppliers, busy, close, onSubmit }: { suppliers: Supplier[]; busy: boolean; close: () => void; onSubmit: (payload: { name: string; description: string; category: string; basePrice: number; size: string; color: string; stock: number; lowStockThreshold: number; supplierId?: number | null }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Dresses');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('Ivory');
  const [basePrice, setBasePrice] = useState('120');
  const [stock, setStock] = useState('12');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [supplierId, setSupplierId] = useState<string>('');

  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><motion.div className="movement-modal" initial={{ y: 16, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 12, opacity: 0, scale: .98 }} transition={{ duration: .18 }}><div className="modal-top"><span className="modal-icon"><Plus size={19} /></span><button className="icon-button" onClick={close} aria-label="Close modal"><X size={18} /></button></div><div className="eyebrow">CATALOG MANAGEMENT</div><h2>Add new item</h2><p className="modal-description">Create a new apparel product and initial variant in the live catalog.</p><form onSubmit={async event => { event.preventDefault(); await onSubmit({ name, description, category, basePrice: Number(basePrice), size, color, stock: Number(stock), lowStockThreshold: Number(lowStockThreshold), supplierId: supplierId ? Number(supplierId) : null }); }}>
      <label className="form-label">Product name <span>*</span><input value={name} onChange={event => setName(event.target.value)} required /></label>
      <label className="form-label">Description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} /></label>
      <div className="split-form"><label className="form-label">Category <span>*</span><select value={category} onChange={event => setCategory(event.target.value)}>{['Dresses','Tops','Knitwear','Bottoms','Outerwear'].map(option => <option key={option}>{option}</option>)}</select></label><label className="form-label">Supplier<select value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="">Select supplier</option>{suppliers.map(supplier => <option key={supplier.id} value={String(supplier.id)}>{supplier.name}</option>)}</select></label></div>
      <div className="split-form"><label className="form-label">Size <span>*</span><input value={size} onChange={event => setSize(event.target.value)} required /></label><label className="form-label">Color <span>*</span><input value={color} onChange={event => setColor(event.target.value)} required /></label></div>
      <div className="split-form"><label className="form-label">Base price <span>*</span><input type="number" min="0" step="0.01" value={basePrice} onChange={event => setBasePrice(event.target.value)} required /></label><label className="form-label">Available stock <span>*</span><input type="number" min="0" step="1" value={stock} onChange={event => setStock(event.target.value)} required /></label></div>
      <label className="form-label">Low stock threshold <span>*</span><input type="number" min="0" step="1" value={lowStockThreshold} onChange={event => setLowStockThreshold(event.target.value)} required /></label>
      <div className="modal-actions"><button type="button" className="button button-light" onClick={close}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save item'}<ArrowUpRight size={15} /></button></div>
    </form></motion.div></motion.div>;
}

function NotificationDrawer({ notifications, close, onRead, onReadAll }: { notifications: Notification[]; close: () => void; onRead: (item: Notification) => void; onReadAll: () => void }) {
  return <motion.div className="drawer-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button className="drawer-scrim" onClick={close} aria-label="Close notifications" /><motion.aside className="notification-drawer" initial={{ x: 440 }} animate={{ x: 0 }} exit={{ x: 440 }} transition={{ type: 'spring', damping: 30, stiffness: 280 }}><div className="drawer-header"><div><span className="eyebrow">YOUR INBOX</span><h2>Notifications <span>{notifications.filter(item => !item.is_read).length}</span></h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button></div><div className="drawer-actions"><span>{notifications.length} recent updates</span><button onClick={onReadAll}><Check size={14} /> Mark all read</button></div><div className="notification-list">{notifications.map(item => <button className={`notification-item ${item.is_read ? 'is-read' : ''}`} key={item.id} onClick={() => onRead(item)}><div className="notification-icon"><ShoppingBag size={17} /></div><div className="notification-content"><div className="notification-title"><strong>{item.title}</strong>{!item.is_read && <i />}</div><p>{item.message}</p>{item.product_details?.customer && <div className="customer-detail"><span>Customer</span><strong>{item.product_details.customer.name}</strong></div>}{item.product_details?.items?.map((variant, i) => <div className="notification-sku" key={`${item.id}-${i}`}><span>{variant.sku}</span><span>{variant.color} / {variant.size}</span><b>×{variant.quantity}</b><strong>{moneyExact(variant.amount ?? (Number(variant.unitPrice) || 0) * variant.quantity)}</strong></div>)}<time>{dateLabel(item.created_at)}</time></div></button>)}{notifications.length === 0 && <EmptyState title="All caught up" text="Online orders and stock updates will appear here." />}</div><div className="drawer-footer"><span><i /> Updates refresh automatically</span><span>Every 15 seconds</span></div></motion.aside></motion.div>;
}

function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span><Package size={19} /></span><strong>{title}</strong><p>{text}</p></div>; }
