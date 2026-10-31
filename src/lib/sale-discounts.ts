export type ServiceDiscountType = 'nominal' | 'percent';

export type DiscountLine = { unitPrice: number; quantity: number; discount?: number; discountType?: ServiceDiscountType };

export function serviceDiscount(line: DiscountLine) {
  const gross = line.unitPrice * line.quantity;
  const raw = line.discount ?? 0;
  const value = Math.max(0, Number.isFinite(raw) ? raw : 0);
  const amount = line.discountType === 'percent'
    ? Math.round(gross * Math.min(value, 100) / 100)
    : Math.round(value);
  return Math.min(gross, Math.max(0, amount));
}

export function calculateSaleDiscounts(items: DiscountLine[], mode: 'nominal' | 'percent', value: number, member: boolean) {
  const subtotal = items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const itemDiscount = items.reduce((sum, line) => sum + serviceDiscount(line), 0);
  const remaining = subtotal - itemDiscount;
  const input = Math.max(0, Number.isFinite(value) ? value : 0);
  const manualDiscount = mode === 'percent'
    ? Math.min(remaining, Math.round(remaining * Math.min(input, 100) / 100))
    : Math.min(remaining, Math.round(input));
  const memberDiscountAmount = member ? Math.round(remaining * 10 / 100) : 0;
  const percent = Math.min(100, (mode === 'percent' ? Math.min(input, 100) : 0) + (member ? 10 : 0));
  const receiptDiscount = member
    ? mode === 'percent' ? Math.round(remaining * percent / 100) : Math.min(remaining, manualDiscount + memberDiscountAmount)
    : manualDiscount;
  const discount = itemDiscount + receiptDiscount;
  const appliedDiscountMode = itemDiscount > 0 ? 'nominal' : member && mode === 'nominal' && manualDiscount === 0 ? 'percent' : mode;
  const appliedDiscountValue = appliedDiscountMode === 'percent' ? percent : discount;
  return { subtotal, itemDiscount, remaining, manualDiscount, memberDiscountAmount, discount, total: subtotal - discount, appliedDiscountMode, appliedDiscountValue } as const;
}
