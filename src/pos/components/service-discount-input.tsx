import { serviceDiscount, type DiscountLine, type ServiceDiscountType } from '@/lib/sale-discounts';

export function ServiceDiscountInput({ line, index, onChange }: { line: DiscountLine & { name: string }; index: number; onChange: (discount: number, discountType: ServiceDiscountType) => void }) {
  const discountType: ServiceDiscountType = line.discountType === 'percent' ? 'percent' : 'nominal';
  const max = discountType === 'percent' ? 100 : line.unitPrice * line.quantity;
  const rawValue = Math.max(0, Number.isFinite(line.discount) ? (line.discount ?? 0) : 0);
  return <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
    <span className="shrink-0">Diskon layanan</span>
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex items-center rounded-md border border-input bg-card p-0.5">
        {(['nominal', 'percent'] as const).map(value => <button key={value} type="button" aria-label={value === 'nominal' ? `Diskon layanan ${line.name} dalam rupiah` : `Diskon layanan ${line.name} dalam persen`} aria-pressed={discountType === value} data-testid={`button-service-discount-type-${value}-${index}`} onClick={() => onChange(0, value)} className={`rounded px-1.5 py-1 text-[9px] font-bold transition ${discountType === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}>{value === 'nominal' ? 'Rp' : '%'}</button>)}
      </span>
      <span className="flex min-w-0 items-center gap-1 rounded-md border border-input bg-card px-2 focus-within:ring-1 focus-within:ring-ring">
        {discountType === 'nominal' && <span>Rp</span>}
        <input aria-label={`Diskon layanan ${line.name} baris ${index + 1}`} data-testid={`input-service-discount-${index}`} type="number" inputMode="numeric" min={0} max={max} step={discountType === 'percent' ? 'any' : 1} value={rawValue || ''} placeholder="0" onChange={event => onChange(Number(event.target.value), discountType)} className="w-16 min-w-0 bg-transparent py-2 text-right font-semibold text-foreground outline-none" />
        {discountType === 'percent' && <span>%</span>}
      </span>
      {serviceDiscount(line) > 0 && <span className="shrink-0 font-semibold text-primary">− {serviceDiscount(line).toLocaleString('id-ID')}</span>}
    </span>
  </div>;
}
