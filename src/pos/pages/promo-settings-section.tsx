import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetPromoSettingsQueryKey,
  useDeletePromoSettings,
  useGetPromoSettings,
  useUpdatePromoSettings,
  type PromoSettings,
  type PromoSettingsInput,
} from '@/lib/api-client';
import { AlertCircle, CalendarDays, Check, Gift, RefreshCw, Save, Trash2 } from 'lucide-react';
import { salonDetails, type SalonId } from '@/pos/lib/menu';

type Props = { salon: SalonId };
type Feedback = { kind: 'success' | 'error'; message: string };

const readErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Promo belum berhasil disimpan. Periksa koneksi lalu coba lagi.';
};

const promoDateLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

export default function PromoSettingsSection({ salon }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useGetPromoSettings({ salon }, {
    query: {
      queryKey: getGetPromoSettingsQueryKey({ salon }),
      refetchOnWindowFocus: true,
    },
  });
  const updateMutation = useUpdatePromoSettings();
  const deleteMutation = useDeletePromoSettings();
  const [draft, setDraft] = useState<PromoSettings | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const serverSettings = settingsQuery.data?.salon === salon ? settingsQuery.data : null;
  const currentDraft = draft?.salon === salon ? draft : serverSettings;
  const hasChanges = Boolean(
    serverSettings &&
    currentDraft &&
    (serverSettings.title !== currentDraft.title ||
      serverSettings.description !== currentDraft.description ||
      serverSettings.startDate !== currentDraft.startDate ||
      serverSettings.endDate !== currentDraft.endDate ||
      serverSettings.isActive !== currentDraft.isActive),
  );
  const activeDraftIsValid = Boolean(
    currentDraft &&
    currentDraft.title.trim() &&
    currentDraft.startDate &&
    currentDraft.endDate &&
    currentDraft.startDate <= currentDraft.endDate,
  );
  const hasSavedPromo = Boolean(serverSettings && (
    serverSettings.title.trim() ||
    serverSettings.description.trim() ||
    serverSettings.startDate ||
    serverSettings.endDate ||
    serverSettings.isActive
  ));

  useEffect(() => {
    if (serverSettings) {
      setDraft(serverSettings);
      setDeleteConfirmationOpen(false);
    }
  }, [serverSettings]);

  const updateDraft = <K extends keyof PromoSettingsInput>(field: K, value: PromoSettingsInput[K]) => {
    if (!currentDraft) return;
    setDraft({ ...currentDraft, [field]: value });
    setFeedback(null);
  };

  const save = async () => {
    if (!currentDraft || !hasChanges) return;
    setFeedback(null);
    try {
      const saved = await updateMutation.mutateAsync({
        params: { salon },
        data: {
          title: currentDraft.title,
          description: currentDraft.description,
          startDate: currentDraft.startDate,
          endDate: currentDraft.endDate,
          isActive: currentDraft.isActive,
        },
      });
      setDraft(saved);
      queryClient.setQueryData(getGetPromoSettingsQueryKey({ salon }), saved);
      setFeedback({ kind: 'success', message: 'Promo kasir berhasil disimpan.' });
    } catch (error) {
      setFeedback({ kind: 'error', message: readErrorMessage(error) });
    }
  };

  const removePromo = async () => {
    setFeedback(null);
    try {
      const cleared = await deleteMutation.mutateAsync({ params: { salon } });
      setDraft(cleared);
      queryClient.setQueryData(getGetPromoSettingsQueryKey({ salon }), cleared);
      setDeleteConfirmationOpen(false);
      setFeedback({ kind: 'success', message: 'Promo berhasil dihapus dari salon ini.' });
    } catch (error) {
      setFeedback({ kind: 'error', message: readErrorMessage(error) });
    }
  };

  return <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[#efdae5] bg-white shadow-[0_8px_24px_rgba(92,44,68,.045)]" aria-labelledby="cashier-promo-settings-title" data-testid="section-cashier-promo-settings">
    <div className="border-b border-[#f3e9ee] px-5 py-4">
      <p className="mb-1 flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[.15em] text-[#bd3c76]">
        <Gift size={13}/> Promo kasir · {salonDetails[salon].name}
      </p>
      <h2 id="cashier-promo-settings-title" className="font-display text-base font-extrabold text-[#472538]">Informasi promo terbaru</h2>
      <p className="mt-1 text-[11px] text-[#927789]">Promo ini tampil sebagai informasi di kasir salon terpilih dan tidak mengubah diskon transaksi.</p>
    </div>

    {settingsQuery.isLoading
      ? <div className="grid gap-3 p-5" role="status" aria-label="Memuat pengaturan promo">
        <div className="h-12 animate-pulse rounded-xl bg-[#faf5f7]"/>
        <div className="h-24 animate-pulse rounded-xl bg-[#faf5f7]"/>
      </div>
      : settingsQuery.isError || !currentDraft
        ? <div className="grid justify-items-center gap-2 p-8 text-center">
          <AlertCircle size={24} className="text-[#b2484f}"/>
          <h3 className="text-sm font-extrabold text-[#472538]">Pengaturan promo belum dapat dimuat</h3>
          <p className="text-xs text-[#927789]">Periksa koneksi lalu muat ulang pengaturan.</p>
          <button className="mt-2 rounded-xl bg-[#b93670] px-4 py-2.5 text-xs font-bold text-white" type="button" onClick={() => void settingsQuery.refetch()}>
            Coba lagi
          </button>
        </div>
        : <div className="grid gap-5 p-4 sm:p-5">
          <label className="grid gap-2 text-xs font-bold text-[#684d5e]" htmlFor="cashier-promo-title">
            Judul promo
            <input
              id="cashier-promo-title"
              maxLength={100}
              value={currentDraft.title}
              onChange={(event) => updateDraft('title', event.target.value)}
              className="w-full rounded-xl border border-[#e6d5df] bg-white px-3 py-3 text-sm font-medium text-[#392839] outline-none transition focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
              placeholder="Nama promo yang ingin ditampilkan"
              data-testid="input-cashier-promo-title"
            />
            <span className="text-right text-[10px] font-normal text-[#9a7b8d]">{currentDraft.title.length}/100</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-bold text-[#684d5e]" htmlFor="cashier-promo-start-date">
              Tanggal mulai
              <span className="relative">
                <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a77c91]"/>
                <input
                  id="cashier-promo-start-date"
                  type="date"
                  max={currentDraft.endDate ?? undefined}
                  value={currentDraft.startDate ?? ''}
                  onChange={(event) => updateDraft('startDate', event.target.value || null)}
                  className="min-h-11 w-full rounded-xl border border-[#e6d5df] bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-[#392839] outline-none transition focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
                  data-testid="input-cashier-promo-start-date"
                />
              </span>
            </label>
            <label className="grid gap-2 text-xs font-bold text-[#684d5e]" htmlFor="cashier-promo-end-date">
              Tanggal berakhir
              <span className="relative">
                <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a77c91]"/>
                <input
                  id="cashier-promo-end-date"
                  type="date"
                  min={currentDraft.startDate ?? undefined}
                  value={currentDraft.endDate ?? ''}
                  onChange={(event) => updateDraft('endDate', event.target.value || null)}
                  className="min-h-11 w-full rounded-xl border border-[#e6d5df] bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-[#392839] outline-none transition focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
                  data-testid="input-cashier-promo-end-date"
                />
              </span>
            </label>
          </div>

          <label className="grid gap-2 text-xs font-bold text-[#684d5e]" htmlFor="cashier-promo-description">
            Detail & ketentuan promo
            <textarea
              id="cashier-promo-description"
              rows={6}
              maxLength={2000}
              value={currentDraft.description}
              onChange={(event) => updateDraft('description', event.target.value)}
              className="min-h-24 w-full resize-y rounded-xl border border-[#e6d5df] bg-white px-3 py-3 text-sm font-medium leading-relaxed text-[#392839] outline-none transition focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
              placeholder="Tulis syarat, layanan yang berlaku, dan cara menggunakan promo"
              data-testid="input-cashier-promo-description"
            />
            <span className="text-right text-[10px] font-normal text-[#9a7b8d]">{currentDraft.description.length}/2.000</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#f0dce5] bg-[#fffafb] p-3 text-xs text-[#684d5e]">
            <input
              type="checkbox"
              checked={currentDraft.isActive}
              onChange={(event) => updateDraft('isActive', event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#b93670]"
              data-testid="toggle-cashier-promo-active"
            />
            <span>
              <span className="block font-bold">Tampilkan promo di menu Kasir</span>
              <span className="mt-1 block text-[10px] font-normal text-[#927789]">Promo hanya muncul selama rentang tanggal yang dipilih.</span>
            </span>
          </label>

          {currentDraft.isActive && !activeDraftIsValid && <p className="text-xs font-semibold text-[#b2484f]" role="alert">
            Isi judul dan rentang tanggal yang valid. Tanggal akhir harus sama atau setelah tanggal mulai.
          </p>}

          <div className="rounded-xl border border-dashed border-[#e8d4de] bg-[#fffdfd] p-4">
            <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9b7e8e]">Pratinjau di kasir</p>
            {currentDraft.isActive && activeDraftIsValid
              ? <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f8eaf1] text-[#a9366b]"><Gift size={17}/></span>
                <div className="min-w-0">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[#bd3c76]">Promo terbaru</p>
                  <h3 className="mt-1 text-sm font-extrabold text-[#472538]">{currentDraft.title}</h3>
                  {currentDraft.startDate && currentDraft.endDate && <p className="mt-1 text-[10px] font-bold text-[#a1768c]">Berlaku {promoDateLabel(currentDraft.startDate)} – {promoDateLabel(currentDraft.endDate)}</p>}
                  {currentDraft.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#765b6d]">{currentDraft.description}</p>}
                </div>
              </div>
              : <p className="text-[10px] text-[#a58a99]">Promo tidak ditampilkan di menu Kasir.</p>}
          </div>

          {feedback && <p className={`flex items-start gap-1.5 text-xs ${feedback.kind === 'success' ? 'text-[#4e8068]' : 'text-[#b2484f]'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
            {feedback.kind === 'success' ? <Check size={14} className="mt-0.5 shrink-0"/> : <AlertCircle size={14} className="mt-0.5 shrink-0"/>}
            {feedback.message}
          </p>}

          {deleteConfirmationOpen && <div className="grid gap-3 rounded-xl border border-[#efd2d2] bg-[#fff8f7] p-3 sm:flex sm:items-center sm:justify-between" role="alert">
            <p className="text-xs leading-relaxed text-[#8f4242]">Promo tersimpan untuk salon ini akan dihapus dan tidak tampil lagi di Kasir. Perubahan yang belum disimpan juga tidak akan berlaku.</p>
            <div className="flex shrink-0 justify-end gap-2">
              <button className="min-h-10 rounded-lg border border-[#e4c8c8] bg-white px-3 text-xs font-bold text-[#765b6d]" type="button" onClick={() => setDeleteConfirmationOpen(false)} disabled={deleteMutation.isPending}>Batal</button>
              <button className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#a84343] px-3 text-xs font-extrabold text-white disabled:opacity-50" type="button" onClick={() => void removePromo()} disabled={deleteMutation.isPending} data-testid="button-confirm-delete-cashier-promo">
                {deleteMutation.isPending ? <><RefreshCw size={13} className="animate-spin"/> Menghapus…</> : <><Trash2 size={13}/> Hapus promo</>}
              </button>
            </div>
          </div>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f3e9ee] pt-4">
            <p className="text-[10px] text-[#927789]">Tersimpan terpisah untuk setiap salon.</p>
            <div className="flex flex-wrap justify-end gap-2">
              {hasSavedPromo && !deleteConfirmationOpen && <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e6caca] bg-white px-4 text-xs font-bold text-[#a34a4a] transition hover:bg-[#fff8f7] disabled:opacity-45"
                type="button"
                onClick={() => setDeleteConfirmationOpen(true)}
                disabled={updateMutation.isPending || deleteMutation.isPending}
                data-testid="button-delete-cashier-promo"
              >
                <Trash2 size={14}/> Hapus promo
              </button>}
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#b93670] px-4 text-xs font-extrabold text-white transition hover:bg-[#9f2d61] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={() => void save()}
                disabled={!hasChanges || updateMutation.isPending || deleteMutation.isPending || deleteConfirmationOpen || (currentDraft.isActive && !activeDraftIsValid)}
                data-testid="button-save-cashier-promo"
              >
                {updateMutation.isPending ? <><RefreshCw size={14} className="animate-spin"/> Menyimpan…</> : <><Save size={14}/> Simpan promo</>}
              </button>
            </div>
          </div>
        </div>}
  </section>;
}
