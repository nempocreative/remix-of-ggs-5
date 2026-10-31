import { serviceDiscount, type DiscountLine } from '@/lib/sale-discounts';

export function ServiceDiscountInput({ line, index, onChange }: { line: DiscountLine & { name: string }; index: number; onChange: (discount: number) => void }) {
  return <label className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
    <span className="shrink-0">Diskon layanan</span>
    <span className="flex min-w-0 items-center gap-2 rounded-md border border-input bg-card px-2 focus-within:ring-1 focus-within:ring-ring">
      <span>Rp</span>
      <input aria-label={`Diskon layanan ${line.name} baris ${index + 1}`} data-testid={`input-service-discount-${index}`} type="number" inputMode="numeric" min={0} max={line.unitPrice * line.quantity} step={1} value={serviceDiscount(line) || ''} placeholder="0" onChange={event => onChange(serviceDiscount({ ...line, discount: Number(event.target.value) }))} className="w-24 min-w-0 bg-transparent py-2 text-right font-semibold text-foreground outline-none" />
    </span>
  </label>;
}