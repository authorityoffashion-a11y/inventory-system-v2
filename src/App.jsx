import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
const AUTH_KEY = 'inv_auth_v2';
const CORRECT_PIN = import.meta.env.VITE_ACCESS_PIN || '1234';

function AuthGate({ children }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (pin === CORRECT_PIN) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      setAuthed(true);
    } else {
      setError('Incorrect PIN. Try again.');
      setPin('');
    }
  };

  if (authed) return children;

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#F3F4F6' }}>
      <div style={{ background:'white', padding:'40px', borderRadius:'12px', boxShadow:'0 4px 24px rgba(0,0,0,0.1)', minWidth:'320px', textAlign:'center' }}>
        <div style={{ fontSize:'36px', marginBottom:'12px' }}>🔐</div>
        <h2 style={{ margin:'0 0 8px', fontSize:'22px', color:'#111827' }}>Inventory System</h2>
        <p style={{ color:'#6B7280', marginBottom:'24px', fontSize:'14px' }}>Enter your PIN to continue</p>
        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          style={{ width:'100%', padding:'12px', border:'2px solid #E5E7EB', borderRadius:'8px', fontSize:'18px', textAlign:'center', letterSpacing:'6px', boxSizing:'border-box' }}
        />
        {error && <p style={{ color:'#EF4444', marginTop:'8px', fontSize:'13px' }}>{error}</p>}
        <button
          onClick={handleLogin}
          style={{ marginTop:'16px', width:'100%', padding:'12px', background:'#7C3AED', color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:'600', cursor:'pointer' }}>
          Unlock
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const getStatus = (product) => {
  if (product.hold_stock > 0) return '🔵 ON HOLD';
  if (product.sellable_stock <= product.reorder_point) return '🔴 CRITICAL';
  if (product.sellable_stock <= product.reorder_point * 1.25) return '🟡 WARNING';
  return '🟢 GOOD';
};

const formatTime = (date) => {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const calcDaysToStockout = (sellable, avgSales) => {
  if (!avgSales || avgSales <= 0) return '∞';
  const days = Math.round(sellable / avgSales);
  if (days > 999) return '999+';
  return String(days);
};

const calcAutoReorderPoint = (avgDailySales, leadDays = 7) => {
  return Math.ceil((avgDailySales || 0) * leadDays * 1.5) || 5;
};

const btnStyle = (bg, outline = false, size = 'normal') => {
  const pad = size === 'small' ? '5px 10px' : '10px 18px';
  const fs = size === 'small' ? '12px' : '13px';
  if (outline) return { padding: pad, background: 'white', color: '#374151', border: '2px solid #E5E7EB', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: fs };
  return { padding: pad, background: bg, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: fs };
};
const thStyle = () => ({ padding: '10px 12px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#374151', borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' });
const tdStyle = () => ({ padding: '10px 12px', fontSize: '13px', verticalAlign: 'middle' });
const labelStyle = { display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '13px', color: '#374151' };
const inputStyle = { width: '100%', padding: '9px', border: '2px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' };

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
const InventoryApp = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  // FIXED: separate loading states for sync vs push — they no longer block each other
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [lastPushTime, setLastPushTime] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState(new Set());

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState('add');
  const [importLog, setImportLog] = useState([]);

  const [salesPeriod, setSalesPeriod] = useState(() => parseInt(localStorage.getItem('salesPeriod') || '30'));
  const [deadStockThreshold, setDeadStockThreshold] = useState(() => parseInt(localStorage.getItem('deadStockDays') || '30'));
  const [deadStockSalesThreshold, setDeadStockSalesThreshold] = useState(() => parseFloat(localStorage.getItem('deadStockSales') || '0'));

  const [formData, setFormData] = useState({
    product_name: '', local_name: '', sku: '', sellable_stock: 0, hold_stock: 0,
    design: '', reorder_point: 5, reorder_point_custom: false,
    supplier_id: null, category_id: null, avg_daily_sales: 0, notes: ''
  });
  const [addStockValue, setAddStockValue] = useState({});

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    await Promise.all([fetchProducts(), fetchCategories(), fetchSuppliers(), fetchSnapshots()]);
    checkShopifyConnection();
    const ls = localStorage.getItem('lastSync');
    const lp = localStorage.getItem('lastPush');
    if (ls) setLastSyncTime(new Date(ls));
    if (lp) setLastPushTime(new Date(lp));
  };

  // ── FETCHERS ──
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('inventory_v2').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error('fetchProducts error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories(data || []);
  };

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
  };

  const fetchSnapshots = async () => {
    const { data } = await supabase.from('inventory_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(12);
    setSnapshots(data || []);
  };

  // ── SHOPIFY ──
  const checkShopifyConnection = async () => {
    try {
      const r = await fetch('/api/shopify?action=checkConnection');
      const d = await r.json();
      setShopifyConnected(d.connected || false);
    } catch {
      setShopifyConnected(false);
    }
  };

  // FIXED: uses setIsSyncing, not shared state
  const initialSyncFromShopify = async () => {
    if (!shopifyConnected) return alert('Shopify not connected.');
    if (!confirm('Import ALL Shopify products? Existing SKUs will be updated.')) return;
    setIsSyncing(true);
    const log = [];
    try {
      const r = await fetch('/api/shopify?action=getAllProducts');
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      const items = d.products || [];
      log.push(`Found ${items.length} products in Shopify`);
      let created = 0, updated = 0;

      for (const p of items) {
        const variant = p.variants[0];
        const sku = variant.sku || `SHOPIFY-${p.id}`;
        const qty = variant.inventory_quantity || 0;
        const { data: existing } = await supabase.from('inventory_v2').select('id,sku').eq('sku', sku).maybeSingle();
        if (existing) {
          await supabase.from('inventory_v2').update({ sellable_stock: qty, product_name: p.title }).eq('sku', sku);
          log.push(`✅ Updated: ${p.title}`);
          updated++;
        } else {
          const rp = calcAutoReorderPoint(1);
          await supabase.from('inventory_v2').insert([{
            product_name: p.title, local_name: p.title, sku,
            sellable_stock: qty, hold_stock: 0,
            design: p.product_type || '',
            reorder_point: rp, reorder_point_custom: false,
            avg_daily_sales: 0, category_id: null, supplier_id: null,
            notes: '', shopify_pushed_at: null, is_dead_stock: false
          }]);
          log.push(`✅ Created: ${p.title}`);
          created++;
        }
        await new Promise(res => setTimeout(res, 200));
      }

      const now = new Date().toISOString();
      localStorage.setItem('lastSync', now);
      setLastSyncTime(new Date(now));
      setImportLog(log);
      alert(`✅ Initial sync complete!\nCreated: ${created}\nUpdated: ${updated}`);
      fetchProducts();
    } catch (e) {
      console.error(e);
      alert(`Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false); // FIXED: always resets
    }
  };

  const syncOrdersFromShopify = async () => {
    if (!shopifyConnected) return alert('Shopify not connected.');
    setIsSyncing(true);
    const log = [];
    try {
      // Always fetch last 30 days for avg_daily_sales calculation
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const since = lastSyncTime ? lastSyncTime.toISOString() : thirtyDaysAgo;

      // Fetch new orders since last sync (for deducting stock)
      const r = await fetch(`/api/shopify?action=getOrders&since=${encodeURIComponent(since)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      const orders = d.orders || [];
      log.push(`Found ${orders.length} orders since last sync`);

      // Also fetch 30-day orders for avg calculation (separate call)
      const r30 = await fetch(`/api/shopify?action=getOrders&since=${encodeURIComponent(thirtyDaysAgo)}`);
      const d30 = r30.ok ? await r30.json() : { orders: orders };
      const orders30 = d30.orders || orders;

      // Build a map: sku → total units sold in last 30 days
      const skuSales30 = {};
      for (const order of orders30) {
        for (const item of order.line_items) {
          if (item.sku) {
            skuSales30[item.sku] = (skuSales30[item.sku] || 0) + item.quantity;
          }
        }
      }

      // Deduct stock from new orders
      let processed = 0, notFound = 0;
      for (const order of orders) {
        for (const item of order.line_items) {
          const { data: prod } = await supabase.from('inventory_v2').select('*').eq('sku', item.sku).maybeSingle();
          if (prod) {
            const newStock = Math.max(0, prod.sellable_stock - item.quantity);
            await supabase.from('inventory_v2').update({
              sellable_stock: newStock,
              last_sold_at: new Date().toISOString()
            }).eq('id', prod.id);
            log.push(`✅ ${prod.product_name}: -${item.quantity} → ${newStock}`);
            processed++;
          } else {
            log.push(`❌ Not found: ${item.name} (SKU: ${item.sku || 'none'})`);
            notFound++;
          }
        }
      }

      // Use actual days with orders as divisor, not always 30
      // This means if your store only has 8 days of history, we divide by 8 not 30
      let earliestDate = new Date();
      for (const o of orders30) { const d = new Date(o.created_at); if (d < earliestDate) earliestDate = d; }
      const actualDays = orders30.length > 0
        ? Math.max(1, Math.ceil((new Date() - earliestDate) / (1000 * 60 * 60 * 24)))
        : 30;
      log.push();

      // Update avg_daily_sales for all products that have 30-day data
      let avgUpdated = 0;
      for (const [sku, totalSold] of Object.entries(skuSales30)) {
        const avgPerDay = parseFloat((totalSold / actualDays).toFixed(2));
        const { data: prod } = await supabase.from('inventory_v2').select('id,reorder_point_custom').eq('sku', sku).maybeSingle();
        if (prod) {
          const updatePayload = { avg_daily_sales: avgPerDay };
          // Only auto-update reorder_point if user hasn't set a custom one
          if (!prod.reorder_point_custom) {
            updatePayload.reorder_point = calcAutoReorderPoint(avgPerDay);
          }
          await supabase.from('inventory_v2').update(updatePayload).eq('id', prod.id);
          avgUpdated++;
        }
      }

      log.push(`📊 Updated avg_daily_sales for ${avgUpdated} products over  actual days`);

      const now = new Date().toISOString();
      localStorage.setItem('lastSync', now);
      setLastSyncTime(new Date(now));
      setImportLog(log);
      alert(`✅ Order sync done!\nStock deducted: ${processed} items\nNot found: ${notFound}\nAvg sales updated: ${avgUpdated} products`);
      fetchProducts();
    } catch (e) {
      console.error(e);
      alert(`Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // FIXED: uses setIsPushing only, completely separate from sync
  const pushSelectedToShopify = async () => {
    if (selectedProducts.size === 0) return alert('Please select at least one product to push.');
    if (!confirm(`Push ${selectedProducts.size} selected product(s) to Shopify?`)) return;
    setIsPushing(true);
    let ok = 0, fail = 0;
    try {
      for (const id of selectedProducts) {
        const p = products.find(x => x.id === id);
        if (!p) continue;
        try {
          const r = await fetch('/api/shopify?action=updateInventoryBySKU', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku: p.sku, product_name: p.product_name, quantity: p.sellable_stock })
          });
          if (r.ok) {
            await supabase.from('inventory_v2').update({ shopify_pushed_at: new Date().toISOString() }).eq('id', p.id);
            ok++;
          } else {
            fail++;
          }
        } catch {
          fail++;
        }
        await new Promise(res => setTimeout(res, 300));
      }
      const now = new Date().toISOString();
      localStorage.setItem('lastPush', now);
      setLastPushTime(new Date(now));
      setSelectedProducts(new Set());
      alert(`Push complete!\n✅ Success: ${ok}\n❌ Failed: ${fail}`);
      fetchProducts();
    } catch (e) {
      alert(`Push error: ${e.message}`);
    } finally {
      setIsPushing(false); // FIXED: always resets
    }
  };

  // ── SNAPSHOT ──
  const takeWeeklySnapshot = async () => {
    if (!confirm('Take inventory snapshot for today?')) return;
    const snapshotData = products.map(p => ({
      id: p.id, product_name: p.product_name, sku: p.sku,
      sellable_stock: p.sellable_stock, hold_stock: p.hold_stock,
    }));
    await supabase.from('inventory_snapshots').insert([{
      snapshot_date: new Date().toISOString().split('T')[0],
      data: snapshotData,
      total_sellable: products.reduce((s, p) => s + p.sellable_stock, 0),
      total_products: products.length,
    }]);
    alert('Snapshot saved!');
    fetchSnapshots();
  };

  // ── PRODUCT CRUD ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    const rp = formData.reorder_point_custom
      ? (formData.reorder_point || 5)
      : calcAutoReorderPoint(formData.avg_daily_sales || 0);
    const payload = { ...formData, reorder_point: rp };
    try {
      if (editingProduct) {
        const { error } = await supabase.from('inventory_v2').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inventory_v2').insert([payload]);
        if (error) throw error;
      }
      fetchProducts();
      resetForm();
    } catch (e) {
      alert('Error saving: ' + e.message);
    }
  };

  const handleAddStock = async (productId) => {
    const val = parseInt(addStockValue[productId] || 0);
    if (!val || val <= 0) return alert('Enter a valid quantity to add (must be more than 0).');
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const { error } = await supabase.from('inventory_v2').update({ sellable_stock: p.sellable_stock + val }).eq('id', productId);
    if (error) return alert('Error adding stock: ' + error.message);
    setAddStockValue(prev => ({ ...prev, [productId]: '' }));
    fetchProducts();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    await supabase.from('inventory_v2').delete().eq('id', id);
    fetchProducts();
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) return;
    if (!confirm(`Delete ${selectedProducts.size} selected products? This cannot be undone.`)) return;
    await supabase.from('inventory_v2').delete().in('id', Array.from(selectedProducts));
    setSelectedProducts(new Set());
    fetchProducts();
  };

  const handleEdit = (p) => {
    setEditingProduct(p);
    setFormData({ ...p });
    setShowForm(true);
    setActiveTab('inventory');
    window.scrollTo(0, 0);
  };

  const resetForm = () => {
    setFormData({
      product_name: '', local_name: '', sku: '', sellable_stock: 0, hold_stock: 0,
      design: '', reorder_point: 5, reorder_point_custom: false,
      supplier_id: null, category_id: null, avg_daily_sales: 0, notes: ''
    });
    setEditingProduct(null);
    setShowForm(false);
  };

  const updateDeadStockFlags = async () => {
    let flagged = 0;
    for (const p of products) {
      const daysSinceActivity = (new Date() - new Date(p.last_sold_at || p.created_at)) / (1000 * 60 * 60 * 24);
      const isDead = (p.avg_daily_sales || 0) <= deadStockSalesThreshold && daysSinceActivity >= deadStockThreshold;
      if (isDead !== p.is_dead_stock) {
        await supabase.from('inventory_v2').update({ is_dead_stock: isDead }).eq('id', p.id);
        if (isDead) flagged++;
      }
    }
    alert(`Dead stock recalculated. ${flagged} new items flagged.`);
    fetchProducts();
  };

  // ── BULK IMPORT ──
  const handleBulkImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const rows = text.split('\n').map(row => {
        const m = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        return m ? m.map(c => c.replace(/^"|"$/g, '').trim()) : [];
      });
      const dataRows = rows.slice(1).filter(r => r.length > 1 && r.some(c => c));
      const log = [];
      for (const row of dataRows) {
        const product = {
          product_name: row[0] || '', local_name: row[1] || row[0] || '',
          sku: row[2] || '', sellable_stock: parseInt(row[3]) || 0,
          hold_stock: parseInt(row[4]) || 0, design: row[5] || '',
          reorder_point: parseInt(row[6]) || 5,
          avg_daily_sales: parseFloat(row[7]) || 0, notes: row[8] || ''
        };
        if (!product.sku) continue;
        const { data: ex } = await supabase.from('inventory_v2').select('id,sku,sellable_stock').eq('sku', product.sku).maybeSingle();
        if (ex && importMode === 'add') {
          await supabase.from('inventory_v2').update({ sellable_stock: ex.sellable_stock + product.sellable_stock }).eq('sku', product.sku);
          log.push(`✅ Added stock: ${product.sku}`);
        } else if (ex && importMode === 'replace') {
          await supabase.from('inventory_v2').update(product).eq('sku', product.sku);
          log.push(`🔄 Replaced: ${product.sku}`);
        } else if (!ex) {
          await supabase.from('inventory_v2').insert([product]);
          log.push(`✅ New: ${product.sku}`);
        }
      }
      setImportLog(log);
      fetchProducts();
      alert(`Import done! ${dataRows.length} rows processed.`);
      setShowImport(false);
    };
    reader.readAsText(file);
  };

  // ── EXPORT CSV ──
  const exportToCSV = () => {
    const headers = ['Product Name', 'Local Name', 'SKU', 'Sellable Stock', 'Hold Stock', 'Design', 'Reorder Point', 'Avg Daily Sales', 'Days to Stockout', 'Status', 'Category', 'Supplier', 'Notes'];
    const rows = [headers.join(',')];
    filteredProducts.forEach(p => {
      const cat = categories.find(c => c.id === p.category_id);
      const sup = suppliers.find(s => s.id === p.supplier_id);
      const days = calcDaysToStockout(p.sellable_stock, p.avg_daily_sales);
      rows.push([
        `"${p.product_name}"`, `"${p.local_name || ''}"`, p.sku,
        p.sellable_stock, p.hold_stock, `"${p.design || ''}"`,
        p.reorder_point, p.avg_daily_sales, days, getStatus(p),
        `"${cat?.name || 'Uncategorized'}"`, `"${sup?.name || ''}"`, `"${p.notes || ''}"`
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ── FILTERS ──
  const filteredProducts = products.filter(p => {
    const s = searchTerm.toLowerCase();
    const matchSearch = !s ||
      (p.product_name || '').toLowerCase().includes(s) ||
      (p.local_name || '').toLowerCase().includes(s) ||
      (p.sku || '').toLowerCase().includes(s);
    const matchCat =
      filterCat === 'all' ? true :
      filterCat === 'uncategorized' ? !p.category_id :
      String(p.category_id) === filterCat;
    const matchStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'critical' ? getStatus(p).includes('CRITICAL') :
      filterStatus === 'warning' ? getStatus(p).includes('WARNING') :
      filterStatus === 'hold' ? p.hold_stock > 0 :
      filterStatus === 'dead' ? p.is_dead_stock :
      true;
    return matchSearch && matchCat && matchStatus;
  });

  const stats = {
    total: products.length,
    critical: products.filter(p => !p.hold_stock && p.sellable_stock <= p.reorder_point).length,
    warning: products.filter(p => !p.hold_stock && p.sellable_stock > p.reorder_point && p.sellable_stock <= p.reorder_point * 1.25).length,
    onHold: products.filter(p => p.hold_stock > 0).length,
    deadStock: products.filter(p => p.is_dead_stock).length,
    sellableUnits: products.reduce((s, p) => s + (p.sellable_stock || 0), 0),
  };

  const topFastMoving = [...products].filter(p => p.avg_daily_sales > 0).sort((a, b) => b.avg_daily_sales - a.avg_daily_sales).slice(0, 5);
  const topDeadStock = [...products].filter(p => p.is_dead_stock).sort((a, b) => b.sellable_stock - a.sellable_stock).slice(0, 5);
  const needReorder = products.filter(p => p.sellable_stock <= p.reorder_point && !p.hold_stock);

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'inventory', label: '📦 Inventory' },
    { id: 'purchase_orders', label: '📋 Purchase Orders' },
    { id: 'snapshots', label: '📅 Weekly Snapshot' },
    { id: 'settings', label: '⚙️ Settings' },
  ];

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: '#F9FAFB', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#7C3AED', color: 'white', padding: '0 24px' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px', height: '60px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px', fontWeight: '700', marginRight: '8px' }}>🏪 Inventory v2</span>
          <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '8px 14px',
                  background: activeTab === t.id ? 'rgba(255,255,255,0.25)' : 'transparent',
                  color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '500'
                }}>
                {t.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '12px', opacity: 0.9 }}>
            {shopifyConnected ? '🟢 Shopify' : '🔴 Shopify'}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>

        {activeTab === 'dashboard' && (
          <DashboardTab stats={stats} topFastMoving={topFastMoving} topDeadStock={topDeadStock} needReorder={needReorder} />
        )}

        {activeTab === 'inventory' && (
          <InventoryTab
            products={products}
            filteredProducts={filteredProducts}
            categories={categories}
            suppliers={suppliers}
            loading={loading}
            isSyncing={isSyncing}
            isPushing={isPushing}
            shopifyConnected={shopifyConnected}
            lastSyncTime={lastSyncTime}
            lastPushTime={lastPushTime}
            searchTerm={searchTerm} setSearchTerm={setSearchTerm}
            filterCat={filterCat} setFilterCat={setFilterCat}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts}
            showForm={showForm} setShowForm={setShowForm}
            editingProduct={editingProduct}
            formData={formData} setFormData={setFormData}
            showImport={showImport} setShowImport={setShowImport}
            importMode={importMode} setImportMode={setImportMode}
            importLog={importLog}
            addStockValue={addStockValue} setAddStockValue={setAddStockValue}
            handleSubmit={handleSubmit}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handleBulkDelete={handleBulkDelete}
            handleBulkImport={handleBulkImport}
            handleAddStock={handleAddStock}
            resetForm={resetForm}
            initialSyncFromShopify={initialSyncFromShopify}
            syncOrdersFromShopify={syncOrdersFromShopify}
            pushSelectedToShopify={pushSelectedToShopify}
            exportToCSV={exportToCSV}
          />
        )}

        {activeTab === 'purchase_orders' && (
          <PurchaseOrderTab products={products} suppliers={suppliers} getStatus={getStatus} />
        )}

        {activeTab === 'snapshots' && (
          <SnapshotsTab snapshots={snapshots} takeWeeklySnapshot={takeWeeklySnapshot} />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            suppliers={suppliers} categories={categories}
            fetchSuppliers={fetchSuppliers} fetchCategories={fetchCategories}
            salesPeriod={salesPeriod} setSalesPeriod={setSalesPeriod}
            deadStockThreshold={deadStockThreshold} setDeadStockThreshold={setDeadStockThreshold}
            deadStockSalesThreshold={deadStockSalesThreshold} setDeadStockSalesThreshold={setDeadStockSalesThreshold}
            updateDeadStockFlags={updateDeadStockFlags}
            products={products}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DASHBOARD TAB
// ─────────────────────────────────────────────
const DashboardTab = ({ stats, topFastMoving, topDeadStock, needReorder }) => (
  <div>
    <h2 style={{ margin: '0 0 20px', fontSize: '22px', color: '#111827' }}>📊 Dashboard Overview</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '28px' }}>
      {[
        { label: 'Total Products', value: stats.total, bg: '#EFF6FF', color: '#1E40AF' },
        { label: '🔴 Critical', value: stats.critical, bg: '#FEF2F2', color: '#DC2626' },
        { label: '🟡 Warning', value: stats.warning, bg: '#FFFBEB', color: '#D97706' },
        { label: '🔵 On Hold', value: stats.onHold, bg: '#EFF6FF', color: '#2563EB' },
        { label: '🪦 Dead Stock', value: stats.deadStock, bg: '#F5F3FF', color: '#7C3AED' },
        { label: 'Sellable Units', value: stats.sellableUnits, bg: '#F0FDF4', color: '#16A34A' },
      ].map(card => (
        <div key={card.label} style={{ padding: '20px', background: card.bg, borderRadius: '10px' }}>
          <div style={{ fontSize: '30px', fontWeight: '700', color: card.color }}>{card.value}</div>
          <div style={{ color: card.color, marginTop: '4px', fontSize: '13px', fontWeight: '500' }}>{card.label}</div>
        </div>
      ))}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#374151' }}>🚀 Top 5 Fast-Moving</h3>
        {topFastMoving.length === 0
          ? <p style={{ color: '#9CA3AF', fontSize: '13px' }}>Run "🔄 Sync Orders" — avg_daily_sales will be auto-calculated from your last 30 days of Shopify orders.</p>
          : topFastMoving.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{i + 1}. {p.product_name}</div>
                <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{p.sku}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#059669' }}>{p.avg_daily_sales}/day</div>
                <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Stock: {p.sellable_stock}</div>
              </div>
            </div>
          ))}
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#374151' }}>🪦 Top 5 Dead Stock</h3>
        {topDeadStock.length === 0
          ? <p style={{ color: '#9CA3AF', fontSize: '13px' }}>No dead stock flagged. Use Settings → Recalculate.</p>
          : topDeadStock.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{i + 1}. {p.product_name}</div>
                <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{p.sku}</div>
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#7C3AED' }}>{p.sellable_stock} units</div>
            </div>
          ))}
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: '#374151' }}>⚠️ Reorder Now</h3>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#9CA3AF' }}>{needReorder.length} product(s) at or below reorder point</p>
        {needReorder.length === 0
          ? <p style={{ color: '#9CA3AF', fontSize: '13px' }}>All good! No immediate reorders needed.</p>
          : needReorder.slice(0, 8).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: '13px', color: '#111827' }}>{p.product_name}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#DC2626' }}>{p.sellable_stock} left</span>
            </div>
          ))}
        {needReorder.length > 8 && <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '8px 0 0' }}>+{needReorder.length - 8} more...</p>}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// INVENTORY TAB
// ─────────────────────────────────────────────
const InventoryTab = ({
  products, filteredProducts, categories, suppliers,
  loading, isSyncing, isPushing, shopifyConnected,
  lastSyncTime, lastPushTime,
  searchTerm, setSearchTerm, filterCat, setFilterCat, filterStatus, setFilterStatus,
  selectedProducts, setSelectedProducts,
  showForm, setShowForm, editingProduct, formData, setFormData,
  showImport, setShowImport, importMode, setImportMode, importLog,
  addStockValue, setAddStockValue,
  handleSubmit, handleEdit, handleDelete, handleBulkDelete, handleBulkImport,
  handleAddStock, resetForm,
  initialSyncFromShopify, syncOrdersFromShopify, pushSelectedToShopify, exportToCSV,
}) => {
  const getCat = (id) => categories.find(c => c.id === id); // kept for unused ref safety

  return (
    <div>
      {/* Status bar */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '14px', fontSize: '13px', color: '#6B7280', flexWrap: 'wrap', alignItems: 'center' }}>
        {shopifyConnected
          ? <span style={{ color: '#059669', fontWeight: '600' }}>✓ Shopify Connected</span>
          : <span style={{ color: '#DC2626', fontWeight: '600' }}>✗ Shopify Not Connected</span>}
        <span>Last sync: <strong>{formatTime(lastSyncTime)}</strong></span>
        <span>Last push: <strong>{formatTime(lastPushTime)}</strong></span>
        {selectedProducts.size > 0 && (
          <span style={{ color: '#7C3AED', fontWeight: '600' }}>✓ {selectedProducts.size} selected</span>
        )}
      </div>

      {/* Action buttons — FIXED: each button has its own disabled logic */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>

        {showForm
          ? <button onClick={resetForm} style={btnStyle('#6B7280')}>✕ Cancel</button>
          : <button onClick={() => setShowForm(true)} style={btnStyle('#7C3AED')}>+ Add Product</button>
        }

        <button onClick={() => setShowImport(!showImport)} style={btnStyle('#0891B2')}>
          📦 Import CSV
        </button>

        {/* SYNC button — only disabled while syncing, never disabled by push */}
        {shopifyConnected && products.length === 0 && (
          <button
            onClick={initialSyncFromShopify}
            disabled={isSyncing}
            style={{ ...btnStyle(isSyncing ? '#9CA3AF' : '#059669'), cursor: isSyncing ? 'not-allowed' : 'pointer' }}>
            {isSyncing ? '⏳ Syncing...' : '⬇️ Initial Sync'}
          </button>
        )}

        {shopifyConnected && products.length > 0 && (
          <button
            onClick={syncOrdersFromShopify}
            disabled={isSyncing}
            style={{ ...btnStyle(isSyncing ? '#9CA3AF' : '#2563EB'), cursor: isSyncing ? 'not-allowed' : 'pointer' }}>
            {isSyncing ? '⏳ Syncing...' : '🔄 Sync Orders'}
          </button>
        )}

        {/* PUSH button — only disabled while pushing OR when nothing selected; never blocked by sync */}
        {shopifyConnected && (
          <button
            onClick={pushSelectedToShopify}
            disabled={isPushing}
            style={{
              ...btnStyle(selectedProducts.size === 0 ? '#9CA3AF' : (isPushing ? '#9CA3AF' : '#7C3AED')),
              cursor: isPushing ? 'not-allowed' : 'pointer',
              opacity: selectedProducts.size === 0 ? 0.6 : 1,
            }}
            title={selectedProducts.size === 0 ? 'Tick checkbox(es) on products you want to push first' : `Push ${selectedProducts.size} selected product(s) to Shopify`}>
            {isPushing ? '⏳ Pushing...' : `↗️ Push to Shopify${selectedProducts.size > 0 ? ` (${selectedProducts.size})` : ''}`}
          </button>
        )}

        <button onClick={exportToCSV} style={btnStyle('#374151', true)}>↓ Export CSV</button>

        {selectedProducts.size > 0 && (
          <button onClick={handleBulkDelete} style={btnStyle('#DC2626')}>
            🗑️ Delete ({selectedProducts.size})
          </button>
        )}

        {selectedProducts.size > 0 && (
          <BulkCategoryAssign
            selectedProducts={selectedProducts}
            categories={categories}
            onAssign={async (catId) => {
              for (const id of selectedProducts) {
                await supabase.from('inventory_v2').update({ category_id: catId }).eq('id', id);
              }
              setSelectedProducts(new Set());
              fetchProducts();
              alert(`✅ Category assigned to ${selectedProducts.size} products`);
            }}
          />
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <ProductForm
          editingProduct={editingProduct}
          formData={formData} setFormData={setFormData}
          handleSubmit={handleSubmit} resetForm={resetForm}
          categories={categories} suppliers={suppliers}
        />
      )}

      {/* Import CSV panel */}
      {showImport && (
        <div style={{ background: '#EFF6FF', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '2px solid #BFDBFE' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>📦 Import from CSV</h3>
          <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 10px' }}>
            Columns: Product Name, Local Name, SKU, Sellable Stock, Hold Stock, Design, Reorder Point, Avg Daily Sales, Notes
          </p>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
            {['add', 'replace'].map(m => (
              <label key={m} style={{ display: 'flex', gap: '6px', cursor: 'pointer', fontSize: '14px', alignItems: 'center' }}>
                <input type="radio" value={m} checked={importMode === m} onChange={e => setImportMode(e.target.value)} />
                <strong>{m.toUpperCase()}</strong> — {m === 'add' ? 'add to existing stock' : 'overwrite all fields'}
              </label>
            ))}
          </div>
          <input type="file" accept=".csv" onChange={handleBulkImport}
            style={{ padding: '8px', border: '2px solid #BFDBFE', borderRadius: '6px', background: 'white', width: '100%', boxSizing: 'border-box' }} />
          {importLog.length > 0 && (
            <div style={{ marginTop: '10px', background: 'white', padding: '10px', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
              {importLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search by name, local name, SKU..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '9px 12px', border: '2px solid #E5E7EB', borderRadius: '6px', fontSize: '13px' }} />

        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ padding: '9px', border: '2px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', minWidth: '150px' }}>
          <option value="all">All Categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '9px', border: '2px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', minWidth: '130px' }}>
          <option value="all">All Status</option>
          <option value="critical">🔴 Critical</option>
          <option value="warning">🟡 Warning</option>
          <option value="hold">🔵 On Hold</option>
          <option value="dead">🪦 Dead Stock</option>
        </select>

        <span style={{ fontSize: '13px', color: '#6B7280' }}>{filteredProducts.length} products</span>
      </div>

      {/* Inventory Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>Loading inventory...</div>
      ) : filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF', background: 'white', borderRadius: '8px' }}>
          {products.length === 0
            ? '🛍️ No products yet. Click "⬇️ Initial Sync" to import from Shopify, or "+ Add Product" to add manually.'
            : 'No products match your current filters.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F3F4F6' }}>
                <th style={thStyle()}>
                  <input type="checkbox"
                    title="Select all visible"
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={e => e.target.checked
                      ? setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
                      : setSelectedProducts(new Set())} />
                </th>
                {['Product', 'Local Name', 'SKU', 'Category', 'Sellable', 'Hold', 'Add Stock', 'Reorder Pt', 'Days Left', 'Status', 'Last Pushed', 'Actions'].map(h => (
                  <th key={h} style={thStyle()}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const days = calcDaysToStockout(p.sellable_stock, p.avg_daily_sales);
                const status = getStatus(p);
                const daysNum = parseInt(days);
                const daysColor = isNaN(daysNum) ? '#6B7280' : daysNum <= 7 ? '#DC2626' : daysNum <= 14 ? '#D97706' : '#059669';
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6', background: p.is_dead_stock ? '#FDF4FF' : 'white' }}>
                    <td style={tdStyle()}>
                      <input type="checkbox"
                        checked={selectedProducts.has(p.id)}
                        onChange={e => {
                          const ns = new Set(selectedProducts);
                          e.target.checked ? ns.add(p.id) : ns.delete(p.id);
                          setSelectedProducts(ns);
                        }} />
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ fontWeight: '600', color: '#111827' }}>{p.product_name}</div>
                      {p.is_dead_stock && <span style={{ fontSize: '10px', color: '#7C3AED', background: '#EDE9FE', padding: '1px 5px', borderRadius: '3px' }}>🪦 Dead</span>}
                      {p.notes && <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>📝 {p.notes.substring(0, 35)}{p.notes.length > 35 ? '...' : ''}</div>}
                    </td>
                    <td style={{ ...tdStyle(), color: '#6B7280' }}>{p.local_name}</td>
                    <td style={{ ...tdStyle(), fontFamily: 'monospace', color: '#6B7280', fontSize: '12px' }}>{p.sku}</td>
                    <td style={tdStyle()}>
                      <select
                        value={p.category_id || ''}
                        onChange={async e => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          await supabase.from('inventory_v2').update({ category_id: val }).eq('id', p.id);
                          fetchProducts();
                        }}
                        style={{ padding: '3px 6px', border: '1px solid #DDD6FE', borderRadius: '4px', fontSize: '12px', background: p.category_id ? '#EDE9FE' : '#F9FAFB', color: p.category_id ? '#5B21B6' : '#9CA3AF', cursor: 'pointer', maxWidth: '130px' }}
                      >
                        <option value="">Uncategorized</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={{ ...tdStyle(), textAlign: 'center', fontWeight: '700', fontSize: '16px', color: '#111827' }}>{p.sellable_stock}</td>
                    <td style={{ ...tdStyle(), textAlign: 'center', color: '#2563EB' }}>{p.hold_stock}</td>
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                          type="number" min="1" placeholder="+qty"
                          value={addStockValue[p.id] || ''}
                          onChange={e => setAddStockValue(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddStock(p.id)}
                          style={{ width: '60px', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px' }}
                        />
                        <button onClick={() => handleAddStock(p.id)}
                          style={{ padding: '4px 8px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          + Add
                        </button>
                      </div>
                    </td>
                    <td style={{ ...tdStyle(), textAlign: 'center' }}>
                      {p.reorder_point}
                      {p.reorder_point_custom && <span style={{ fontSize: '9px', color: '#7C3AED', marginLeft: '3px' }} title="Custom">✎</span>}
                    </td>
                    <td style={{ ...tdStyle(), textAlign: 'center', fontWeight: '600', color: daysColor }}>{days}d</td>
                    <td style={{ ...tdStyle(), fontSize: '12px', fontWeight: '600' }}>{status}</td>
                    <td style={{ ...tdStyle(), fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                      {p.shopify_pushed_at ? formatTime(p.shopify_pushed_at) : '—'}
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => handleEdit(p)} style={{ padding: '5px 10px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                        <button onClick={() => handleDelete(p.id)} style={{ padding: '5px 10px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// PRODUCT FORM
// ─────────────────────────────────────────────
const ProductForm = ({ editingProduct, formData, setFormData, handleSubmit, resetForm, categories, suppliers }) => {
  const autoRp = calcAutoReorderPoint(formData.avg_daily_sales || 0);
  return (
    <div style={{ background: '#F9FAFB', padding: '24px', borderRadius: '8px', marginBottom: '20px', border: '2px solid #E5E7EB' }}>
      <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>{editingProduct ? '✏️ Edit Product' : '➕ Add New Product'}</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Product Name *</label>
            <input type="text" required value={formData.product_name || ''} onChange={e => setFormData({ ...formData, product_name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Local Name (Hindi/Regional)</label>
            <input type="text" value={formData.local_name || ''} onChange={e => setFormData({ ...formData, local_name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SKU *</label>
            <input type="text" required value={formData.sku || ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Sellable Stock</label>
            <input type="number" min="0" value={formData.sellable_stock || 0} onChange={e => setFormData({ ...formData, sellable_stock: parseInt(e.target.value) || 0 })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Hold Stock</label>
            <input type="number" min="0" value={formData.hold_stock || 0} onChange={e => setFormData({ ...formData, hold_stock: parseInt(e.target.value) || 0 })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Design / Type</label>
            <input type="text" value={formData.design || ''} onChange={e => setFormData({ ...formData, design: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={formData.category_id || ''} onChange={e => setFormData({ ...formData, category_id: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle}>
              <option value="">Uncategorized</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Supplier</label>
            <select value={formData.supplier_id || ''} onChange={e => setFormData({ ...formData, supplier_id: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle}>
              <option value="">None</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Avg Daily Sales (units/day)</label>
            <input type="number" step="0.1" min="0" value={formData.avg_daily_sales || 0} onChange={e => setFormData({ ...formData, avg_daily_sales: parseFloat(e.target.value) || 0 })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>
              Reorder Point &nbsp;
              <label style={{ fontWeight: '400', fontSize: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.reorder_point_custom || false}
                  onChange={e => setFormData({ ...formData, reorder_point_custom: e.target.checked })}
                  style={{ marginRight: '4px' }} />
                Override (auto = {autoRp})
              </label>
            </label>
            <input type="number" min="0"
              value={formData.reorder_point_custom ? (formData.reorder_point || 0) : autoRp}
              disabled={!formData.reorder_point_custom}
              onChange={e => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
              style={{ ...inputStyle, background: formData.reorder_point_custom ? 'white' : '#F3F4F6', color: formData.reorder_point_custom ? '#111827' : '#9CA3AF' }} />
          </div>
        </div>
        <div style={{ marginTop: '14px' }}>
          <label style={labelStyle}>Notes / Remarks</label>
          <textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })}
            rows={2} placeholder="Any notes about this product..."
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
          <button type="submit" style={btnStyle('#7C3AED')}>{editingProduct ? 'Update Product' : 'Add Product'}</button>
          <button type="button" onClick={resetForm} style={btnStyle('#6B7280')}>Cancel</button>
        </div>
      </form>
    </div>
  );
};

// ─────────────────────────────────────────────
// PURCHASE ORDER TAB
// ─────────────────────────────────────────────
const PurchaseOrderTab = ({ products, suppliers, getStatus }) => {
  const defaultItems = () => products
    .filter(p => getStatus(p).includes('CRITICAL') || getStatus(p).includes('WARNING'))
    .map(p => ({
      id: p.id, product_name: p.product_name, sku: p.sku,
      current_stock: p.sellable_stock, reorder_point: p.reorder_point,
      order_qty: Math.max(1, (p.reorder_point * 2) - p.sellable_stock),
      unit_price: 0, supplier_id: p.supplier_id || null, remark: ''
    }));

  const [items, setItems] = useState(defaultItems);
  const [poDate] = useState(new Date().toISOString().split('T')[0]);
  const [poNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [exportFormat, setExportFormat] = useState('csv');

  const updateItem = (id, field, value) => setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const addItem = () => setItems(prev => [...prev, { id: `custom-${Date.now()}`, product_name: '', sku: '', current_stock: 0, reorder_point: 0, order_qty: 1, unit_price: 0, supplier_id: null, remark: '' }]);
  const totalValue = items.reduce((s, i) => s + ((i.order_qty || 0) * (i.unit_price || 0)), 0);

  const exportPO = () => {
    // CSV export (always works, no backend needed)
    const headers = ['Product Name', 'SKU', 'Current Stock', 'Order Qty', 'Unit Price (Rs)', 'Total (Rs)', 'Supplier', 'Remark'];
    const rows = [
      `Purchase Order: ${poNumber}`, `Date: ${poDate}`, `Authority of Fashion`, '',
      headers.join(',')
    ];
    items.forEach(i => {
      const sup = suppliers.find(s => s.id === i.supplier_id);
      rows.push([
        `"${i.product_name || ''}"`, i.sku || '', i.current_stock || 0,
        i.order_qty || 0, i.unit_price || 0,
        (i.order_qty || 0) * (i.unit_price || 0),
        `"${sup?.name || ''}"`, `"${i.remark || ''}"`
      ].join(','));
    });
    rows.push(['', '', '', '', 'TOTAL', totalValue, '', ''].join(','));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${poNumber}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px' }}>📋 Purchase Order Generator</h2>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '14px' }}>PO# {poNumber} &nbsp;|&nbsp; Date: {poDate}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={addItem} style={btnStyle('#059669')}>+ Add Item</button>
          <button onClick={exportPO} disabled={items.length === 0} style={btnStyle(items.length === 0 ? '#9CA3AF' : '#7C3AED')}>
            📥 Export CSV
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#9CA3AF' }}>
          No items need reordering right now, or all stock is good. Click "+ Add Item" to create a manual PO.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  {['Product Name', 'SKU', 'Current Stock', 'Order Qty', 'Unit Price (₹)', 'Total (₹)', 'Supplier', 'Remark', ''].map(h => (
                    <th key={h} style={thStyle()}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const total = (item.order_qty || 0) * (item.unit_price || 0);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={tdStyle()}>
                        <input type="text" value={item.product_name || ''} onChange={e => updateItem(item.id, 'product_name', e.target.value)}
                          style={{ width: '150px', padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px' }} />
                      </td>
                      <td style={{ ...tdStyle(), fontFamily: 'monospace', color: '#6B7280' }}>{item.sku}</td>
                      <td style={{ ...tdStyle(), textAlign: 'center' }}>{item.current_stock}</td>
                      <td style={tdStyle()}>
                        <input type="number" min="0" value={item.order_qty || 0} onChange={e => updateItem(item.id, 'order_qty', parseInt(e.target.value) || 0)}
                          style={{ width: '70px', padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }} />
                      </td>
                      <td style={tdStyle()}>
                        <input type="number" min="0" step="0.01" value={item.unit_price || 0} onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          style={{ width: '80px', padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }} />
                      </td>
                      <td style={{ ...tdStyle(), textAlign: 'right', fontWeight: '600' }}>₹{total.toLocaleString('en-IN')}</td>
                      <td style={tdStyle()}>
                        <select value={item.supplier_id || ''} onChange={e => updateItem(item.id, 'supplier_id', e.target.value ? parseInt(e.target.value) : null)}
                          style={{ padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px', minWidth: '100px' }}>
                          <option value="">None</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle()}>
                        <input type="text" placeholder="Remark..." value={item.remark || ''} onChange={e => updateItem(item.id, 'remark', e.target.value)}
                          style={{ width: '120px', padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px' }} />
                      </td>
                      <td style={tdStyle()}>
                        <button onClick={() => removeItem(item.id)} style={{ padding: '4px 8px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F5F3FF', fontWeight: '700' }}>
                  <td colSpan={5} style={{ ...tdStyle(), textAlign: 'right', fontSize: '14px' }}>Total Order Value:</td>
                  <td style={{ ...tdStyle(), color: '#7C3AED', fontSize: '14px' }}>₹{totalValue.toLocaleString('en-IN')}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#9CA3AF' }}>
            💡 Pre-filled with critical/warning products. Edit quantities before exporting.
          </p>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// SNAPSHOTS TAB
// ─────────────────────────────────────────────
const SnapshotsTab = ({ snapshots, takeWeeklySnapshot }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <h2 style={{ margin: 0, fontSize: '22px' }}>📅 Weekly Snapshots / Changelog</h2>
      <button onClick={takeWeeklySnapshot} style={btnStyle('#7C3AED')}>📸 Take Snapshot Now</button>
    </div>
    {snapshots.length === 0 ? (
      <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#9CA3AF' }}>
        No snapshots yet. Click "Take Snapshot Now" to start tracking weekly stock changes.
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {snapshots.map((snap, i) => {
          const prev = snapshots[i + 1];
          const changes = (prev && snap.data && prev.data)
            ? snap.data.filter(cur => { const old = prev.data.find(o => o.id === cur.id); return old && old.sellable_stock !== cur.sellable_stock; })
            : [];
          return (
            <div key={snap.id} style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <span style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>
                    {new Date(snap.snapshot_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                  <span style={{ marginLeft: '12px', fontSize: '13px', color: '#6B7280' }}>
                    {snap.total_products} products · {snap.total_sellable} total units
                  </span>
                </div>
                {i === 0 && <span style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>LATEST</span>}
              </div>
              {changes.length > 0 ? (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', margin: '0 0 8px' }}>Changes vs previous snapshot:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '6px' }}>
                    {changes.slice(0, 9).map(cur => {
                      const old = prev.data.find(o => o.id === cur.id);
                      const diff = cur.sellable_stock - old.sellable_stock;
                      return (
                        <div key={cur.id} style={{ padding: '6px 10px', background: '#F9FAFB', borderRadius: '5px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#374151' }}>{cur.product_name}</span>
                          <span style={{ fontWeight: '700', color: diff < 0 ? '#DC2626' : '#059669' }}>{diff > 0 ? '+' : ''}{diff}</span>
                        </div>
                      );
                    })}
                    {changes.length > 9 && <div style={{ padding: '6px 10px', color: '#9CA3AF', fontSize: '12px' }}>+{changes.length - 9} more changes</div>}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>{prev ? 'No stock changes since previous snapshot.' : 'First snapshot — no comparison available.'}</p>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────
// SETTINGS TAB
// ─────────────────────────────────────────────
const SettingsTab = ({
  suppliers, categories, fetchSuppliers, fetchCategories,
  salesPeriod, setSalesPeriod, deadStockThreshold, setDeadStockThreshold,
  deadStockSalesThreshold, setDeadStockSalesThreshold, updateDeadStockFlags, products
}) => {
  const [newCat, setNewCat] = useState('');
  const [newSup, setNewSup] = useState({ name: '', address: '', mobile: '', gst_id: '' });
  const [editSup, setEditSup] = useState(null);

  const addCategory = async () => {
    if (!newCat.trim()) return;
    const { error } = await supabase.from('categories').insert([{ name: newCat.trim() }]);
    if (error) return alert('Error: ' + error.message);
    setNewCat('');
    fetchCategories();
  };

  const deleteCategory = async (id) => {
    if (!confirm('Delete this category? Products will become Uncategorized.')) return;
    await supabase.from('inventory_v2').update({ category_id: null }).eq('category_id', id);
    await supabase.from('categories').delete().eq('id', id);
    fetchCategories();
  };

  const addSupplier = async () => {
    if (!newSup.name.trim()) return alert('Supplier name is required.');
    const { error } = await supabase.from('suppliers').insert([newSup]);
    if (error) return alert('Error: ' + error.message);
    setNewSup({ name: '', address: '', mobile: '', gst_id: '' });
    fetchSuppliers();
  };

  const deleteSupplier = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    fetchSuppliers();
  };

  const saveSupplierEdit = async () => {
    const { error } = await supabase.from('suppliers').update(editSup).eq('id', editSup.id);
    if (error) return alert('Error: ' + error.message);
    setEditSup(null);
    fetchSuppliers();
  };

  const saveSettings = () => {
    localStorage.setItem('salesPeriod', String(salesPeriod));
    localStorage.setItem('deadStockDays', String(deadStockThreshold));
    localStorage.setItem('deadStockSales', String(deadStockSalesThreshold));
    alert('✅ Settings saved!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Categories */}
      <div style={{ background: 'white', padding: '24px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>📁 Product Categories</h3>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6B7280' }}>Create your own categories (e.g. Earrings, Sarees, Blouses). New Shopify imports start as Uncategorized.</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input type="text" placeholder="New category name..." value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            style={{ flex: 1, padding: '9px', border: '2px solid #E5E7EB', borderRadius: '6px', fontSize: '14px' }} />
          <button onClick={addCategory} style={btnStyle('#7C3AED')}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {categories.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EDE9FE', padding: '6px 12px', borderRadius: '20px' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#5B21B6' }}>{c.name}</span>
              <span style={{ fontSize: '11px', color: '#7C3AED' }}>({products.filter(p => p.category_id === c.id).length})</span>
              <button onClick={() => deleteCategory(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '16px', lineHeight: 1, padding: 0, marginLeft: '2px' }}>×</button>
            </div>
          ))}
          {categories.length === 0 && <p style={{ color: '#9CA3AF', fontSize: '13px' }}>No categories yet. Add your first one above.</p>}
        </div>
      </div>

      {/* Suppliers */}
      <div style={{ background: 'white', padding: '24px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>🏭 Supplier Master List</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          {[
            { key: 'name', placeholder: 'Supplier Name *' },
            { key: 'address', placeholder: 'Address' },
            { key: 'mobile', placeholder: 'Mobile No.' },
            { key: 'gst_id', placeholder: 'GST ID' },
          ].map(f => (
            <input key={f.key} type="text" placeholder={f.placeholder} value={newSup[f.key]}
              onChange={e => setNewSup({ ...newSup, [f.key]: e.target.value })}
              style={{ padding: '9px', border: '2px solid #E5E7EB', borderRadius: '6px', fontSize: '13px' }} />
          ))}
        </div>
        <button onClick={addSupplier} style={btnStyle('#059669')}>+ Add Supplier</button>

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {suppliers.length === 0 && <p style={{ color: '#9CA3AF', fontSize: '13px' }}>No suppliers yet.</p>}
          {suppliers.map(s => (
            <div key={s.id} style={{ padding: '14px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
              {editSup?.id === s.id ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                    {['name', 'address', 'mobile', 'gst_id'].map(k => (
                      <input key={k} type="text" placeholder={k} value={editSup[k] || ''}
                        onChange={e => setEditSup({ ...editSup, [k]: e.target.value })}
                        style={{ padding: '7px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={saveSupplierEdit} style={btnStyle('#059669', false, 'small')}>Save</button>
                    <button onClick={() => setEditSup(null)} style={btnStyle('#6B7280', false, 'small')}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}>{s.name}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '3px' }}>
                      {[s.mobile && `📞 ${s.mobile}`, s.address && `📍 ${s.address}`, s.gst_id && `GST: ${s.gst_id}`].filter(Boolean).join('  ·  ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setEditSup({ ...s })} style={btnStyle('#3B82F6', false, 'small')}>Edit</button>
                    <button onClick={() => deleteSupplier(s.id)} style={btnStyle('#EF4444', false, 'small')}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dead Stock Settings */}
      <div style={{ background: 'white', padding: '24px', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>📊 Dead Stock & Analytics Settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Sales Period for Avg Calculation</label>
            <select value={salesPeriod} onChange={e => setSalesPeriod(parseInt(e.target.value))} style={inputStyle}>
              <option value={7}>1 Week</option>
              <option value={30}>1 Month</option>
              <option value={90}>3 Months</option>
              <option value={180}>6 Months</option>
              <option value={365}>1 Year</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Dead Stock: No activity in X days</label>
            <select value={deadStockThreshold} onChange={e => setDeadStockThreshold(parseInt(e.target.value))} style={inputStyle}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Dead Stock: Avg sales less than</label>
            <select value={deadStockSalesThreshold} onChange={e => setDeadStockSalesThreshold(parseFloat(e.target.value))} style={inputStyle}>
              <option value={0}>0 (zero sales only)</option>
              <option value={0.1}>Less than 0.1/day</option>
              <option value={0.5}>Less than 0.5/day</option>
              <option value={1}>Less than 1/day</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={saveSettings} style={btnStyle('#7C3AED')}>💾 Save Settings</button>
          <button onClick={updateDeadStockFlags} style={btnStyle('#DC2626')}>🔄 Recalculate Dead Stock Flags</button>
        </div>
        <p style={{ marginTop: '10px', fontSize: '12px', color: '#9CA3AF' }}>
          A product is flagged as dead stock when its avg_daily_sales is at or below the threshold AND it hasn't been updated in the configured number of days. Click "Recalculate" after changing these settings.
        </p>
      </div>

    </div>
  );
};

// ─────────────────────────────────────────────
// BULK CATEGORY ASSIGN (inline dropdown in toolbar)
// ─────────────────────────────────────────────
const BulkCategoryAssign = ({ selectedProducts, categories, onAssign }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ ...btnStyle('#059669'), display: 'flex', alignItems: 'center', gap: '4px' }}>
        🏷️ Assign Category ({selectedProducts.size})
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, background: 'white',
          border: '2px solid #E5E7EB', borderRadius: '8px', padding: '8px',
          zIndex: 100, minWidth: '180px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
        }}>
          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '6px', padding: '0 4px' }}>
            Assign to all {selectedProducts.size} selected:
          </div>
          <button
            onClick={() => { onAssign(null); setOpen(false); }}
            style={{ display: 'block', width: '100%', padding: '7px 10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px', fontSize: '13px', color: '#9CA3AF' }}>
            Uncategorized
          </button>
          {categories.map(c => (
            <button key={c.id}
              onClick={() => { onAssign(c.id); setOpen(false); }}
              style={{ display: 'block', width: '100%', padding: '7px 10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px', fontSize: '13px', color: '#5B21B6' }}
              onMouseEnter={e => e.target.style.background = '#F5F3FF'}
              onMouseLeave={e => e.target.style.background = 'none'}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export default function App() {
  return (
    <AuthGate>
      <InventoryApp />
    </AuthGate>
  );
}
