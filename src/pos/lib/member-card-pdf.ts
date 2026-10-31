import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 54;

export async function downloadMemberCardPdf(
  frontCard: HTMLElement,
  backCard: HTMLElement,
  filename: string,
) {
  await document.fonts?.ready;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [CARD_WIDTH_MM, CARD_HEIGHT_MM],
    compress: true,
  });

  for (const [index, card] of [frontCard, backCard].entries()) {
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error('Pratinjau kartu belum siap untuk diunduh.');
    }

    await Promise.all(
      Array.from(card.querySelectorAll('img')).map((image) => image.decode()),
    );

    const canvas = await html2canvas(card, {
      scale: 4,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
    });
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Kartu tidak berhasil dirender. Silakan coba lagi.');
    }

    if (index > 0) doc.addPage([CARD_WIDTH_MM, CARD_HEIGHT_MM], 'landscape');
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);
  }

  doc.save(filename);
}
