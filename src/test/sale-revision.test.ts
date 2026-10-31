import { describe, expect, it } from 'vitest';
import { receiptDiscountForEdit, revisionTotals, saleRevisionSchema } from '@/lib/sale-revision';

const draft = { customerName: 'Test', customerPhone: '08123456789', cashierName: 'Bela', paymentMethod: 'Tunai' as const, discountMode: 'nominal' as const, discountValue: 0, amountReceived: 50000, items: [{ serviceId: 'a', name: 'Layanan', unitPrice: 50000, quantity: 1, employeeId: 'siti', discount: 10, discountType: 'percent' as const }] };
describe('sale revisions', () => {
  it('recalculates per-service percentage discounts, payment and points', () => {
    expect(revisionTotals(draft)).toMatchObject({ total: 45000, discount: 5000, change: 5000, pointsEarned: 45 });
  });
  it('does not apply the stored per-service discount twice', () => {
    expect(receiptDiscountForEdit({ discountMode: 'nominal', discountValue: 5000, discount: 5000, items: draft.items })).toBe(0);
  });
  it('rejects payment below the revised total', () => {
    expect(() => revisionTotals({ ...draft, amountReceived: 44000 })).toThrow();
  });
  it('rejects service discounts over 100 percent', () => {
    expect(() => revisionTotals({ ...draft, items: [{ ...draft.items[0], discount: 101 }] })).toThrow();
  });
  it('requires a staff assignment for revised services', () => {
    expect(saleRevisionSchema.safeParse({ ...draft, items: [{ ...draft.items[0], employeeId: '' }] }).success).toBe(false);
  });
});