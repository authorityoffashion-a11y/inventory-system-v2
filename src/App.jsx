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
        <button onClick={handleLogin} style={{ marginTop:'16px', width:'100%', padding:'12px', background:'#7C3AED', color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:'600', cursor:'pointer' }}>
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
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
};

const calcDaysToStockout = (sellable, avgSales) => {
  if (!avgSales || avgSales <= 0) return '∞';
  const days = Math.round(sellable / avgSales);
  if (days > 999) return '999+';
  return days;
};

const calcAutoReorderPoint = (avgDailySales, leadDays = 7) => {
  return Math.ceil(avgDailySales * leadDays * 1.5);
};

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
  const [syncing, setSyncing] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [lastPushTime, setLastPushTime] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showSupplierMgr, setShowSupplierMgr] = useState(false);
  const [showSnapshotView, setShowSnapshotView] = useState(false);
  const [showPOGenerator, setShowPOGenerator] = useState(false);
  const [importLog, setImportLog] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState('add');

  // Settings
  const [salesPeriod, setSalesPeriod] = useState(() => parseInt(localStorage.getItem('salesPeriod') || '30'));
  const [deadStockThreshold, setDeadStockThreshold] = useState(() => parseInt(localStorage.getItem('deadStockDays') || '30'));
  const [deadStockSalesThreshold, setDeadStockSalesThreshold] = useState(() => parseInt(localStorage.getItem('deadStockSales') || '0'));

  const [formData, setFormData] = useState({
    product_name:'', local_name:'', sku:'', sellable_stock:0, hold_stock:0,
    design:'', reorder_point:5, reorder_point_custom:false,
    supplier_id:null, category_id:null, avg_daily_sales:0, notes:''
  });
  const [addStockValue, setAddStockValue] = useState({});

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    await Promise.all([
      fetchProducts(),
      fetchCategories(),
      fetchSuppliers(),
      fetchSnapshots(),
    ]);
    checkShopifyConnection();
    setLastSyncTime(localStorage.getItem('lastSync') ? new Date(localStorage.getItem('lastSync')) : null);
    setLastPushTime(localStorage.getItem('lastPush') ? new Date(localStorage.getItem('lastPush')) : null);
  };

  // ── DB FETCHERS ──
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('inventory_v2').select('*').order('created_at', { ascending: false });
    if (!error) setProducts(data || []);
    setLoading(false);
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
    } catch { setShopifyConnected(false); }
  };

  const initialSyncFromShopify = async () => {
    if (!shopifyConnected) return alert('Shopify not connected.');
    if (!confirm('Import ALL Shopify products? Existing SKUs will be updated.')) return;
    setSyncing(true);
    const log = [];
    try {
      const r = await fetch('/api/shopify?action=getAllProducts');
      const d = await r.json();
      const items = d.products || [];
      log.push(`Found ${items.length} products`);
      let created = 0, updated = 0;
      for (const p of items) {
        const variant = p.variants[0];
        const sku = variant.sku || `SHOPIFY-${p.id}`;
        const qty = variant.inventory_quantity || 0;
        const { data: existing } = await supabase.from('inventory_v2').select('*').eq('sku', sku).single();
        if (existing) {
          await supabase.from('inventory_v2').update({ sellable_stock: qty, product_name: p.title }).eq('sku', sku);
          log.push(`✅ Updated: ${p.title}`); updated++;
        } else {
          const rp = calcAutoReorderPoint(1);
          await supabase.from('inventory_v2').insert([{
            product_name: p.title, local_name: p.title, sku,
            sellable_stock: qty, hold_stock: 0, design: p.product_type || '',
            reorder_point: rp, reorder_point_custom: false,
            avg_daily_sales: 0, category_id: null, supplier_id: null, notes: '',
            shopify_pushed_at: null, is_dead_stock: false
          }]);
          log.push(`✅ Created: ${p.title}`); created++;
        }
        await new Promise(r => setTimeout(r, 300));
      }
      const now = new Date().toISOString();
      localStorage.setItem('lastSync', now);
      setLastSyncTime(new Date(now));
      setImportLog(log);
      alert(`Sync complete! Created: ${created}, Updated: ${updated}`);
      fetchProducts();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const syncOrdersFromShopify = async () => {
    if (!shopifyConnected) return alert('Shopify not connected.');
    setSyncing(true);
    const log = [];
    try {
      const since = lastSyncTime
        ? lastSyncTime.toISOString()
        : new Date(Date.now() - 7*24*60*60*1000).toISOString();
      const r = await fetch(`/api/shopify?action=getOrders&since=${encodeURIComponent(since)}`);
      const d = await r.json();
      const orders = d.orders || [];
      log.push(`Found ${orders.length} orders since last sync`);
      let processed = 0, notFound = 0;
      for (const order of orders) {
        for (const item of order.line_items) {
          const { data: prod } = await supabase.from('inventory_v2').select('*').eq('sku', item.sku).single();
          if (prod) {
            const newStock = Math.max(0, prod.sellable_stock - item.quantity);
            await supabase.from('inventory_v2').update({ sellable_stock: newStock }).eq('id', prod.id);
            log.push(`✅ ${prod.product_name}: -${item.quantity} → ${newStock}`);
            processed++;
          } else {
            log.push(`❌ Not found: ${item.name} (${item.sku})`);
            notFound++;
          }
        }
      }
      const now = new Date().toISOString();
      localStorage.setItem('lastSync', now);
      setLastSyncTime(new Date(now));
      setImportLog(log);
      alert(`Order sync done! Processed: ${processed}, Not found: ${notFound}`);
      fetchProducts();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const pushSelectedToShopify = async () => {
    if (selectedProducts.size === 0) return alert('Select products to push.');
    if (!confirm(`Push ${selectedProducts.size} product(s) to Shopify?`)) return;
    setSyncing(true);
    let ok = 0, fail = 0;
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
        } else { fail++; }
      } catch { fail++; }
      await new Promise(r => setTimeout(r, 400));
    }
    const now = new Date().toISOString();
    localStorage.setItem('lastPush', now);
    setLastPushTime(new Date(now));
    setSelectedProducts(new Set());
    alert(`Push complete! ✅ ${ok} succeeded, ❌ ${fail} failed`);
    fetchProducts();
    setSyncing(false);
  };

  // ── SNAPSHOT ──
  const takeWeeklySnapshot = async () => {
    if (!confirm('Take inventory snapshot for this week?')) return;
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
      ? formData.reorder_point
      : calcAutoReorderPoint(formData.avg_daily_sales || 0);
    const payload = { ...formData, reorder_point: rp };
    try {
      if (editingProduct) {
        await supabase.from('inventory_v2').update(payload).eq('id', editingProduct.id);
      } else {
        await supabase.from('inventory_v2').insert([payload]);
      }
      fetchProducts();
      resetForm();
    } catch (e) {
      alert('Error saving: ' + e.message);
    }
  };

  const handleAddStock = async (productId) => {
    const val = parseInt(addStockValue[productId] || 0);
    if (!val || val <= 0) return alert('Enter a valid quantity to add.');
    const p = products.find(x => x.id === productId);
    await supabase.from('inventory_v2').update({ sellable_stock: p.sellable_stock + val }).eq('id', productId);
    setAddStockValue(prev => ({ ...prev, [productId]: '' }));
    fetchProducts();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    await supabase.from('inventory_v2').delete().eq('id', id);
    fetchProducts();
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedProducts.size} products?`)) return;
    await supabase.from('inventory_v2').delete().in('id', Array.from(selectedProducts));
    setSelectedProducts(new Set());
    fetchProducts();
  };

  const handleEdit = (p) => {
    setEditingProduct(p);
    setFormData({ ...p });
    setShowForm(true);
    setActiveTab('inventory');
  };

  const resetForm = () => {
    setFormData({ product_name:'', local_name:'', sku:'', sellable_stock:0, hold_stock:0, design:'', reorder_point:5, reorder_point_custom:false, supplier_id:null, category_id:null, avg_daily_sales:0, notes:'' });
    setEditingProduct(null);
    setShowForm(false);
  };

  const updateDeadStockFlags = async () => {
    for (const p of products) {
      const isDead = p.avg_daily_sales <= deadStockSalesThreshold
        && (new Date() - new Date(p.last_sold_at || p.created_at)) / (1000*60*60*24) >= deadStockThreshold;
      if (isDead !== p.is_dead_stock) {
        await supabase.from('inventory_v2').update({ is_dead_stock: isDead }).eq('id', p.id);
      }
    }
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
        return m ? m.map(c => c.replace(/^"|"$/g,'').trim()) : [];
      });
      const dataRows = rows.slice(1).filter(r => r.length > 1 && r.some(c => c));
      const log = [];
      for (const row of dataRows) {
        const product = {
          product_name: row[0]||'', local_name: row[1]||row[0]||'', sku: row[2]||'',
          sellable_stock: parseInt(row[3])||0, hold_stock: parseInt(row[4])||0,
          design: row[5]||'', reorder_point: parseInt(row[6])||5,
          avg_daily_sales: parseFloat(row[7])||0, notes: row[8]||''
        };
        if (!product.sku) continue;
        const { data: ex } = await supabase.from('inventory_v2').select('*').eq('sku', product.sku).single();
        if (ex && importMode === 'add') {
          await supabase.from('inventory_v2').update({ sellable_stock: ex.sellable_stock + product.sellable_stock }).eq('sku', product.sku);
          log.push(`✅ Added stock: ${product.sku}`);
        } else if (!ex) {
          await supabase.from('inventory_v2').insert([product]);
          log.push(`✅ New: ${product.sku}`);
        } else {
          await supabase.from('inventory_v2').update(product).eq('sku', product.sku);
          log.push(`🔄 Replaced: ${product.sku}`);
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
    const headers = ['Product Name','Local Name','SKU','Sellable Stock','Hold Stock','Design','Reorder Point','Avg Daily Sales','Days to Stockout','Status','Category','Supplier','Notes'];
    const rows = [headers.join(',')];
    filteredProducts.forEach(p => {
      const cat = categories.find(c => c.id === p.category_id);
      const sup = suppliers.find(s => s.id === p.supplier_id);
      const days = calcDaysToStockout(p.sellable_stock, p.avg_daily_sales);
      rows.push([
        `"${p.product_name}"`,`"${p.local_name}"`,p.sku,
        p.sellable_stock, p.hold_stock, `"${p.design||''}"`,
        p.reorder_point, p.avg_daily_sales, days, getStatus(p),
        `"${cat?.name||'Uncategorized'}"`, `"${sup?.name||''}"`, `"${p.notes||''}"`
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ── FILTERS ──
  const filteredProducts = products.filter(p => {
    const search = searchTerm.toLowerCase();
    const matchSearch = !search ||
      p.product_name.toLowerCase().includes(search) ||
      (p.local_name||'').toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search);
    const matchCat = filterCat === 'all' ||
      (filterCat === 'uncategorized' ? !p.category_id : String(p.category_id) === filterCat);
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
    sellableUnits: products.reduce((s,p) => s + p.sellable_stock, 0),
  };

  const topFastMoving = [...products]
    .filter(p => p.avg_daily_sales > 0)
    .sort((a,b) => b.avg_daily_sales - a.avg_daily_sales)
    .slice(0,5);

  const topDeadStock = [...products]
    .filter(p => p.is_dead_stock)
    .sort((a,b) => a.avg_daily_sales - b.avg_daily_sales)
    .slice(0,5);

  const needReorder = products.filter(p => p.sellable_stock <= p.reorder_point && !p.hold_stock);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  const tabs = [
    { id:'dashboard', label:'📊 Dashboard' },
    { id:'inventory', label:'📦 Inventory' },
    { id:'purchase_orders', label:'📋 Purchase Orders' },
    { id:'snapshots', label:'📅 Weekly Snapshot' },
    { id:'settings', label:'⚙️ Settings' },
  ];

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', background:'#F9FAFB', minHeight:'100vh' }}>
      {/* Header */}
      <div style={{ background:'#7C3AED', color:'white', padding:'0 24px' }}>
        <div style={{ maxWidth:'1600px', margin:'0 auto', display:'flex', alignItems:'center', gap:'16px', height:'60px' }}>
          <span style={{ fontSize:'20px', fontWeight:'700' }}>🏪 Inventory v2</span>
          <div style={{ display:'flex', gap:'4px', marginLeft:'auto' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding:'8px 16px', background: activeTab===t.id ? 'rgba(255,255,255,0.25)' : 'transparent',
                  color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:'500' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:'12px', opacity:0.8, marginLeft:'8px' }}>
            {shopifyConnected ? '🟢 Shopify' : '🔴 Shopify'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:'1600px', margin:'0 auto', padding:'24px' }}>

        {/* ── DASHBOARD TAB ── */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            stats={stats} products={products} topFastMoving={topFastMoving}
            topDeadStock={topDeadStock} needReorder={needReorder}
            categories={categories} suppliers={suppliers}
          />
        )}

        {/* ── INVENTORY TAB ── */}
        {activeTab === 'inventory' && (
          <InventoryTab
            products={products} filteredProducts={filteredProducts}
            categories={categories} suppliers={suppliers}
            stats={stats} loading={loading} syncing={syncing}
            shopifyConnected={shopifyConnected}
            lastSyncTime={lastSyncTime} lastPushTime={lastPushTime}
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
            handleSubmit={handleSubmit} handleEdit={handleEdit} handleDelete={handleDelete}
            handleBulkDelete={handleBulkDelete} handleBulkImport={handleBulkImport}
            handleAddStock={handleAddStock} resetForm={resetForm}
            initialSyncFromShopify={initialSyncFromShopify}
            syncOrdersFromShopify={syncOrdersFromShopify}
            pushSelectedToShopify={pushSelectedToShopify}
            exportToCSV={exportToCSV}
            getStatus={getStatus} calcDaysToStockout={calcDaysToStockout}
            salesPeriod={salesPeriod}
          />
        )}

        {/* ── PURCHASE ORDERS TAB ── */}
        {activeTab === 'purchase_orders' && (
          <PurchaseOrderTab
            products={products} suppliers={suppliers} categories={categories}
            getStatus={getStatus}
          />
        )}

        {/* ── SNAPSHOTS TAB ── */}
        {activeTab === 'snapshots' && (
          <SnapshotsTab
            snapshots={snapshots} takeWeeklySnapshot={takeWeeklySnapshot}
            products={products}
          />
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <SettingsTab
            suppliers={suppliers} setSuppliers={setSuppliers}
            categories={categories} setCategories={setCategories}
            supabase={supabase}
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
const DashboardTab = ({ stats, products, topFastMoving, topDeadStock, needReorder, categories, suppliers }) => {
  const totalValue = products.reduce((s,p) => s + p.sellable_stock, 0);
  return (
    <div>
      <h2 style={{ margin:'0 0 20px', fontSize:'22px', color:'#111827' }}>📊 Dashboard Overview</h2>
      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'28px' }}>
        {[
          { label:'Total Products', value:stats.total, bg:'#EFF6FF', color:'#1E40AF' },
          { label:'🔴 Critical', value:stats.critical, bg:'#FEF2F2', color:'#DC2626' },
          { label:'🟡 Warning', value:stats.warning, bg:'#FFFBEB', color:'#D97706' },
          { label:'🔵 On Hold', value:stats.onHold, bg:'#EFF6FF', color:'#2563EB' },
          { label:'🪦 Dead Stock', value:stats.deadStock, bg:'#F5F3FF', color:'#7C3AED' },
          { label:'Sellable Units', value:stats.sellableUnits, bg:'#F0FDF4', color:'#16A34A' },
        ].map(card => (
          <div key={card.label} style={{ padding:'20px', background:card.bg, borderRadius:'10px' }}>
            <div style={{ fontSize:'30px', fontWeight:'700', color:card.color }}>{card.value}</div>
            <div style={{ color:card.color, marginTop:'4px', fontSize:'13px', fontWeight:'500' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Three panels */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'20px' }}>
        <div style={{ background:'white', padding:'20px', borderRadius:'10px', border:'1px solid #E5E7EB' }}>
          <h3 style={{ margin:'0 0 16px', fontSize:'15px', color:'#374151' }}>🚀 Top 5 Fast-Moving</h3>
          {topFastMoving.length === 0 ? (
            <p style={{ color:'#9CA3AF', fontSize:'13px' }}>Set avg_daily_sales on products to see this.</p>
          ) : topFastMoving.map((p, i) => (
            <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{i+1}. {p.product_name}</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{p.sku}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#059669' }}>{p.avg_daily_sales}/day</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>Stock: {p.sellable_stock}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:'white', padding:'20px', borderRadius:'10px', border:'1px solid #E5E7EB' }}>
          <h3 style={{ margin:'0 0 16px', fontSize:'15px', color:'#374151' }}>🪦 Top 5 Dead Stock</h3>
          {topDeadStock.length === 0 ? (
            <p style={{ color:'#9CA3AF', fontSize:'13px' }}>No dead stock flagged yet.</p>
          ) : topDeadStock.map((p, i) => (
            <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:'600', color:'#111827' }}>{i+1}. {p.product_name}</div>
                <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{p.sku}</div>
              </div>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#7C3AED' }}>{p.sellable_stock} units</div>
            </div>
          ))}
        </div>

        <div style={{ background:'white', padding:'20px', borderRadius:'10px', border:'1px solid #E5E7EB' }}>
          <h3 style={{ margin:'0 0 4px', fontSize:'15px', color:'#374151' }}>⚠️ Reorder Now</h3>
          <p style={{ margin:'0 0 12px', fontSize:'12px', color:'#9CA3AF' }}>{needReorder.length} product(s) at or below reorder point</p>
          {needReorder.length === 0 ? (
            <p style={{ color:'#9CA3AF', fontSize:'13px' }}>All good! No immediate reorders.</p>
          ) : needReorder.slice(0,8).map(p => (
            <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F3F4F6' }}>
              <div style={{ fontSize:'13px', color:'#111827' }}>{p.product_name}</div>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#DC2626' }}>{p.sellable_stock} left</div>
            </div>
          ))}
          {needReorder.length > 8 && <p style={{ fontSize:'12px', color:'#9CA3AF', margin:'8px 0 0' }}>+{needReorder.length-8} more...</p>}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// INVENTORY TAB
// ─────────────────────────────────────────────
const InventoryTab = ({
  products, filteredProducts, categories, suppliers, stats, loading, syncing,
  shopifyConnected, lastSyncTime, lastPushTime,
  searchTerm, setSearchTerm, filterCat, setFilterCat, filterStatus, setFilterStatus,
  selectedProducts, setSelectedProducts, showForm, setShowForm, editingProduct,
  formData, setFormData, showImport, setShowImport, importMode, setImportMode, importLog,
  addStockValue, setAddStockValue,
  handleSubmit, handleEdit, handleDelete, handleBulkDelete, handleBulkImport,
  handleAddStock, resetForm, initialSyncFromShopify, syncOrdersFromShopify,
  pushSelectedToShopify, exportToCSV, getStatus, calcDaysToStockout, salesPeriod
}) => {
  const sup = (id) => suppliers.find(s => s.id === id);
  const cat = (id) => categories.find(c => c.id === id);

  return (
    <div>
      {/* Sync status bar */}
      <div style={{ display:'flex', gap:'20px', marginBottom:'16px', fontSize:'13px', color:'#6B7280', flexWrap:'wrap', alignItems:'center' }}>
        {shopifyConnected
          ? <span style={{ color:'#059669', fontWeight:'500' }}>✓ Shopify Connected</span>
          : <span style={{ color:'#DC2626' }}>✗ Shopify Disconnected</span>
        }
        <span>Last sync: {formatTime(lastSyncTime)}</span>
        <span>Last push: {formatTime(lastPushTime)}</span>
        {selectedProducts.size > 0 && (
          <span style={{ color:'#7C3AED', fontWeight:'600' }}>{selectedProducts.size} selected</span>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
        {showForm ? (
          <button onClick={resetForm} style={btnStyle('#6B7280')}>✕ Cancel</button>
        ) : (
          <button onClick={() => setShowForm(true)} style={btnStyle('#7C3AED')}>+ Add Product</button>
        )}
        <button onClick={() => setShowImport(!showImport)} style={btnStyle('#0891B2')}>📦 Import CSV</button>

        {shopifyConnected && (
          <>
            {products.length === 0 ? (
              <button onClick={initialSyncFromShopify} disabled={syncing} style={btnStyle(syncing ? '#9CA3AF':'#059669')}>
                {syncing ? '⏳ Syncing...' : '⬇️ Initial Sync'}
              </button>
            ) : (
              <button onClick={syncOrdersFromShopify} disabled={syncing} style={btnStyle(syncing ? '#9CA3AF':'#2563EB')}>
                {syncing ? '⏳ Syncing...' : '🔄 Sync Orders'}
              </button>
            )}
            <button
              onClick={pushSelectedToShopify}
              disabled={syncing || selectedProducts.size === 0}
              style={btnStyle(selectedProducts.size === 0 ? '#9CA3AF' : '#7C3AED')}
              title="Select products to push"
            >
              {syncing ? '⏳ Pushing...' : `↗️ Push to Shopify${selectedProducts.size > 0 ? ` (${selectedProducts.size})` : ''}`}
            </button>
          </>
        )}
        <button onClick={exportToCSV} style={btnStyle('#374151', true)}>↓ Export CSV</button>
        {selectedProducts.size > 0 && (
          <button onClick={handleBulkDelete} style={btnStyle('#DC2626')}>🗑️ Delete ({selectedProducts.size})</button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <ProductForm
          editingProduct={editingProduct} formData={formData} setFormData={setFormData}
          handleSubmit={handleSubmit} resetForm={resetForm}
          categories={categories} suppliers={suppliers}
        />
      )}

      {/* Import */}
      {showImport && (
        <div style={{ background:'#EFF6FF', padding:'20px', borderRadius:'8px', marginBottom:'20px', border:'2px solid #BFDBFE' }}>
          <h3 style={{ margin:'0 0 12px', fontSize:'16px' }}>📦 Import from CSV</h3>
          <p style={{ fontSize:'12px', color:'#6B7280', margin:'0 0 10px' }}>
            Columns: Product Name, Local Name, SKU, Sellable Stock, Hold Stock, Design, Reorder Point, Avg Daily Sales, Notes
          </p>
          <div style={{ display:'flex', gap:'20px', marginBottom:'12px' }}>
            {['add','replace'].map(m => (
              <label key={m} style={{ display:'flex', gap:'6px', cursor:'pointer', fontSize:'14px' }}>
                <input type="radio" value={m} checked={importMode===m} onChange={e => setImportMode(e.target.value)} />
                <strong>{m.toUpperCase()}</strong>
              </label>
            ))}
          </div>
          <input type="file" accept=".csv" onChange={handleBulkImport} style={{ padding:'8px', border:'2px solid #BFDBFE', borderRadius:'6px', background:'white', width:'100%', boxSizing:'border-box' }} />
          {importLog.length > 0 && (
            <div style={{ marginTop:'12px', background:'white', padding:'12px', borderRadius:'6px', maxHeight:'150px', overflowY:'auto', fontSize:'12px', fontFamily:'monospace' }}>
              {importLog.map((l,i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'16px', alignItems:'center', flexWrap:'wrap' }}>
        <input type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ flex:1, minWidth:'200px', padding:'9px 12px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'14px' }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ padding:'9px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'14px', minWidth:'140px' }}>
          <option value="all">All Categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding:'9px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'14px', minWidth:'130px' }}>
          <option value="all">All Status</option>
          <option value="critical">🔴 Critical</option>
          <option value="warning">🟡 Warning</option>
          <option value="hold">🔵 On Hold</option>
          <option value="dead">🪦 Dead Stock</option>
        </select>
        <span style={{ fontSize:'13px', color:'#6B7280' }}>{filteredProducts.length} products</span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF' }}>Loading...</div>
      ) : filteredProducts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF' }}>No products found.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:'8px', overflow:'hidden', fontSize:'13px' }}>
            <thead>
              <tr style={{ background:'#F3F4F6' }}>
                <th style={thStyle()}>
                  <input type="checkbox"
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={e => e.target.checked
                      ? setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
                      : setSelectedProducts(new Set())}
                  />
                </th>
                {['Product','Local Name','SKU','Category','Sellable','Hold','Add Stock','Reorder Pt','Days Left','Status','Pushed','Actions'].map(h => (
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
                  <tr key={p.id} style={{ borderBottom:'1px solid #F3F4F6', background: p.is_dead_stock ? '#FDF4FF' : 'white' }}>
                    <td style={tdStyle()}>
                      <input type="checkbox" checked={selectedProducts.has(p.id)}
                        onChange={e => {
                          const ns = new Set(selectedProducts);
                          e.target.checked ? ns.add(p.id) : ns.delete(p.id);
                          setSelectedProducts(ns);
                        }} />
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ fontWeight:'600', color:'#111827' }}>{p.product_name}</div>
                      {p.is_dead_stock && <span style={{ fontSize:'10px', color:'#7C3AED', background:'#EDE9FE', padding:'1px 4px', borderRadius:'3px' }}>🪦 Dead</span>}
                      {p.notes && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>📝 {p.notes.substring(0,30)}{p.notes.length>30?'...':''}</div>}
                    </td>
                    <td style={tdStyle()}>{p.local_name}</td>
                    <td style={{ ...tdStyle(), fontFamily:'monospace', color:'#6B7280' }}>{p.sku}</td>
                    <td style={tdStyle()}>{cat(p.category_id)?.name || <span style={{ color:'#9CA3AF' }}>Uncategorized</span>}</td>
                    <td style={{ ...tdStyle(), textAlign:'center', fontWeight:'700', fontSize:'15px' }}>{p.sellable_stock}</td>
                    <td style={{ ...tdStyle(), textAlign:'center', color:'#2563EB' }}>{p.hold_stock}</td>
                    <td style={tdStyle()}>
                      <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                        <input type="number" min="0" placeholder="+qty"
                          value={addStockValue[p.id] || ''}
                          onChange={e => setAddStockValue(prev => ({ ...prev, [p.id]: e.target.value }))}
                          style={{ width:'64px', padding:'4px 6px', border:'1px solid #D1D5DB', borderRadius:'4px', fontSize:'12px' }}
                        />
                        <button onClick={() => handleAddStock(p.id)}
                          style={{ padding:'4px 8px', background:'#059669', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>
                          Add
                        </button>
                      </div>
                    </td>
                    <td style={{ ...tdStyle(), textAlign:'center' }}>
                      {p.reorder_point}
                      {p.reorder_point_custom && <span style={{ fontSize:'9px', color:'#7C3AED', marginLeft:'2px' }}>✎</span>}
                    </td>
                    <td style={{ ...tdStyle(), textAlign:'center', fontWeight:'600', color:daysColor }}>{days}d</td>
                    <td style={{ ...tdStyle(), fontSize:'12px', fontWeight:'600' }}>{status}</td>
                    <td style={{ ...tdStyle(), fontSize:'11px', color:'#9CA3AF' }}>
                      {p.shopify_pushed_at ? formatTime(p.shopify_pushed_at) : '—'}
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => handleEdit(p)} style={{ padding:'5px 10px', background:'#3B82F6', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>Edit</button>
                        <button onClick={() => handleDelete(p.id)} style={{ padding:'5px 10px', background:'#EF4444', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>Del</button>
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
  const rp = formData.reorder_point_custom
    ? formData.reorder_point
    : calcAutoReorderPoint(formData.avg_daily_sales || 0);

  return (
    <div style={{ background:'#F9FAFB', padding:'24px', borderRadius:'8px', marginBottom:'20px', border:'2px solid #E5E7EB' }}>
      <h3 style={{ margin:'0 0 20px', fontSize:'18px' }}>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'14px' }}>
          {[
            { key:'product_name', label:'Product Name *', type:'text', required:true },
            { key:'local_name', label:'Local Name (Hindi/Regional)', type:'text', required:false },
            { key:'sku', label:'SKU *', type:'text', required:true },
          ].map(f => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              <input type={f.type} required={f.required} value={formData[f.key]||''}
                onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                style={inputStyle} />
            </div>
          ))}

          {[
            { key:'sellable_stock', label:'Sellable Stock' },
            { key:'hold_stock', label:'Hold Stock' },
          ].map(f => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              <input type="number" min="0" value={formData[f.key]||0}
                onChange={e => setFormData({ ...formData, [f.key]: parseInt(e.target.value)||0 })}
                style={inputStyle} />
            </div>
          ))}

          <div>
            <label style={labelStyle}>Design/Type</label>
            <input type="text" value={formData.design||''}
              onChange={e => setFormData({ ...formData, design: e.target.value })}
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Category</label>
            <select value={formData.category_id||''} onChange={e => setFormData({ ...formData, category_id: e.target.value ? parseInt(e.target.value) : null })}
              style={inputStyle}>
              <option value="">Uncategorized</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Supplier</label>
            <select value={formData.supplier_id||''} onChange={e => setFormData({ ...formData, supplier_id: e.target.value ? parseInt(e.target.value) : null })}
              style={inputStyle}>
              <option value="">None</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Avg Daily Sales (units/day)</label>
            <input type="number" step="0.1" min="0" value={formData.avg_daily_sales||0}
              onChange={e => setFormData({ ...formData, avg_daily_sales: parseFloat(e.target.value)||0 })}
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>
              Reorder Point
              <label style={{ marginLeft:'10px', fontSize:'12px', cursor:'pointer' }}>
                <input type="checkbox" checked={formData.reorder_point_custom||false}
                  onChange={e => setFormData({ ...formData, reorder_point_custom: e.target.checked })}
                  style={{ marginRight:'4px' }} />
                Override (auto: {rp})
              </label>
            </label>
            <input type="number" min="0" value={formData.reorder_point_custom ? (formData.reorder_point||0) : rp}
              disabled={!formData.reorder_point_custom}
              onChange={e => setFormData({ ...formData, reorder_point: parseInt(e.target.value)||0 })}
              style={{ ...inputStyle, background: formData.reorder_point_custom ? 'white' : '#F3F4F6' }} />
          </div>
        </div>

        <div style={{ marginTop:'14px' }}>
          <label style={labelStyle}>Notes / Remarks</label>
          <textarea value={formData.notes||''} onChange={e => setFormData({ ...formData, notes: e.target.value })}
            rows={2} placeholder="Any notes about this product..."
            style={{ ...inputStyle, resize:'vertical' }} />
        </div>

        <div style={{ marginTop:'18px', display:'flex', gap:'10px' }}>
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
const PurchaseOrderTab = ({ products, suppliers, categories, getStatus }) => {
  const defaultItems = products
    .filter(p => getStatus(p).includes('CRITICAL') || getStatus(p).includes('WARNING'))
    .map(p => ({
      id: p.id, product_name: p.product_name, sku: p.sku,
      current_stock: p.sellable_stock, reorder_point: p.reorder_point,
      order_qty: Math.max(1, p.reorder_point * 2 - p.sellable_stock),
      unit_price: 0, supplier_id: p.supplier_id || null,
      remark: ''
    }));

  const [items, setItems] = useState(defaultItems);
  const [poDate] = useState(new Date().toISOString().split('T')[0]);
  const [poNumber] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setItems(defaultItems);
  }, [products.length]);

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const addCustomItem = () => {
    setItems(prev => [...prev, {
      id: `custom-${Date.now()}`, product_name: 'New Item', sku: '', current_stock: 0,
      reorder_point: 0, order_qty: 1, unit_price: 0, supplier_id: null, remark: ''
    }]);
  };

  const totalValue = items.reduce((s,i) => s + (i.order_qty * i.unit_price), 0);

  const generatePO = async () => {
    setGenerating(true);
    try {
      const payload = { items, poNumber, poDate, totalValue, suppliers, exportFormat };
      const r = await fetch('/api/generate-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!r.ok) throw new Error('Failed to generate PO from server');
      const blob = await r.blob();
      const ext = exportFormat === 'xlsx' ? 'xlsx' : exportFormat === 'docx' ? 'docx' : 'pdf';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${poNumber}.${ext}`;
      a.click();
    } catch (e) {
      // Fallback: generate CSV PO
      const headers = ['Product Name','SKU','Current Stock','Order Qty','Unit Price','Total','Supplier','Remark'];
      const rows = [headers.join(',')];
      items.forEach(i => {
        const sup = suppliers.find(s => s.id === i.supplier_id);
        rows.push([
          `"${i.product_name}"`, i.sku, i.current_stock, i.order_qty,
          i.unit_price, i.order_qty * i.unit_price,
          `"${sup?.name||''}"`, `"${i.remark||''}"`
        ].join(','));
      });
      rows.push(['','','','','TOTAL',totalValue,'',''].join(','));
      const blob = new Blob([rows.join('\n')], { type:'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${poNumber}.csv`;
      a.click();
      alert('Note: PDF/XLSX generation requires the backend API. Downloaded as CSV instead.');
    }
    setGenerating(false);
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <div>
          <h2 style={{ margin:0, fontSize:'22px' }}>📋 Purchase Order Generator</h2>
          <p style={{ margin:'4px 0 0', color:'#6B7280', fontSize:'14px' }}>PO# {poNumber} | Date: {poDate}</p>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <select value={exportFormat} onChange={e => setExportFormat(e.target.value)}
            style={{ padding:'8px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'14px' }}>
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel (XLSX)</option>
            <option value="docx">Word (DOCX)</option>
            <option value="csv">CSV (fallback)</option>
          </select>
          <button onClick={generatePO} disabled={generating || items.length === 0}
            style={btnStyle(generating || items.length === 0 ? '#9CA3AF' : '#7C3AED')}>
            {generating ? '⏳ Generating...' : `📥 Export ${exportFormat.toUpperCase()}`}
          </button>
          <button onClick={addCustomItem} style={btnStyle('#059669')}>+ Add Item</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ background:'white', padding:'40px', borderRadius:'8px', textAlign:'center', color:'#9CA3AF' }}>
          No items to reorder. All stock levels are good, or click "+ Add Item" to create a custom PO.
        </div>
      ) : (
        <>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:'8px', overflow:'hidden', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#F3F4F6' }}>
                  {['Product Name','SKU','Current Stock','Order Qty','Unit Price (₹)','Total (₹)','Supplier','Remark',''].map(h => (
                    <th key={h} style={thStyle()}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                    <td style={tdStyle()}>
                      <input type="text" value={item.product_name}
                        onChange={e => updateItem(item.id,'product_name',e.target.value)}
                        style={{ width:'150px', padding:'4px 6px', border:'1px solid #E5E7EB', borderRadius:'4px', fontSize:'12px' }} />
                    </td>
                    <td style={{ ...tdStyle(), fontFamily:'monospace', color:'#6B7280' }}>{item.sku}</td>
                    <td style={{ ...tdStyle(), textAlign:'center' }}>{item.current_stock}</td>
                    <td style={tdStyle()}>
                      <input type="number" min="0" value={item.order_qty}
                        onChange={e => updateItem(item.id,'order_qty',parseInt(e.target.value)||0)}
                        style={{ width:'70px', padding:'4px 6px', border:'1px solid #E5E7EB', borderRadius:'4px', fontSize:'12px', textAlign:'center' }} />
                    </td>
                    <td style={tdStyle()}>
                      <input type="number" min="0" step="0.01" value={item.unit_price}
                        onChange={e => updateItem(item.id,'unit_price',parseFloat(e.target.value)||0)}
                        style={{ width:'80px', padding:'4px 6px', border:'1px solid #E5E7EB', borderRadius:'4px', fontSize:'12px', textAlign:'right' }} />
                    </td>
                    <td style={{ ...tdStyle(), textAlign:'right', fontWeight:'600' }}>
                      ₹{(item.order_qty * item.unit_price).toLocaleString('en-IN')}
                    </td>
                    <td style={tdStyle()}>
                      <select value={item.supplier_id||''}
                        onChange={e => updateItem(item.id,'supplier_id',e.target.value ? parseInt(e.target.value) : null)}
                        style={{ padding:'4px 6px', border:'1px solid #E5E7EB', borderRadius:'4px', fontSize:'12px', minWidth:'100px' }}>
                        <option value="">None</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle()}>
                      <input type="text" placeholder="Remark..." value={item.remark||''}
                        onChange={e => updateItem(item.id,'remark',e.target.value)}
                        style={{ width:'120px', padding:'4px 6px', border:'1px solid #E5E7EB', borderRadius:'4px', fontSize:'12px' }} />
                    </td>
                    <td style={tdStyle()}>
                      <button onClick={() => removeItem(item.id)}
                        style={{ padding:'4px 8px', background:'#FEE2E2', color:'#DC2626', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F9FAFB', fontWeight:'700', fontSize:'14px' }}>
                  <td colSpan={5} style={{ ...tdStyle(), textAlign:'right' }}>Total Order Value:</td>
                  <td style={{ ...tdStyle(), color:'#7C3AED' }}>₹{totalValue.toLocaleString('en-IN')}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p style={{ marginTop:'12px', fontSize:'12px', color:'#9CA3AF' }}>
            💡 Pre-filled with products at or near reorder point. Edit quantities as needed before exporting.
          </p>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// SNAPSHOTS TAB
// ─────────────────────────────────────────────
const SnapshotsTab = ({ snapshots, takeWeeklySnapshot, products }) => (
  <div>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
      <h2 style={{ margin:0, fontSize:'22px' }}>📅 Weekly Snapshots / Changelog</h2>
      <button onClick={takeWeeklySnapshot} style={btnStyle('#7C3AED')}>📸 Take Snapshot Now</button>
    </div>
    {snapshots.length === 0 ? (
      <div style={{ background:'white', padding:'40px', borderRadius:'8px', textAlign:'center', color:'#9CA3AF' }}>
        No snapshots yet. Take your first snapshot to start tracking weekly changes.
      </div>
    ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        {snapshots.map((snap, i) => {
          const prev = snapshots[i+1];
          const changes = prev && snap.data && prev.data ? snap.data.filter(cur => {
            const old = prev.data.find(o => o.id === cur.id);
            return old && old.sellable_stock !== cur.sellable_stock;
          }) : [];
          return (
            <div key={snap.id} style={{ background:'white', padding:'20px', borderRadius:'8px', border:'1px solid #E5E7EB' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                <div>
                  <span style={{ fontWeight:'700', fontSize:'16px', color:'#111827' }}>
                    {new Date(snap.snapshot_date).toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
                  </span>
                  <span style={{ marginLeft:'12px', fontSize:'13px', color:'#6B7280' }}>
                    {snap.total_products} products | {snap.total_sellable} units
                  </span>
                </div>
                {i === 0 && <span style={{ background:'#DBEAFE', color:'#1D4ED8', padding:'2px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'600' }}>LATEST</span>}
              </div>
              {changes.length > 0 && (
                <div>
                  <p style={{ fontSize:'12px', fontWeight:'600', color:'#6B7280', margin:'0 0 8px' }}>Changes vs previous snapshot:</p>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(250px, 1fr))', gap:'8px' }}>
                    {changes.slice(0,6).map(cur => {
                      const old = prev.data.find(o => o.id === cur.id);
                      const diff = cur.sellable_stock - old.sellable_stock;
                      return (
                        <div key={cur.id} style={{ padding:'8px', background:'#F9FAFB', borderRadius:'6px', fontSize:'12px', display:'flex', justifyContent:'space-between' }}>
                          <span>{cur.product_name}</span>
                          <span style={{ fontWeight:'600', color: diff < 0 ? '#DC2626' : '#059669' }}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        </div>
                      );
                    })}
                    {changes.length > 6 && <div style={{ padding:'8px', color:'#9CA3AF', fontSize:'12px' }}>+{changes.length-6} more changes</div>}
                  </div>
                </div>
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
  suppliers, setSuppliers, categories, setCategories, supabase,
  fetchSuppliers, fetchCategories,
  salesPeriod, setSalesPeriod, deadStockThreshold, setDeadStockThreshold,
  deadStockSalesThreshold, setDeadStockSalesThreshold, updateDeadStockFlags, products
}) => {
  const [newCat, setNewCat] = useState('');
  const [newSup, setNewSup] = useState({ name:'', address:'', mobile:'', gst_id:'' });
  const [editSup, setEditSup] = useState(null);

  const addCategory = async () => {
    if (!newCat.trim()) return;
    await supabase.from('categories').insert([{ name: newCat.trim() }]);
    setNewCat('');
    fetchCategories();
  };

  const deleteCategory = async (id) => {
    if (!confirm('Delete category? Products will become Uncategorized.')) return;
    await supabase.from('inventory_v2').update({ category_id: null }).eq('category_id', id);
    await supabase.from('categories').delete().eq('id', id);
    fetchCategories();
  };

  const addSupplier = async () => {
    if (!newSup.name.trim()) return alert('Supplier name required.');
    await supabase.from('suppliers').insert([newSup]);
    setNewSup({ name:'', address:'', mobile:'', gst_id:'' });
    fetchSuppliers();
  };

  const deleteSupplier = async (id) => {
    if (!confirm('Delete supplier?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    fetchSuppliers();
  };

  const saveSupplierEdit = async () => {
    await supabase.from('suppliers').update(editSup).eq('id', editSup.id);
    setEditSup(null);
    fetchSuppliers();
  };

  const saveSettings = () => {
    localStorage.setItem('salesPeriod', String(salesPeriod));
    localStorage.setItem('deadStockDays', String(deadStockThreshold));
    localStorage.setItem('deadStockSales', String(deadStockSalesThreshold));
    alert('Settings saved!');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
      {/* Categories */}
      <div style={{ background:'white', padding:'24px', borderRadius:'10px', border:'1px solid #E5E7EB' }}>
        <h3 style={{ margin:'0 0 16px', fontSize:'18px' }}>📁 Product Categories</h3>
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
          <input type="text" placeholder="New category name (e.g. Earrings, Sarees...)" value={newCat}
            onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key==='Enter' && addCategory()}
            style={{ flex:1, padding:'9px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'14px' }} />
          <button onClick={addCategory} style={btnStyle('#7C3AED')}>Add</button>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
          {categories.map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:'6px', background:'#EDE9FE', padding:'6px 12px', borderRadius:'6px' }}>
              <span style={{ fontSize:'13px', fontWeight:'500', color:'#5B21B6' }}>{c.name}</span>
              <span style={{ fontSize:'11px', color:'#7C3AED' }}>
                ({products.filter(p => p.category_id === c.id).length})
              </span>
              <button onClick={() => deleteCategory(c.id)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:'14px', lineHeight:1, padding:0 }}>×</button>
            </div>
          ))}
          {categories.length === 0 && <p style={{ color:'#9CA3AF', fontSize:'14px' }}>No categories yet.</p>}
        </div>
      </div>

      {/* Suppliers */}
      <div style={{ background:'white', padding:'24px', borderRadius:'10px', border:'1px solid #E5E7EB' }}>
        <h3 style={{ margin:'0 0 16px', fontSize:'18px' }}>🏭 Supplier Master List</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'10px', marginBottom:'12px' }}>
          {[
            { key:'name', placeholder:'Name *' },
            { key:'address', placeholder:'Address' },
            { key:'mobile', placeholder:'Mobile No.' },
            { key:'gst_id', placeholder:'GST ID' },
          ].map(f => (
            <input key={f.key} type="text" placeholder={f.placeholder} value={newSup[f.key]}
              onChange={e => setNewSup({ ...newSup, [f.key]: e.target.value })}
              style={{ padding:'9px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'13px' }} />
          ))}
        </div>
        <button onClick={addSupplier} style={btnStyle('#059669')}>+ Add Supplier</button>

        <div style={{ marginTop:'16px', display:'flex', flexDirection:'column', gap:'10px' }}>
          {suppliers.map(s => (
            <div key={s.id} style={{ padding:'14px', background:'#F9FAFB', borderRadius:'8px', border:'1px solid #E5E7EB' }}>
              {editSup?.id === s.id ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:'8px' }}>
                  {['name','address','mobile','gst_id'].map(k => (
                    <input key={k} type="text" placeholder={k} value={editSup[k]||''}
                      onChange={e => setEditSup({ ...editSup, [k]: e.target.value })}
                      style={{ padding:'6px', border:'1px solid #D1D5DB', borderRadius:'4px', fontSize:'13px' }} />
                  ))}
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={saveSupplierEdit} style={btnStyle('#059669', false, 'small')}>Save</button>
                    <button onClick={() => setEditSup(null)} style={btnStyle('#6B7280', false, 'small')}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:'600', fontSize:'14px', color:'#111827' }}>{s.name}</div>
                    <div style={{ fontSize:'12px', color:'#6B7280', marginTop:'2px' }}>
                      {[s.mobile, s.address, s.gst_id ? `GST: ${s.gst_id}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={() => setEditSup({...s})} style={btnStyle('#3B82F6', false, 'small')}>Edit</button>
                    <button onClick={() => deleteSupplier(s.id)} style={btnStyle('#EF4444', false, 'small')}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Analytics & Dead Stock Settings */}
      <div style={{ background:'white', padding:'24px', borderRadius:'10px', border:'1px solid #E5E7EB' }}>
        <h3 style={{ margin:'0 0 16px', fontSize:'18px' }}>📊 Analytics & Dead Stock Settings</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:'20px' }}>
          <div>
            <label style={labelStyle}>Sales Period for Avg Daily Sales</label>
            <select value={salesPeriod} onChange={e => setSalesPeriod(parseInt(e.target.value))} style={inputStyle}>
              <option value={7}>1 Week</option>
              <option value={30}>1 Month</option>
              <option value={90}>3 Months</option>
              <option value={180}>6 Months</option>
              <option value={365}>1 Year</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Dead Stock: No sales in X days</label>
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
            <label style={labelStyle}>Dead Stock: Sales less than (units/day)</label>
            <select value={deadStockSalesThreshold} onChange={e => setDeadStockSalesThreshold(parseFloat(e.target.value))} style={inputStyle}>
              <option value={0}>0 (no sales at all)</option>
              <option value={0.1}>Less than 0.1/day</option>
              <option value={0.5}>Less than 0.5/day</option>
              <option value={1}>Less than 1/day</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop:'16px', display:'flex', gap:'10px' }}>
          <button onClick={saveSettings} style={btnStyle('#7C3AED')}>💾 Save Settings</button>
          <button onClick={updateDeadStockFlags} style={btnStyle('#DC2626')}>🔄 Recalculate Dead Stock Flags</button>
        </div>
        <p style={{ marginTop:'8px', fontSize:'12px', color:'#9CA3AF' }}>
          Dead stock is flagged when avg_daily_sales ≤ threshold AND no update in X days.
          Run "Recalculate" after changing settings.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────
function btnStyle(bg, outline = false, size = 'normal') {
  const pad = size === 'small' ? '5px 10px' : '10px 18px';
  const fs = size === 'small' ? '12px' : '13px';
  if (outline) return { padding:pad, background:'white', color:'#374151', border:'2px solid #E5E7EB', borderRadius:'6px', cursor:'pointer', fontWeight:'500', fontSize:fs };
  return { padding:pad, background:bg, color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'500', fontSize:fs };
}
function thStyle() { return { padding:'10px 12px', textAlign:'left', fontWeight:'600', fontSize:'12px', color:'#374151', borderBottom:'2px solid #E5E7EB', whiteSpace:'nowrap' }; }
function tdStyle() { return { padding:'10px 12px', fontSize:'13px', verticalAlign:'middle' }; }
const labelStyle = { display:'block', marginBottom:'5px', fontWeight:'500', fontSize:'13px', color:'#374151' };
const inputStyle = { width:'100%', padding:'9px', border:'2px solid #E5E7EB', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box' };

export default function App() {
  return (
    <AuthGate>
      <InventoryApp />
    </AuthGate>
  );
}
