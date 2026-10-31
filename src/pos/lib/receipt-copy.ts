import type { SalonId } from './menu';

export type ReceiptCopy = {
  thankYouText: string;
  taglineText: string;
};

export function defaultReceiptCopy(salon: SalonId): ReceiptCopy {
  const salonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  return {
    thankYouText: `Terima kasih telah mempercayakan perawatan dan penampilan Anda kepada ${salonName}.`,
    taglineText: 'Cantik atau tampan, tampil percaya diri dengan gaya terbaikmu.',
  };
}
