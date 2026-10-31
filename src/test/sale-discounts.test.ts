import { describe, expect, it } from 'vitest';
import { calculateSaleDiscounts, serviceDiscount } from '@/lib/sale-discounts';
import { CreateSaleBody } from '@/lib/api-zod';

describe('manual service discounts', () => {
  const items = [{ unitPrice: 100000, quantity: 1, discount: 15000 }, { unitPrice: 50000, quantity: 1, discount: 5000 }];
  it('keeps distinct discounts for two services in one receipt', () => {
    expect(items.map(serviceDiscount)).toEqual([15000, 5000]);
    expect(calculateSaleDiscounts(items, 'nominal', 0, false)).toMatchObject({ subtotal: 150000, itemDiscount: 20000, discount: 20000, total: 130000 });
  });
  it('applies additional receipt discount only to the remaining amount', () => {
    expect(calculateSaleDiscounts(items, 'percent', 10, false)).toMatchObject({ discount: 33000, total: 117000, appliedDiscountMode: 'nominal', appliedDiscountValue: 33000 });
  });
  it('bounds a line discount at its gross amount without discounting another service', () => {
    expect(calculateSaleDiscounts([{ unitPrice: 100000, quantity: 1, discount: 999999 }, items[1]], 'nominal', 0, false).total).toBe(45000);
  });
  it('retains member promotion on the amount remaining after service discounts', () => {
    expect(calculateSaleDiscounts(items, 'nominal', 0, true)).toMatchObject({ discount: 33000, total: 117000 });
  });
  it('applies a percent discount to its own service only', () => {
    const mixed = [{ unitPrice: 100000, quantity: 1, discount: 10, discountType: 'percent' as const }, { unitPrice: 50000, quantity: 1, discount: 5000 }];
    expect(mixed.map(serviceDiscount)).toEqual([10000, 5000]);
    expect(calculateSaleDiscounts(mixed, 'nominal', 0, false)).toMatchObject({ itemDiscount: 15000, total: 135000 });
  });
  it('caps a percent line discount at 100% of its service', () => {
    expect(serviceDiscount({ unitPrice: 80000, quantity: 2, discount: 150, discountType: 'percent' })).toBe(160000);
  });
  it('keeps old receipts with no line discounts unchanged', () => {
    expect(calculateSaleDiscounts([{ unitPrice: 150000, quantity: 1 }], 'percent', 10, true)).toMatchObject({ discount: 30000, total: 120000, appliedDiscountMode: 'percent', appliedDiscountValue: 20 });
  });
  it('accepts line discounts in transaction validation and rejects negative amounts', () => {
    const input = { salon: 'beauty', id: '11111111-1111-4111-8111-111111111111', customerName: 'Test', customerPhone: '08000000000', cashierName: 'Test', paymentMethod: 'Tunai', discountMode: 'nominal', discountValue: 0, amountReceived: 130000, items: items.map(item => ({ ...item, serviceId: 'service', name: 'Service', employeeId: 'staff' })) };
    expect(CreateSaleBody.parse(input).items.map(item => item.discount)).toEqual([15000, 5000]);
    expect(CreateSaleBody.safeParse({ ...input, items: [{ ...input.items[0], discount: -1 }] }).success).toBe(false);
    const percentInput = { ...input, items: [{ ...input.items[0], discount: 10, discountType: 'percent' }] };
    expect(CreateSaleBody.parse(percentInput).items[0].discountType).toBe('percent');
    expect(CreateSaleBody.safeParse({ ...input, items: [{ ...input.items[0], discountType: 'persen' }] }).success).toBe(false);
  });
});