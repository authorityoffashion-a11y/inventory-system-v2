export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, since } = req.query;
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

  if (action === 'checkConnection') {
    return res.status(200).json({ connected: !!(SHOPIFY_STORE_URL && SHOPIFY_ACCESS_TOKEN) });
  }

  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Shopify credentials not configured' });
  }

  const shopifyFetch = (path, options = {}) =>
    fetch(`https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
      ...options,
      headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN, 'Content-Type': 'application/json', ...options.headers }
    });

  try {
    if (action === 'getAllProducts') {
      const r = await shopifyFetch('/products.json?limit=250');
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      return res.status(200).json(await r.json());
    }

    if (action === 'getOrders') {
      const r = await shopifyFetch(`/orders.json?status=any&created_at_min=${since}&limit=250`);
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      return res.status(200).json(await r.json());
    }

    if (action === 'updateInventoryBySKU') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { sku, quantity, product_name } = body;

      const pr = await shopifyFetch('/products.json?limit=250');
      if (!pr.ok) return res.status(pr.status).json({ error: await pr.text() });
      const { products } = await pr.json();

      let inventoryItemId = null;
      for (const p of products) {
        for (const v of p.variants) {
          if ((sku && v.sku === sku) || p.title.toLowerCase() === product_name?.toLowerCase()) {
            inventoryItemId = v.inventory_item_id;
            break;
          }
        }
        if (inventoryItemId) break;
      }

      if (!inventoryItemId) {
        return res.status(404).json({ error: `Product "${product_name}" (SKU: ${sku}) not found in Shopify.` });
      }

      const lr = await shopifyFetch('/locations.json');
      if (!lr.ok) return res.status(lr.status).json({ error: await lr.text() });
      const { locations } = await lr.json();
      const locationId = locations?.[0]?.id;
      if (!locationId) return res.status(404).json({ error: 'No location found in Shopify' });

      const ur = await shopifyFetch('/inventory_levels/set.json', {
        method: 'POST',
        body: JSON.stringify({ location_id: locationId, inventory_item_id: inventoryItemId, available: quantity })
      });
      if (!ur.ok) return res.status(ur.status).json({ error: await ur.text() });
      return res.status(200).json({ success: true, quantity });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
