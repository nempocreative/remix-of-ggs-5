import { z } from 'zod';
import { calculateSaleDiscounts } from './sale-discounts';

export const saleRevisionSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().regex(/^0\d{7,14}$/),
  cashierName: z.string().trim().min(1).max(120),
  paymentMethod: z.enum(['Tunai', 'Transfer / QRIS']),
  discountMode: z.enum(['nominal', 'percent']),
  discountValue: z.number().finite().min(0).max(2_000_000_000),
  amountReceived: z.number().int().min(0).max(2_000_000_000),
  items: z.array(z.object({
    serviceId: z.string().min(1).max(120), name: z.string().trim().min(1).max(200),
    unitPrice: z.number().int().min(0).max(2_000_000_000), quantity: z.number().int().min(1).max(1000),
    discount: z.number().int().min(0).default(0), discountType: z.enum(['nominal', 'percent']).default('nominal'),
    employeeId: z.string().min(1).max(120),
  })).min(1).max(100),
});
export type SaleRevision = z.infer<typeof saleRevisionSchema>;

// Stored receipt discount already includes any original member promotion.
export function revisionTotals(input: SaleRevision) {
  if (input.discountMode === 'percent' && input.discountValue > 100) throw new Error('Diskon maksimal 100%.');
  if (input.items.some(item => item.discount > (item.discountType === 'percent' ? 100 : item.unitPrice * item.quantity))) throw new Error('Diskon layanan melebihi batas.');
  const calculated = calculateSaleDiscounts(input.items, input.discountMode, input.discountValue, false);
  if (!Number.isSafeInteger(calculated.subtotal) || calculated.subtotal > 2_000_000_000) throw new Error('Total transaksi terlalu besar.');
  if (input.discountMode === 'nominal' && input.discountValue > calculated.remaining) throw new Error('Diskon struk melebihi subtotal.');
  if (input.paymentMethod === 'Tunai' ? input.amountReceived < calculated.total : input.amountReceived !== calculated.total) throw new Error('Nominal pembayaran tidak sesuai total.');
  return { ...calculated, pointsEarned: Math.floor(calculated.total / 1000), change: input.paymentMethod === 'Tunai' ? input.amountReceived - calculated.total : 0 };
}

export function receiptDiscountForEdit(sale: { discountMode?: string; discountValue?: number; discount: number; items: { discount?: number; discountType?: 'nominal' | 'percent'; unitPrice: number; quantity: number }[] }) {
  const itemDiscount = calculateSaleDiscounts(sale.items, 'nominal', 0, false).itemDiscount;
  return sale.discountMode === 'percent' ? (sale.discountValue ?? 0) : Math.max(0, sale.discount - itemDiscount);
}