import { downloadTablePdf } from '@/pos/lib/table-pdf';
import { useMemo, useState } from 'react';
import { getFinanceIncome, getGetFinanceReportQueryKey, listExpenses, useGetFinanceReport } from '@/lib/api-client';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, ChevronDown, CircleHelp, Download, RefreshCw, Scissors, WalletCards } from 'lucide-react';
import type { SalonId } from '@/pos/lib/menu';

type Props = { salon: SalonId };
type Period = 'today' | '7d' | 'month' | 'custom';

const jakartaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const dateOffset = (date: string, offset: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + offset, 12));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
};
const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const money = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(amount);
const axisMoney = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1,
}).format(Math.round(amount));
const showDate = (value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { ...options, timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
};
const errorMessage = (error: unknown) => error instanceof Error
  ? error.message
  : 'Laporan belum dapat dimuat. Periksa koneksi lalu coba lagi.';
const pdfTitles: Record<string, string> = { 'arus-kas': 'Laporan Arus Kas', pemasukan: 'Laporan Pemasukan', pengeluaran: 'Laporan Pengeluaran' };
const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const [, kind, salonSlug, range] = filename.match(/^(arus-kas|pemasukan|pengeluaran)-(ggs-beauty|ggs-hair-studio)-(.+)\.pdf$/) ?? [];
  const salonName = salonSlug === 'ggs-hair-studio' ? 'GGS Hair Studio' : 'GGS Beauty';
  const [from, to] = [range?.slice(0, 10), range?.slice(11)];
  return downloadTablePdf({ filename, title: `${pdfTitles[kind] ?? 'Laporan'} · ${salonName}`, subtitle: `Periode ${from} s.d. ${to}`, headers, rows });
};

export default function FinancePage({ salon }: Props) {
  const today = useMemo(() => jakartaDate(), []);
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(startOfMonth(today));
  const [to, setTo] = useState(today);
  const [incomeDownloadBusy, setIncomeDownloadBusy] = useState(false);
  const [expenseDownloadBusy, setExpenseDownloadBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const salonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const salonFileName = salon === 'beauty' ? 'ggs-beauty' : 'ggs-hair-studio';
  const params = useMemo(() => ({ salon, from, to }), [salon, from, to]);
  const queryKey = getGetFinanceReportQueryKey(params);
  const reportQuery = useGetFinanceReport(params, { query: { queryKey, enabled: from <= to } });
  const report = reportQuery.data;
  const invalidRange = from > to;
  const setPreset = (next: Exclude<Period, 'custom'>) => {
    setPeriod(next);
    setTo(today);
    setFrom(next === 'today' ? today : next === '7d' ? dateOffset(today, -6) : startOfMonth(today));
  };
  const changeDate = (which: 'from' | 'to', value: string) => {
    setPeriod('custom');
    if (which === 'from') setFrom(value);
    else setTo(value);
  };
  const rangeLabel = from === to ? showDate(from, { day: 'numeric', month: 'long', year: 'numeric' })
    : `${showDate(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${showDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const daily = report?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.flatMap((item) => [item.revenue, item.expenses]));
  const chartIntervals = maxDaily < 3 ? Math.ceil(maxDaily) : 3;
  const exportCashFlow = async () => {
    if (!report || invalidRange) return;
    setExportFeedback(null);
    try {
      const rows: (string | number)[][] = report.daily.map((item) => [
        item.date,
        item.revenue,
        item.expenses,
        item.netCashFlow,
        item.cashRevenue,
        item.transferRevenue,
        item.otherRevenue,
        item.cashExpenses,
        item.transferExpenses,
        item.unclassifiedExpenses,
      ]);
      rows.push([
        'TOTAL PERIODE',
        report.revenue,
        report.expenses,
        report.netCashFlow,
        report.cashRevenue,
        report.transferRevenue,
        report.otherRevenue,
        report.cashExpenses,
        report.transferExpenses,
        report.unclassifiedExpenses,
      ]);
      await downloadCsv(`arus-kas-${salonFileName}-${from}-${to}.pdf`, [
        'Tanggal',
        'Dana masuk',
        'Dana keluar',
        'Arus kas bersih',
        'Masuk tunai',
        'Masuk transfer / QRIS',
        'Masuk metode lain',
        'Keluar tunai',
        'Keluar transfer / QRIS',
        'Keluar belum diklasifikasi',
      ], rows);
      setExportFeedback({ type: 'success', message: 'PDF arus kas berhasil diunduh.' });
    } catch (error) {
      setExportFeedback({ type: 'error', message: errorMessage(error) });
    }
  };
  const exportIncome = async () => {
    if (invalidRange) return;
    setIncomeDownloadBusy(true);
    setExportFeedback(null);
    try {
      const income = await getFinanceIncome({ salon, from, to });
      const rows: (string | number)[][] = income.rows.map((item) => [
        item.date,
        item.invoiceNumber,
        item.paymentMethod,
        item.subtotal,
        item.discount,
        item.revenue,
      ]);
      rows.push(['TOTAL PERIODE', '', '', '', '', income.totalRevenue]);
      await downloadCsv(`pemasukan-${salonFileName}-${from}-${to}.pdf`, [
        'Tanggal',
        'Nomor transaksi',
        'Metode pembayaran',
        'Subtotal',
        'Diskon',
        'Pemasukan bersih',
      ], rows);
      setExportFeedback({ type: 'success', message: `PDF pemasukan berhasil diunduh (${income.count} transaksi).` });
    } catch (error) {
      setExportFeedback({ type: 'error', message: errorMessage(error) });
    } finally {
      setIncomeDownloadBusy(false);
    }
  };
  const exportExpenses = async () => {
    if (invalidRange) return;
    setExpenseDownloadBusy(true);
    setExportFeedback(null);
    try {
      const result = await listExpenses(params);
      const rows: (string | number)[][] = result.expenses.map((item) => [
        item.expenseDate,
        item.category,
        item.description,
        item.amount,
        item.paymentMethod ?? 'Belum diklasifikasi',
        item.createdAt,
        item.id,
      ]);
      rows.push(['TOTAL PERIODE', '', '', result.totalAmount, '', '', '']);
      await downloadCsv(`pengeluaran-${salonFileName}-${from}-${to}.pdf`, [
        'Tanggal',
        'Kategori',
        'Rincian',
        'Nominal (Rp)',
        'Metode pembayaran',
        'Waktu dicatat',
        'ID catatan',
      ], rows);
      setExportFeedback({ type: 'success', message: `Rincian ${result.count} pengeluaran berhasil diunduh.` });
    } catch (error) {
      setExportFeedback({ type: 'error', message: errorMessage(error) });
    } finally {
      setExpenseDownloadBusy(false);
    }
  };

  return <div className={`finance-page${salon === 'hair-studio' ? ' finance-page--hair' : ''}`} data-testid="page-finance">
    <style>{`
      .finance-page{--fi-ink:#472538;--fi-muted:#947b8b;--fi-accent:#b93670;--fi-line:#ecd9e3;--fi-wash:#fff8fb;--fi-green:#35785b;--fi-red:#b64e55;max-width:1320px;margin:0 auto;color:var(--fi-ink)}
      .finance-page *{box-sizing:border-box}.finance-page--hair{--fi-ink:#252525;--fi-muted:#777;--fi-accent:#252525;--fi-line:#dedede;--fi-wash:#f7f7f7;--fi-green:#35785b}
      .fi-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:0 0 18px}
      .fi-eyebrow{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:var(--fi-accent);font-size:9px;font-weight:900;letter-spacing:.16em}
      .fi-head h1{margin:0;color:var(--fi-ink);font-family:var(--app-font-serif);font-size:clamp(29px,4vw,40px);line-height:1.05;letter-spacing:-.055em}
      .fi-head p:not(.fi-eyebrow){max-width:640px;margin:8px 0 0;color:var(--fi-muted);font-size:12px;line-height:1.65}
      .fi-salon{display:flex;align-items:center;gap:9px;border:1px solid var(--fi-line);border-radius:14px;background:#fff;padding:9px 12px;white-space:nowrap}
      .fi-salon-mark{display:grid;width:33px;height:33px;place-items:center;border-radius:11px;background:#f8eaf1;color:var(--fi-accent)}.finance-page--hair .fi-salon-mark{background:#eee}
      .fi-salon small,.fi-salon strong{display:block}.fi-salon small{color:#a38495;font-size:8px;font-weight:900;letter-spacing:.12em}.fi-salon strong{margin-top:2px;font-size:11px}
       .fi-toolbar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;margin-bottom:14px;border:1px solid var(--fi-line);border-radius:16px;background:#fff;padding:12px 14px}
      .fi-toolbar-label{display:flex;align-items:center;gap:8px;color:#785b6e;font-size:10px;font-weight:850}
       .fi-presets{display:flex;justify-content:center;gap:5px}.fi-preset{min-height:33px;border:1px solid transparent;border-radius:9px;background:transparent;padding:0 10px;color:#8e7182;font-size:10px;font-weight:800;cursor:pointer}
      .fi-preset:hover{background:var(--fi-wash);color:var(--fi-accent)}.fi-preset.is-active{border-color:#f0d7e3;background:#f8eaf1;color:var(--fi-accent)}.finance-page--hair .fi-preset.is-active{border-color:#ddd;background:#eee}
       .fi-toolbar-right{display:grid;justify-items:end;gap:8px}.fi-dates{display:flex;align-items:center;gap:8px}.fi-date{display:grid;gap:4px;color:#a18494;font-size:8px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
       .fi-date input{height:34px;border:1px solid #eadce4;border-radius:8px;background:#fff;padding:0 7px;color:#5e4053;font:600 10px inherit;outline:none}.fi-date input:focus-visible{border-color:#bd7293;box-shadow:0 0 0 3px rgba(185,54,112,.1)}
        .fi-export-actions{display:flex;justify-content:flex-end;gap:6px}.fi-download{display:inline-flex;min-height:34px;align-items:center;justify-content:center;gap:6px;border:1px solid var(--fi-line);border-radius:9px;background:#fff;padding:0 9px;color:var(--fi-accent);font-size:10px;font-weight:850;cursor:pointer;transition:background .15s,border-color .15s}.fi-download:hover:not(:disabled){border-color:#d9b6c7;background:var(--fi-wash)}.fi-download:disabled{opacity:.48;cursor:not-allowed}
       .fi-export-feedback{margin:-5px 0 13px;border-radius:9px;padding:9px 11px;font-size:9px;line-height:1.5}.fi-export-feedback--success{border:1px solid #d5e8dd;background:#f6fbf7;color:#4e8068}.fi-export-feedback--error{border:1px solid #f1d2d4;background:#fff7f7;color:#a6444b}
       .fi-overview{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,.75fr));gap:11px;margin-bottom:14px}
      .fi-net-card{position:relative;display:flex;min-height:132px;align-items:center;justify-content:space-between;gap:14px;overflow:hidden;border:1px solid #d6e8dd;border-radius:17px;background:radial-gradient(ellipse at 95% 0%,#e5f3ea,transparent 45%),linear-gradient(112deg,#f7fcf8,#fff 72%);padding:17px 19px}
      .fi-net-card.is-loss{border-color:#efd5d5;background:radial-gradient(ellipse at 95% 0%,#f9e9e8,transparent 45%),linear-gradient(112deg,#fff8f7,#fff 72%)}
      .fi-net-copy,.fi-net-icon{position:relative;z-index:1}.fi-net-label{display:flex;align-items:center;gap:6px;color:#638b73;font-size:8px;font-weight:900;letter-spacing:.15em}.fi-net-card.is-loss .fi-net-label{color:#a65c60}
      .fi-net-value{margin-top:7px;color:#256349;font-family:var(--app-font-serif);font-size:clamp(23px,3vw,34px);font-weight:850;letter-spacing:-.06em;line-height:1.1}.fi-net-card.is-loss .fi-net-value{color:#a3434a}
      .fi-net-caption{margin-top:6px;color:#8b9e90;font-size:9px;line-height:1.5}.fi-net-icon{display:grid;width:46px;height:46px;flex:none;place-items:center;border:1px solid #d9e9de;border-radius:15px;background:#fff;color:#43815d}
      .fi-metric{display:flex;min-height:132px;flex-direction:column;justify-content:space-between;border:1px solid var(--fi-line);border-radius:16px;background:#fff;padding:14px}
      .fi-metric-top{display:flex;align-items:center;justify-content:space-between;gap:6px;color:#9a8090;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.fi-metric-icon{display:grid;width:28px;height:28px;place-items:center;border-radius:9px;background:var(--fi-wash);color:var(--fi-accent)}
      .fi-metric-value{margin-top:9px;color:#51344a;font-family:var(--app-font-serif);font-size:clamp(17px,2vw,23px);font-weight:850;letter-spacing:-.045em;overflow-wrap:anywhere}.fi-metric-note{margin-top:3px;color:#a28b99;font-size:9px;line-height:1.4}
      .fi-note{display:flex;align-items:flex-start;gap:9px;margin:0 0 14px;border:1px solid #eadcc4;border-radius:12px;background:#fffaf0;padding:11px 13px;color:#826943;font-size:9px;line-height:1.6}.fi-note svg{flex:none;margin-top:1px;color:#b38a4a}.fi-note strong{color:#6e5736}
      .fi-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,.75fr);align-items:start;gap:14px}
      .fi-panel{min-width:0;overflow:hidden;border:1px solid var(--fi-line);border-radius:17px;background:#fff;box-shadow:0 8px 24px rgba(92,44,68,.04)}
      .fi-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #f3e9ee;background:linear-gradient(100deg,#fff9fb,#fff 75%);padding:14px 16px}
      .finance-page--hair .fi-panel-head{background:linear-gradient(100deg,#fafafa,#fff 75%)}.fi-panel-head h2{margin:0;color:#4c3044;font-family:var(--app-font-serif);font-size:14px;font-weight:850;letter-spacing:-.03em}.fi-panel-head p{margin:4px 0 0;color:#9a8291;font-size:9px;line-height:1.5}
      .fi-legend{display:flex;gap:12px;color:#927a89;font-size:8px;font-weight:800}.fi-legend span{display:flex;align-items:center;gap:5px}.fi-dot{width:7px;height:7px;border-radius:3px;background:#ba477c}.fi-dot--expense{background:#e4b47b}
      .fi-chart-wrap{overflow-x:auto;padding:14px 15px 10px}.fi-chart{display:block;width:100%;min-width:420px;height:205px;overflow:visible}
       .fi-chart-grid{stroke:#f0e7ec;stroke-width:1}.fi-chart-label{fill:#8e7886;font:9px var(--app-font-sans)}.fi-bar-revenue{fill:#bd477d}.fi-bar-expense{fill:#e4b47b}.fi-chart-empty{display:grid;min-height:205px;place-items:center;color:#a18b98;font-size:10px}
      .fi-chart-caption{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #f4edf1;padding:9px 16px;color:#a18b98;font-size:8px}
      .fi-flow{margin-top:14px}.fi-flow-list{padding:2px 16px 9px}.fi-flow-row{display:grid;grid-template-columns:minmax(78px,1fr) repeat(3,minmax(0,1fr));align-items:center;gap:8px;min-height:43px;border-bottom:1px solid #f4edf1;color:#80697a;font-size:9px}
      .fi-flow-row:last-child{border-bottom:0}.fi-flow-row strong{color:#583b4f;font-size:9px;text-align:right;white-space:nowrap}.fi-flow-row--head{min-height:32px;color:#a38d9b;font-size:8px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
      .fi-flow-row--head strong{color:#a38d9b;font-size:8px}.fi-categories{padding:4px 15px 11px}.fi-category{display:flex;align-items:center;gap:9px;min-height:52px;border-bottom:1px solid #f4edf1}.fi-category:last-child{border-bottom:0}
      .fi-category-mark{display:grid;width:31px;height:31px;flex:none;place-items:center;border-radius:10px;background:var(--fi-wash);color:var(--fi-accent)}.fi-category-main{min-width:0;flex:1}.fi-category-main b{display:block;overflow:hidden;color:#5c3c50;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.fi-category-main small{display:block;margin-top:3px;color:#a38c9b;font-size:8px}.fi-category-amount{color:#56394d;font-family:var(--app-font-serif);font-size:11px;font-weight:850;white-space:nowrap}
      .fi-payment{margin-top:14px}.fi-payment-body{padding:9px 15px 13px}.fi-payment-line{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:38px;border-bottom:1px solid #f4edf1;color:#816a7a;font-size:9px}.fi-payment-line:last-child{border:0}.fi-payment-line strong{color:#56394d;font-size:10px;white-space:nowrap}.fi-payment-foot{margin-top:7px;border-radius:9px;background:#fff8ee;padding:9px;color:#8b714e;font-size:8px;line-height:1.55}
      .fi-state{display:grid;min-height:205px;align-content:center;justify-items:center;padding:24px 18px;color:#bd7b9a;text-align:center}.fi-state h3{margin:10px 0 4px;color:#58394d;font-family:var(--app-font-serif);font-size:14px;font-weight:850}.fi-state p{max-width:310px;margin:0;color:#9a8090;font-size:9px;line-height:1.6}.fi-retry{display:inline-flex;align-items:center;gap:6px;margin-top:12px;border:0;border-radius:9px;background:var(--fi-accent);padding:8px 11px;color:#fff;font-size:9px;font-weight:800;cursor:pointer}
      .fi-skeleton{display:grid;gap:9px;padding:16px}.fi-skeleton span{height:42px;border-radius:9px;background:linear-gradient(90deg,#faf2f6,#f1e6ec,#faf2f6);background-size:200% 100%;animation:fi-shimmer 1.35s ease-in-out infinite}@keyframes fi-shimmer{to{background-position:-200% 0}}
       @media(max-width:980px){.fi-toolbar{grid-template-columns:1fr auto}.fi-presets{grid-row:2;grid-column:1/-1;justify-content:flex-start}.fi-toolbar-right{grid-row:1;grid-column:2}.fi-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.fi-net-card{grid-column:span 2}.fi-grid{grid-template-columns:1fr}.fi-side-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}}
        @media(max-width:640px){.fi-head{align-items:flex-start;flex-direction:column}.fi-salon{width:100%}.fi-toolbar{grid-template-columns:1fr;align-items:stretch}.fi-toolbar-label{justify-content:center}.fi-presets{grid-row:auto;grid-column:auto;justify-content:space-between}.fi-toolbar-right{grid-row:auto;grid-column:1;justify-items:stretch}.fi-dates{display:grid;grid-template-columns:1fr 1fr}.fi-date input{width:100%}.fi-export-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.fi-download{padding-inline:5px;font-size:8px}.fi-overview{gap:8px}.fi-metric{min-height:111px;padding:11px}.fi-net-card{min-height:119px;padding:14px}.fi-net-icon{width:38px;height:38px}.fi-side-grid{grid-template-columns:1fr}.fi-panel-head{padding:13px}.fi-flow-list{padding-inline:10px}.fi-flow-row{grid-template-columns:minmax(66px,.8fr) repeat(3,minmax(0,1fr));gap:4px;font-size:8px}.fi-flow-row strong{font-size:8px}.fi-chart-wrap{padding-inline:9px}}
      @media(prefers-reduced-motion:reduce){.finance-page *, .finance-page *:before,.finance-page *:after{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
    `}</style>
    <header className="fi-head">
      <div><p className="fi-eyebrow"><WalletCards size={13}/> KEUANGAN SALON</p><h1>Laporan keuangan</h1><p>Ringkas pendapatan, biaya tercatat, dan pergerakan kas tanpa mencampur pembukuan antar salon.</p></div>
      <div className="fi-salon"><span className="fi-salon-mark"><Scissors size={16}/></span><span><small>SALON TERPILIH</small><strong>{salonName}</strong></span></div>
    </header>

    <section className="fi-toolbar" aria-label="Periode laporan">
      <div className="fi-toolbar-label"><CalendarDays size={15}/> Periode laporan</div>
      <div className="fi-presets" role="group" aria-label="Pilih periode">
        {([['today', 'Hari ini'], ['7d', '7 hari'], ['month', 'Bulan ini']] as const).map(([value, label]) =>
          <button key={value} type="button" className={`fi-preset${period === value ? ' is-active' : ''}`} aria-pressed={period === value} onClick={() => setPreset(value)} data-testid={`button-finance-period-${value}`}>{label}</button>)}
        <button type="button" className={`fi-preset${period === 'custom' ? ' is-active' : ''}`} aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')} data-testid="button-finance-period-custom">Rentang khusus</button>
      </div>
      <div className="fi-toolbar-right">
        <div className="fi-dates">
          <label className="fi-date">Dari tanggal<input type="date" aria-label="Tanggal mulai laporan" value={from} max={to} onChange={(event) => changeDate('from', event.target.value)} data-testid="input-finance-from"/></label>
          <label className="fi-date">Sampai tanggal<input type="date" aria-label="Tanggal akhir laporan" value={to} min={from} max={today} onChange={(event) => changeDate('to', event.target.value)} data-testid="input-finance-to"/></label>
        </div>
        <div className="fi-export-actions" aria-label="Unduh laporan">
          <button type="button" className="fi-download" onClick={exportCashFlow} disabled={!report || invalidRange || reportQuery.isLoading || reportQuery.isError} data-testid="button-export-cashflow"><Download size={12}/> Unduh arus kas PDF</button>
          <button type="button" className="fi-download" onClick={() => void exportIncome()} disabled={!report || invalidRange || reportQuery.isLoading || reportQuery.isError || incomeDownloadBusy} data-testid="button-export-income"><Download size={12}/> {incomeDownloadBusy ? 'Menyiapkan…' : 'Unduh pemasukan PDF'}</button>
          <button type="button" className="fi-download" onClick={() => void exportExpenses()} disabled={!report || invalidRange || reportQuery.isLoading || reportQuery.isError || expenseDownloadBusy} data-testid="button-export-expenses"><Download size={12}/> {expenseDownloadBusy ? 'Menyiapkan…' : 'Unduh pengeluaran PDF'}</button>
        </div>
      </div>
    </section>

    {exportFeedback && <div className={`fi-export-feedback fi-export-feedback--${exportFeedback.type}`} role={exportFeedback.type === 'error' ? 'alert' : 'status'} aria-live="polite">{exportFeedback.message}</div>}
    {invalidRange && <div className="fi-note" role="alert"><AlertCircle size={15}/><span>Tanggal mulai harus sebelum atau sama dengan tanggal akhir.</span></div>}
    {!invalidRange && reportQuery.isError && <div className="fi-state" role="alert"><AlertCircle size={25}/><h3>Laporan belum dapat dimuat</h3><p>{errorMessage(reportQuery.error)}</p><button type="button" className="fi-retry" onClick={() => void reportQuery.refetch()}><RefreshCw size={13}/> Coba lagi</button></div>}
    {!invalidRange && reportQuery.isLoading && <div className="fi-skeleton" role="status" aria-label="Memuat laporan keuangan"><span/><span/><span/><span/></div>}

    {!invalidRange && !reportQuery.isLoading && !reportQuery.isError && report && <>
      <section className="fi-overview" aria-label="Ringkasan laba rugi">
        <div className={`fi-net-card${report.netProfit < 0 ? ' is-loss' : ''}`}>
          <div className="fi-net-copy"><span className="fi-net-label">{report.netProfit >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>} LABA BERSIH TERCATAT</span><div className="fi-net-value" data-testid="text-finance-net-profit">{money(report.netProfit)}</div><div className="fi-net-caption">{rangeLabel} · {salonName}<br/>Pendapatan setelah diskon dikurangi pengeluaran tercatat.</div></div>
          <span className="fi-net-icon">{report.netProfit >= 0 ? <ArrowUpRight size={21}/> : <ArrowDownRight size={21}/>}</span>
        </div>
        <Metric label="Pendapatan" value={money(report.revenue)} note={`${report.salesCount} transaksi · setelah diskon`} icon={ArrowUpRight} testId="text-finance-revenue"/>
        <Metric label="Pengeluaran tercatat" value={money(report.expenses)} note={`${report.expenseCount} catatan`} icon={ArrowDownRight} testId="text-finance-expenses"/>
        <Metric label="Arus kas bersih" value={money(report.netCashFlow)} note="Dana masuk dikurangi dana keluar" icon={Banknote} testId="text-finance-net-cash-flow" negative={report.netCashFlow < 0}/>
      </section>
      <div className="fi-note"><CircleHelp size={15}/><span><strong>Catatan pembukuan:</strong> laba bersih dihitung dari penjualan setelah diskon dikurangi baris pengeluaran yang tercatat. Arus kas memakai metode pembayaran yang tersedia; pengeluaran lama tanpa metode tetap ditandai belum terklasifikasi. Aplikasi tidak mencatat saldo awal. Pajak, HPP, dan komisi tidak ditambahkan ke perhitungan laba ini.</span></div>

      <div className="fi-grid">
        <div>
          <section className="fi-panel" aria-labelledby="finance-chart-title">
            <div className="fi-panel-head"><div><h2 id="finance-chart-title">Pergerakan harian</h2><p>Pendapatan dan pengeluaran tercatat per tanggal.</p></div><div className="fi-legend"><span><i className="fi-dot"/>Pendapatan</span><span><i className="fi-dot fi-dot--expense"/>Pengeluaran</span></div></div>
            {daily.length === 0 ? <div className="fi-state"><CalendarDays size={24}/><h3>Belum ada pergerakan</h3><p>Tidak ada data transaksi atau pengeluaran pada rentang tanggal ini.</p></div> : <div className="fi-chart-wrap">
              <svg className="fi-chart" style={{ width: `${Math.max(420, daily.length * 54)}px` }} viewBox={`0 0 ${Math.max(420, daily.length * 54)} 205`} role="img" aria-label={`Grafik pendapatan dan pengeluaran harian, ${daily.length} hari`}>
                 {Array.from({ length: chartIntervals + 1 }, (_, line) => {
                   const y = 164 - line * 135 / chartIntervals;
                   const value = maxDaily * line / chartIntervals;
                   return <g key={line}><line className="fi-chart-grid" x1="35" y1={y} x2={Math.max(405, daily.length * 54 - 10)} y2={y}/><text className="fi-chart-label" x="2" y={y + 3}>{axisMoney(value)}</text></g>;
                 })}
                {daily.map((item, index) => {
                  const x = 48 + index * 54;
                  const revenueHeight = item.revenue / maxDaily * 135;
                  const expenseHeight = item.expenses / maxDaily * 135;
                  return <g key={item.date}>
                    <rect className="fi-bar-revenue" x={x} y={164 - revenueHeight} width="15" height={Math.max(1, revenueHeight)} rx="4"><title>{showDate(item.date)} · Pendapatan {money(item.revenue)}</title></rect>
                    <rect className="fi-bar-expense" x={x + 18} y={164 - expenseHeight} width="15" height={Math.max(1, expenseHeight)} rx="4"><title>{showDate(item.date)} · Pengeluaran {money(item.expenses)}</title></rect>
                    {(daily.length < 13 || index % Math.ceil(daily.length / 10) === 0 || index === daily.length - 1) && <text className="fi-chart-label" x={x - 5} y="188">{showDate(item.date)}</text>}
                  </g>;
                })}
              </svg>
            </div>}
            <div className="fi-chart-caption"><span>{rangeLabel}</span><span>Nilai dalam rupiah · gulir grafik untuk melihat semua tanggal</span></div>
          </section>
          <section className="fi-panel fi-flow" aria-labelledby="finance-flow-title">
             <div className="fi-panel-head"><div><h2 id="finance-flow-title">Rincian arus kas harian</h2><p>Dana masuk, dana keluar, dan perubahan bersih setiap hari.</p></div></div>
            {daily.length === 0 ? <div className="fi-state"><p>Belum ada pergerakan harian untuk ditampilkan.</p></div> : <div className="fi-flow-list">
              <div className="fi-flow-row fi-flow-row--head"><span>Tanggal</span><strong>Masuk</strong><strong>Keluar</strong><strong>Bersih</strong></div>
              {[...daily].reverse().map((item) => <div className="fi-flow-row" key={item.date}><span>{showDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><strong>{money(item.revenue)}</strong><strong>{money(item.expenses)}</strong><strong style={{ color: item.netCashFlow < 0 ? '#b64e55' : '#35785b' }}>{money(item.netCashFlow)}</strong></div>)}
            </div>}
          </section>
        </div>
        <aside className="fi-side-grid">
          <section className="fi-panel" aria-labelledby="finance-categories-title">
            <div className="fi-panel-head"><div><h2 id="finance-categories-title">Pengeluaran per kategori</h2><p>Pengelompokan dari catatan pada periode ini.</p></div><ChevronDown size={15} color="#a38c9b"/></div>
            {report.categories.length === 0 ? <div className="fi-state"><CircleHelp size={23}/><h3>Belum ada rincian kategori</h3><p>Kategori pengeluaran akan terlihat setelah ada catatan biaya.</p></div> : <div className="fi-categories">{report.categories.map((item) => <div className="fi-category" key={item.category}><span className="fi-category-mark"><ArrowDownRight size={15}/></span><div className="fi-category-main"><b>{item.category}</b><small>{item.count} {item.count === 1 ? 'catatan' : 'catatan'}</small></div><span className="fi-category-amount">{money(item.amount)}</span></div>)}</div>}
          </section>
          <section className="fi-panel fi-payment" aria-labelledby="finance-payment-title">
            <div className="fi-panel-head"><div><h2 id="finance-payment-title">Rincian metode pembayaran</h2><p>Komposisi dana sesuai klasifikasi yang tersimpan.</p></div></div>
            <div className="fi-payment-body">
              <div className="fi-payment-line"><span>Pendapatan · Tunai</span><strong>{money(report.cashRevenue)}</strong></div>
              <div className="fi-payment-line"><span>Pendapatan · Transfer / QRIS</span><strong>{money(report.transferRevenue)}</strong></div>
              <div className="fi-payment-line"><span>Pendapatan · Metode lain</span><strong>{money(report.otherRevenue)}</strong></div>
              <div className="fi-payment-line"><span>Pengeluaran · Tunai</span><strong>{money(report.cashExpenses)}</strong></div>
              <div className="fi-payment-line"><span>Pengeluaran · Transfer / QRIS</span><strong>{money(report.transferExpenses)}</strong></div>
              <div className="fi-payment-line"><span>Pengeluaran · Belum diklasifikasi</span><strong>{money(report.unclassifiedExpenses)}</strong></div>
              {report.unclassifiedExpenses > 0 && <div className="fi-payment-foot">Sebagian catatan pengeluaran historis dibuat sebelum metode pembayaran diwajibkan. Nominal tersebut tetap masuk ke pengeluaran dan laba bersih, tetapi tidak dapat dipetakan ke arus kas Tunai atau Transfer / QRIS.</div>}
            </div>
          </section>
        </aside>
      </div>
    </>}
  </div>;
}

function Metric({ label, value, note, icon: Icon, testId, negative = false }: { label: string; value: string; note: string; icon: typeof ArrowUpRight; testId: string; negative?: boolean }) {
  return <div className="fi-metric"><div className="fi-metric-top"><span>{label}</span><span className="fi-metric-icon"><Icon size={14}/></span></div><div><div className="fi-metric-value" data-testid={testId} style={negative ? { color: '#b64e55' } : undefined}>{value}</div><div className="fi-metric-note">{note}</div></div></div>;
}
