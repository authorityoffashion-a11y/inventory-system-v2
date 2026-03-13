// api/lib/po-docx.js
// Uses docx npm package for DOCX generation

export async function generateDOCX({ items, poNumber, poDate, totalValue, suppliers }) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel, VerticalAlign
  } = await import('docx');

  const purple = '7C3AED';
  const lightPurple = 'EDE9FE';
  const gray = '6B7280';

  const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

  const headerCellStyle = (text) => new TableCell({
    borders,
    shading: { fill: purple, type: ShadingType.CLEAR },
    width: { size: 1400, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })]
    })]
  });

  const dataCell = (text, shade = false, align = AlignmentType.LEFT) => new TableCell({
    borders,
    shading: shade ? { fill: 'F5F3FF', type: ShadingType.CLEAR } : { fill: 'FFFFFF', type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text || ''), size: 18 })]
    })]
  });

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: ['Product Name','SKU','Curr. Stock','Order Qty','Unit Price (₹)','Total (₹)','Supplier','Remark']
        .map(h => headerCellStyle(h))
    }),
    ...items.map((item, i) => {
      const sup = suppliers?.find(s => s.id === item.supplier_id);
      const total = (item.order_qty || 0) * (item.unit_price || 0);
      const shade = i % 2 === 0;
      return new TableRow({
        children: [
          dataCell(item.product_name, shade),
          dataCell(item.sku, shade),
          dataCell(item.current_stock || 0, shade, AlignmentType.CENTER),
          dataCell(item.order_qty || 0, shade, AlignmentType.CENTER),
          dataCell(`₹${(item.unit_price || 0).toFixed(2)}`, shade, AlignmentType.RIGHT),
          dataCell(`₹${total.toFixed(2)}`, shade, AlignmentType.RIGHT),
          dataCell(sup?.name || '', shade),
          dataCell(item.remark || '', shade),
        ]
      });
    }),
    // Total row
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 5, borders,
          shading: { fill: lightPurple, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'TOTAL ORDER VALUE:', bold: true, size: 20 })]
          })]
        }),
        new TableCell({
          borders,
          shading: { fill: lightPurple, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, bold: true, size: 20, color: purple })]
          })]
        }),
        new TableCell({ borders, children: [new Paragraph('')] }),
        new TableCell({ borders, children: [new Paragraph('')] }),
      ]
    })
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 16838, height: 11906 }, margin: { top: 720, right: 720, bottom: 720, left: 720 }, orientation: 'landscape' }
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'PURCHASE ORDER', bold: true, size: 36, color: purple })]
        }),
        new Paragraph({
          children: [new TextRun({ text: `PO Number: ${poNumber}   |   Date: ${poDate}`, size: 20, color: gray })]
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Authority of Fashion', size: 20, color: gray })]
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Table({
          width: { size: 15398, type: WidthType.DXA },
          columnWidths: [2800, 1400, 1200, 1200, 1600, 1600, 1800, 1798],
          rows: tableRows
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'This is a computer-generated purchase order.', size: 16, color: '9CA3AF' })]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
