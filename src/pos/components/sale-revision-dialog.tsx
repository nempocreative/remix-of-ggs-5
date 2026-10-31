import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGetEmployees, useGetServices } from '@/lib/api-client';
import { customFetch } from '@/lib/api-client/custom-fetch';
import { saleRevisionSchema, revisionTotals, receiptDiscountForEdit, type SaleRevision } from '@/lib/sale-revision';
import { calculateSaleDiscounts } from '@/lib/sale-discounts';
import { ServiceDiscountInput } from './service-discount-input';

export type EditableSale = {
  id: string; salon: 'beauty' | 'hair-studio'; invoiceNumber: string; customerName: string;
  customerPhone?: string | null; cashierName?: string | null; paymentMethod: string;
  discountMode?: 'nominal' | 'percent'; discountValue?: number; discount: number; amountReceived: number;
  items: { serviceId: string; name: string; unitPrice: number; quantity: number; employeeId?: string | null; discount?: number; discountType?: 'nominal' | 'percent' }[];
};
const money = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';

export function SaleRevisionDialog({ sale, onClose }: { sale: EditableSale; onClose: () => void }) {
  const queryClient = useQueryClient();
  const employees = useGetEmployees({ salon: sale.salon });
  const services = useGetServices({ salon: sale.salon });
  const [draft, setDraft] = useState<SaleRevision>(() => ({
    customerName: sale.customerName, customerPhone: sale.customerPhone ?? '', cashierName: sale.cashierName ?? '',
    paymentMethod: sale.paymentMethod === 'Tunai' ? 'Tunai' : 'Transfer / QRIS',
    discountMode: sale.discountMode ?? 'nominal', discountValue: receiptDiscountForEdit(sale), amountReceived: sale.amountReceived,
    items: sale.items.map(item => ({ ...item, employeeId: item.employeeId ?? '', discount: item.discount ?? 0, discountType: item.discountType ?? 'nominal' })),
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const totals = calculateSaleDiscounts(draft.items, draft.discountMode, draft.discountValue, false);
  const setLine = (index: number, patch: Partial<SaleRevision['items'][number]>) => setDraft(current => ({ ...current, items: current.items.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = saleRevisionSchema.safeParse(draft);
    if (!parsed.success) { setError('Lengkapi pelanggan, nomor HP, kasir, dan staf pada setiap layanan.'); return; }
    try { revisionTotals(parsed.data); } catch (issue) { setError(issue instanceof Error ? issue.message : 'Data revisi tidak valid.'); return; }
    setSaving(true); setError('');
    try {
      await customFetch(`/api/sales/${sale.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      await queryClient.invalidateQueries();
      onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Revisi belum tersimpan.'); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-3xl max-h-[90dvh] w-[calc(100%-24px)]">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil size={18}/> Revisi transaksi</DialogTitle><DialogDescription>{sale.invoiceNumber}</DialogDescription></DialogHeader>
      <form onSubmit={event => void save(event)} className="space-y-5">
        <fieldset disabled={saving} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Nama pelanggan<input required maxLength={120} className={inputClass} value={draft.customerName} onChange={e => setDraft({ ...draft, customerName: e.target.value })}/></label>
            <label className="text-sm">Nomor HP<input required inputMode="tel" className={inputClass} value={draft.customerPhone} onChange={e => setDraft({ ...draft, customerPhone: e.target.value })}/></label>
            <label className="text-sm">Nama kasir<input required maxLength={120} className={inputClass} value={draft.cashierName} onChange={e => setDraft({ ...draft, cashierName: e.target.value })}/></label>
            <label className="text-sm">Pembayaran<select className={inputClass} value={draft.paymentMethod} onChange={e => setDraft({ ...draft, paymentMethod: e.target.value === 'Tunai' ? 'Tunai' : 'Transfer / QRIS' })}><option>Tunai</option><option>Transfer / QRIS</option></select></label>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {draft.items.map((line, index) => <div key={index} className="space-y-2 py-4">
              <div className="flex items-start gap-2">
                <label className="min-w-0 flex-1 text-xs">Layanan<select aria-label={`Layanan baris ${index + 1}`} className={inputClass} value={line.serviceId} onChange={e => { const service = services.data?.find(item => item.id === e.target.value); if (service) setLine(index, { serviceId: service.id, name: service.name, unitPrice: service.minPrice }); }}>
                  {!services.data?.some(service => service.id === line.serviceId) && <option value={line.serviceId}>{line.name}</option>}
                  {services.data?.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select></label>
                <Button type="button" variant="ghost" size="icon" className="mt-5 text-destructive" disabled={draft.items.length === 1} aria-label={`Hapus layanan baris ${index + 1}`} title="Hapus layanan" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}><Trash2/></Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_100px_1.3fr]">
                <label className="text-xs">Harga (Rp)<input aria-label={`Harga baris ${index + 1}`} className={inputClass} required type="number" min={0} step={1} value={line.unitPrice} onChange={e => setLine(index, { unitPrice: Number(e.target.value) })}/></label>
                <label className="text-xs">Jumlah<input aria-label={`Jumlah baris ${index + 1}`} className={inputClass} required type="number" min={1} max={1000} step={1} value={line.quantity} onChange={e => setLine(index, { quantity: Number(e.target.value) })}/></label>
                <label className="col-span-2 text-xs sm:col-span-1">Staf<select required aria-label={`Staf baris ${index + 1}`} className={inputClass} value={line.employeeId} onChange={e => setLine(index, { employeeId: e.target.value })}><option value="">Pilih staf</option>{employees.data?.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.active ? '' : ' (nonaktif)'}</option>)}</select></label>
              </div>
              <ServiceDiscountInput line={line} index={index} onChange={(discount, discountType) => setLine(index, { discount, discountType })}/>
            </div>)}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!services.data?.length} onClick={() => { const service = services.data?.[0]; if (service) setDraft({ ...draft, items: [...draft.items, { serviceId: service.id, name: service.name, unitPrice: service.minPrice, quantity: 1, employeeId: '', discount: 0, discountType: 'nominal' }] }); }}><Plus/> Tambah layanan</Button>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs">Jenis diskon struk<select className={inputClass} value={draft.discountMode} onChange={e => setDraft({ ...draft, discountMode: e.target.value === 'percent' ? 'percent' : 'nominal', discountValue: 0 })}><option value="nominal">Rupiah (Rp)</option><option value="percent">Persen (%)</option></select></label>
            <label className="text-xs">Diskon struk<input required aria-label="Diskon struk" type="number" min={0} max={draft.discountMode === 'percent' ? 100 : totals.remaining} className={inputClass} value={draft.discountValue} onChange={e => setDraft({ ...draft, discountValue: Number(e.target.value) })}/></label>
            <label className="text-xs">Nominal diterima (Rp)<input required aria-label="Nominal diterima" type="number" min={0} step={1} className={inputClass} value={draft.amountReceived} onChange={e => setDraft({ ...draft, amountReceived: Number(e.target.value) })}/></label>
          </div>
        </fieldset>
        <div className="space-y-1 border-t border-border pt-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="flex justify-between text-muted-foreground"><span>Total diskon</span><span>− {money(totals.discount)}</span></div><div className="flex justify-between text-lg font-bold"><span>Total revisi</span><span data-testid="revised-total">{money(totals.total)}</span></div></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Batal</Button><Button type="submit" disabled={saving || employees.isLoading || services.isLoading}><Save/>{saving ? 'Menyimpan…' : 'Simpan revisi'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}