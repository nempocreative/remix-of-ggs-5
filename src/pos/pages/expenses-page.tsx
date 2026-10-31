import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListExpensesQueryKey,
  useCreateExpense,
  useDeleteExpense,
  useGetEmployees,
  useListExpenses,
  useUpdateExpense,
  type Expense,
  type ExpenseInput,
} from '@/lib/api-client';
import { AlertCircle, ArrowDownLeft, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Pencil, Plus, ReceiptText, RefreshCw, Scissors, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import type { SalonId } from '@/pos/lib/menu';
import { displayStaffName } from '@/lib/utils';

type Props = { salon: SalonId };
type PaymentMethod = '' | 'Tunai' | 'Transfer / QRIS';
type ExpenseDraft = {
  category: string;
  customCategory: string;
  description: string;
  employeeName: string;
  employeeOther: string;
  teaQuantity: string;
  teaUnit: string;
  amount: string;
  expenseDate: string;
  paymentMethod: PaymentMethod;
};

const CATEGORIES = [
  'Produk & bahan',
  'Peralatan',
  'Utilitas',
  'Kebersihan',
  'Gaji & komisi',
  'Cashbon pegawai',
  'Teh & konsumsi',
  'Sewa',
  'Transportasi',
  'Operasional',
  'Lainnya',
];
const EMPTY_DRAFT: ExpenseDraft = {
  category: '', customCategory: '', description: '', employeeName: '', employeeOther: '', teaQuantity: '', teaUnit: 'kotak',
  amount: '', expenseDate: '', paymentMethod: '',
};
const formatMoney = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
const formatNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const jakartaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Permintaan belum berhasil. Periksa koneksi lalu coba lagi.';
const showDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
};
const parseDescription = (expense: Expense) => {
  const description = expense.description ?? '';
  if (expense.category === 'Cashbon pegawai') {
    const match = description.match(/^Pegawai:\s*(.*?)\s*\|\s*Keperluan:\s*([\s\S]*)$/);
    if (match) return { employeeName: match[1], detail: match[2], displayDetail: match[2], teaQuantity: '', teaUnit: 'kotak', searchable: description };
  }
  if (expense.category === 'Teh & konsumsi') {
    const match = description.match(/^Pembelian:\s*(.*?)\s*\|\s*Jumlah:\s*(\d+)\s+([^|]+)$/);
    if (match) {
      const teaUnit = match[3].trim();
      return { employeeName: '', detail: match[1], displayDetail: `${match[1]} · ${match[2]} ${teaUnit}`, teaQuantity: match[2], teaUnit, searchable: description };
    }
    const legacyMatch = description.match(/^Pembelian:\s*([\s\S]*)$/);
    if (legacyMatch) return { employeeName: '', detail: legacyMatch[1], displayDetail: legacyMatch[1], teaQuantity: '', teaUnit: 'kotak', searchable: description };
  }
  return { employeeName: '', detail: description, displayDetail: description, teaQuantity: '', teaUnit: 'kotak', searchable: description };
};
const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export default function ExpensesPage({ salon }: Props) {
  const queryClient = useQueryClient();
  const today = useMemo(() => jakartaDate(), []);
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Semua kategori');

  const params = useMemo(() => ({ salon, from, to }), [salon, from, to]);
  const queryKey = getListExpensesQueryKey(params);
  const employeeParams = useMemo(() => ({ salon }), [salon]);
  const expensesQuery = useListExpenses(params);
  const employeesQuery = useGetEmployees(employeeParams);
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const expenses = expensesQuery.data?.expenses ?? [];
  const employees = employeesQuery.data ?? [];
  const salonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const mutationPending = createExpense.isPending || updateExpense.isPending || deleteExpense.isPending;
  const invalidRange = from > to;
  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID');
    return expenses.filter((expense) => {
      const detail = parseDescription(expense);
      const matchesCategory = categoryFilter === 'Semua kategori' || expense.category === categoryFilter;
      const matchesSearch = !term || [
        expense.description, expense.category, detail.employeeName, detail.detail,
        expense.paymentMethod ?? '', formatMoney(expense.amount), showDate(expense.expenseDate),
      ].join(' ').toLocaleLowerCase('id-ID').includes(term);
      return matchesCategory && matchesSearch;
    }).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt));
  }, [expenses, search, categoryFilter]);

  const beginCreate = () => {
    setEditing(null);
    setEditorOpen(true);
    setDraft({ ...EMPTY_DRAFT, expenseDate: today });
    setFormError('');
    setPageError('');
    setFeedback('');
  };
  const beginEdit = (expense: Expense) => {
    const parsed = parseDescription(expense);
    setEditing(expense);
    setEditorOpen(true);
    setDraft({
      ...EMPTY_DRAFT,
      category: CATEGORIES.includes(expense.category) ? expense.category : 'Lainnya',
      customCategory: CATEGORIES.includes(expense.category) ? '' : expense.category,
      description: parsed.detail,
      employeeName: parsed.employeeName,
      teaQuantity: parsed.teaQuantity,
      teaUnit: parsed.teaUnit,
      amount: String(expense.amount),
      expenseDate: expense.expenseDate,
      paymentMethod: expense.paymentMethod ?? '',
    });
    setFormError('');
    setPageError('');
    setFeedback('');
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormError('');
  };
  const refreshList = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');
    const category = draft.category === 'Lainnya' ? draft.customCategory.trim() : draft.category.trim();
    const detail = draft.description.trim();
    const amount = Number(draft.amount.replace(/\D/g, ''));
    const employeeName = draft.employeeName === '__other__' ? draft.employeeOther.trim() : draft.employeeName.trim();
    const cleanEmployeeName = displayStaffName(employeeName);
    if (!category || category.length > 80) {
      setFormError('Pilih kategori atau isi nama kategori, maksimal 80 karakter.');
      return;
    }
    if (draft.category === 'Cashbon pegawai' && !employeeName) {
      setFormError('Pilih atau tulis nama pegawai untuk cashbon.');
      return;
    }
    if (!detail || detail.length > 160) {
      setFormError(draft.category === 'Cashbon pegawai' ? 'Rincian keperluan wajib diisi, maksimal 160 karakter.' : 'Rincian pengeluaran wajib diisi, maksimal 160 karakter.');
      return;
    }
    if (draft.category === 'Cashbon pegawai' && cleanEmployeeName.length > 100) {
      setFormError('Nama pegawai maksimal 100 karakter.');
      return;
    }
    const teaQuantity = Number(draft.teaQuantity);
    if (draft.category === 'Teh & konsumsi' && (!Number.isSafeInteger(teaQuantity) || teaQuantity < 1)) {
      setFormError('Masukkan jumlah pembelian teh atau konsumsi, minimal 1.');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setFormError('Masukkan nominal rupiah bulat yang lebih besar dari nol.');
      return;
    }
    if (!isRealDate(draft.expenseDate) || draft.expenseDate > today) {
      setFormError('Pilih tanggal pengeluaran yang valid dan tidak melebihi hari ini.');
      return;
    }
    if (!draft.paymentMethod) {
      setFormError('Pilih metode pembayaran untuk pengeluaran ini.');
      return;
    }
    const description = draft.category === 'Cashbon pegawai'
      ? `Pegawai: ${cleanEmployeeName} | Keperluan: ${detail}`
      : draft.category === 'Teh & konsumsi' ? `Pembelian: ${detail} | Jumlah: ${teaQuantity} ${draft.teaUnit}` : detail;
    if (description.length > 160) {
      setFormError('Gabungan nama dan rincian terlalu panjang. Ringkas keterangan hingga maksimal 160 karakter.');
      return;
    }
    const data: ExpenseInput = { category, description, amount, expenseDate: draft.expenseDate, paymentMethod: draft.paymentMethod };
    try {
      if (editing) {
        await updateExpense.mutateAsync({ salon, id: editing.id, data });
        await refreshList();
        setFeedback('Perubahan pengeluaran berhasil disimpan.');
      } else {
        await createExpense.mutateAsync({ salon, data });
        await refreshList();
        setFeedback('Pengeluaran berhasil dicatat.');
      }
      closeEditor();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setPageError('');
    setFeedback('');
    try {
      await deleteExpense.mutateAsync({ salon, id: deleteTarget.id });
      await refreshList();
      setFeedback('Catatan pengeluaran berhasil dihapus.');
      setDeleteTarget(null);
    } catch (error) {
      setPageError(errorMessage(error));
      setDeleteTarget(null);
    }
  };
  const updateDraft = (field: keyof ExpenseDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const changeMonth = (direction: -1 | 1) => {
    const [year, month] = from.slice(0, 7).split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + direction, 1, 12));
    const nextFrom = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const finalDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0, 12)).getUTCDate();
    setFrom(nextFrom);
    setTo(direction === 1 && nextFrom.slice(0, 7) === today.slice(0, 7) ? today : `${nextFrom.slice(0, 7)}-${String(finalDay).padStart(2, '0')}`);
  };
  const dateRangeLabel = from.slice(0, 7) === to.slice(0, 7)
    ? new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${from.slice(0, 7)}-15T12:00:00Z`))
    : `${showDate(from)} – ${showDate(to)}`;
  const historyCategories = [...new Set(expenses.map((expense) => expense.category))].sort((a, b) => a.localeCompare(b, 'id'));

  return <div className={`expenses-page fade-up${salon === 'hair-studio' ? ' expenses-page--hair' : ''}`} data-testid="page-expenses">
    <style>{`
      .expenses-page{--ex-ink:#472538;--ex-muted:#947b8b;--ex-pink:#b93670;--ex-line:#ecd9e3;--ex-soft:#fff8fb;--ex-green:#4e8068;color:var(--ex-ink);min-height:100%}
      .expenses-page *{box-sizing:border-box}
      .expenses-page--hair{--ex-ink:#252525;--ex-muted:#777;--ex-pink:#242424;--ex-line:#dedede;--ex-soft:#f7f7f7;--ex-green:#557b62}
      .ex-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:0 0 18px}
      .ex-eyebrow{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:var(--ex-pink);font-size:9px;font-weight:900;letter-spacing:.16em}
      .ex-head h1{margin:0;color:var(--ex-ink);font-family:var(--app-font-serif);font-size:clamp(28px,4vw,39px);line-height:1.05;letter-spacing:-.05em}
      .ex-head p:not(.ex-eyebrow){max-width:620px;margin:8px 0 0;color:var(--ex-muted);font-size:12px;line-height:1.6}
      .ex-salon{display:flex;align-items:center;gap:9px;border:1px solid var(--ex-line);border-radius:12px;background:#fff;padding:9px 12px;white-space:nowrap}
      .ex-salon-mark{display:grid;width:32px;height:32px;place-items:center;border-radius:10px;background:#f8eaf1;color:var(--ex-pink)}
      .expenses-page--hair .ex-salon-mark{background:#eee;color:#222}
      .ex-salon small,.ex-salon strong{display:block}.ex-salon small{color:#a38495;font-size:8px;font-weight:900;letter-spacing:.12em}.ex-salon strong{margin-top:2px;font-size:11px}
      .ex-toolbar{display:grid;grid-template-columns:auto auto minmax(220px,1fr);align-items:center;gap:14px;margin-bottom:14px;padding:12px 14px;border:1px solid var(--ex-line);border-radius:13px;background:#fff}
      .ex-range-label{display:flex;align-items:center;gap:8px;color:#785b6e;font-size:10px;font-weight:850}
      .ex-range-controls{display:flex;align-items:center;gap:7px}
      .ex-month-nav{display:grid;width:32px;height:32px;place-items:center;border:1px solid #eee1e8;border-radius:9px;background:#fff;color:#805c72;cursor:pointer}
      .ex-month-nav:hover:not(:disabled){background:var(--ex-soft);color:var(--ex-pink)}.ex-month-nav:disabled{opacity:.4;cursor:not-allowed}
      .ex-range-title{min-width:132px;color:#57394d;font-family:var(--app-font-serif);font-size:13px;font-weight:800;text-align:center}
      .ex-date-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;justify-self:end}
      .ex-date-field{display:grid;gap:4px;color:#a18494;font-size:8px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
      .ex-date-field input{width:100%;height:34px;border:1px solid #eadce4;border-radius:8px;background:#fff;padding:0 8px;color:#5e4053;font-size:11px;outline:none}
      .ex-date-field input:focus,.ex-field input:focus,.ex-field select:focus,.ex-search:focus-within,.ex-filter:focus{border-color:#c36891;box-shadow:0 0 0 3px rgba(185,54,112,.09)}
      .ex-primary{display:inline-flex;min-height:39px;align-items:center;justify-content:center;gap:7px;border:0;border-radius:9px;background:var(--ex-pink);padding:0 13px;color:#fff;font-size:10px;font-weight:850;cursor:pointer;transition:transform .16s,background .16s}
      .ex-primary:hover:not(:disabled){transform:translateY(-1px);background:#9f2d61}.ex-primary:disabled{opacity:.5;cursor:not-allowed}
      .ex-overview{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(150px,.6fr);gap:12px;margin-bottom:15px}
      .ex-total-card{display:flex;min-height:106px;align-items:center;justify-content:space-between;gap:16px;border:1px solid #e8cbd9;border-radius:13px;background:linear-gradient(112deg,#fffafd,#f8f2f1);padding:16px 19px}
      .expenses-page--hair .ex-total-card{border-color:#d9d9d9;background:linear-gradient(112deg,#fafafa,#f1f1ef)}
      .ex-total-copy,.ex-total-icon{position:relative;z-index:1}.ex-total-label{display:flex;align-items:center;gap:6px;color:#9a758a;font-size:8px;font-weight:900;letter-spacing:.15em}
      .ex-total-amount{margin-top:6px;color:#4d2a41;font-family:var(--app-font-serif);font-size:clamp(23px,3vw,32px);font-weight:850;letter-spacing:-.045em;line-height:1.15;overflow-wrap:anywhere}
      .ex-total-caption{margin-top:5px;color:#9a7b8d;font-size:9px}
      .ex-total-icon{display:grid;width:44px;height:44px;flex:none;place-items:center;border:1px solid #edd8e3;border-radius:12px;background:#fff;color:var(--ex-pink)}
      .ex-count-card{display:flex;min-height:106px;flex-direction:column;justify-content:center;border:1px solid var(--ex-line);border-radius:13px;background:#fff;padding:15px}
      .ex-count-card span{color:#9a8090;font-size:8px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.ex-count-card strong{margin-top:7px;color:#51344a;font-family:var(--app-font-serif);font-size:27px;letter-spacing:-.04em}.ex-count-card small{margin-top:1px;color:#a28b99;font-size:9px}
      .ex-notice{display:flex;align-items:flex-start;gap:8px;margin:0 0 12px;padding:10px 12px;border-radius:10px;font-size:10px;font-weight:700;line-height:1.5}
      .ex-notice svg{flex:none;margin-top:1px}.ex-notice--success{border:1px solid #d5e8dd;background:#f6fbf7;color:#4e8068}.ex-notice--error{border:1px solid #f1d2d4;background:#fff7f7;color:#a6444b}
      .ex-notice button{margin-left:auto;border:0;background:transparent;color:inherit;cursor:pointer}
      .ex-panel{overflow:hidden;border:1px solid var(--ex-line);border-radius:13px;background:#fff;box-shadow:0 2px 8px rgba(92,44,68,.035)}
      .ex-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #f3e9ee;background:#faf7f5}
      .ex-panel-head h2{margin:0;color:#4c3044;font-family:var(--app-font-serif);font-size:15px;font-weight:850;letter-spacing:-.03em}.ex-panel-head p{margin:4px 0 0;color:#9a8291;font-size:9px;line-height:1.45}
      .ex-history-tools{display:grid;grid-template-columns:minmax(180px,1fr) minmax(150px,205px);gap:9px;padding:12px 15px;border-bottom:1px solid #f3e9ee;background:#fff}
      .ex-search{display:flex;min-width:0;align-items:center;gap:8px;border:1px solid #e7d8e1;border-radius:9px;background:#fff;padding:0 10px;color:#9a8291}
      .ex-search input{width:100%;height:37px;min-width:0;border:0;background:transparent;color:#53364a;font-size:11px;outline:none}
      .ex-search input::placeholder{color:#b49eaa}
      .ex-filter{width:100%;height:39px;border:1px solid #e7d8e1;border-radius:9px;background:#fff;padding:0 10px;color:#53364a;font-size:10px;outline:none}
      .ex-results{padding:9px 15px;color:#9a8291;font-size:9px}
      .ex-list{display:grid;padding:0 15px 13px}
      .ex-row{display:grid;grid-template-columns:82px minmax(0,1fr) minmax(110px,.72fr) minmax(110px,.8fr) auto;align-items:center;gap:12px;padding:13px 2px;border-top:1px solid #f1e9ec}
      .ex-row-date{color:#73596b;font-size:10px;font-weight:700;white-space:nowrap}
      .ex-row-main{min-width:0}.ex-item-title{color:#55384b;font-size:11px;font-weight:850;line-height:1.4;overflow-wrap:anywhere}.ex-item-sub{display:flex;align-items:flex-start;gap:4px;margin-top:4px;color:#a18a98;font-size:9px;line-height:1.45;overflow-wrap:anywhere}.ex-item-sub svg{flex:none;margin-top:1px}
      .ex-category{display:inline-flex;align-items:center;max-width:100%;border:1px solid #f0dfe7;border-radius:999px;background:#fff8fb;padding:5px 8px;color:#9b5577;font-size:8px;font-weight:800;line-height:1.3;overflow-wrap:anywhere}
      .expenses-page--hair .ex-category{border-color:#ddd;background:#f7f7f7;color:#4b4b4b}
      .ex-payment{display:inline-flex;align-items:center;max-width:100%;border:1px solid #e6eadf;border-radius:999px;background:#f7fbf7;padding:5px 8px;color:#52785d;font-size:8px;font-weight:800;white-space:normal;line-height:1.3}.ex-payment--unknown{border-color:#eadcc4;background:#fff9ef;color:#947342}
      .ex-amount{color:#503449;font-family:var(--app-font-serif);font-size:12px;font-weight:850;white-space:nowrap}
      .ex-actions{display:flex;justify-content:flex-end;gap:3px}
      .ex-icon-button{display:grid;width:32px;height:32px;place-items:center;border:1px solid transparent;border-radius:8px;background:transparent;color:#9a7c8d;cursor:pointer}
      .ex-icon-button:hover{border-color:#efdae5;background:#fff7fa;color:#a9366b}.ex-icon-button--delete:hover{border-color:#f1d2d4;background:#fff5f5;color:#b34b54}
      .ex-state{display:grid;min-height:210px;align-content:center;justify-items:center;padding:25px 18px;color:#bd7b9a;text-align:center}
      .ex-state h3{margin:10px 0 4px;color:#58394d;font-family:var(--app-font-serif);font-size:15px;font-weight:850}.ex-state p{max-width:330px;margin:0;color:#9a8090;font-size:10px;line-height:1.6}
      .ex-state button{margin-top:13px}.ex-skeleton{display:grid;gap:9px;padding:15px 17px}.ex-skeleton span{height:52px;border-radius:8px;background:linear-gradient(90deg,#faf2f6,#f3e7ee,#faf2f6);background-size:200% 100%;animation:ex-shimmer 1.35s ease-in-out infinite}
      @keyframes ex-shimmer{to{background-position:-200% 0}}
      .ex-modal-backdrop{position:fixed;z-index:70;inset:0;display:flex;align-items:center;justify-content:center;overflow-y:auto;background:rgba(50,23,40,.48);padding:14px;backdrop-filter:blur(3px)}
      .ex-modal{position:relative;width:100%;max-width:510px;max-height:calc(100dvh - 28px);margin:auto;overflow:auto;border:1px solid #ecd9e3;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(50,23,40,.22);animation:fadeUp .2s ease both}
      .ex-modal-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:11px;border-bottom:1px solid #f1e5eb;background:#faf7f5;padding:14px 17px}
      .ex-modal-mark{display:grid;width:36px;height:36px;flex:none;place-items:center;border-radius:10px;background:#f8eaf1;color:var(--ex-pink)}
      .ex-modal-head-copy{min-width:0;flex:1}.ex-modal-head-copy small{color:#b07894;font-size:8px;font-weight:900;letter-spacing:.14em}.ex-modal-head-copy h2{margin:3px 0 0;color:#4c3044;font-family:var(--app-font-serif);font-size:17px;font-weight:850;letter-spacing:-.03em}
      .ex-close{display:grid;width:32px;height:32px;place-items:center;border:0;border-radius:8px;background:transparent;color:#9a7c8d;cursor:pointer}.ex-close:hover{background:#f7eaf0;color:#9d3161}
      .ex-form{display:grid;gap:12px;padding:16px}
      .ex-field{display:grid;gap:6px;color:#795e70;font-size:10px;font-weight:800;letter-spacing:.02em;line-height:1.35}
      .ex-field input,.ex-field select{width:100%;min-width:0;height:40px;border:1px solid #e7d8e1;border-radius:9px;background:#fff;padding:0 10px;color:#53364a;font-size:11px;letter-spacing:normal;outline:none}
      .ex-field input::placeholder{color:#bea9b5;font-weight:500}
      .ex-two-col{display:grid;grid-template-columns:1fr 1fr;gap:11px}
      .ex-rupiah-input{display:flex;align-items:center;border:1px solid #e7d8e1;border-radius:9px;background:#fff;padding-left:10px;color:#a37c91;font-size:10px;font-weight:850}
      .ex-rupiah-input:focus-within{border-color:#c36891;box-shadow:0 0 0 3px rgba(185,54,112,.09)}.ex-rupiah-input input{border:0;box-shadow:none!important}
      .ex-inline-note{margin:0;color:#9a8291;font-size:9px;font-weight:500;letter-spacing:normal;line-height:1.5}
      .ex-form-error{display:flex;align-items:flex-start;gap:7px;border:1px solid #f1d2d4;border-radius:9px;background:#fff7f7;padding:9px 10px;color:#a6444b;font-size:10px;font-weight:700;line-height:1.5}.ex-form-error svg{flex:none;margin-top:1px}
      .ex-form-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #f1e5eb;background:#faf7f5;padding:12px 16px}
      .ex-foot-note{display:flex;align-items:center;gap:6px;color:#9a8291;font-size:9px;line-height:1.4}.ex-foot-note svg{flex:none;color:#7c9b87}
      .ex-form-actions{display:flex;gap:7px}.ex-cancel{min-height:37px;border:1px solid #e9dbe3;border-radius:9px;background:#fff;padding:0 12px;color:#765b6d;font-size:10px;font-weight:800;cursor:pointer}
      .ex-delete-mark{display:grid;width:42px;height:42px;place-items:center;border-radius:11px;background:#fff0f0;color:#b54252}
      .ex-delete-content{padding:19px}.ex-delete-content h2{margin:12px 0 0;color:#4c3044;font-family:var(--app-font-serif);font-size:20px;letter-spacing:-.04em}.ex-delete-content p{margin:7px 0 0;color:#80697a;font-size:11px;line-height:1.65;overflow-wrap:anywhere}
      .ex-delete-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #f1e5eb;background:#faf7f5;padding:12px 18px}
      .ex-danger{min-height:37px;border:0;border-radius:9px;background:#b34450;padding:0 13px;color:#fff;font-size:10px;font-weight:850;cursor:pointer}.ex-danger:hover:not(:disabled){background:#993844}.ex-danger:disabled{opacity:.5;cursor:not-allowed}
      @media(max-width:900px){.ex-toolbar{grid-template-columns:1fr 1fr}.ex-range-label{grid-column:1/-1}.ex-date-tools{width:100%;justify-self:stretch}}
      @media(max-width:680px){.ex-head{align-items:flex-start;flex-direction:column}.ex-salon{width:100%}.ex-toolbar{grid-template-columns:1fr;gap:10px}.ex-range-label{grid-column:auto}.ex-range-controls{justify-content:space-between}.ex-overview{grid-template-columns:minmax(0,1fr) 105px;gap:8px}.ex-total-card{min-height:98px;padding:13px}.ex-total-icon{width:37px;height:37px}.ex-total-amount{font-size:23px}.ex-count-card{min-height:98px;padding:12px}.ex-count-card strong{font-size:24px}.ex-panel-head{align-items:flex-start;flex-direction:column;padding:13px}.ex-panel-head .ex-primary{width:100%}.ex-history-tools{grid-template-columns:1fr;padding:10px}.ex-results{padding:9px 11px}.ex-list{padding:0 11px 10px}.ex-row{grid-template-columns:minmax(0,1fr) auto;gap:7px 10px;padding:12px 2px}.ex-row-date{grid-column:1;grid-row:1}.ex-row-main{grid-column:1/-1;grid-row:2}.ex-row-category{grid-column:1;grid-row:3}.ex-row-payment{grid-column:1;grid-row:4}.ex-row-amount{grid-column:2;grid-row:1/3;align-self:center;text-align:right}.ex-row-actions{grid-column:2;grid-row:4}.ex-actions{gap:2px}.ex-category,.ex-payment{font-size:8px}.ex-form-foot{align-items:flex-start;flex-direction:column}.ex-form-actions{width:100%}.ex-form-actions button{flex:1}.ex-two-col{grid-template-columns:1fr 1fr}}
      @media(max-width:390px){.ex-overview{grid-template-columns:minmax(0,1fr) 88px}.ex-total-amount{font-size:20px}.ex-date-tools{grid-template-columns:1fr}.ex-two-col{grid-template-columns:1fr}.ex-modal-backdrop{padding:8px}.ex-modal{max-height:calc(100dvh - 16px)}}
      @media(prefers-reduced-motion:reduce){.expenses-page *, .expenses-page *:before,.expenses-page *:after{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
    `}</style>

    <header className="ex-head">
      <div>
        <p className="ex-eyebrow"><CircleDollarSign size={13}/> OPERASIONAL SALON</p>
        <h1>Pengeluaran</h1>
        <p>Catat dan telusuri uang keluar. Pembukuan selalu mengikuti salon yang sedang dipilih.</p>
      </div>
      <div className="ex-salon"><span className="ex-salon-mark"><Scissors size={16}/></span><span><small>SALON TERPILIH</small><strong>{salonName}</strong></span></div>
    </header>

    <section className="ex-toolbar" aria-label="Rentang tanggal pengeluaran">
      <div className="ex-range-label"><CalendarDays size={15}/> Periode laporan</div>
      <div className="ex-range-controls">
        <button type="button" className="ex-month-nav" aria-label="Bulan sebelumnya" data-testid="button-expenses-previous-month" onClick={() => changeMonth(-1)}><ChevronLeft size={15}/></button>
        <span className="ex-range-title">{dateRangeLabel}</span>
        <button type="button" className="ex-month-nav" aria-label="Bulan berikutnya" data-testid="button-expenses-next-month" disabled={from.slice(0, 7) >= today.slice(0, 7)} onClick={() => changeMonth(1)}><ChevronRight size={15}/></button>
      </div>
      <div className="ex-date-tools">
        <label className="ex-date-field">Dari tanggal<input type="date" value={from} max={to} aria-label="Tanggal mulai" data-testid="input-expenses-from" onChange={(event) => setFrom(event.target.value)}/></label>
        <label className="ex-date-field">Sampai tanggal<input type="date" value={to} min={from} max={today} aria-label="Tanggal akhir" data-testid="input-expenses-to" onChange={(event) => setTo(event.target.value)}/></label>
      </div>
    </section>

    <section className="ex-overview" aria-label="Ringkasan pengeluaran">
      <div className="ex-total-card">
        <div className="ex-total-copy"><span className="ex-total-label"><ArrowDownLeft size={12}/> TOTAL KELUAR</span>
          <div className="ex-total-amount" data-testid="text-expenses-total">{expensesQuery.isLoading ? 'Memuat…' : formatMoney(expensesQuery.data?.totalAmount ?? 0)}</div>
          <div className="ex-total-caption">{dateRangeLabel} · {salonName}</div>
        </div>
        <span className="ex-total-icon"><ReceiptText size={20}/></span>
      </div>
      <div className="ex-count-card"><span>Catatan</span><strong data-testid="text-expenses-count">{expensesQuery.isLoading ? '—' : expensesQuery.data?.count ?? 0}</strong><small>pengeluaran · periode ini</small></div>
    </section>

    {feedback && <div className="ex-notice ex-notice--success" role="status" data-testid="status-expenses-feedback"><Check size={15}/><span>{feedback}</span><button type="button" aria-label="Tutup pesan" onClick={() => setFeedback('')}><X size={14}/></button></div>}
    {pageError && <div className="ex-notice ex-notice--error" role="alert" data-testid="text-expenses-error"><AlertCircle size={15}/><span>{pageError}</span><button type="button" aria-label="Tutup pesan" onClick={() => setPageError('')}><X size={14}/></button></div>}
    {invalidRange && <div className="ex-notice ex-notice--error" role="alert"><AlertCircle size={15}/><span>Tanggal mulai harus sebelum atau sama dengan tanggal akhir.</span></div>}

    <section className="ex-panel" aria-labelledby="expenses-list-title">
      <div className="ex-panel-head">
        <div><h2 id="expenses-list-title">Catatan pengeluaran</h2><p>Telusuri transaksi salon ini berdasarkan nama, rincian, kategori, tanggal, atau nominal.</p></div>
        <button type="button" className="ex-primary" data-testid="button-add-expense" onClick={beginCreate}><Plus size={15}/> Catat pengeluaran</button>
      </div>
      <div className="ex-history-tools">
        <label className="ex-search"><Search size={15}/><input aria-label="Cari riwayat pengeluaran" placeholder="Cari nama, rincian, atau nominal" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-expenses-search"/></label>
        <label><span className="sr-only">Filter kategori</span><select className="ex-filter" aria-label="Filter kategori pengeluaran" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} data-testid="select-expenses-category-filter"><option>Semua kategori</option>{historyCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      </div>
      {invalidRange ? <div className="ex-state"><CalendarDays size={25}/><h3>Periksa rentang tanggal</h3><p>Pilih periode yang berurutan untuk melihat catatan pengeluaran.</p></div>
        : expensesQuery.isLoading ? <div className="ex-skeleton" role="status" aria-label="Memuat catatan pengeluaran"><span/><span/><span/><span/></div>
          : expensesQuery.isError ? <div className="ex-state"><AlertCircle size={25}/><h3>Data belum dapat dimuat</h3><p>Periksa koneksi salon, lalu coba muat ulang daftar pengeluaran.</p><button type="button" className="ex-primary" onClick={() => void expensesQuery.refetch()}><RefreshCw size={13}/> Coba lagi</button></div>
            : expenses.length === 0 ? <div className="ex-state"><ReceiptText size={26}/><h3>Belum ada pengeluaran</h3><p>Catatan untuk periode ini akan muncul di sini. Mulai dengan mencatat biaya pertama salon.</p><button type="button" className="ex-primary" onClick={beginCreate}><Plus size={14}/> Catat pengeluaran</button></div>
              : filteredExpenses.length === 0 ? <div className="ex-state"><Search size={24}/><h3>Tidak ada catatan yang cocok</h3><p>Coba ubah kata pencarian atau filter kategori untuk melihat riwayat lainnya.</p><button type="button" className="ex-cancel" onClick={() => { setSearch(''); setCategoryFilter('Semua kategori'); }}>Hapus filter</button></div>
                : <>
                  <div className="ex-results" aria-live="polite" data-testid="text-expenses-filter-count">Menampilkan {filteredExpenses.length} dari {expensesQuery.data?.count ?? expenses.length} catatan · total ringkasan tetap untuk seluruh periode</div>
                  <div className="ex-list">
                    {filteredExpenses.map((expense) => {
                      const parsed = parseDescription(expense);
                      const when = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(expense.createdAt));
                      return <article className="ex-row" key={expense.id} data-testid={`row-expense-${expense.id}`}>
                        <div className="ex-row-date">{showDate(expense.expenseDate)}</div>
                        <div className="ex-row-main">
                        <div className="ex-item-title">{parsed.displayDetail}</div>
                        <div className="ex-item-sub">{parsed.employeeName ? <><span>{displayStaffName(parsed.employeeName)}</span><span aria-hidden="true">·</span></> : null}<Clock3 size={10}/><span>{when} dicatat</span></div>
                        </div>
                        <div className="ex-row-category"><span className="ex-category">{expense.category}</span></div>
                        <div className="ex-row-payment"><span className={`ex-payment${expense.paymentMethod ? '' : ' ex-payment--unknown'}`}>{expense.paymentMethod ?? 'Belum diklasifikasi'}</span></div>
                        <div className="ex-row-amount"><span className="ex-amount">{formatMoney(expense.amount)}</span></div>
                        <div className="ex-row-actions"><div className="ex-actions"><button type="button" className="ex-icon-button" aria-label={`Ubah ${expense.description}`} title="Ubah catatan" data-testid={`button-edit-expense-${expense.id}`} onClick={() => beginEdit(expense)}><Pencil size={14}/></button><button type="button" className="ex-icon-button ex-icon-button--delete" aria-label={`Hapus ${expense.description}`} title="Hapus catatan" data-testid={`button-delete-expense-${expense.id}`} onClick={() => setDeleteTarget(expense)}><Trash2 size={14}/></button></div></div>
                      </article>;
                    })}
                  </div>
                </>}
    </section>

    {editorOpen && <div className="ex-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !mutationPending) closeEditor(); }}>
      <section className="ex-modal" role="dialog" aria-modal="true" aria-labelledby="expense-form-title">
        <header className="ex-modal-head"><span className="ex-modal-mark">{editing ? <Pencil size={17}/> : <Plus size={18}/>}</span><div className="ex-modal-head-copy"><small>{editing ? 'PERBARUI CATATAN' : 'CATAT DANA KELUAR'}</small><h2 id="expense-form-title">{editing ? 'Ubah pengeluaran' : 'Pengeluaran baru'}</h2></div><button type="button" className="ex-close" aria-label="Tutup form pengeluaran" onClick={closeEditor} disabled={mutationPending}><X size={17}/></button></header>
        <form id="expense-form" className="ex-form" onSubmit={(event) => void submit(event)} noValidate>
          <label className="ex-field">Kategori <span>*</span><select autoFocus value={draft.category} onChange={(event) => { updateDraft('category', event.target.value); setFormError(''); }} data-testid="input-expense-category"><option value="">Pilih kategori</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          {draft.category === 'Lainnya' && <label className="ex-field">Nama kategori <span>*</span><input maxLength={80} value={draft.customCategory} onChange={(event) => updateDraft('customCategory', event.target.value)} placeholder="Nama kategori" data-testid="input-expense-custom-category"/></label>}
          {draft.category === 'Cashbon pegawai' && <>
            <label className="ex-field">Nama pegawai <span>*</span>
              <select value={draft.employeeName} onChange={(event) => updateDraft('employeeName', event.target.value)} data-testid="select-expense-employee">
                <option value="">Pilih pegawai</option>
                {employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.name}>{displayStaffName(employee.name)}</option>)}
                {draft.employeeName && draft.employeeName !== '__other__' && !employees.some((employee) => employee.name === draft.employeeName) && <option value={draft.employeeName}>{displayStaffName(draft.employeeName)}</option>}
                <option value="__other__">Nama lain / tidak ada di daftar</option>
              </select>
            </label>
            {employeesQuery.isLoading && <p className="ex-inline-note" role="status">Memuat daftar pegawai salon…</p>}
            {employeesQuery.isError && <div className="ex-form-error" role="alert"><AlertCircle size={14}/><span>Daftar pegawai tidak dapat dimuat. Nama pegawai tetap dapat ditulis manual.</span><button type="button" className="ex-cancel" onClick={() => void employeesQuery.refetch()} data-testid="button-retry-expense-employees">Coba lagi</button></div>}
            {draft.employeeName === '__other__' && <label className="ex-field">Nama pegawai <span>*</span><input maxLength={100} value={draft.employeeOther} onChange={(event) => updateDraft('employeeOther', event.target.value)} placeholder="Nama lengkap pegawai" data-testid="input-expense-employee-other"/></label>}
            <label className="ex-field">Rincian keperluan <span>*</span><input maxLength={160} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="Keperluan cashbon" data-testid="input-expense-description"/></label>
          </>}
          {draft.category === 'Teh & konsumsi' && <>
            <label className="ex-field">Nama item / pembelian <span>*</span><input maxLength={115} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="Contoh: teh celup dan gula" data-testid="input-expense-description"/></label>
            <div className="ex-two-col">
              <label className="ex-field">Jumlah <span>*</span><input type="number" min="1" step="1" inputMode="numeric" value={draft.teaQuantity} onChange={(event) => updateDraft('teaQuantity', event.target.value)} placeholder="Contoh: 2" data-testid="input-expense-tea-quantity"/></label>
              <label className="ex-field">Satuan <span>*</span><select value={draft.teaUnit} onChange={(event) => updateDraft('teaUnit', event.target.value)} data-testid="select-expense-tea-unit"><option value="kotak">Kotak</option><option value="dus">Dus</option><option value="pak">Pak</option><option value="bungkus">Bungkus</option><option value="botol">Botol</option><option value="kg">Kg</option><option value="pcs">Pcs</option></select></label>
            </div>
          </>}
          {draft.category !== 'Cashbon pegawai' && draft.category !== 'Teh & konsumsi' && <label className="ex-field">Keterangan <span>*</span><input maxLength={160} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="Rincian pengeluaran" data-testid="input-expense-description"/></label>}
          {editing?.paymentMethod == null && <div className="ex-form-error"><AlertCircle size={14}/><span>Catatan ini belum memiliki metode pembayaran. Pilih metode yang sesuai untuk melengkapinya.</span></div>}
          <label className="ex-field">Metode pembayaran <span>*</span><select value={draft.paymentMethod} onChange={(event) => updateDraft('paymentMethod', event.target.value as PaymentMethod)} data-testid="select-expense-payment-method" aria-label="Metode pembayaran pengeluaran"><option value="">Pilih metode pembayaran</option><option value="Tunai">Tunai</option><option value="Transfer / QRIS">Transfer / QRIS</option></select></label>
          <div className="ex-two-col">
            <label className="ex-field">Nominal <span>*</span><span className="ex-rupiah-input"><span>Rp</span><input inputMode="numeric" value={draft.amount ? formatNumber.format(Number(draft.amount.replace(/\D/g, ''))) : ''} onChange={(event) => updateDraft('amount', event.target.value.replace(/\D/g, ''))} placeholder="0" aria-label="Nominal pengeluaran dalam rupiah" data-testid="input-expense-amount"/></span></label>
            <label className="ex-field">Tanggal pengeluaran <span>*</span><input type="date" max={today} value={draft.expenseDate} onChange={(event) => updateDraft('expenseDate', event.target.value)} data-testid="input-expense-date"/></label>
          </div>
          {formError && <div className="ex-form-error" role="alert" data-testid="text-expense-form-error"><AlertCircle size={14}/><span>{formError}</span></div>}
        </form>
        <footer className="ex-form-foot"><span className="ex-foot-note"><ShieldCheck size={13}/> Tersimpan khusus untuk {salonName}</span><div className="ex-form-actions"><button type="button" className="ex-cancel" onClick={closeEditor} disabled={mutationPending}>Batal</button><button type="submit" form="expense-form" className="ex-primary" disabled={mutationPending} data-testid="button-save-expense">{mutationPending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan pengeluaran'}</button></div></footer>
      </section>
    </div>}

    {deleteTarget && <div className="ex-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteExpense.isPending) setDeleteTarget(null); }}>
      <section className="ex-modal" role="alertdialog" aria-modal="true" aria-labelledby="expense-delete-title" aria-describedby="expense-delete-description">
        <div className="ex-delete-content"><span className="ex-delete-mark"><Trash2 size={19}/></span><h2 id="expense-delete-title">Hapus catatan ini?</h2><p id="expense-delete-description">Pengeluaran <strong>{parseDescription(deleteTarget).detail}</strong> sebesar <strong>{formatMoney(deleteTarget.amount)}</strong> akan dihapus dari catatan {salonName}. Tindakan ini tidak dapat dibatalkan.</p></div>
        <div className="ex-delete-actions"><button type="button" className="ex-cancel" onClick={() => setDeleteTarget(null)} disabled={deleteExpense.isPending}>Batal</button><button type="button" className="ex-danger" onClick={() => void confirmDelete()} disabled={deleteExpense.isPending} data-testid="button-confirm-delete-expense">{deleteExpense.isPending ? 'Menghapus…' : 'Hapus pengeluaran'}</button></div>
      </section>
    </div>}
  </div>;
}
