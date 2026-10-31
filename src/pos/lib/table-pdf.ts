export type PdfCell = string | number;

export type TablePdfOptions = {
  filename: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: PdfCell[][];
  summary?: [string, string][];
};

const formatCell = (value: PdfCell) => typeof value === 'number' ? value.toLocaleString('id-ID') : value;

/** Formal landscape A4 PDF report with a branded header, table, and page numbers. */
export async function downloadTablePdf({ filename, title, subtitle, headers, rows, summary }: TablePdfOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const printed = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date());

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(150, 40, 90);
  doc.text(title, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 70, 80);
  if (subtitle) doc.text(subtitle, 14, 22);
  doc.text(`Dicetak: ${printed} WIB`, pageWidth - 14, 16, { align: 'right' });
  doc.setDrawColor(200, 150, 175);
  doc.line(14, 25, pageWidth - 14, 25);

  let startY = 30;
  if (summary?.length) {
    doc.setFontSize(9);
    summary.forEach(([label, value], index) => {
      const x = 14 + (index % 4) * ((pageWidth - 28) / 4);
      const y = startY + Math.floor(index / 4) * 10;
      doc.setTextColor(120, 100, 110);
      doc.text(label, x, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 30, 40);
      doc.text(value, x, y + 4.5);
      doc.setFont('helvetica', 'normal');
    });
    startY += Math.ceil(summary.length / 4) * 10 + 2;
  }

  const numericColumns = new Set(headers.map((_, index) => index).filter((index) => rows.length > 0 && rows.every((row) => typeof row[index] === 'number' || row[index] === '')));
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows.map((row) => row.map(formatCell)),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [40, 30, 35], lineColor: [225, 205, 215], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: [168, 62, 112], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 245, 248] },
    columnStyles: Object.fromEntries([...numericColumns].map((index) => [index, { halign: 'right' as const }])),
    didParseCell: (data) => {
      if (data.section === 'body' && String(data.row.raw && (data.row.raw as PdfCell[])[0]).startsWith('TOTAL')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [246, 228, 236];
      }
    },
    margin: { left: 14, right: 14 },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(140, 120, 130);
    doc.text(`Halaman ${page} dari ${pages}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text(title, 14, doc.internal.pageSize.getHeight() - 8);
  }
  doc.save(filename);
}
