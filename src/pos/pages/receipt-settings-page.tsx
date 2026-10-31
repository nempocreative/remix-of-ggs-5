import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetReceiptSettingsQueryKey,
  useGetReceiptSettings,
  useUpdateReceiptSettings,
  type ReceiptSettings,
} from '@/lib/api-client';
import { AlertCircle, Check, RefreshCw, Save } from 'lucide-react';
import { salonDetails, type SalonId } from '@/pos/lib/menu';

type Props = { salon: SalonId };
type Feedback = { kind: 'success' | 'error'; message: string };

const readErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Pengaturan belum berhasil disimpan. Periksa koneksi lalu coba lagi.';
};

export default function ReceiptSettingsPage({ salon }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useGetReceiptSettings({ salon }, {
    query: {
      queryKey: getGetReceiptSettingsQueryKey({ salon }),
      refetchOnWindowFocus: false,
    },
  });
  const updateMutation = useUpdateReceiptSettings();
  const [draft, setDraft] = useState<ReceiptSettings | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const serverSettings = settingsQuery.data?.salon === salon ? settingsQuery.data : null;
  const currentDraft = draft?.salon === salon ? draft : serverSettings;
  const hasChanges = Boolean(
    serverSettings &&
    currentDraft &&
    (serverSettings.thankYouText !== currentDraft.thankYouText ||
      serverSettings.taglineText !== currentDraft.taglineText),
  );

  useEffect(() => {
    if (serverSettings) setDraft(serverSettings);
  }, [serverSettings]);

  const updateDraft = (field: 'thankYouText' | 'taglineText', value: string) => {
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
          thankYouText: currentDraft.thankYouText,
          taglineText: currentDraft.taglineText,
        },
      });
      setDraft(saved);
      queryClient.setQueryData(getGetReceiptSettingsQueryKey({ salon }), saved);
      setFeedback({ kind: 'success', message: 'Teks struk berhasil disimpan.' });
    } catch (error) {
      setFeedback({ kind: 'error', message: readErrorMessage(error) });
    }
  };

  return <main className="fade-up mx-auto max-w-5xl space-y-5 pb-8" data-testid="page-receipt-settings">
    <header>
      <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#bd3c76]">
        <span className="h-px w-5 bg-[#d88cac]"/> Pengaturan kasir
      </p>
      <h1 className="font-display text-[30px] font-extrabold tracking-[-.045em] text-[#472538] sm:text-[36px]">Pengaturan kasir</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#927789]">
        Atur pesan pada struk dan informasi promo yang tampil di menu Kasir {salonDetails[salon].name}.
      </p>
    </header>

    <section className="overflow-hidden rounded-2xl border border-[#efdae5] bg-white shadow-[0_8px_24px_rgba(92,44,68,.045)]" aria-labelledby="receipt-copy-title">
      <div className="border-b border-[#f3e9ee] px-5 py-4">
        <h2 id="receipt-copy-title" className="font-display text-base font-extrabold text-[#472538]">Pesan di bagian bawah struk</h2>
        <p className="mt-1 text-[11px] text-[#927789]">Teks disimpan terpisah untuk setiap salon. Kosongkan kolom jika kalimatnya tidak ingin dicetak.</p>
      </div>

      {settingsQuery.isLoading
        ? <div className="grid gap-3 p-5" role="status" aria-label="Memuat pengaturan struk">
          <div className="h-24 animate-pulse rounded-xl bg-[#faf5f7]"/>
          <div className="h-24 animate-pulse rounded-xl bg-[#faf5f7]"/>
        </div>
        : settingsQuery.isError || !currentDraft
          ? <div className="grid justify-items-center gap-2 p-8 text-center">
            <AlertCircle size={24} className="text-[#b2484f}"/>
            <h3 className="text-sm font-extrabold text-[#472538]">Pengaturan belum dapat dimuat</h3>
            <p className="text-xs text-[#927789]">Periksa koneksi lalu muat ulang pengaturan struk.</p>
            <button className="mt-2 rounded-xl bg-[#b93670] px-4 py-2.5 text-xs font-bold text-white" type="button" onClick={() => void settingsQuery.refetch()}>
              Coba lagi
            </button>
          </div>
          : <div className="grid gap-5 p-4 sm:p-5">
            <label className="grid gap-2 text-xs font-bold text-[#684d5e]" htmlFor="receipt-thank-you-text">
              Ucapan terima kasih
              <textarea
                id="receipt-thank-you-text"
                rows={3}
                maxLength={500}
                value={currentDraft.thankYouText}
                onChange={(event) => updateDraft('thankYouText', event.target.value)}
                className="min-h-24 w-full resize-y rounded-xl border border-[#e6d5df] bg-white px-3 py-3 text-sm font-medium leading-relaxed text-[#392839] outline-none transition focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
                placeholder="Tulis ucapan terima kasih"
                data-testid="input-receipt-thank-you-text"
              />
              <span className="text-right text-[10px] font-normal text-[#9a7b8d]">{currentDraft.thankYouText.length}/500</span>
            </label>

            <label className="grid gap-2 text-xs font-bold text-[#684d5e]" htmlFor="receipt-tagline-text">
              Kalimat penutup
              <textarea
                id="receipt-tagline-text"
                rows={3}
                maxLength={500}
                value={currentDraft.taglineText}
                onChange={(event) => updateDraft('taglineText', event.target.value)}
                className="min-h-24 w-full resize-y rounded-xl border border-[#e6d5df] bg-white px-3 py-3 text-sm font-medium leading-relaxed text-[#392839] outline-none transition focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
                placeholder="Tulis kalimat penutup"
                data-testid="input-receipt-tagline-text"
              />
              <span className="text-right text-[10px] font-normal text-[#9a7b8d]">{currentDraft.taglineText.length}/500</span>
            </label>

            <div className="rounded-xl border border-dashed border-[#e8d4de] bg-[#fffdfd] p-4 text-center">
              <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[.13em] text-[#9b7e8e]">Pratinjau</p>
              {currentDraft.thankYouText && <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#765b6d]">{currentDraft.thankYouText}</p>}
              {currentDraft.taglineText && <p className="mt-2 whitespace-pre-wrap text-[11px] font-semibold italic leading-relaxed text-[#bd3c76]">{currentDraft.taglineText}</p>}
              {!currentDraft.thankYouText && !currentDraft.taglineText && <p className="text-[10px] text-[#a58a99]">Tidak ada pesan tambahan di bagian bawah struk.</p>}
            </div>

            {feedback && <p className={`flex items-start gap-1.5 text-xs ${feedback.kind === 'success' ? 'text-[#4e8068]' : 'text-[#b2484f]'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
              {feedback.kind === 'success' ? <Check size={14} className="mt-0.5 shrink-0"/> : <AlertCircle size={14} className="mt-0.5 shrink-0"/>}
              {feedback.message}
            </p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f3e9ee] pt-4">
              <p className="text-[10px] text-[#927789]">Perubahan berlaku pada struk transaksi baru dan cetak ulang.</p>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#b93670] px-4 text-xs font-extrabold text-white transition hover:bg-[#9f2d61] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={() => void save()}
                disabled={!hasChanges || updateMutation.isPending}
                data-testid="button-save-receipt-settings"
              >
                {updateMutation.isPending ? <><RefreshCw size={14} className="animate-spin"/> Menyimpan…</> : <><Save size={14}/> Simpan pengaturan</>}
              </button>
            </div>
          </div>}
    </section>
  </main>;
}
