import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListCashierAccessPinsQueryKey,
  getListAttendanceStaffQueryKey,
  useListCashierAccessPins,
  useListAttendanceStaff,
  useSetCashierAccessPin,
  useSetEmployeeAttendancePin,
} from '@/lib/api-client';
import type { CashierAccessPinAccount } from '@/lib/api-client';
import { AlertCircle, Check, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { salonDetails, type SalonId } from '@/pos/lib/menu';
import { displayStaffName } from '@/lib/utils';

type Props = { salon: SalonId };
type Feedback = { kind: 'success' | 'error'; message: string };

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'PIN belum berhasil disimpan. Periksa koneksi lalu coba lagi.';
};

export default function StaffSecurityPage({ salon }: Props) {
  const queryClient = useQueryClient();
  const staffQuery = useListAttendanceStaff({ salon });
  const accessPinsQuery = useListCashierAccessPins();
  const saveAccessPinMutation = useSetCashierAccessPin();
  const savePinMutation = useSetEmployeeAttendancePin();
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [feedbackByStaff, setFeedbackByStaff] = useState<Record<string, Feedback>>({});
  const [accessPinDrafts, setAccessPinDrafts] = useState<Record<string, string>>({});
  const [accessFeedback, setAccessFeedback] = useState<Record<string, Feedback>>({});
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [savingAccessId, setSavingAccessId] = useState<string | null>(null);
  const staff = staffQuery.data ?? [];
  const accessAccounts = accessPinsQuery.data ?? [];
  const configuredCount = staff.filter((item) => item.hasPin).length;

  const saveAccessPin = async (account: CashierAccessPinAccount) => {
    const pin = accessPinDrafts[account.id] ?? '';
    if (!/^\d{6}$/.test(pin)) {
      setAccessFeedback((current) => ({
        ...current,
        [account.id]: { kind: 'error', message: 'PIN harus terdiri dari 6 angka.' },
      }));
      return;
    }

    setSavingAccessId(account.id);
    setAccessFeedback((current) => {
      const next = { ...current };
      delete next[account.id];
      return next;
    });

    try {
      await saveAccessPinMutation.mutateAsync({ id: account.id, data: { pin } });
      setAccessPinDrafts((current) => ({ ...current, [account.id]: '' }));
      setAccessFeedback((current) => ({
        ...current,
        [account.id]: { kind: 'success', message: 'PIN akses berhasil disimpan.' },
      }));
      await queryClient.invalidateQueries({ queryKey: getListCashierAccessPinsQueryKey() });
    } catch (error) {
      setAccessFeedback((current) => ({
        ...current,
        [account.id]: { kind: 'error', message: errorMessage(error) },
      }));
    } finally {
      setSavingAccessId(null);
    }
  };

  const savePin = async (employeeId: string) => {
    const pin = pinDrafts[employeeId] ?? '';
    if (!/^\d{6}$/.test(pin)) {
      setFeedbackByStaff((current) => ({
        ...current,
        [employeeId]: { kind: 'error', message: 'PIN harus terdiri dari 6 angka.' },
      }));
      return;
    }

    setSavingStaffId(employeeId);
    setFeedbackByStaff((current) => {
      const next = { ...current };
      delete next[employeeId];
      return next;
    });

    try {
      await savePinMutation.mutateAsync({
        salon,
        id: employeeId,
        data: { pin },
      });
      setPinDrafts((current) => ({ ...current, [employeeId]: '' }));
      setFeedbackByStaff((current) => ({
        ...current,
        [employeeId]: { kind: 'success', message: 'PIN absensi berhasil disimpan.' },
      }));
      await queryClient.invalidateQueries({
        queryKey: getListAttendanceStaffQueryKey({ salon }),
      });
    } catch (error) {
      setFeedbackByStaff((current) => ({
        ...current,
        [employeeId]: { kind: 'error', message: errorMessage(error) },
      }));
    } finally {
      setSavingStaffId(null);
    }
  };

  return <main className="fade-up mx-auto max-w-6xl space-y-5 pb-8" data-testid="page-staff-security">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#bd3c76]">
          <span className="h-px w-5 bg-[#d88cac]"/> Pengaturan akses
        </p>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-.045em] text-[#472538] sm:text-[36px]">Keamanan Sistem</h1>
        <p className="mt-1 text-sm text-[#927789]">Kelola PIN akses akun kasir dan PIN absensi staf {salonDetails[salon].name} di sini.</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-[#efdae5] bg-white px-4 py-3 text-xs font-semibold text-[#65495a] shadow-sm">
        <Users size={16} className="text-[#b93670]"/>
        <span><strong className="text-[#472538]">{configuredCount}</strong> dari <strong className="text-[#472538]">{staff.length}</strong> staf memiliki PIN</span>
      </div>
    </header>

    <section className="overflow-hidden rounded-2xl border border-[#efdae5] bg-white shadow-[0_8px_24px_rgba(92,44,68,.045)]" aria-labelledby="cashier-access-pin-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3e9ee] px-5 py-4">
        <div>
          <h2 id="cashier-access-pin-title" className="font-display text-base font-extrabold text-[#472538]">PIN akses kasir dan Owner</h2>
          <p className="mt-1 text-[11px] text-[#927789]">Atur PIN login akun kasir dan Owner Global. PIN Owner Global hanya dapat diatur dari sesi Owner.</p>
        </div>
        <button
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#e7d5df] bg-white px-3 text-[11px] font-bold text-[#694b60] transition hover:bg-[#fff6f9] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => void accessPinsQuery.refetch()}
          disabled={accessPinsQuery.isFetching || saveAccessPinMutation.isPending}
          data-testid="button-refresh-cashier-access-pins"
        >
          <RefreshCw size={13} className={accessPinsQuery.isFetching ? 'animate-spin' : ''}/> Muat ulang
        </button>
      </div>

      {accessPinsQuery.isLoading
        ? <div className="grid gap-3 p-5" role="status" aria-label="Memuat akun kasir">
          <div className="h-24 animate-pulse rounded-xl bg-[#faf5f7]"/>
        </div>
        : accessPinsQuery.isError
          ? <div className="grid justify-items-center gap-2 p-8 text-center">
            <AlertCircle size={24} className="text-[#b2484f]"/>
            <h3 className="text-sm font-extrabold text-[#472538]">Status PIN akses belum dapat dimuat</h3>
            <p className="text-xs text-[#927789]">Periksa koneksi lalu muat ulang.</p>
            <button className="mt-2 rounded-xl bg-[#b93670] px-4 py-2.5 text-xs font-bold text-white" type="button" onClick={() => void accessPinsQuery.refetch()}>Coba lagi</button>
          </div>
          : accessAccounts.length === 0
            ? <div className="p-6 text-center text-xs text-[#927789]">Tidak ada akun kasir aktif yang dapat diatur.</div>
            : <div className="grid gap-3 p-4 sm:p-5">
              {accessAccounts.map((account) => {
                const feedback = accessFeedback[account.id];
                const isSaving = savingAccessId === account.id;
                return <article key={account.id} className="grid gap-4 rounded-2xl border border-[#f0e3e9] bg-[#fffdfd] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)] sm:items-center" data-testid={`cashier-access-pin-card-${account.id}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f8eaf1] text-[#ad4776]"><KeyRound size={17}/></span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold text-[#472538]">{account.id === 'ownerggs' ? 'Owner Global' : account.name}</h3>
                      <p className="mt-0.5 text-[10px] text-[#927789]">ID akses: {account.id}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${account.role === 'owner' ? 'bg-[#f1eee0] text-[#806b38]' : 'bg-[#eaf0fa] text-[#47618d]'}`}>
                        {account.role === 'owner' ? 'Owner' : 'Admin'}
                      </span>
                      {account.id === 'ownerggs' && <p className="mt-0.5 text-[10px] text-[#927789]">PIN ini memberi akses ke semua salon.</p>}
                      <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${account.hasPin ? 'bg-[#edf7f0] text-[#4e8068]' : 'bg-[#fff5e9] text-[#96642d]'}`}>
                        <LockKeyhole size={11}/>{account.hasPin ? 'PIN akses aktif' : 'PIN akses belum diatur'}
                      </span>
                    </div>
                  </div>

                  <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); void saveAccessPin(account); }}>
                    <label className="sr-only" htmlFor={`cashier-access-pin-${account.id}`}>PIN akses baru untuk {account.name}</label>
                    <input
                      id={`cashier-access-pin-${account.id}`}
                      className="h-11 min-w-0 rounded-xl border border-[#e6d5df] bg-white px-3 text-sm font-semibold tracking-[.18em] text-[#392839] outline-none transition placeholder:tracking-normal placeholder:text-[#b19aaa] focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      value={accessPinDrafts[account.id] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                        setAccessPinDrafts((current) => ({ ...current, [account.id]: value }));
                        setAccessFeedback((current) => {
                          const next = { ...current };
                          delete next[account.id];
                          return next;
                        });
                      }}
                      placeholder="PIN baru · 6 angka"
                      data-testid={`input-cashier-access-pin-${account.id}`}
                    />
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#b93670] px-4 text-[11px] font-extrabold text-white transition hover:bg-[#9f2d61] disabled:cursor-not-allowed disabled:opacity-45"
                      type="submit"
                      disabled={saveAccessPinMutation.isPending || (accessPinDrafts[account.id] ?? '').length !== 6}
                      data-testid={`button-save-cashier-access-pin-${account.id}`}
                    >
                      {isSaving ? <><RefreshCw size={13} className="animate-spin"/> Menyimpan…</> : account.hasPin ? 'Ganti PIN' : 'Atur PIN'}
                    </button>
                    {feedback && <p className={`flex items-start gap-1.5 text-[11px] sm:col-span-2 ${feedback.kind === 'success' ? 'text-[#4e8068]' : 'text-[#b2484f]'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
                      {feedback.kind === 'success' ? <Check size={13} className="mt-0.5 shrink-0"/> : <AlertCircle size={13} className="mt-0.5 shrink-0"/>}
                      {feedback.message}
                    </p>}
                  </form>
                </article>;
              })}
            </div>}
    </section>

    <section className="flex items-start gap-3 rounded-2xl border border-[#e7e8dc] bg-[#fbfcf7] p-4 text-xs leading-relaxed text-[#677158]" aria-label="Informasi keamanan PIN">
      <ShieldCheck size={18} className="mt-0.5 shrink-0"/>
      <p>PIN akses digunakan untuk masuk ke website; PIN absensi untuk check-in dan check-out. Masing-masing PIN dikunci selama 15 menit setelah 5 percobaan salah.</p>
    </section>

    <section className="overflow-hidden rounded-2xl border border-[#efdae5] bg-white shadow-[0_8px_24px_rgba(92,44,68,.045)]" aria-labelledby="staff-pin-list-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3e9ee] px-5 py-4">
        <div>
          <h2 id="staff-pin-list-title" className="font-display text-base font-extrabold text-[#472538]">PIN staf · {salonDetails[salon].name}</h2>
          <p className="mt-1 text-[11px] text-[#927789]">Atur PIN baru atau perbarui PIN staf yang sudah aktif.</p>
        </div>
        <button
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#e7d5df] bg-white px-3 text-[11px] font-bold text-[#694b60] transition hover:bg-[#fff6f9] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => void staffQuery.refetch()}
          disabled={staffQuery.isFetching || savePinMutation.isPending}
          data-testid="button-refresh-staff-security"
        >
          <RefreshCw size={13} className={staffQuery.isFetching ? 'animate-spin' : ''}/> Muat ulang
        </button>
      </div>

      {staffQuery.isLoading
        ? <div className="grid gap-3 p-5" role="status" aria-label="Memuat daftar staf">
          <div className="h-24 animate-pulse rounded-xl bg-[#faf5f7]"/>
          <div className="h-24 animate-pulse rounded-xl bg-[#faf5f7]"/>
        </div>
        : staffQuery.isError
          ? <div className="grid justify-items-center gap-2 p-8 text-center">
            <AlertCircle size={24} className="text-[#b2484f]"/>
            <h3 className="text-sm font-extrabold text-[#472538]">Daftar staf belum dapat dimuat</h3>
            <p className="text-xs text-[#927789]">Periksa koneksi lalu muat ulang daftar staf.</p>
            <button className="mt-2 rounded-xl bg-[#b93670] px-4 py-2.5 text-xs font-bold text-white" type="button" onClick={() => void staffQuery.refetch()}>Coba lagi</button>
          </div>
          : staff.length === 0
            ? <div className="grid justify-items-center gap-2 p-9 text-center">
              <Users size={26} className="text-[#b67a97]"/>
              <h3 className="text-sm font-extrabold text-[#472538]">Belum ada staf aktif</h3>
              <p className="text-xs text-[#927789]">Tambahkan staf aktif terlebih dahulu untuk mengatur PIN absensi.</p>
            </div>
            : <div className="grid gap-3 p-4 sm:p-5">
              {staff.map((employee) => {
                const feedback = feedbackByStaff[employee.id];
                const isSaving = savingStaffId === employee.id;
                return <article key={employee.id} className="grid gap-4 rounded-2xl border border-[#f0e3e9] bg-[#fffdfd] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)] sm:items-center" data-testid={`staff-security-card-${employee.id}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f8eaf1] text-[#ad4776]"><KeyRound size={17}/></span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold text-[#472538]">{displayStaffName(employee.name)}</h3>
                      <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${employee.hasPin ? 'bg-[#edf7f0] text-[#4e8068]' : 'bg-[#fff5e9] text-[#96642d]'}`}>
                        <LockKeyhole size={11}/>{employee.hasPin ? 'PIN aktif' : 'PIN belum diatur'}
                      </span>
                    </div>
                  </div>

                  <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); void savePin(employee.id); }}>
                    <label className="sr-only" htmlFor={`staff-pin-${employee.id}`}>PIN baru untuk {displayStaffName(employee.name)}</label>
                    <input
                      id={`staff-pin-${employee.id}`}
                      className="h-11 min-w-0 rounded-xl border border-[#e6d5df] bg-white px-3 text-sm font-semibold tracking-[.18em] text-[#392839] outline-none transition placeholder:tracking-normal placeholder:text-[#b19aaa] focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      value={pinDrafts[employee.id] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                        setPinDrafts((current) => ({ ...current, [employee.id]: value }));
                        setFeedbackByStaff((current) => {
                          const next = { ...current };
                          delete next[employee.id];
                          return next;
                        });
                      }}
                      placeholder="PIN baru · 6 angka"
                      data-testid={`input-staff-pin-${employee.id}`}
                    />
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#b93670] px-4 text-[11px] font-extrabold text-white transition hover:bg-[#9f2d61] disabled:cursor-not-allowed disabled:opacity-45"
                      type="submit"
                      disabled={savePinMutation.isPending || (pinDrafts[employee.id] ?? '').length !== 6}
                      data-testid={`button-save-staff-pin-${employee.id}`}
                    >
                      {isSaving ? <><RefreshCw size={13} className="animate-spin"/> Menyimpan…</> : employee.hasPin ? 'Perbarui PIN' : 'Atur PIN'}
                    </button>
                    {feedback && <p className={`flex items-start gap-1.5 text-[11px] sm:col-span-2 ${feedback.kind === 'success' ? 'text-[#4e8068]' : 'text-[#b2484f]'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
                      {feedback.kind === 'success' ? <Check size={13} className="mt-0.5 shrink-0"/> : <AlertCircle size={13} className="mt-0.5 shrink-0"/>}
                      {feedback.message}
                    </p>}
                  </form>
                </article>;
              })}
            </div>}
    </section>
  </main>;
}
