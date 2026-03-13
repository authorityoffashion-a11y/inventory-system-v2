import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Note: This is a Vercel serverless function.
// It generates Purchase Orders in PDF, XLSX, or DOCX format.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { items, poNumber, poDate, totalValue, suppliers, exportFormat } = req.body;

  try {
    if (exportFormat === 'pdf') {
      const { generatePDF } = await import('./lib/po-pdf.js');
      const pdfBuffer = await generatePDF({ items, poNumber, poDate, totalValue, suppliers });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${poNumber}.pdf"`);
      return res.send(Buffer.from(pdfBuffer));
    }

    if (exportFormat === 'xlsx') {
      const { generateXLSX } = await import('./lib/po-xlsx.js');
      const xlsxBuffer = await generateXLSX({ items, poNumber, poDate, totalValue, suppliers });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${poNumber}.xlsx"`);
      return res.send(Buffer.from(xlsxBuffer));
    }

    if (exportFormat === 'docx') {
      const { generateDOCX } = await import('./lib/po-docx.js');
      const docxBuffer = await generateDOCX({ items, poNumber, poDate, totalValue, suppliers });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${poNumber}.docx"`);
      return res.send(Buffer.from(docxBuffer));
    }

    return res.status(400).json({ error: 'Invalid format' });
  } catch (error) {
    console.error('PO generation error:', error);
    return res.status(500).json({ error: error.message });
  }
}
