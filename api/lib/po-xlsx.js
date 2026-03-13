// api/lib/po-xlsx.js
// Uses exceljs for server-side XLSX generation

export async function generateXLSX({ items, poNumber, poDate, totalValue, suppliers }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventory System V2';
  const ws = wb.addWorksheet('Purchase Order');

  // Title
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'PURCHASE ORDER';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF7C3AED' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.getCell('A2').value = `PO Number: ${poNumber}`;
  ws.getCell('A3').value = `Date: ${poDate}`;
  ws.getCell('A4').value = 'Authority of Fashion';
  ws.getCell('A2').font = ws.getCell('A3').font = ws.getCell('A4').font = { bold: false, size: 10, color: { argb: 'FF6B7280' } };

  // Headers row 6
  const headers = ['Product Name', 'SKU', 'Current Stock', 'Order Qty', 'Unit Price (₹)', 'Total (₹)', 'Supplier', 'Remark'];
  ws.getRow(6).values = headers;
  ws.getRow(6).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Column widths
  ws.columns = [
    { width: 35 }, { width: 15 }, { width: 14 }, { width: 12 },
    { width: 16 }, { width: 14 }, { width: 20 }, { width: 25 }
  ];

  // Data rows
  items.forEach((item, i) => {
    const sup = suppliers?.find(s => s.id === item.supplier_id);
    const row = ws.addRow([
      item.product_name || '',
      item.sku || '',
      item.current_stock || 0,
      item.order_qty || 0,
      item.unit_price || 0,
      `=D${7 + i}*E${7 + i}`,
      sup?.name || '',
      item.remark || ''
    ]);
    row.getCell(6).numFmt = '₹#,##0.00';
    row.getCell(5).numFmt = '₹#,##0.00';
    if (i % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
      });
    }
  });

  // Total row
  const totalRow = ws.addRow(['', '', '', '', 'TOTAL', `=SUM(F7:F${6 + items.length})`, '', '']);
  totalRow.getCell(5).font = totalRow.getCell(6).font = { bold: true };
  totalRow.getCell(6).numFmt = '₹#,##0.00';
  totalRow.getCell(5).fill = totalRow.getCell(6).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEE9FE' }
  };

  // Border all data cells
  for (let r = 6; r <= 6 + items.length + 1; r++) {
    ws.getRow(r).eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
