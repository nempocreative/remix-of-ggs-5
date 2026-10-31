import { downloadTablePdf } from '@/pos/lib/table-pdf';
import { useMutation, useQuery } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client/custom-fetch';
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetEmployeesQueryKey,
  getGetSalesQueryKey,
  useCreateEmployee,
  useGetEmployees,
  useGetSales,
  useUpdateEmployee,
  type Employee,
} from '@/lib/api-client';
import { AlertCircle, ArrowDownWideNarrow, ArrowUpRight, BadgePercent, BarChart3, CalendarDays, ChevronDown, CircleDollarSign, Download, Eye, EyeOff, FileWarning, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { Link } from '@/pos/router-compat';
import type { SalonId } from '@/pos/lib/menu';
import { displayStaffName } from '@/lib/utils';
import './employee-performance-page.css';

type Props = { salon: SalonId };
type Period = 'month' | 'last30' | 'all' | 'custom';
type SortMetric = 'commission' | 'base' | 'services' | 'sales' | 'name';
type ServiceMetric = { name: string; quantity: number; base: number; commission: number; capturedSnapshotUnits: number; missingSnapshotUnits: number };
type EmployeeMetric = {
  commission: number;
  base: number;
  services: number;
  sales: number;
  capturedSnapshotUnits: number;
  missingSnapshotUnits: number;
  serviceBreakdown: Map<string, ServiceMetric>;
};

type Settlement = { id: string; employeeId: string; employeeName: string; action: 'withdraw' | 'save' | 'savings_withdraw'; amount: number; periodStart: string | null; periodEnd: string; createdBy: string | null; createdAt: string };
type CommissionLedger = { settlements: Settlement[]; employees: Record<string, { cutoff: string | null; savings: number }> };
const settlementLabel: Record<Settlement['action'], string> = { withdraw: 'Ditarik', save: 'Disimpan ke tabungan', savings_withdraw: 'Tabungan dicairkan' };
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value));

const money = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(amount);

const recordedMoney = (amount: number, capturedSnapshotUnits: number) =>
  capturedSnapshotUnits > 0 ? money(amount) : '—';

function jakartaDateKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function currentMonthRange() {
  const today = jakartaDateKey(new Date())!;
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${dateKey}T12:00:00+07:00`));
}

function formatUpdatedTime(timestamp: number) {
  if (!timestamp) return 'Belum tersinkron';
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
  return `Diperbarui ${time} WIB`;
}

function periodLabel(period: Period, start: string | null, end: string | null) {
  if (period === 'all') return 'Semua waktu';
  if (period === 'month') return 'Bulan ini';
  if (period === 'last30') return '30 hari terakhir';
  if (!start || !end) return 'Rentang tanggal';
  return `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

export default function EmployeePerformancePage({ salon }: Props) {
  const queryClient = useQueryClient();
  const employeesQuery = useGetEmployees({ salon }, {
    query: { queryKey: getGetEmployeesQueryKey({ salon }), refetchInterval: 30_000, refetchOnWindowFocus: true },
  });
  const salesQuery = useGetSales({ salon }, {
    query: { queryKey: getGetSalesQueryKey({ salon }), refetchInterval: 30_000, refetchOnWindowFocus: true },
  });
  const ledgerQuery = useQuery({
    queryKey: ['commission-ledger', salon],
    queryFn: () => customFetch<CommissionLedger>(`/api/commissions/${salon}`),
    refetchInterval: 30_000,
  });
  const ledger = ledgerQuery.data;
  const settle = useMutation({
    mutationFn: ({ employeeId, action }: { employeeId: string; action: Settlement['action'] }) =>
      customFetch<Settlement>(`/api/commissions/${salon}/${employeeId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-ledger', salon] }),
  });
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const [period, setPeriod] = useState<Period>('month');
  const [customRangeDraft, setCustomRangeDraft] = useState(currentMonthRange);
  const [appliedCustomRange, setAppliedCustomRange] = useState(currentMonthRange);
  const [customRangeError, setCustomRangeError] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortMetric>('commission');
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  const [showSnapshotHelp, setShowSnapshotHelp] = useState(false);
  const [name, setName] = useState('');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const employees = employeesQuery.data ?? [];
  const sales = salesQuery.data ?? [];
  const todayKey = jakartaDateKey(new Date())!;
  const activeRange = useMemo(() => {
    if (period === 'all') return { start: null, end: null };
    if (period === 'month') return { start: `${todayKey.slice(0, 7)}-01`, end: todayKey };
    if (period === 'last30') return { start: addDaysToDateKey(todayKey, -29), end: todayKey };
    return appliedCustomRange;
  }, [period, todayKey, appliedCustomRange]);
  const selectedPeriodLabel = periodLabel(period, activeRange.start, activeRange.end);
  const customRangeIsValid = Boolean(
    customRangeDraft.start && customRangeDraft.end && customRangeDraft.start <= customRangeDraft.end,
  );

  const performanceData = useMemo(() => {
    const totals = new Map<string, EmployeeMetric>();
    let unassignedServiceUnits = 0;
    let unassignedTransactions = 0;
    for (const sale of sales) {
      if (sale.salon !== salon) continue;
      if (activeRange.start || activeRange.end) {
        const saleDate = jakartaDateKey(sale.createdAt);
        if (!saleDate || (activeRange.start && saleDate < activeRange.start) || (activeRange.end && saleDate > activeRange.end)) continue;
      }
      const touched = new Set<string>();
      let hasUnassignedService = false;
      for (const item of sale.items ?? []) {
        const id = item.employeeId;
        const cutoff = id ? ledger?.employees[id]?.cutoff : null;
        if (cutoff && new Date(sale.createdAt) <= new Date(cutoff)) continue;
        if (!id) {
          unassignedServiceUnits += Math.max(0, item.quantity ?? 1);
          hasUnassignedService = true;
          continue;
        }
        const current = totals.get(id) ?? {
          commission: 0,
          base: 0,
          services: 0,
          sales: 0,
          capturedSnapshotUnits: 0,
          missingSnapshotUnits: 0,
          serviceBreakdown: new Map<string, ServiceMetric>(),
        };
        const quantity = item.quantity;
        const hasSnapshot = Number.isSafeInteger(item.commissionBase)
          && item.commissionBase! >= 0
          && Number.isSafeInteger(item.commissionAmount)
          && item.commissionAmount! >= 0;
        const base = hasSnapshot ? item.commissionBase! : 0;
        const commission = hasSnapshot ? item.commissionAmount! : 0;
        current.commission += commission;
        current.base += base;
        current.services += quantity;
        if (hasSnapshot) current.capturedSnapshotUnits += quantity;
        else current.missingSnapshotUnits += quantity;
        const serviceKey = `${item.serviceId}:${item.name}`;
        const service = current.serviceBreakdown.get(serviceKey) ?? {
          name: item.name,
          quantity: 0,
          base: 0,
          commission: 0,
          capturedSnapshotUnits: 0,
          missingSnapshotUnits: 0,
        };
        service.quantity += quantity;
        service.base += base;
        service.commission += commission;
        if (hasSnapshot) service.capturedSnapshotUnits += quantity;
        else service.missingSnapshotUnits += quantity;
        current.serviceBreakdown.set(serviceKey, service);
        totals.set(id, current);
        touched.add(id);
      }
      if (hasUnassignedService) unassignedTransactions += 1;
      for (const id of touched) {
        const current = totals.get(id)!;
        current.sales += 1;
      }
    }
    return { totals, unassignedServiceUnits, unassignedTransactions };
  }, [sales, salon, activeRange, ledger]);
  const performance = performanceData.totals;
  const rankedEmployees = useMemo(() => employees
    .filter((employee) => showInactiveEmployees || employee.active)
    .map((employee) => ({
      employee,
      metric: performance.get(employee.id) ?? {
        commission: 0,
        base: 0,
        services: 0,
        sales: 0,
        capturedSnapshotUnits: 0,
        missingSnapshotUnits: 0,
        serviceBreakdown: new Map<string, ServiceMetric>(),
      },
    }))
    .filter(({ employee }) => displayStaffName(employee.name).toLocaleLowerCase('id-ID').includes(staffSearch.trim().toLocaleLowerCase('id-ID')))
    .sort((a, b) => {
      if (sortBy === 'name') return a.employee.name.localeCompare(b.employee.name, 'id');
      const value = (metric: EmployeeMetric) => metric[sortBy];
      return value(b.metric) - value(a.metric)
        || b.metric.commission - a.metric.commission
        || b.metric.base - a.metric.base
        || a.metric.missingSnapshotUnits - b.metric.missingSnapshotUnits
        || a.employee.name.localeCompare(b.employee.name, 'id');
    }),
  [employees, performance, staffSearch, sortBy, showInactiveEmployees]);
  const activeCount = employees.filter((employee) => employee.active).length;
  const inactiveCount = employees.length - activeCount;
  const visibleRosterEmployees = showInactiveEmployees ? employees : employees.filter((employee) => employee.active);
  const totalEarned = [...performance.values()].reduce((sum, item) => sum + item.commission, 0);
  const totalBase = [...performance.values()].reduce((sum, item) => sum + item.base, 0);
  const totalServices = [...performance.values()].reduce((sum, item) => sum + item.services, 0);
  const totalTransactions = [...performance.values()].reduce((sum, item) => sum + item.sales, 0);
  const capturedSnapshotUnits = [...performance.values()].reduce((sum, item) => sum + item.capturedSnapshotUnits, 0);
  const missingSnapshotUnits = [...performance.values()].reduce((sum, item) => sum + item.missingSnapshotUnits, 0);
  const unassignedServiceUnits = performanceData.unassignedServiceUnits;
  const unassignedTransactions = performanceData.unassignedTransactions;
  const reviewServiceUnits = missingSnapshotUnits + unassignedServiceUnits;
  const scopedServiceUnits = totalServices + unassignedServiceUnits;
  const dataQualityPercent = scopedServiceUnits > 0
    ? Math.round((capturedSnapshotUnits / scopedServiceUnits) * 100)
    : null;
  const latestDataUpdatedAt = Math.max(employeesQuery.dataUpdatedAt, salesQuery.dataUpdatedAt);
  const isRefreshing = employeesQuery.isFetching || salesQuery.isFetching;

  const refreshPerformanceData = () => {
    void Promise.all([employeesQuery.refetch(), salesQuery.refetch()]);
  };

  const applyCustomRange = () => {
    if (!customRangeIsValid) {
      setCustomRangeError('Tanggal akhir harus sama atau setelah tanggal awal.');
      return;
    }
    setAppliedCustomRange(customRangeDraft);
    setCustomRangeError('');
    setPeriod('custom');
  };

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetEmployeesQueryKey({ salon }) }),
      queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey({ salon }) }),
    ]);
  };

  const addEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Masukkan nama staf.');
      return;
    }
    setError('');
    setFeedback('');
    try {
      await createEmployee.mutateAsync({ salon, data: { name: cleanName, commissionPercent: 10 } });
      setName('');
      setFeedback(`${cleanName} ditambahkan ke daftar staf.`);
      await invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Staf belum dapat ditambahkan. Coba lagi.');
    }
  };

  const saveEmployee = async (
    employee: Employee,
    active = employee.active,
    isCashier = employee.isCashier,
  ) => {
    setError('');
    setFeedback('');
    try {
      await updateEmployee.mutateAsync({
        salon,
        id: employee.id,
        data: { name: employee.name, commissionPercent: employee.commissionPercent, active, isCashier },
      });
      setFeedback(`${displayStaffName(employee.name)} berhasil diperbarui.`);
      await invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Perubahan belum tersimpan. Coba lagi.');
    }
  };

  const isLoading = employeesQuery.isLoading || salesQuery.isLoading;
  const isError = employeesQuery.isError || salesQuery.isError;
  const salonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const runSettlement = async (employee: { id: string; name: string }, action: Settlement['action'], amount: number) => {
    const question = action === 'withdraw'
      ? `Tarik komisi ${displayStaffName(employee.name)} sebesar ${money(amount)} hari ini? Komisi akan pindah ke riwayat penarikan.`
      : action === 'save'
        ? `Simpan komisi ${displayStaffName(employee.name)} sebesar ${money(amount)} ke tabungan?`
        : `Cairkan seluruh tabungan komisi ${displayStaffName(employee.name)} sebesar ${money(amount)}?`;
    if (!window.confirm(question)) return;
    setError(''); setFeedback('');
    try {
      const result = await settle.mutateAsync({ employeeId: employee.id, action });
      setFeedback(`${settlementLabel[result.action]}: ${displayStaffName(employee.name)} ${money(result.amount)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Komisi belum berhasil diproses.');
    }
  };
  const downloadSettlementsPdf = () => {
    const rows = ledger?.settlements ?? [];
    void downloadTablePdf({
      filename: `riwayat-penarikan-komisi-${salon === 'beauty' ? 'ggs-beauty' : 'ggs-hair-studio'}-${todayKey}.pdf`,
      title: `Riwayat Penarikan Komisi · ${salonName}`,
      subtitle: 'Semua penarikan, simpanan, dan pencairan tabungan',
      headers: ['Waktu', 'Staf', 'Jenis', 'Komisi sejak', 'Sampai', 'Dicatat oleh', 'Nominal (Rp)'],
      rows: rows.map((row) => [dateTimeLabel(row.createdAt), displayStaffName(row.employeeName), settlementLabel[row.action], row.periodStart ? dateTimeLabel(row.periodStart) : row.action === 'savings_withdraw' ? '-' : 'Awal', row.action === 'savings_withdraw' ? '-' : dateTimeLabel(row.periodEnd), row.createdBy ?? '-', row.amount]),
    });
  };
  const downloadPerformancePdf = () => {
    const rows: (string | number)[][] = [];
    rankedEmployees.forEach(({ employee, metric }, index) => {
      rows.push([index + 1, displayStaffName(employee.name), employee.active ? 'Aktif' : 'Nonaktif', metric.sales, metric.services, metric.base, metric.commission]);
      [...metric.serviceBreakdown.values()].forEach((service) => rows.push(['', `   - ${service.name}`, '', '', service.quantity, service.base, service.commission]));
    });
    rows.push(['TOTAL', '', '', totalTransactions, totalServices, totalBase, totalEarned]);
    void downloadTablePdf({
      filename: `kinerja-staf-${salon === 'beauty' ? 'ggs-beauty' : 'ggs-hair-studio'}-${activeRange.start ?? 'awal'}-${activeRange.end ?? todayKey}.pdf`,
      title: `Laporan Kinerja Staf · ${salonName}`,
      subtitle: `Periode: ${selectedPeriodLabel}`,
      headers: ['No', 'Staf / layanan', 'Status', 'Transaksi', 'Layanan', 'Dasar komisi (Rp)', 'Komisi (Rp)'],
      rows,
      summary: [['Total komisi', money(totalEarned)], ['Dasar komisi', money(totalBase)], ['Layanan', String(totalServices)], ['Staf aktif', String(activeCount)]],
    });
  };

  return <main className="employee-page fade-up ggs-performance">
    <div className="gp-shell">
      <header className="gp-page-head">
        <div>
          <div className="gp-breadcrumb">LAPORAN <span>/</span> TIM &amp; KOMISI</div>
          <div className="gp-heading-line">
            <h1>Kinerja staf</h1>
            <span className="gp-period-stamp"><CalendarDays size={14}/>{selectedPeriodLabel}</span>
          </div>
          <p className="gp-subtitle">Tinjau aktivitas dan komisi transaksi {salonName}. Perhitungan tanggal menggunakan waktu Jakarta.</p>
        </div>
         <div className="gp-header-status">
           <div className="gp-updated"><Users size={15}/><span><strong>{activeCount} staf aktif</strong><br/>{employees.length} staf terdaftar</span></div>
           <div className="gp-sync-status">
             <span aria-live="polite">{formatUpdatedTime(latestDataUpdatedAt)}</span>
             <button type="button" className="gp-refresh-button" onClick={downloadPerformancePdf} disabled={employeesQuery.isLoading || salesQuery.isLoading} data-testid="button-download-performance-pdf"><Download size={13}/><span>Unduh PDF</span></button>
             <button type="button" className="gp-refresh-button" onClick={refreshPerformanceData} disabled={isRefreshing} aria-label="Perbarui data kinerja" data-testid="button-refresh-performance-data">
               <RefreshCw size={13} className={isRefreshing ? 'is-spinning' : ''}/><span>{isRefreshing ? 'Memuat' : 'Perbarui'}</span>
             </button>
           </div>
         </div>
      </header>

      <section className="gp-controls" aria-label="Filter periode kinerja">
        <div className="gp-range-tabs" role="group" aria-label="Periode kinerja">
          <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')} data-testid="button-period-month">Bulan ini</button>
          <button type="button" aria-pressed={period === 'last30'} onClick={() => setPeriod('last30')} data-testid="button-period-last-30">30 hari</button>
          <button type="button" aria-pressed={period === 'all'} onClick={() => setPeriod('all')} data-testid="button-period-all">Semua waktu</button>
          <button type="button" aria-pressed={period === 'custom'} onClick={() => { setPeriod('custom'); setCustomRangeError(''); }} data-testid="button-period-custom">Rentang tanggal</button>
        </div>
        {period === 'custom' && <div className="gp-custom-range">
          <label htmlFor="performance-range-start">Dari <input id="performance-range-start" type="date" value={customRangeDraft.start} max={todayKey} onChange={(event) => { setCustomRangeDraft((range) => ({ ...range, start: event.target.value })); setCustomRangeError(''); }}/></label>
          <span aria-hidden="true">–</span>
          <label htmlFor="performance-range-end">Sampai <input id="performance-range-end" type="date" value={customRangeDraft.end} max={todayKey} onChange={(event) => { setCustomRangeDraft((range) => ({ ...range, end: event.target.value })); setCustomRangeError(''); }}/></label>
          <button type="button" className="gp-apply-range" onClick={applyCustomRange} disabled={!customRangeIsValid} data-testid="button-apply-custom-range">Terapkan</button>
          {!customRangeIsValid && <span className="gp-range-error" role="alert">Tanggal akhir harus sama atau setelah tanggal awal.</span>}
          {customRangeError && <span className="gp-range-error" role="alert">{customRangeError}</span>}
        </div>}
      </section>

      <section className="gp-metrics" aria-label={`Ringkasan kinerja ${salonName}`}>
        <article className="gp-metric gp-metric-primary">
          <div className="gp-metric-top"><span>Komisi tercatat</span><span className="gp-metric-icon"><CircleDollarSign size={16}/></span></div>
          <strong>{recordedMoney(totalEarned, capturedSnapshotUnits)}</strong>
          <div className="gp-metric-foot"><span>{capturedSnapshotUnits} layanan bersnapshot</span><span>{selectedPeriodLabel}</span></div>
        </article>
        <article className="gp-metric">
          <div className="gp-metric-top"><span>Dasar komisi tersimpan</span><span className="gp-metric-icon"><BadgePercent size={16}/></span></div>
          <strong>{recordedMoney(totalBase, capturedSnapshotUnits)}</strong>
          <div className="gp-metric-foot"><span>Snapshot saat pembayaran</span><span>{totalTransactions} transaksi</span></div>
        </article>
        <article className="gp-metric">
          <div className="gp-metric-top"><span>Aktivitas layanan</span><span className="gp-metric-icon"><BarChart3 size={16}/></span></div>
          <strong>{totalServices}<small> layanan</small></strong>
          <div className="gp-metric-foot"><span>{activeCount} staf aktif</span><span>{employees.length} terdaftar</span></div>
        </article>
        <article className={`gp-metric ${reviewServiceUnits > 0 ? 'gp-metric-warning' : ''}`}>
          <div className="gp-metric-top"><span>Perlu ditinjau</span><span className="gp-metric-icon"><FileWarning size={16}/></span></div>
          <strong>{reviewServiceUnits}<small> layanan</small></strong>
          <div className="gp-data-quality">
            <div className="gp-data-quality-head">
              <span>{scopedServiceUnits > 0 ? `${capturedSnapshotUnits} dari ${scopedServiceUnits} layanan lengkap` : 'Belum ada layanan'}</span>
              <strong>{dataQualityPercent === null ? '—' : `${dataQualityPercent}%`}</strong>
            </div>
            <div className="gp-data-quality-track" role="progressbar" aria-label="Kelengkapan data komisi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dataQualityPercent ?? 0} aria-valuetext={dataQualityPercent === null ? 'Belum ada layanan' : `${dataQualityPercent}% layanan tercatat lengkap`}>
              <span style={{ width: `${dataQualityPercent ?? 0}%` }}/>
            </div>
          </div>
          <div className="gp-metric-foot"><span>{unassignedServiceUnits} tanpa staf · {missingSnapshotUnits} tanpa snapshot</span><button type="button" onClick={() => setShowSnapshotHelp((current) => !current)} aria-expanded={showSnapshotHelp}>Tentang data</button></div>
        </article>
      </section>

      {unassignedServiceUnits > 0 && <aside className="gp-unassigned-note" role="note">
        <FileWarning size={15}/><span><strong>{unassignedServiceUnits} layanan dalam {unassignedTransactions} transaksi belum memiliki staf.</strong> Baris ini tidak masuk ke peringkat kinerja.</span>
      </aside>}

      {showSnapshotHelp && <aside className="gp-integrity-banner">
        <FileWarning size={17}/>
        <p><strong>Kinerja hanya menghitung layanan dengan staf terpilih.</strong> Item tanpa staf tidak masuk ke peringkat. Dasar komisi dan komisi berasal dari snapshot saat pembayaran; layanan tanpa snapshot tidak dianggap Rp0 atau dihitung ulang memakai tarif saat ini.</p>
        <button type="button" onClick={() => setShowSnapshotHelp(false)} aria-label="Tutup penjelasan">Tutup</button>
      </aside>}

      {(feedback || error) && <p className={`gp-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error ? <AlertCircle size={14}/> : <ArrowUpRight size={14}/>} {error || feedback}</p>}

      <section className="gp-management-grid" aria-label="Kelola staf">
        <section className="gp-management-card">
          <header className="gp-management-head">
            <div><div className="gp-report-kicker"><span className="gp-kicker-line"/>ROSTER SALON</div><h2>Daftar staf</h2><p>{activeCount} aktif <span>·</span> {employees.length} terdaftar</p></div>
            <span className="gp-head-count"><b>{employees.length.toString().padStart(2, '0')}</b><span>staf<br/>salon</span></span>
          </header>
          {isLoading
            ? <div className="gp-empty" role="status">Memuat daftar staf…</div>
            : isError
              ? <div className="gp-empty gp-empty-error"><AlertCircle size={22}/><strong>Data belum dapat dimuat</strong><span>Periksa koneksi, lalu coba lagi.</span><button type="button" onClick={() => { void employeesQuery.refetch(); void salesQuery.refetch(); }}><RefreshCw size={13}/> Coba lagi</button></div>
              : employees.length === 0
                ? <div className="gp-empty"><Users size={22}/><strong>Belum ada staf</strong><span>Tambahkan staf agar layanan dan komisi dapat dicatat dengan tepat.</span></div>
                : <>
                  {inactiveCount > 0 && <div className="gp-roster-tools">
                    <button
                      type="button"
                      className="gp-inactive-toggle"
                      aria-pressed={showInactiveEmployees}
                      onClick={() => setShowInactiveEmployees((value) => !value)}
                      data-testid="button-toggle-inactive-employees"
                    >
                      {showInactiveEmployees ? <EyeOff size={13}/> : <Eye size={13}/>}
                      {showInactiveEmployees ? 'Sembunyikan staf nonaktif' : `Tampilkan staf nonaktif (${inactiveCount})`}
                    </button>
                  </div>}
                  {visibleRosterEmployees.length === 0
                    ? <div className="gp-empty"><Users size={22}/><strong>Belum ada staf aktif</strong><span>Staf nonaktif disembunyikan dari daftar utama.</span></div>
                    : <div className="gp-roster-list">{visibleRosterEmployees.map((employee) => {
                  const metric = performance.get(employee.id) ?? {
                    commission: 0, base: 0, services: 0, sales: 0, capturedSnapshotUnits: 0, missingSnapshotUnits: 0, serviceBreakdown: new Map<string, ServiceMetric>(),
                  };
                  const initials = displayStaffName(employee.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('id-ID');
                  return <article className={`gp-roster-row${employee.active ? '' : ' is-inactive'}`} key={employee.id} data-testid={`row-employee-${employee.id}`}>
                    <span className={`gp-avatar${employee.active ? '' : ' is-inactive'}`}>{initials}</span>
                    <div className="gp-person">
                      <strong>{displayStaffName(employee.name)}</strong>
                      <span className="gp-staff-state">
                        <i className={employee.active ? 'is-active' : ''}/>{employee.active ? 'Aktif' : 'Nonaktif'}
                        {employee.isCashier && <span className="gp-cashier-badge">Kasir</span>}
                      </span>
                      <small>{metric.services} layanan <i/> {metric.sales} transaksi</small>
                    </div>
                    <div className="gp-roster-commission">
                      <small>Komisi · {selectedPeriodLabel}</small>
                      <strong>{recordedMoney(metric.commission, metric.capturedSnapshotUnits)}</strong>
                      <span>{metric.missingSnapshotUnits > 0 ? `${metric.missingSnapshotUnits} layanan tanpa snapshot` : metric.capturedSnapshotUnits > 0 ? 'Snapshot tersimpan' : 'Belum ada aktivitas'}</span>
                    </div>
                    <div className="gp-roster-actions gp-commission-actions">
                      <small>Tabungan: <strong>{money(ledger?.employees[employee.id]?.savings ?? 0)}</strong></small>
                      <button type="button" className="gp-roster-action" disabled={settle.isPending || metric.commission <= 0} onClick={() => void runSettlement(employee, 'withdraw', metric.commission)} data-testid={`button-withdraw-commission-${employee.id}`}>Tarik hari ini</button>
                      <button type="button" className="gp-roster-action" disabled={settle.isPending || metric.commission <= 0} onClick={() => void runSettlement(employee, 'save', metric.commission)} data-testid={`button-save-commission-${employee.id}`}>Simpan ke tabungan</button>
                      {(ledger?.employees[employee.id]?.savings ?? 0) > 0 && <button type="button" className="gp-roster-action" disabled={settle.isPending} onClick={() => void runSettlement(employee, 'savings_withdraw', ledger?.employees[employee.id]?.savings ?? 0)} data-testid={`button-withdraw-savings-${employee.id}`}>Cairkan tabungan</button>}
                    </div>
                    <div className="gp-roster-actions">
                      <button
                        type="button"
                        className="gp-roster-action gp-cashier-toggle"
                        disabled={updateEmployee.isPending}
                        aria-pressed={employee.isCashier}
                        onClick={() => void saveEmployee(employee, employee.active, !employee.isCashier)}
                        data-testid={`button-toggle-cashier-employee-${employee.id}`}
                      >{employee.isCashier ? 'Hapus tanda' : 'Jadikan kasir'}</button>
                      <button type="button" className="gp-roster-action" disabled={updateEmployee.isPending} onClick={() => void saveEmployee(employee, !employee.active)} data-testid={`button-toggle-employee-${employee.id}`}>{employee.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </div>
                  </article>;
                })}</div>}
                </>}
          <div className="gp-settlement-history" data-testid="section-commission-history">
            <div className="gp-settlement-head"><h3>Riwayat penarikan komisi</h3><button type="button" className="gp-refresh-button" onClick={downloadSettlementsPdf} disabled={!ledger?.settlements.length} data-testid="button-download-commission-history-pdf"><Download size={13}/><span>Unduh PDF</span></button></div>
            {!ledger?.settlements.length ? <p className="gp-management-note">Belum ada komisi yang ditarik atau disimpan.</p>
              : <table><thead><tr><th>Waktu</th><th>Staf</th><th>Jenis</th><th>Nominal</th></tr></thead><tbody>
                {ledger.settlements.map((row) => <tr key={row.id}><td>{dateTimeLabel(row.createdAt)}</td><td>{displayStaffName(row.employeeName)}</td><td>{settlementLabel[row.action]}</td><td>{money(row.amount)}</td></tr>)}
              </tbody></table>}
          </div>
          <p className="gp-management-note">Staf nonaktif disembunyikan dari daftar utama. Riwayat transaksi dan snapshot komisi tetap tersimpan.</p>
        </section>

        <aside className="gp-management-card gp-add-card">
          <header className="gp-management-head">
            <div><div className="gp-report-kicker"><span className="gp-kicker-line"/>ANGGOTA BARU</div><h2>Tambah staf</h2><p>Catat anggota tim salon.</p></div>
            <span className="gp-metric-icon"><Plus size={17}/></span>
          </header>
          <form className="gp-add-form" onSubmit={(event) => void addEmployee(event)}>
            <label htmlFor="employee-name">Nama staf</label>
            <input id="employee-name" data-testid="input-employee-name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Masukkan nama staf"/>
            <p>Tarif komisi diatur pada layanan di <Link href="/layanan">Layanan &amp; Harga</Link>.</p>
            <button type="submit" className="gp-add-button" disabled={createEmployee.isPending || !name.trim()} data-testid="button-add-employee"><Plus size={15}/>{createEmployee.isPending ? 'Menambahkan…' : 'Tambahkan ke roster'}</button>
          </form>
          <div className="gp-add-note"><BadgePercent size={15}/><p><strong>Komisi ditetapkan per layanan.</strong> Layanan lama tanpa tarif khusus sementara mengikuti tarif staf sebelumnya.</p></div>
        </aside>
      </section>

      <section className="gp-report" aria-labelledby="employee-report-title">
        <header className="gp-report-head">
          <div><div className="gp-report-kicker"><span className="gp-kicker-line"/>PERINGKAT BERDASARKAN KOMISI TERCATAT</div><h2 id="employee-report-title">Rincian kinerja per staf</h2><p>{salonName} <span>·</span> {selectedPeriodLabel} <span>·</span> Snapshot transaksi selesai</p></div>
          <div className="gp-head-count"><b>{rankedEmployees.length.toString().padStart(2, '0')}</b><span>staf<br/>ditampilkan</span></div>
        </header>
        <div className="gp-table-tools">
          <label className="gp-search"><Search size={15}/><input aria-label="Cari nama staf" placeholder="Cari nama staf…" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} data-testid="input-staff-search"/>{staffSearch && <button type="button" aria-label="Hapus pencarian" onClick={() => setStaffSearch('')}>×</button>}</label>
          <label className="gp-sort"><ArrowDownWideNarrow size={14}/><span>Urutkan</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMetric)} aria-label="Urutkan kinerja">
              <option value="commission">Komisi tertinggi</option>
              <option value="base">Dasar komisi tertinggi</option>
              <option value="services">Layanan terbanyak</option>
              <option value="sales">Transaksi terbanyak</option>
              <option value="name">Nama A–Z</option>
            </select><ChevronDown size={13}/>
          </label>
        </div>

        {isLoading
          ? <div className="gp-empty" role="status">Memuat rincian kinerja…</div>
          : isError
            ? <div className="gp-empty gp-empty-error"><AlertCircle size={22}/><strong>Rincian belum dapat dimuat</strong><span>Periksa koneksi, lalu coba lagi.</span><button type="button" onClick={() => { void employeesQuery.refetch(); void salesQuery.refetch(); }}><RefreshCw size={13}/> Coba lagi</button></div>
            : employees.length === 0
              ? <div className="gp-empty"><Users size={22}/><strong>Belum ada data staf</strong><span>Tambahkan staf untuk mulai melihat rincian kinerja.</span></div>
            : rankedEmployees.length === 0
                ? <div className="gp-empty">
                  {staffSearch.trim() ? <Search size={22}/> : <Users size={22}/>}
                  <strong>{staffSearch.trim() ? 'Staf tidak ditemukan' : 'Belum ada staf aktif'}</strong>
                  <span>{staffSearch.trim() ? 'Coba kata kunci yang berbeda atau hapus pencarian.' : 'Staf nonaktif disembunyikan dari laporan ini.'}</span>
                  {staffSearch.trim()
                    ? <button type="button" onClick={() => setStaffSearch('')}>Hapus pencarian</button>
                    : inactiveCount > 0 && !showInactiveEmployees && <button type="button" onClick={() => setShowInactiveEmployees(true)}>Tampilkan staf nonaktif</button>}
                </div>
                : <div className="gp-table-wrap">
                  <div className="gp-table-header"><span>PERINGKAT &amp; STAF</span><span>LAYANAN</span><span>TRANSAKSI</span><span>DASAR KOMISI</span><span>KOMISI TERCATAT</span><span aria-hidden="true"/></div>
                  <ol className="gp-staff-list">{rankedEmployees.map(({ employee, metric }, index) => {
                    const isExpanded = expandedEmployee === employee.id;
                    const serviceBreakdown = [...metric.serviceBreakdown.values()].sort((a, b) => b.base - a.base || b.quantity - a.quantity || a.name.localeCompare(b.name, 'id'));
                    return <li className={`gp-staff-entry${isExpanded ? ' is-expanded' : ''}`} key={employee.id}>
                      <button type="button" className="gp-staff-row" aria-expanded={isExpanded} aria-controls={`employee-report-details-${employee.id}`} onClick={() => setExpandedEmployee(isExpanded ? null : employee.id)} data-testid={`button-report-employee-${employee.id}`}>
                        <span className="gp-identity">
                          <span className="gp-rank">{String(index + 1).padStart(2, '0')}</span>
                          <span className={`gp-initials${employee.active ? '' : ' is-inactive'}`}>{displayStaffName(employee.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('id-ID')}</span>
                          <span className="gp-person"><strong>{displayStaffName(employee.name)}</strong><span className="gp-staff-state"><i className={employee.active ? 'is-active' : ''}/>{employee.active ? 'Aktif' : 'Nonaktif'}</span><small className="gp-person-stats">{metric.services} layanan <i/> {metric.sales} transaksi</small></span>
                        </span>
                        <span className="gp-cell-number">{metric.services}<small>{metric.missingSnapshotUnits > 0 ? `${metric.missingSnapshotUnits} tanpa snapshot` : 'layanan'}</small></span>
                        <span className="gp-cell-number">{metric.sales}<small>transaksi</small></span>
                        <span className="gp-money">{recordedMoney(metric.base, metric.capturedSnapshotUnits)}<small>{metric.capturedSnapshotUnits} layanan bersnapshot</small></span>
                        <span className="gp-money gp-commission">{recordedMoney(metric.commission, metric.capturedSnapshotUnits)}<small>{metric.missingSnapshotUnits > 0 ? `${metric.missingSnapshotUnits} layanan perlu verifikasi` : metric.capturedSnapshotUnits > 0 ? 'Snapshot tersimpan' : 'Belum ada snapshot'}</small></span>
                        <span className={`gp-expand${isExpanded ? ' is-open' : ''}`}><ChevronDown size={17}/></span>
                      </button>
                      {isExpanded && <div className="gp-detail" id={`employee-report-details-${employee.id}`}>
                        <div className="gp-detail-head"><div><span>RINCIAN LAYANAN</span><strong>{displayStaffName(employee.name)}</strong></div><small>{selectedPeriodLabel} · {salonName}</small></div>
                        {serviceBreakdown.length === 0
                          ? <div className="gp-no-activity">Belum ada layanan yang tercatat untuk staf ini pada periode tersebut.</div>
                          : <div className="gp-service-table">
                            <div className="gp-service-th"><span>Nama layanan</span><span>Jumlah</span><span>Dasar tercatat</span><span>Komisi tercatat</span></div>
                            {serviceBreakdown.map((service) => <div className="gp-service-tr" key={`${employee.id}-${service.name}`}>
                              <span className="gp-service-name">{service.name}{service.missingSnapshotUnits > 0 && <small className="gp-legacy-tag">{service.capturedSnapshotUnits > 0 ? 'Sebagian tanpa snapshot' : 'Snapshot belum tersedia'}</small>}{service.capturedSnapshotUnits > 0 && service.commission === 0 && service.missingSnapshotUnits === 0 && <small className="gp-zero-tag">Snapshot Rp0</small>}</span>
                              <span>{service.quantity}×</span>
                              <span>{service.capturedSnapshotUnits > 0 ? money(service.base) : <i className="gp-dash">—</i>}</span>
                              <strong>{service.capturedSnapshotUnits > 0 ? money(service.commission) : <i className="gp-dash">—</i>}</strong>
                            </div>)}
                          </div>}
                        {metric.missingSnapshotUnits > 0 && <p className="gp-detail-note"><FileWarning size={13}/>Layanan tanpa snapshot tidak masuk ke total komisi dan tidak dihitung ulang memakai tarif saat ini.</p>}
                      </div>}
                    </li>;
                  })}</ol>
                </div>}
        <footer className="gp-report-foot"><div><FileWarning size={14}/><span>Komisi memakai snapshot saat pembayaran; item tanpa staf dikecualikan.</span></div><span>{totalServices} layanan · {totalTransactions} transaksi staf · WIB Jakarta</span></footer>
      </section>
    </div>
  </main>;
}
