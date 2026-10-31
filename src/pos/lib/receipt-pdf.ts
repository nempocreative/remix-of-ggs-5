import { jsPDF } from 'jspdf';

const PAGE_WIDTH_MM = 80;
const SIDE_MARGIN_MM = 2.5;

export async function downloadReceiptPdf(receiptElement: HTMLElement, invoiceNumber: string) {
  const rect = receiptElement.getBoundingClientRect();
  const sourceWidth = Math.ceil(Math.max(rect.width, receiptElement.scrollWidth));
  const sourceHeight = Math.ceil(Math.max(rect.height, receiptElement.scrollHeight));

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Pratinjau struk tidak tersedia.');
  }

  const contentWidth = PAGE_WIDTH_MM - SIDE_MARGIN_MM * 2;
  const pageHeight = Math.ceil(sourceHeight * contentWidth / sourceWidth + SIDE_MARGIN_MM * 2);
  const doc = new jsPDF({
    unit: 'mm',
    format: [PAGE_WIDTH_MM, pageHeight],
    compress: true,
  });
  const safeInvoice = invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');

  await doc.html(receiptElement, {
    x: SIDE_MARGIN_MM,
    y: SIDE_MARGIN_MM,
    width: contentWidth,
    windowWidth: sourceWidth,
    autoPaging: false,
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      onclone: (clonedDocument) => {
        clonedDocument.querySelectorAll('[data-receipt-export-hide]').forEach((element) => element.remove());
      },
    },
  });

  doc.save(`struk-${safeInvoice}.pdf`);
}
