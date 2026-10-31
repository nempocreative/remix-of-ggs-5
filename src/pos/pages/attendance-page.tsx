import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAttendanceRecordQueryKey,
  getListAttendanceQueryKey,
  getListAttendanceStaffQueryKey,
  getAuthStatus,
  loginCashier,
  useDeleteAttendanceRecord,
  useGetAttendanceRecord,
  useListAttendance,
  useListAttendanceStaff,
  useRecordAttendancePinAction,
  useUpdateAttendanceRecord,
  useVerifyAttendanceRecord,
  type AttendanceRecord,
} from '@/lib/api-client';
import { AlertCircle, BadgeCheck, CalendarDays, Check, ChevronDown, Clock3, LockKeyhole, RefreshCw, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { SalonId } from '@/pos/lib/menu';
import { displayStaffName } from '@/lib/utils';
import { Link } from '@/pos/router-compat';

type Props = { salon: SalonId };
type AttendanceAction = 'check-in' | 'check-out';
type AdminAction = 'save' | 'delete' | 'verify-check-in' | 'verify-check-out';

const jakartaDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(value);

const displayDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const displayTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—';

const timeInputValue = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
  : '';

const errorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Permintaan belum berhasil. Periksa koneksi lalu coba lagi.';
};

const isCheckInVerified = (record: AttendanceRecord) => Boolean(record.checkInAdminVerifiedAt || record.adminVerifiedAt);
const isCheckOutVerified = (record: AttendanceRecord) => Boolean(record.checkOutAdminVerifiedAt || record.adminVerifiedAt);
const hasAdminVerification = (record: AttendanceRecord) => isCheckInVerified(record) || isCheckOutVerified(record);
const nextVerificationAction = (record: AttendanceRecord): AdminAction | null => {
  if (!isCheckInVerified(record)) return 'verify-check-in';
  if (record.checkOutAt && !isCheckOutVerified(record)) return 'verify-check-out';
  return null;
};
const isVerificationAction = (action: AdminAction) => action === 'verify-check-in' || action === 'verify-check-out';
const verificationActionLabel = (action: AdminAction) => action === 'verify-check-in'
  ? 'Verifikasi jam masuk'
  : 'Verifikasi jam pulang';
const isUnauthorizedError = (error: unknown) => Boolean(
  error && typeof error === 'object' && 'status' in error && error.status === 401,
);

function AttendanceSkeleton() {
  return <div className="att-skeletons" role="status" aria-label="Memuat data absensi">
    <span/><span/><span/>
  </div>;
}

export default function AttendancePage({ salon }: Props) {
  const queryClient = useQueryClient();
  const activeSalon = salon;
  const salonName = activeSalon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const today = useMemo(jakartaDate, []);
  const [date, setDate] = useState(today);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [attendancePin, setAttendancePin] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busyLabel, setBusyLabel] = useState('');
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [editCheckInTime, setEditCheckInTime] = useState('');
  const [editCheckOutTime, setEditCheckOutTime] = useState('');
  const [adminAction, setAdminAction] = useState<AdminAction | null>(null);
  const [adminTargetRecord, setAdminTargetRecord] = useState<AttendanceRecord | null>(null);
  const [adminId, setAdminId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminSessionReady, setAdminSessionReady] = useState(false);
  const [adminSessionLoading, setAdminSessionLoading] = useState(true);

  const staffQuery = useListAttendanceStaff({ salon: activeSalon });
  const reportQuery = useListAttendance({ salon: activeSalon, date });
  const todayQuery = useListAttendance({ salon: activeSalon, date: today });
  const detailQuery = useGetAttendanceRecord(activeSalon, detailRecordId ?? '', {
    query: {
      enabled: !!detailRecordId,
      queryKey: getGetAttendanceRecordQueryKey(activeSalon, detailRecordId ?? ''),
    },
  });
  const recordAttendancePinAction = useRecordAttendancePinAction();
  const updateRecord = useUpdateAttendanceRecord();
  const verifyRecord = useVerifyAttendanceRecord();
  const deleteRecord = useDeleteAttendanceRecord();

  const staff = staffQuery.data ?? [];
  const records = reportQuery.data ?? [];
  const todayRecords = todayQuery.data ?? [];
  const selectedStaff = staff.find((item) => item.id === selectedEmployeeId);
  const detailRecord = detailQuery.data;
  const detailVerificationAction = detailRecord ? nextVerificationAction(detailRecord) : null;
  const detailCheckInVerifiedAt = detailRecord?.checkInAdminVerifiedAt ?? detailRecord?.adminVerifiedAt ?? null;
  const detailCheckInVerifiedBy = detailRecord?.checkInAdminVerifiedBy ?? detailRecord?.adminVerifiedBy ?? null;
  const detailCheckOutVerifiedAt = detailRecord?.checkOutAdminVerifiedAt ?? detailRecord?.adminVerifiedAt ?? null;
  const detailCheckOutVerifiedBy = detailRecord?.checkOutAdminVerifiedBy ?? detailRecord?.adminVerifiedBy ?? null;
  const selectedTodayRecord = todayRecords.find((item) => item.employeeId === selectedEmployeeId);
  const nextAction: AttendanceAction = selectedTodayRecord?.checkInAt && !selectedTodayRecord.checkOutAt ? 'check-out' : 'check-in';
  const checkedInCount = records.filter((item) => item.checkInAt).length;
  const completedCount = records.filter((item) => item.checkOutAt).length;
  useEffect(() => {
    let cancelled = false;
    void getAuthStatus()
      .then((status) => {
        if (!cancelled) setAdminSessionReady(status.authenticated);
      })
      .catch(() => {
        if (!cancelled) setAdminSessionReady(false);
      })
      .finally(() => {
        if (!cancelled) setAdminSessionLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const isBusy = !!busyLabel || adminBusy || adminSessionLoading
    || recordAttendancePinAction.isPending
    || updateRecord.isPending || verifyRecord.isPending || deleteRecord.isPending;

  const refreshAttendance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAttendanceStaffQueryKey({ salon: activeSalon }) }),
      queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ salon: activeSalon, date }) }),
      queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ salon: activeSalon, date: today }) }),
      detailRecordId
        ? queryClient.invalidateQueries({ queryKey: getGetAttendanceRecordQueryKey(activeSalon, detailRecordId) })
        : Promise.resolve(),
    ]);
  };

  const closeRecordDetail = () => {
    if (adminBusy) return;
    setAdminAction(null);
    setAdminTargetRecord(null);
    setDetailRecordId(null);
    setIsEditingRecord(false);
    setAdminId('');
    setAdminPassword('');
    setAdminError('');
  };

  const closeAdminConfirmation = () => {
    if (adminBusy) return;
    setAdminAction(null);
    setAdminTargetRecord(null);
    setAdminId('');
    setAdminPassword('');
    setAdminError('');
  };

  const openRecordDetail = (record: AttendanceRecord) => {
    setDetailRecordId(record.id);
    setIsEditingRecord(false);
    setEditCheckInTime(timeInputValue(record.checkInAt));
    setEditCheckOutTime(timeInputValue(record.checkOutAt));
    setAdminAction(null);
    setAdminTargetRecord(null);
    setAdminError('');
    setError('');
  };

  const performAdminAction = async (action: AdminAction, record: AttendanceRecord) => {
    if (action === 'save') {
      await updateRecord.mutateAsync({
        salon: activeSalon,
        id: record.id,
        data: {
          checkInTime: editCheckInTime,
          checkOutTime: editCheckOutTime || null,
        },
      });
    } else if (action === 'delete') {
      await deleteRecord.mutateAsync({ salon: activeSalon, id: record.id });
    } else {
      const stage = action === 'verify-check-in' ? 'check-in' : 'check-out';
      await verifyRecord.mutateAsync({ salon: activeSalon, id: record.id, data: { stage } });
    }

    setAdminAction(null);
    setAdminTargetRecord(null);
    setDetailRecordId(null);
    setIsEditingRecord(false);
    setAdminId('');
    setAdminPassword('');
    await refreshAttendance();
    setFeedback(action === 'save'
      ? 'Perubahan absensi berhasil disimpan.'
      : action === 'delete'
        ? 'Data absensi berhasil dihapus.'
        : action === 'verify-check-in'
          ? 'Jam masuk berhasil diverifikasi admin.'
          : 'Jam pulang berhasil diverifikasi admin.');
  };

  const runWithAdminSession = async (action: AdminAction, record: AttendanceRecord) => {
    setAdminBusy(true);
    setError('');
    try {
      await performAdminAction(action, record);
    } catch (caught) {
      if (isVerificationAction(action) && isUnauthorizedError(caught)) {
        setAdminSessionReady(false);
        setAdminTargetRecord(record);
        setAdminAction(action);
        setAdminId('');
        setAdminPassword('');
        setAdminError('Sesi kasir berakhir. Masuk lagi untuk melanjutkan verifikasi.');
      } else {
        setError(errorText(caught));
      }
    } finally {
      setAdminBusy(false);
    }
  };

  const requestAdminAction = (action: AdminAction, record = detailRecord) => {
    if (!record) return;
    if ((action === 'save' || action === 'delete') && hasAdminVerification(record)) return;
    if (action === 'verify-check-in' && isCheckInVerified(record)) return;
    if (action === 'verify-check-out') {
      if (!record.checkOutAt) {
        setError('Staf perlu check-out dengan PIN sebelum jam pulang diverifikasi.');
        return;
      }
      if (!isCheckInVerified(record)) {
        setError('Verifikasi jam masuk terlebih dahulu.');
        return;
      }
      if (isCheckOutVerified(record)) return;
    }

    setAdminTargetRecord(record);
    setAdminId('');
    setAdminPassword('');
    setAdminError('');
    setError('');
    if (isVerificationAction(action) && adminSessionReady) {
      setAdminAction(null);
      void runWithAdminSession(action, record);
      return;
    }
    setAdminAction(action);
  };

  const confirmAdminAction = async () => {
    if (!adminTargetRecord || !adminAction) return;
    if (!adminId.trim() || !adminPassword) {
      setAdminError('Masukkan ID dan kata sandi kasir untuk melanjutkan.');
      return;
    }

    const action = adminAction;
    const record = adminTargetRecord;
    setAdminBusy(true);
    setAdminError('');
    try {
      if (!isVerificationAction(action) || !adminSessionReady) {
        await loginCashier({ id: adminId.trim(), password: adminPassword });
        setAdminSessionReady(true);
      }
      await performAdminAction(action, record);
    } catch (caught) {
      if (isVerificationAction(action) && isUnauthorizedError(caught)) {
        setAdminSessionReady(false);
        setAdminError('Sesi kasir berakhir. Periksa ID dan kata sandi, lalu coba lagi.');
      } else {
        setAdminError(errorText(caught));
      }
      setAdminPassword('');
    } finally {
      setAdminBusy(false);
    }
  };

  const runAction = async (action: AttendanceAction) => {
    if (!selectedStaff) {
      setError('Pilih nama staf terlebih dahulu.');
      return;
    }
    if (!selectedStaff.hasPin) {
      setError('PIN absensi belum diatur. Minta kasir mengatur PIN staf ini.');
      return;
    }
    if (!/^\d{6}$/.test(attendancePin)) {
      setError('Masukkan PIN absensi 6 angka.');
      return;
    }
    setError('');
    setFeedback('');
    setBusyLabel(action === 'check-in' ? 'Mencatat masuk…' : 'Mencatat pulang…');
    try {
      await recordAttendancePinAction.mutateAsync({
        data: {
          salon: activeSalon,
          employeeId: selectedStaff.id,
          action,
          pin: attendancePin,
        },
      });
      setAttendancePin('');
      setFeedback(`${displayStaffName(selectedStaff.name)} berhasil ${action === 'check-in' ? 'check-in' : 'check-out'} hari ini.`);
      await refreshAttendance();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusyLabel('');
    }
  };

  return <div className="attendance-page fade-up" data-testid="page-attendance">
    <style>{`
      .attendance-page{--att-ink:#392839;--att-muted:#8e7788;--att-pink:#b93670;--att-pink-dark:#9f2d61;--att-line:#ecdde5;--att-soft:#fff7fa;--att-paper:#fffdfd;--att-green:#4e8068;color:var(--att-ink);font-family:inherit}
      .attendance-page *{box-sizing:border-box}
      .att-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 0 22px}
      .att-head h1{margin:0;font-family:var(--font-display,inherit);font-size:clamp(28px,4vw,38px);line-height:1.05;letter-spacing:-.045em;color:#45243a}
      .att-head p{margin:9px 0 0;color:var(--att-muted);font-size:13px;line-height:1.6}
      .att-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.82fr);gap:16px;align-items:start}
      .att-main-column,.att-side-column{display:grid;gap:16px;min-width:0}
      .att-panel{overflow:hidden;border:1px solid var(--att-line);border-radius:19px;background:#fff;box-shadow:0 8px 24px rgba(92,44,68,.045)}
      .att-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 19px;border-bottom:1px solid #f3e9ee}
      .att-panel-head h2{margin:0;font-size:15px;font-family:var(--font-display,inherit);font-weight:850;letter-spacing:-.025em}
      .att-panel-head p{margin:4px 0 0;font-size:11px;color:var(--att-muted)}
      .att-panel-body{padding:18px 19px}
      .att-label{display:block;margin:0 0 7px;font-size:10px;font-weight:850;letter-spacing:.08em;color:#896d80;text-transform:uppercase}
      .att-select-wrap{position:relative}
       .att-select-wrap select{width:100%;min-width:0;appearance:none;padding:12px 40px 12px 13px;border:1px solid #e6d5df;border-radius:12px;background:#fff;color:var(--att-ink);font-family:inherit;font-size:13px;font-weight:600;text-overflow:ellipsis;outline:none}
      .att-select-wrap select:focus,.att-date-input:focus,.att-input:focus{border-color:#c36891;box-shadow:0 0 0 3px rgba(185,54,112,.09)}
      .att-select-wrap svg{position:absolute;right:13px;top:50%;transform:translateY(-50%);pointer-events:none;color:#9e7e91}
      .att-staff-meta{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:10px;color:#957b8b}
      .att-staff-meta i{width:6px;height:6px;border-radius:50%;background:var(--att-green)}
      .att-action-card{margin-top:16px;padding:16px;border:1px solid #f0d7e2;border-radius:15px;background:linear-gradient(135deg,#fff9fb,#fff)}
      .att-action-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .att-action-title{display:flex;gap:11px;align-items:center}
      .att-action-icon{display:grid;width:39px;height:39px;place-items:center;border-radius:12px;background:#f8e9f0;color:var(--att-pink)}
      .att-action-title h3{margin:0;font-size:13px;font-weight:850}.att-action-title p{margin:4px 0 0;font-size:10px;color:var(--att-muted)}
      .att-next-label{border:1px solid #d6e9de;border-radius:99px;background:#f3faf6;padding:6px 9px;font-size:9px;font-weight:850;color:#4e8068}
      .att-auth-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end;margin-top:16px}
       .att-input{width:100%;height:43px;padding:0 12px;border:1px solid #e6d5df;border-radius:11px;background:#fff;color:var(--att-ink);font-family:inherit;font-size:14px;font-weight:600;outline:none}
       .att-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 15px;border:0;border-radius:11px;background:var(--att-pink);color:#fff;font-family:inherit;font-size:11px;font-weight:750;cursor:pointer;transition:background .18s,transform .18s}
      .att-button:hover:not(:disabled){background:var(--att-pink-dark);transform:translateY(-1px)}
      .att-button:disabled{cursor:not-allowed;opacity:.48}
      .att-button--outline{border:1px solid #e7d5df;background:#fff;color:#694b60}.att-button--outline:hover:not(:disabled){background:#fff6f9;color:var(--att-pink-dark)}
      .att-button--soft{background:#f9edf2;color:#9e3567}.att-button--soft:hover:not(:disabled){background:#f4dfe9}
      .att-full{width:100%;margin-top:9px}
      .att-hint{margin:9px 0 0;font-size:10px;line-height:1.5;color:#9b8292}
      .att-action-divider{display:flex;align-items:center;gap:10px;margin:13px 0;color:#ad97a5;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .att-action-divider:before,.att-action-divider:after{height:1px;flex:1;background:#f0e5eb;content:''}
      .att-notice{display:flex;align-items:flex-start;gap:8px;margin:0 0 14px;padding:10px 12px;border-radius:11px;font-size:11px;line-height:1.5}
      .att-notice--error{border:1px solid #f1d2d4;background:#fff7f7;color:#a6444b}.att-notice--success{border:1px solid #d5e8dd;background:#f6fbf7;color:#4e8068}
      .att-notice svg{flex:none;margin-top:1px}
      .att-summary{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0 19px 16px}
      .att-stat{padding:12px;border:1px solid #f0e4ea;border-radius:13px;background:#fffafb}
      .att-stat span{display:block;color:#9a7f90;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .att-stat strong{display:block;margin-top:5px;font-family:var(--font-display,inherit);font-size:22px;letter-spacing:-.04em}
      .att-table-wrap{overflow:auto}
      .att-table{width:100%;border-collapse:collapse;min-width:730px}
      .att-table th{padding:10px 12px;background:#fffafb;color:#a08394;font-size:9px;font-weight:850;letter-spacing:.1em;text-align:left;text-transform:uppercase}
      .att-table td{padding:13px 12px;border-top:1px solid #f4ebef;font-size:11px;white-space:nowrap}
      .att-table th:last-child,.att-table td:last-child{width:210px}
      .att-employee-cell{display:flex;align-items:center;gap:9px}
      .att-avatar{display:grid;width:31px;height:31px;flex:none;place-items:center;border-radius:10px;background:#f8eaf1;color:#a9366b;font-size:10px;font-weight:900}
      .att-employee-name{font-weight:800;color:#50364a}
      .att-status{display:inline-flex;align-items:center;gap:5px;border-radius:99px;background:#f2f8f4;padding:5px 8px;color:#4c8065;font-size:9px;font-weight:850}
      .att-status.is-open{background:#fff5e9;color:#a06a25}.att-status.is-empty{background:#f7f1f4;color:#9a8191}
      .att-status-stack{display:grid;justify-items:start;gap:5px}
      .att-admin-status{display:inline-flex;align-items:center;gap:5px;color:#9a8191;font-size:9px;font-weight:750}
      .att-admin-status.is-verified{color:#4c8065}
      .att-detail-button{min-height:33px;padding:0 11px;border:1px solid #e7d5df;border-radius:9px;background:#fff;color:#694b60;font-family:inherit;font-size:10px;font-weight:800;cursor:pointer}
      .att-detail-button:hover{border-color:#c36891;background:#fff6f9;color:var(--att-pink-dark)}
      .att-row-actions{display:flex;align-items:center;gap:7px}
      .att-inline-verify-group{display:grid;justify-items:start;gap:4px}
      .att-inline-verify{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:33px;padding:0 10px;border:1px solid #d5e8dd;border-radius:9px;background:#f6fbf7;color:#4e8068;font-family:inherit;font-size:10px;font-weight:800;white-space:nowrap;cursor:pointer}
      .att-inline-verify:hover:not(:disabled){background:#eaf5ee}
      .att-inline-verify:disabled{cursor:not-allowed;opacity:.52}
      .att-inline-verify-hint{color:#9a8191;font-size:8px;line-height:1.3}
      .att-inline-lock{display:inline-flex;align-items:center;gap:5px;color:#4e8068;font-size:9px;font-weight:800;white-space:nowrap}
      .att-mobile-list{display:none}
      .att-mobile-card{display:grid;gap:12px;padding:13px;border:1px solid #f0e4ea;border-radius:13px;background:#fff}
      .att-mobile-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .att-mobile-time-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .att-mobile-time{padding:9px 10px;border-radius:10px;background:#fffafb}
      .att-mobile-time span{display:block;color:#9a7f90;font-size:8px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
      .att-mobile-time strong{display:block;margin-top:4px;color:#50364a;font-size:12px}
      .att-modal-backdrop{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:20px;background:rgba(43,26,39,.46);backdrop-filter:blur(3px)}
      .att-modal-backdrop--confirm{z-index:51;background:rgba(43,26,39,.62)}
      .att-modal{width:min(100%,520px);max-height:min(90vh,760px);overflow:auto;border:1px solid #ecdde5;border-radius:20px;background:#fffdfd;box-shadow:0 24px 80px rgba(43,26,39,.24)}
      .att-modal--confirm{width:min(100%,420px)}
      .att-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 22px 15px;border-bottom:1px solid #f3e9ee}
      .att-modal-head h2{margin:0;color:#45243a;font-family:var(--font-display,inherit);font-size:19px;letter-spacing:-.03em}
      .att-modal-head p{margin:5px 0 0;color:var(--att-muted);font-size:11px;line-height:1.5}
      .att-modal-close{display:grid;width:34px;height:34px;flex:none;place-items:center;border:1px solid #eadce4;border-radius:10px;background:#fff;color:#73586b;cursor:pointer}
      .att-modal-body{display:grid;gap:15px;padding:18px 22px}
      .att-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .att-detail-item{min-width:0;padding:12px;border:1px solid #f0e4ea;border-radius:12px;background:#fffafb}
      .att-detail-item span{display:block;color:#9a7f90;font-size:9px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}
      .att-detail-item strong{display:block;margin-top:5px;overflow-wrap:anywhere;color:#50364a;font-size:12px}
      .att-verification-note{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border:1px solid #eadde5;border-radius:11px;background:#fbf7f9;color:#876e7e;font-size:10px;line-height:1.5}
      .att-verification-note.is-verified{border-color:#d5e8dd;background:#f6fbf7;color:#4e8068}
      .att-verification-note svg{flex:none;margin-top:1px}
      .att-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .att-modal-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:15px 22px 20px;border-top:1px solid #f3e9ee}
      .att-admin-form{display:grid;gap:13px;padding:18px 22px 20px}
      .att-admin-form .att-input{height:42px;letter-spacing:normal}
      .att-confirm-copy{margin:0;color:#765f70;font-size:11px;line-height:1.6}
      .att-modal-error{margin:0;padding:10px 11px;border:1px solid #f1d2d4;border-radius:10px;background:#fff7f7;color:#a6444b;font-size:10px;line-height:1.5}
      .att-modal-skeleton{padding:28px 22px;color:#8e7788;font-size:12px}
      .att-date-tools{display:flex;align-items:center;gap:9px}
       .att-date-input{height:35px;padding:0 9px;border:1px solid #e8dbe3;border-radius:9px;background:#fff;color:#654b5e;font-family:inherit;font-size:11px;font-weight:600;outline:none}
      .att-list-state{padding:29px 20px;text-align:center;color:#957c8c}
      .att-list-state svg{color:#bd7a9b}.att-list-state h3{margin:9px 0 5px;color:#573e51;font-size:13px}.att-list-state p{max-width:300px;margin:0 auto;font-size:10px;line-height:1.55}
      .att-skeletons{display:grid;gap:8px;padding:17px 19px}.att-skeletons span{height:47px;border-radius:10px;background:linear-gradient(90deg,#faf2f6,#f4e9ef,#faf2f6);background-size:200% 100%;animation:att-shimmer 1.4s ease-in-out infinite}
      @keyframes att-shimmer{to{background-position:-200% 0}}
      .att-setup{padding:17px 18px}
      .att-setup-intro{display:flex;gap:10px;align-items:flex-start;margin-bottom:14px}
      .att-setup-mark{display:grid;width:35px;height:35px;flex:none;place-items:center;border-radius:11px;background:#f8eaf1;color:var(--att-pink)}
      .att-setup-intro h3{margin:0;font-size:12px;font-weight:850}.att-setup-intro p{margin:4px 0 0;font-size:10px;line-height:1.5;color:#957d8c}
      .att-pin-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .att-pin-row .att-button{min-width:94px}
      .att-setup-actions{display:grid;gap:8px;margin-top:10px}
      .att-setup-status{display:flex;align-items:center;gap:7px;margin-top:12px;padding-top:12px;border-top:1px solid #f2e8ed;color:#8d7384;font-size:10px}
      .att-setup-status strong{color:#5a4053}
      .att-privacy{display:flex;gap:9px;padding:13px;border:1px solid #e7e8dc;border-radius:13px;background:#fbfcf7;color:#677158;font-size:10px;line-height:1.55}
      .att-privacy svg{flex:none}
      @media(max-width:900px){.att-layout{grid-template-columns:1fr}.att-side-column{grid-template-columns:1fr 1fr;align-items:start}}
       @media(max-width:620px){.att-head{align-items:flex-start;flex-direction:column;margin-bottom:16px}.att-layout,.att-main-column,.att-side-column{gap:12px}.att-side-column{grid-template-columns:1fr}.att-panel{border-radius:16px}.att-panel-head{padding:15px}.att-panel-body{padding:15px}.att-summary{padding:0 15px 14px}.att-action-card{padding:13px}.att-auth-row{grid-template-columns:1fr}.att-auth-row .att-button{width:100%}.att-date-tools{align-items:flex-end;flex-direction:column}.att-date-input{width:130px}.att-pin-row{grid-template-columns:1fr}.att-pin-row .att-button{width:100%}.att-table-wrap{display:none}.att-mobile-list{display:grid;gap:9px;padding:0 15px 15px}.att-modal-backdrop{padding:12px}.att-modal-head,.att-modal-body{padding-left:16px;padding-right:16px}.att-modal-actions{padding-left:16px;padding-right:16px}.att-modal-actions>.att-button{flex:1}.att-modal-actions>.att-verification-note{width:100%;margin-right:0!important}}
    `}</style>

    <header className="att-head">
      <div>
        <h1>Absensi staf</h1>
        <p>Catat jam kerja dan tinjau kehadiran staf.</p>
      </div>
    </header>

    {(error || feedback) && <div className={`att-notice ${error ? 'att-notice--error' : 'att-notice--success'}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertCircle size={15}/> : <Check size={15}/>}<span>{error || feedback}</span>
    </div>}

    <div className="att-layout">
      <div className="att-main-column">
        <section className="att-panel" aria-labelledby="att-mark-title">
          <div className="att-panel-head">
              <div><h2 id="att-mark-title">Catat kehadiran</h2><p>{displayDate(today)} · WIB</p></div>
          </div>
          <div className="att-panel-body">
            {staffQuery.isLoading ? <AttendanceSkeleton/> : staffQuery.isError
              ? <div className="att-list-state"><AlertCircle size={24}/><h3>Daftar staf belum tersedia</h3><p>Periksa koneksi lalu muat ulang.</p><button className="att-button att-button--outline" type="button" onClick={() => void staffQuery.refetch()}><RefreshCw size={13}/> Muat ulang</button></div>
              : staff.length === 0
                ? <div className="att-list-state"><Users size={25}/><h3>Belum ada staf aktif</h3><p>Tambahkan staf aktif di Tim.</p></div>
                : <>
                  <label className="att-label" htmlFor="attendance-staff">Pilih nama staf</label>
                  <div className="att-select-wrap">
                    <select id="attendance-staff" value={selectedEmployeeId} onChange={(event) => { setSelectedEmployeeId(event.target.value); setAttendancePin(''); setError(''); setFeedback(''); }} data-testid="select-attendance-staff">
                       <option value="">Pilih staf</option>
                      {staff.map((item) => <option key={item.id} value={item.id}>{displayStaffName(item.name)}</option>)}
                    </select><ChevronDown size={16}/>
                  </div>
                   {selectedStaff && <div className="att-staff-meta"><i/> PIN absensi {selectedStaff.hasPin ? 'sudah aktif' : 'belum diatur'}</div>}
                  {selectedStaff && <div className="att-action-card">
                    <div className="att-action-top">
                      <div className="att-action-title">
                        <span className="att-action-icon"><Clock3 size={18}/></span>
                        <div><h3>{nextAction === 'check-in' ? 'Mulai jam kerja' : 'Akhiri jam kerja'}</h3><p>{selectedTodayRecord?.checkInAt && nextAction === 'check-out' ? `Masuk pukul ${displayTime(selectedTodayRecord.checkInAt)}` : 'Verifikasi untuk mencatat absensi.'}</p></div>
                      </div>
                      <span className="att-next-label">{nextAction === 'check-in' ? 'CHECK-IN' : 'CHECK-OUT'}</span>
                    </div>
                    {selectedTodayRecord?.checkOutAt
                      ? <p className="att-hint">Absensi {displayStaffName(selectedStaff.name)} hari ini selesai. Masuk {displayTime(selectedTodayRecord.checkInAt)} · pulang {displayTime(selectedTodayRecord.checkOutAt)}.</p>
                      : selectedStaff.hasPin
                        ? <>
                          <label className="att-label" htmlFor="attendance-action-pin">PIN absensi · 6 angka</label>
                          <div className="att-pin-row">
                            <input id="attendance-action-pin" className="att-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={attendancePin} onChange={(event) => setAttendancePin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Masukkan PIN" data-testid="input-attendance-pin"/>
                            <button className="att-button" type="button" disabled={isBusy || attendancePin.length !== 6} onClick={() => void runAction(nextAction)} data-testid={`button-attendance-${nextAction}-pin`}>{busyLabel || (nextAction === 'check-in' ? 'Masuk dengan PIN' : 'Pulang dengan PIN')}</button>
                          </div>
                        </>
                        : <p className="att-hint">PIN absensi belum diatur. <Link href="/keamanan-sistem" className="font-bold text-[#a9366b] underline underline-offset-2">Atur di Keamanan Sistem</Link>.</p>}
                  </div>}
                </>}
          </div>
        </section>

        <section className="att-panel" aria-labelledby="att-records-title">
          <div className="att-panel-head">
            <div><h2 id="att-records-title">Rekap harian</h2><p>{salonName} · {date === today ? 'Hari ini' : displayDate(date)}</p></div>
            <label className="att-date-tools" htmlFor="attendance-date"><span className="att-label" style={{ margin: 0 }}>Tanggal</span><input id="attendance-date" className="att-date-input" type="date" max={today} value={date} onChange={(event) => setDate(event.target.value || today)} data-testid="input-attendance-date"/></label>
          </div>
          <div className="att-summary">
            <div className="att-stat"><span>Sudah check-in</span><strong>{reportQuery.isLoading ? '—' : checkedInCount}</strong></div>
            <div className="att-stat"><span>Sudah check-out</span><strong>{reportQuery.isLoading ? '—' : completedCount}</strong></div>
          </div>
          {reportQuery.isLoading ? <AttendanceSkeleton/> : reportQuery.isError
            ? <div className="att-list-state"><AlertCircle size={23}/><h3>Rekap belum dapat dimuat</h3><p>Coba muat ulang data absensi untuk tanggal ini.</p><button className="att-button att-button--outline" type="button" onClick={() => void reportQuery.refetch()}><RefreshCw size={13}/> Coba lagi</button></div>
            : records.length === 0
              ? <div className="att-list-state"><CalendarDays size={24}/><h3>Belum ada catatan kehadiran</h3></div>
              : <div className="att-table-wrap"><table className="att-table">
                <thead><tr><th>Staf</th><th>Masuk</th><th>Pulang</th><th>Status absensi</th><th>Aksi</th></tr></thead>
                <tbody>{records.map((record: AttendanceRecord) => {
                  const employeeName = displayStaffName(record.employeeName);
                  const initials = employeeName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase('id');
                  return <tr key={record.id} data-testid={`row-attendance-${record.employeeId}`}>
                    <td><div className="att-employee-cell"><span className="att-avatar">{initials || <UserRound size={14}/>}</span><span className="att-employee-name">{employeeName}</span></div></td>
                    <td>{displayTime(record.checkInAt)}</td><td>{displayTime(record.checkOutAt)}</td>
                    <td><div className="att-status-stack">
                      <span className={`att-status${record.checkOutAt ? '' : ' is-open'}`}>{record.checkOutAt ? <><BadgeCheck size={12}/> Lengkap</> : <><Clock3 size={12}/> Sedang bekerja</>}</span>
                      <span className={`att-admin-status${isCheckInVerified(record) ? ' is-verified' : ''}`}>{isCheckInVerified(record) ? <BadgeCheck size={11}/> : <Clock3 size={11}/>} Masuk {isCheckInVerified(record) ? 'terverifikasi' : 'belum diverifikasi'}</span>
                      {record.checkOutAt && <span className={`att-admin-status${isCheckOutVerified(record) ? ' is-verified' : ''}`}>{isCheckOutVerified(record) ? <BadgeCheck size={11}/> : <Clock3 size={11}/>} Pulang {isCheckOutVerified(record) ? 'terverifikasi' : 'belum diverifikasi'}</span>}
                    </div></td>
                    <td><div className="att-row-actions">
                      <button className="att-detail-button" type="button" onClick={() => openRecordDetail(record)} aria-label={`Lihat detail absensi ${employeeName}`} data-testid={`button-attendance-detail-${record.employeeId}`}>Detail</button>
                      {nextVerificationAction(record)
                        ? <div className="att-inline-verify-group">
                          <button className="att-inline-verify" type="button" disabled={isBusy} title={`${verificationActionLabel(nextVerificationAction(record)!)} dan kunci data absensi`} onClick={() => requestAdminAction(nextVerificationAction(record)!, record)} aria-label={`${verificationActionLabel(nextVerificationAction(record)!)} untuk ${employeeName}`} data-testid={`button-verify-attendance-row-${record.employeeId}`}><BadgeCheck size={12}/>{verificationActionLabel(nextVerificationAction(record)!)}</button>
                          {!record.checkOutAt && <span className="att-inline-verify-hint">Check-out tetap bisa dengan PIN</span>}
                        </div>
                        : hasAdminVerification(record)
                          ? <div className="att-inline-verify-group">
                            <span className="att-inline-lock"><LockKeyhole size={11}/> Terkunci</span>
                            {!record.checkOutAt && <span className="att-inline-verify-hint">Check-out tetap bisa dengan PIN</span>}
                          </div>
                          : null}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table></div>}
          {!reportQuery.isLoading && !reportQuery.isError && records.length > 0 && <div className="att-mobile-list">
            {records.map((record: AttendanceRecord) => {
              const employeeName = displayStaffName(record.employeeName);
              const initials = employeeName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase('id');
              return <article className="att-mobile-card" key={`mobile-${record.id}`} data-testid={`mobile-row-attendance-${record.employeeId}`}>
                <div className="att-mobile-card-head">
                  <div className="att-employee-cell"><span className="att-avatar">{initials || <UserRound size={14}/>}</span><span className="att-employee-name">{employeeName}</span></div>
                  <button className="att-detail-button" type="button" onClick={() => openRecordDetail(record)} aria-label={`Lihat detail absensi ${employeeName}`} data-testid={`mobile-button-attendance-detail-${record.employeeId}`}>Detail</button>
                </div>
                <div className="att-mobile-time-grid">
                  <div className="att-mobile-time"><span>Masuk</span><strong>{displayTime(record.checkInAt)}</strong></div>
                  <div className="att-mobile-time"><span>Pulang</span><strong>{displayTime(record.checkOutAt)}</strong></div>
                </div>
                <div className="att-status-stack">
                  <span className={`att-status${record.checkOutAt ? '' : ' is-open'}`}>{record.checkOutAt ? <><BadgeCheck size={12}/> Lengkap</> : <><Clock3 size={12}/> Sedang bekerja</>}</span>
                  <span className={`att-admin-status${isCheckInVerified(record) ? ' is-verified' : ''}`}>{isCheckInVerified(record) ? <BadgeCheck size={11}/> : <Clock3 size={11}/>} Masuk {isCheckInVerified(record) ? 'terverifikasi' : 'belum diverifikasi'}</span>
                  {record.checkOutAt && <span className={`att-admin-status${isCheckOutVerified(record) ? ' is-verified' : ''}`}>{isCheckOutVerified(record) ? <BadgeCheck size={11}/> : <Clock3 size={11}/>} Pulang {isCheckOutVerified(record) ? 'terverifikasi' : 'belum diverifikasi'}</span>}
                </div>
                {nextVerificationAction(record)
                  ? <div className="att-inline-verify-group" style={{ width: '100%' }}>
                    <button className="att-inline-verify" style={{ width: '100%' }} type="button" disabled={isBusy} title={`${verificationActionLabel(nextVerificationAction(record)!)} dan kunci data absensi`} onClick={() => requestAdminAction(nextVerificationAction(record)!, record)} aria-label={`${verificationActionLabel(nextVerificationAction(record)!)} untuk ${employeeName}`} data-testid={`mobile-button-verify-attendance-${record.employeeId}`}><BadgeCheck size={12}/>{verificationActionLabel(nextVerificationAction(record)!)}</button>
                    {!record.checkOutAt && <span className="att-inline-verify-hint">Check-out tetap bisa dengan PIN</span>}
                  </div>
                  : hasAdminVerification(record) && !record.checkOutAt
                    ? <span className="att-inline-verify-hint">Check-out tetap bisa dengan PIN</span>
                    : null}
              </article>;
            })}
          </div>}
        </section>
      </div>

      <aside className="att-side-column">
        <section className="att-panel" aria-labelledby="att-security-title">
          <div className="att-panel-head"><div><h2 id="att-security-title">Keamanan Sistem</h2><p>Pengaturan PIN terpusat</p></div><ShieldCheck size={18} color="#ad4776"/></div>
          <div className="att-setup">
            <div className="att-setup-intro"><span className="att-setup-mark"><LockKeyhole size={16}/></span><div><h3>Kelola semua PIN di satu menu</h3><p>Atur atau ubah PIN absensi staf GGS Beauty dan GGS Hair Studio di menu khusus.</p></div></div>
            <Link href="/keamanan-sistem" className="att-button att-button--soft att-full">Buka Keamanan Sistem</Link>
            <p className="att-hint">PIN terdiri dari 6 angka. Lima percobaan salah akan mengunci PIN selama 15 menit.</p>
          </div>
        </section>

        <div className="att-privacy"><ShieldCheck size={16}/><span>PIN diverifikasi saat check-in dan check-out; pengaturan PIN tersedia di menu Keamanan Sistem.</span></div>
      </aside>
    </div>

    {detailRecordId && <div className="att-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRecordDetail(); }}>
      <section className="att-modal" role="dialog" aria-modal="true" aria-labelledby="att-detail-title" data-testid="dialog-attendance-detail">
        <div className="att-modal-head">
          <div><h2 id="att-detail-title">Detail absensi</h2><p>Tinjau catatan sebelum admin mengesahkannya.</p></div>
          <button className="att-modal-close" type="button" aria-label="Tutup detail" onClick={closeRecordDetail}><span aria-hidden="true">×</span></button>
        </div>
        {detailQuery.isLoading ? <div className="att-modal-skeleton" role="status">Memuat detail absensi…</div>
          : detailQuery.isError || !detailRecord
            ? <div className="att-modal-body"><div className="att-notice att-notice--error"><AlertCircle size={15}/><span>Detail absensi tidak dapat dimuat. Tutup lalu buka kembali data ini.</span></div></div>
            : <>
              <div className="att-modal-body">
                <div className="att-detail-grid">
                  <div className="att-detail-item"><span>Nama staf</span><strong>{displayStaffName(detailRecord.employeeName)}</strong></div>
                  <div className="att-detail-item"><span>Salon</span><strong>{salonName}</strong></div>
                  <div className="att-detail-item"><span>Tanggal kerja</span><strong>{displayDate(detailRecord.workDate)}</strong></div>
                  <div className="att-detail-item"><span>Jam masuk</span><strong>{displayTime(detailRecord.checkInAt)}</strong></div>
                  <div className="att-detail-item"><span>Jam pulang</span><strong>{displayTime(detailRecord.checkOutAt)}</strong></div>
                  <div className="att-detail-item"><span>Status kerja</span><strong>{detailRecord.checkOutAt ? 'Selesai' : 'Sedang bekerja'}</strong></div>
                </div>
                <div className={`att-verification-note${hasAdminVerification(detailRecord) ? ' is-verified' : ''}`}>
                  {hasAdminVerification(detailRecord) ? <BadgeCheck size={15}/> : <Clock3 size={15}/>}
                  <span>
                    {isCheckInVerified(detailRecord)
                      ? `Jam masuk terverifikasi${detailCheckInVerifiedBy ? ` oleh ${detailCheckInVerifiedBy}` : ''}${detailCheckInVerifiedAt ? ` · ${displayDate(detailCheckInVerifiedAt)}, ${displayTime(detailCheckInVerifiedAt)}` : ''}.`
                      : 'Jam masuk belum diverifikasi admin.'}
                    {detailRecord.checkOutAt
                      ? ` Jam pulang ${isCheckOutVerified(detailRecord)
                        ? `terverifikasi${detailCheckOutVerifiedBy ? ` oleh ${detailCheckOutVerifiedBy}` : ''}${detailCheckOutVerifiedAt ? ` · ${displayDate(detailCheckOutVerifiedAt)}, ${displayTime(detailCheckOutVerifiedAt)}` : ''}.`
                        : 'belum diverifikasi admin.'}`
                      : ''}
                    {!hasAdminVerification(detailRecord) && ' Catatan masih bisa diedit atau dihapus.'}
                  </span>
                </div>
                {!detailRecord.checkOutAt && <p className="att-confirm-copy">Admin dapat memverifikasi sekarang; staf tetap bisa check-out dengan PIN.</p>}
                {isEditingRecord && !hasAdminVerification(detailRecord) && <>
                  <p className="att-confirm-copy">Jam masuk dan pulang dapat diubah. Nama staf dan tanggal mengikuti catatan awal.</p>
                  <div className="att-edit-grid">
                    <label><span className="att-label">Jam masuk</span><input className="att-input" type="time" value={editCheckInTime} onChange={(event) => setEditCheckInTime(event.target.value)} data-testid="input-edit-attendance-check-in"/></label>
                    <label><span className="att-label">Jam pulang</span><input className="att-input" type="time" value={editCheckOutTime} onChange={(event) => setEditCheckOutTime(event.target.value)} data-testid="input-edit-attendance-check-out"/></label>
                  </div>
                </>}
              </div>
              <div className="att-modal-actions">
                {hasAdminVerification(detailRecord)
                  ? <>
                    <div className="att-verification-note is-verified" style={{ marginRight: 'auto' }}><LockKeyhole size={14}/><span>{detailRecord.checkOutAt ? 'Data terkunci dan tidak bisa diedit atau dihapus.' : 'Data terkunci dari edit dan hapus; staf tetap bisa check-out dengan PIN.'}</span></div>
                    {detailVerificationAction && <button className="att-button att-button--soft" type="button" disabled={isBusy} onClick={() => requestAdminAction(detailVerificationAction, detailRecord)} data-testid="button-verify-attendance">{verificationActionLabel(detailVerificationAction)}</button>}
                  </>
                  : isEditingRecord
                    ? <>
                      <button className="att-button att-button--outline" type="button" onClick={() => setIsEditingRecord(false)}>Batal</button>
                      <button className="att-button" type="button" disabled={!editCheckInTime || isBusy} onClick={() => requestAdminAction('save')} data-testid="button-save-attendance">Simpan perubahan</button>
                    </>
                    : <>
                      <button className="att-button att-button--outline" type="button" onClick={() => { setEditCheckInTime(timeInputValue(detailRecord.checkInAt)); setEditCheckOutTime(timeInputValue(detailRecord.checkOutAt)); setIsEditingRecord(true); }} data-testid="button-edit-attendance">Edit</button>
                      <button className="att-button att-button--soft" type="button" disabled={isBusy} onClick={() => requestAdminAction(nextVerificationAction(detailRecord) ?? 'verify-check-in')} data-testid="button-verify-attendance">{verificationActionLabel(nextVerificationAction(detailRecord) ?? 'verify-check-in')}</button>
                      <button className="att-button att-button--outline" type="button" disabled={isBusy} onClick={() => requestAdminAction('delete')} data-testid="button-delete-attendance">Hapus</button>
                    </>}
              </div>
            </>}
      </section>
    </div>}

    {adminAction && adminTargetRecord && <div className="att-modal-backdrop att-modal-backdrop--confirm">
      <section className="att-modal att-modal--confirm" role="alertdialog" aria-modal="true" aria-labelledby="att-admin-action-title">
        <div className="att-modal-head">
          <div>
            <h2 id="att-admin-action-title">{adminAction === 'save' ? 'Sahkan perubahan' : adminAction === 'delete' ? 'Hapus absensi' : verificationActionLabel(adminAction)}</h2>
            <p>{displayStaffName(adminTargetRecord.employeeName)} · {displayDate(adminTargetRecord.workDate)}</p>
          </div>
          <button className="att-modal-close" type="button" aria-label="Batal" disabled={adminBusy} onClick={closeAdminConfirmation}><span aria-hidden="true">×</span></button>
        </div>
        <form className="att-admin-form" onSubmit={(event) => { event.preventDefault(); void confirmAdminAction(); }}>
          <p className="att-confirm-copy">{adminAction === 'save'
            ? 'Masukkan ID dan kata sandi kasir untuk menyimpan perubahan jam absensi.'
            : adminAction === 'delete'
              ? 'Data yang dihapus tidak dapat dikembalikan. Data hanya bisa dihapus sebelum verifikasi admin.'
              : adminAction === 'verify-check-in'
                ? 'Verifikasi jam masuk akan mengunci perubahan dan penghapusan. Staf tetap dapat check-out dengan PIN.'
                : 'Setelah jam pulang diverifikasi, catatan absensi terkunci dan tidak bisa diedit atau dihapus.'}</p>
          <label><span className="att-label">ID kasir</span><input className="att-input" type="text" autoComplete="username" value={adminId} onChange={(event) => setAdminId(event.target.value)} required data-testid="input-attendance-admin-id"/></label>
          <label><span className="att-label">Kata sandi kasir</span><input className="att-input" type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required data-testid="input-attendance-admin-password"/></label>
          {adminError && <p className="att-modal-error" role="alert">{adminError}</p>}
          <div className="att-modal-actions" style={{ padding: '4px 0 0', border: 0 }}>
            <button className="att-button att-button--outline" type="button" disabled={adminBusy} onClick={closeAdminConfirmation}>Batal</button>
            <button className="att-button" type="submit" disabled={adminBusy || !adminId.trim() || !adminPassword} data-testid="button-confirm-attendance-admin-action">
              {adminBusy ? 'Memproses…' : adminAction === 'save' ? 'Simpan' : adminAction === 'delete' ? 'Hapus permanen' : `${verificationActionLabel(adminAction)} & kunci`}
            </button>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}
