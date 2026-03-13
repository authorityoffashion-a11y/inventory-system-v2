// api/lib/po-pdf.js
// Uses pdfkit for server-side PDF generation

export async function generatePDF({ items, poNumber, poDate, totalValue, suppliers }) {
  const PDFDocument = (await import('pdfkit')).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('PURCHASE ORDER', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    doc.text(`PO Number: ${poNumber}`, 50, 80);
    doc.text(`Date: ${poDate}`, 50, 95);
    doc.text('Authority of Fashion', 50, 110);
    doc.fillColor('#000000');

    // Divider
    doc.moveTo(50, 135).lineTo(545, 135).stroke('#7C3AED');

    // Table header
    const cols = [
      { label: 'Product Name', x: 50, width: 160 },
      { label: 'SKU', x: 210, width: 80 },
      { label: 'Current', x: 290, width: 55 },
      { label: 'Order Qty', x: 345, width: 60 },
      { label: 'Unit Price', x: 405, width: 65 },
      { label: 'Total', x: 470, width: 75 },
    ];

    let y = 150;
    doc.rect(50, y, pageWidth, 20).fill('#7C3AED');
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
    cols.forEach(c => doc.text(c.label, c.x + 3, y + 6, { width: c.width - 6 }));

    y += 22;
    doc.fillColor('#000000').font('Helvetica').fontSize(9);

    items.forEach((item, i) => {
      if (y > 720) { doc.addPage(); y = 50; }
      if (i % 2 === 0) doc.rect(50, y, pageWidth, 18).fill('#F9F5FF');
      doc.fillColor('#000000');
      const sup = suppliers?.find(s => s.id === item.supplier_id);
      doc.text(item.product_name || '', cols[0].x + 3, y + 5, { width: cols[0].width - 6, ellipsis: true });
      doc.text(item.sku || '', cols[1].x + 3, y + 5, { width: cols[1].width - 6 });
      doc.text(String(item.current_stock || 0), cols[2].x + 3, y + 5, { width: cols[2].width - 6 });
      doc.text(String(item.order_qty || 0), cols[3].x + 3, y + 5, { width: cols[3].width - 6 });
      doc.text(`₹${(item.unit_price || 0).toFixed(2)}`, cols[4].x + 3, y + 5, { width: cols[4].width - 6 });
      doc.text(`₹${((item.order_qty || 0) * (item.unit_price || 0)).toFixed(2)}`, cols[5].x + 3, y + 5, { width: cols[5].width - 6 });
      if (item.remark) {
        y += 18;
        doc.fillColor('#9CA3AF').fontSize(8).text(`  Remark: ${item.remark}`, cols[0].x + 3, y, { width: pageWidth - 6 });
        doc.fillColor('#000000').fontSize(9);
      }
      y += 20;
    });

    // Total
    y += 8;
    doc.moveTo(50, y).lineTo(545, y).stroke('#E5E7EB');
    y += 10;
    doc.fontSize(12).font('Helvetica-Bold').text(`Total Order Value: ₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 50, y, { align: 'right', width: pageWidth });

    // Footer
    y += 40;
    doc.fontSize(9).font('Helvetica').fillColor('#9CA3AF').text('This is a computer-generated purchase order.', 50, y, { align: 'center', width: pageWidth });

    doc.end();
  });
}
