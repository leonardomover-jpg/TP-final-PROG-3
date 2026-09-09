import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// Funciones puras compartidas por los dos reportes exportables (ventas,
// turnos) — mismo criterio que mercado-pago-client.ts/meta-client.ts: una
// sola implementación por formato, parametrizada por columnas/filas, en
// vez de repetir la generación de CSV/PDF/XLSX en cada service.
export interface ExportColumn {
  key: string;
  label: string;
}

export function buildCsv(columns: ExportColumn[], rows: Record<string, string | number>[]): Buffer {
  const escape = (value: string | number) => {
    const str = String(value ?? '');
    // Comilla doble si el valor trae coma, comilla o salto de línea —
    // regla estándar de CSV (RFC 4180).
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','));
  return Buffer.from([header, ...lines].join('\n'), 'utf-8');
}

export async function buildXlsx(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, string | number>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 20 }));
  sheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildPdf(title: string, columns: ExportColumn[], rows: Record<string, string | number>[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { align: 'left' });
    doc.moveDown();

    // Tabla simple por texto (pdfkit no trae tablas nativas): un renglón
    // por fila, columnas separadas por tabulación visual con anchos fijos
    // — suficiente para un reporte tabular sin diseño gráfico elaborado
    // (punto 94/95 del pedido: no inventar UI no pedida).
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;
    doc.fontSize(9).font('Helvetica-Bold');
    let y = doc.y;
    columns.forEach((c, i) => {
      doc.text(c.label, doc.page.margins.left + i * colWidth, y, { width: colWidth });
    });
    doc.font('Helvetica');
    y = doc.y + 16;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
    y += 6;

    for (const row of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      columns.forEach((c, i) => {
        doc.text(String(row[c.key] ?? ''), doc.page.margins.left + i * colWidth, y, { width: colWidth });
      });
      y += 16;
    }

    doc.end();
  });
}
