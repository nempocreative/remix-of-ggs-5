import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  getGetPointActivityQueryKey,
  getGetCustomersQueryKey,
  getGetEmployeesQueryKey,
  getGetPointRedemptionsQueryKey,
  getGetPointRewardsQueryKey,
  getGetPromoSettingsQueryKey,
  getGetQueueBookingsQueryKey,
  getGetSalesQueryKey,
  getAuthStatus,
  loginCashier,
  logoutCashier,
  useCreateCustomer,
  useCreatePointRedemption,
  useCreateSale,
  useGetCustomers,
  useGetEmployees,
  useGetPointRewards,
  useGetPromoSettings,
  useGetReceiptSettings,
  useGetServices,
  useGetSales,
  useImportLegacyData,
  type Customer as ApiCustomer,
  type PointReward,
  type Sale as ApiSale,
} from '@/lib/api-client';
import { ErrorBoundary } from '@/pos/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QRCodeCanvas } from 'qrcode.react';
import NotFound from '@/pos/pages/not-found';
import ServicesPage from '@/pos/pages/services-page';
import PointsPage from '@/pos/pages/points-page';
import EmployeePerformancePage from '@/pos/pages/employee-performance-page';
import BackupPage from '@/pos/pages/backup-page';
import AttendancePage from '@/pos/pages/attendance-page';
import StaffSecurityPage from '@/pos/pages/staff-security-page';
import ExpensesPage from '@/pos/pages/expenses-page';
import FinancePage from '@/pos/pages/finance-page';
import ReceiptSettingsPage from '@/pos/pages/receipt-settings-page';
import PromoSettingsSection from '@/pos/pages/promo-settings-section';
import NotificationsPage from '@/pos/pages/notifications-page';
import QueuePage from '@/pos/pages/queue-page';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from '@/pos/router-compat';
import { ArrowRight, ArrowUpRight, Banknote, CalendarDays, Camera, Check, ChevronDown, Clock3, Coins, CreditCard, Database, Download, Gift, History, LockKeyhole, MessageCircle, Minus, PanelLeftClose, PanelLeftOpen, Plus, Printer, QrCode, Search, ScanLine, Scissors, Settings, ShoppingBag, Tags, Trash2, UserRound, Users, WalletCards, X } from 'lucide-react';
import { salonDetails, type SalonId, type Service } from '@/pos/lib/menu';
import { displayStaffName } from '@/lib/utils';
import { downloadReceiptPdf } from '@/pos/lib/receipt-pdf';
import { downloadMemberCardPdf } from '@/pos/lib/member-card-pdf';
import { defaultReceiptCopy } from '@/pos/lib/receipt-copy';
import { calculateSaleDiscounts, serviceDiscount } from '@/lib/sale-discounts';
import { ServiceDiscountInput } from '@/pos/components/service-discount-input';

type CartLine = { serviceId: string; name: string; unitPrice: number; quantity: number; discount?: number; discountType?: 'nominal' | 'percent'; employeeId?: string | null; employeeName?: string | null; commissionPercent?: number; commissionBase?: number; commissionAmount?: number };
type DiscountMode = 'nominal' | 'percent';
type Sale = { id: string; salon: SalonId; invoiceNumber: string; createdAt: string; customerName: string; customerWhatsapp?: string; customerPhone?: string | null; cashierName?: string | null; paymentMethod: string; discountMode?: DiscountMode; discountValue?: number; items: CartLine[]; subtotal: number; discount: number; total: number; amountReceived: number; change: number; pointsEarned?: number; pointsBalance?: number };
type CustomerProfile = { salon: SalonId; phone: string; memberCode: string; name: string; points: number; transactionCount: number; totalSpent: number; lastTransactionAt: string | null };
type CustomerSort = 'points' | 'spent' | 'transactions' | 'recent' | 'name';
type CashierDraft = {
  cart: CartLine[];
  query: string;
  category: string;
  customer: string;
  customerWhatsapp: string;
  cashierName: string;
  discountText: string;
  discountMode: DiscountMode;
  method: string;
  receivedText: string;
  serviceFlow: 'direct' | 'queue';
};
const STORE_KEY = 'ggs-beauty-sales-v1';
const CUSTOMER_STORE_KEY = 'ggs-beauty-customers-v1';
const DATA_MIGRATION_KEY = 'ggs-beauty-db-migration-v1';
const CASHIER_DRAFTS_KEY = 'ggs-cashier-drafts-v1';
const ACTIVE_SALON_KEY = 'ggs-active-salon-v1';
const MEMBER_CODE_PREFIX = 'GGS-MEMBER:V1:';
const memberCardScanValue = (memberCode: string) => `${MEMBER_CODE_PREFIX}${memberCode}`;
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';
const RUPIAH_PER_POINT = 1000;
const BRAND_CONTACTS: Record<SalonId, { whatsapp: string; instagram: string; tiktok?: string }> = {
  beauty: {
    whatsapp: '082342777723',
    instagram: '@ggsbeauty.hair.co',
    tiktok: '@ggsbeauty.salonspa',
  },
  'hair-studio': {
    whatsapp: '081333359200',
    instagram: '@hairstudio.ggs.grt',
  },
};
type AuthContextValue = { logout: () => void; logoutError: string; salonScope: SalonId | null };
const AuthContext = createContext<AuthContextValue | null>(null);
const emptyCashierDraft: CashierDraft = {
  cart: [],
  query: '',
  category: 'SEMUA',
  customer: '',
  customerWhatsapp: '',
  cashierName: '',
  discountText: '0',
  discountMode: 'nominal',
  method: 'Tunai',
  receivedText: '',
  serviceFlow: 'direct',
};
const isSalonId = (value: unknown): value is SalonId => value === 'beauty' || value === 'hair-studio';
function useActiveSalon() {
  const auth = useContext(AuthContext);
  const [storedSalon, setStoredSalon] = useState<SalonId>(() => {
    if (auth?.salonScope) return auth.salonScope;
    const saved = localStorage.getItem(ACTIVE_SALON_KEY);
    return isSalonId(saved) ? saved : 'beauty';
  });
  const salon = auth?.salonScope ?? storedSalon;
  useEffect(() => {
    localStorage.setItem(ACTIVE_SALON_KEY, salon);
  }, [salon]);
  const setSalon = (nextSalon: SalonId) => {
    setStoredSalon(auth?.salonScope ?? nextSalon);
  };
  return [salon, setSalon] as const;
}
const readCashierDrafts = (): Record<SalonId, CashierDraft> => {
  try {
    const saved = JSON.parse(localStorage.getItem(CASHIER_DRAFTS_KEY) || '{}') as Partial<Record<SalonId, Partial<CashierDraft>>>;
    return {
      beauty: { ...emptyCashierDraft, ...(saved.beauty ?? {}) },
      'hair-studio': { ...emptyCashierDraft, ...(saved['hair-studio'] ?? {}) },
    };
  } catch {
    return { beauty: { ...emptyCashierDraft }, 'hair-studio': { ...emptyCashierDraft } };
  }
};
const money = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
const rupiahInputFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const formatRupiahInput = (value: string | number) => {
  const digits = String(value).replace(/\D/g, '');
  return digits ? rupiahInputFormatter.format(Number(digits)) : '';
};
const parseRupiahInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const normalizeCustomerPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0062')) return `0${digits.slice(4)}`;
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;
  if (digits.startsWith('8')) return `0${digits}`;
  return digits;
};
const toWhatsAppNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0062')) return digits.slice(2);
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
};
const customerDisplayName = (name: string) => {
  const displayName = name.replace(/^\s*contoh\b\s*(?:[•·|:/–—-]\s*)?/i, '').trim();
  return displayName || name.trim();
};
const pointsFromAmount = (amount: number) => Math.floor(Math.max(0, amount) / RUPIAH_PER_POINT);
const caretPositionForDigitCount = (value: string, digitCount: number) => {
  if (digitCount === 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) seen += 1;
    if (seen === digitCount) return index + 1;
  }
  return value.length;
};
const businessDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
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
const businessDayNumber = (date: Date) => {
  const [year, month, day] = businessDateKey(date).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};
const dateTimeId = (date: Date) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
const isMemberPromoWeekday = (date: Date) =>
  ['Mon', 'Tue', 'Wed', 'Thu'].includes(new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
  }).format(date));
const readSales = (): Sale[] => {
  try { const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{"version":1,"sales":[]}'); return value.version === 1 && Array.isArray(value.sales) ? value.sales : []; }
  catch { return []; }
};
const readCustomers = (): CustomerProfile[] => {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOMER_STORE_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((item) => item && typeof item.phone === 'string' && typeof item.name === 'string' && Number.isFinite(item.points))
      : [];
  } catch {
    return [];
  }
};
const toUiSale = (sale: ApiSale): Sale => ({
  ...sale,
  salon: sale.salon ?? 'beauty',
  createdAt: new Date(String(sale.createdAt)).toISOString(),
  customerName: customerDisplayName(sale.customerName ?? ''),
  cashierName: /^kasir\s+contoh$/i.test(sale.cashierName?.trim() ?? '') ? null : sale.cashierName,
  customerWhatsapp: sale.customerPhone ?? undefined,
  discountMode: sale.discountMode,
});
const toUiCustomer = (customer: ApiCustomer): CustomerProfile => ({
  ...customer,
  lastTransactionAt: customer.lastTransactionAt
    ? new Date(String(customer.lastTransactionAt)).toISOString()
    : null,
});
const dateId = () => new Intl.DateTimeFormat('id-ID', { timeZone: BUSINESS_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

function BeautyLogoMark({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return <img
    src="/ggs-beauty-logo.jpg"
    alt={alt}
    className={`object-contain ${className}`}
    data-testid="img-ggs-beauty-logo"
  />;
}

function HairStudioLogoMark({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return <img
    src="/ggs-hair-studio-logo.png"
    alt={alt}
    className={`object-contain ${className}`}
    data-testid="img-ggs-hair-studio-logo"
  />;
}

function ReceiptBrandHeading({ salon }: { salon: SalonId }) {
  const brand = salonDetails[salon];
  return <>
    {salon === 'beauty'
      ? <BeautyLogoMark className="mx-auto mb-2 h-16 w-16" alt="Logo GGS Beauty Salon & Spa"/>
      : <HairStudioLogoMark className="mx-auto mb-2 h-16 w-16" alt="Logo GGS Hair Studio Barber"/>}
    <p className={`font-display text-sm font-extrabold tracking-wide ${salon === 'hair-studio' ? 'text-[#151515]' : 'text-[#472538]'}`}>{brand.name.toUpperCase()}</p>
    <p className="mt-0.5 text-[8px] font-bold tracking-[.17em] text-[#98788a]">{brand.descriptor}</p>
    <p className={`mt-1 text-[9px] font-semibold italic ${salon === 'hair-studio' ? 'text-[#252525]' : 'text-[#bd3c76]'}`}>Grooming is better</p>
  </>;
}

function ReceiptBrandContacts({ salon }: { salon: SalonId }) {
  const contacts = BRAND_CONTACTS[salon];
  return <div className="mt-4 border-t border-dashed border-[#e7d2dd] pt-3 text-center text-[9px] leading-relaxed text-[#765b6d]">
    <p>WhatsApp bisnis · {contacts.whatsapp}</p>
    <p>Instagram · {contacts.instagram}</p>
    {contacts.tiktok && <p>TikTok · {contacts.tiktok}</p>}
  </div>;
}

function AppFrame({ children, salon = 'beauty' }: { children: ReactNode; salon?: SalonId }) {
  const [path] = useLocation();
  const brand = salonDetails[salon];
  const auth = useContext(AuthContext);
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => window.matchMedia('(max-width: 1100px)').matches,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => {
      const compact = window.matchMedia('(max-width: 1100px)').matches;
      const key = compact ? 'ggs-pos-sidebar-collapsed-compact' : 'ggs-pos-sidebar-collapsed';
      const saved = localStorage.getItem(key);
      return saved === null ? compact : saved === 'true';
    },
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsCompactViewport(event.matches);
      const key = event.matches ? 'ggs-pos-sidebar-collapsed-compact' : 'ggs-pos-sidebar-collapsed';
      const saved = localStorage.getItem(key);
      setSidebarCollapsed(saved === null ? event.matches : saved === 'true');
    };
    media.addEventListener('change', handleViewportChange);
    return () => media.removeEventListener('change', handleViewportChange);
  }, []);
  useEffect(() => {
    const key = isCompactViewport ? 'ggs-pos-sidebar-collapsed-compact' : 'ggs-pos-sidebar-collapsed';
    localStorage.setItem(key, String(sidebarCollapsed));
  }, [isCompactViewport, sidebarCollapsed]);

  const navItems = [
    { href: '/', label: 'Kasir', icon: ShoppingBag, testId: 'link-navigation-kasir' },
    { href: '/antrian', label: 'Antrian', icon: CalendarDays, testId: 'link-navigation-antrian' },
    { href: '/riwayat', label: 'Riwayat', icon: History, testId: 'link-navigation-riwayat' },
    { href: '/pengeluaran', label: 'Pengeluaran', icon: Banknote, testId: 'link-navigation-pengeluaran' },
    { href: '/keuangan', label: 'Keuangan', icon: WalletCards, testId: 'link-navigation-keuangan' },
    { href: '/pelanggan', label: 'Member', icon: Users, testId: 'link-navigation-pelanggan' },
    { href: '/notifikasi', label: 'Notifikasi', icon: MessageCircle, testId: 'link-navigation-notifikasi' },
    { href: '/poin', label: 'Poin', icon: Coins, testId: 'link-navigation-poin' },
    { href: '/kinerja', label: 'Kinerja staf', icon: UserRound, testId: 'link-navigation-kinerja' },
    { href: '/layanan', label: 'Layanan & Harga', icon: Tags, testId: 'link-navigation-layanan' },
    { href: '/absensi', label: 'Absensi', icon: Clock3, testId: 'link-navigation-absensi' },
    { href: '/keamanan-sistem', label: 'Keamanan Sistem', icon: LockKeyhole, testId: 'link-navigation-keamanan-sistem' },
    { href: '/pengaturan', label: 'Pengaturan', icon: Settings, testId: 'link-navigation-pengaturan' },
    { href: '/backup', label: 'Backup', icon: Database, testId: 'link-navigation-backup' },
  ];

  return <div className={`app-shell${salon === 'hair-studio' ? ' salon-theme-hair' : ''}`} data-salon={salon}>
    <header className={`sticky top-0 z-30 border-b border-[#eedde5] bg-[#fffafb]/95 backdrop-blur-md${salon === 'hair-studio' ? ' salon-header-hair' : ''}`}>
      <div className="cashier-topbar-inner mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-7">
        <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-brand-home">
          {salon === 'hair-studio'
            ? <HairStudioLogoMark className="h-11 w-11 rounded-full bg-white shadow-sm" alt="Logo GGS Hair Studio Barber"/>
            : <BeautyLogoMark className="h-11 w-11 rounded-full bg-white shadow-sm" alt="Logo GGS Beauty Salon & Spa"/>}
          <span><span className="block font-display text-[17px] font-extrabold tracking-[-.04em] text-[#472538]">{brand.name.toUpperCase()}</span><span className="block text-[9px] font-bold tracking-[.2em] text-[#a47c90]">{brand.descriptor} · KASIR</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-[#d7e9de] bg-[#f4faf6] px-3 py-2 text-[10px] font-bold text-[#4e8068] sm:inline-flex">Akses terverifikasi</span>
          {auth?.logoutError && <span className="text-[10px] font-semibold text-[#b2484f]" role="alert">{auth.logoutError}</span>}
          {auth && <button className="rounded-full border border-[#ead9e2] bg-white px-3 py-2 text-[10px] font-bold text-[#694b60] transition hover:bg-[#fff6f9]" type="button" onClick={auth.logout} data-testid="button-app-logout">Keluar</button>}
        </div>
      </div>
    </header>
    <div className={`app-content${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}${isCompactViewport && !sidebarCollapsed ? ' mobile-sidebar-open' : ''}`}>
      {isCompactViewport && !sidebarCollapsed && <button
        type="button"
        className="app-sidebar-backdrop"
        aria-label="Tutup menu"
        onClick={() => setSidebarCollapsed(true)}
        data-testid="button-close-sidebar"
      />}
      <aside className="app-sidebar" aria-label="Menu utama">
        <div className="app-sidebar__heading">
          <span className="app-sidebar__section-label">MENU</span>
          <button
            type="button"
            className="app-sidebar__toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Perbesar sidebar' : 'Minimalkan sidebar'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Perbesar sidebar' : 'Minimalkan sidebar'}
            data-testid="button-toggle-sidebar"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}
          </button>
        </div>
        <nav className="app-sidebar__nav" aria-label="Navigasi utama">
          {navItems.map(({ href, label, icon: Icon, testId }) => (
            <Link
              key={href}
              href={href}
              data-testid={testId}
              aria-label={label}
              aria-current={path === href ? 'page' : undefined}
              title={sidebarCollapsed ? label : undefined}
              className={`app-sidebar__link${path === href ? ' is-active' : ''}`}
            >
              <Icon size={18} aria-hidden="true"/>
              <span className="app-sidebar__link-label">{label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className={`app-page-content mx-auto max-w-[1500px] ${path==='/'?'cashier-main py-3 sm:py-4':'history-main px-4 py-6 sm:px-7 sm:py-8'}`}>{children}</main>
    </div>
  </div>;
}

function PriceEntryPanel({ service, onClose, onAdd }: { service: Service; onClose: () => void; onAdd: (price: number) => void }) {
  const [price, setPrice] = useState(String(service.minPrice));
  const selected = Number(price);
  const maximumPrice = service.maxPrice;
  const belowMinimum = Number.isFinite(selected) && selected < service.minPrice;
  const aboveMaximum = maximumPrice !== undefined && Number.isFinite(selected) && selected > maximumPrice;
  const valid = Number.isFinite(selected) && Number.isInteger(selected) && selected >= service.minPrice && (maximumPrice === undefined || selected <= maximumPrice);
  const validationMessage = !Number.isFinite(selected)
    ? 'Masukkan nominal harga yang valid.'
    : !Number.isInteger(selected)
      ? 'Gunakan nominal rupiah bulat.'
      : belowMinimum
        ? `Harga tidak boleh di bawah minimum ${money(service.minPrice)}.`
        : aboveMaximum
        ? `Harga tidak boleh melebihi maksimum ${money(maximumPrice ?? 0)}.`
          : '';
  return <section aria-labelledby="price-title" className="mb-3 overflow-hidden rounded-2xl border border-[#edcfdd] bg-white shadow-[0_8px_24px_rgba(112,49,78,.08)] fade-up">
    <div className="flex items-center justify-between gap-3 border-b border-[#f1e4ea] bg-[#fffafb] px-4 py-3">
      <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[.15em] text-[#bd3c76]">ATUR HARGA LAYANAN</p><h2 id="price-title" className="mt-0.5 truncate font-display text-base font-extrabold text-[#45243a]">{service.name}</h2></div>
      <button type="button" onClick={onClose} aria-label="Batalkan input harga" data-testid="button-close-price-dialog" className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#936d81] hover:bg-[#f7eaf0]"><X size={14}/> Batalkan</button>
    </div>
    <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_205px] sm:p-4">
      <div className="sm:col-span-2">
        <div className={`price-range-grid grid gap-2 ${maximumPrice === undefined ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className="rounded-xl border border-[#f0dce5] bg-[#fffafb] px-3 py-2"><span className="text-[8px] font-extrabold uppercase tracking-[.12em] text-[#956e83]">{service.priceType === 'starting' ? 'Harga mulai dari' : 'Harga minimum'}</span><p className="mt-0.5 font-display text-sm font-extrabold text-[#a9366b]">{money(service.minPrice)}</p></div>
          {maximumPrice !== undefined&&<div className="rounded-xl border border-[#f0dce5] bg-[#fffafb] px-3 py-2"><span className="text-[8px] font-extrabold uppercase tracking-[.12em] text-[#956e83]">Harga maksimum</span><p className="mt-0.5 font-display text-sm font-extrabold text-[#522a43]">{money(maximumPrice)}</p></div>}
        </div>
        <label className="mt-3 block text-[11px] font-bold text-[#56374a]" htmlFor="input-custom-price">Harga yang dikenakan</label>
        <div className={`mt-1.5 flex items-center rounded-xl border bg-white px-3 focus-within:ring-2 ${belowMinimum||aboveMaximum?'border-[#c65a61] focus-within:ring-[#c65a61]/10':'border-[#e8cfdb] focus-within:border-[#bd3c76] focus-within:ring-[#bd3c76]/10'}`}><span className="mr-2 text-xs font-bold text-[#a47d91]">Rp</span><input id="input-custom-price" data-testid="input-custom-price" autoFocus type="number" min={service.minPrice} max={maximumPrice} step="1000" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border-0 bg-transparent py-2.5 text-base font-bold text-[#472538] outline-none"/></div>
        <p className={`mt-1.5 flex min-h-4 items-start gap-1 text-[10px] font-semibold ${valid?'text-[#588c72]':'text-[#b44c54]'}`} data-testid="text-price-validation" aria-live="polite">{valid?<><Check size={12} className="mt-px shrink-0"/> Harga memenuhi ketentuan.</>:<><span aria-hidden="true">!</span><span>{validationMessage}</span></>}</p>
        <p className="mt-1 text-[10px] text-[#9a7b8d]">Nominal ini akan masuk langsung ke transaksi aktif.</p>
      </div>
    </div>
    <div className="border-t border-[#f1e4ea] bg-[#fffafb] px-3 py-2.5 sm:px-4">
      <button data-testid="button-add-priced-service" disabled={!valid} onClick={() => { onAdd(selected); onClose(); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b93670] py-2.5 text-xs font-bold text-white transition hover:bg-[#a82d64] disabled:cursor-not-allowed disabled:opacity-45">Tambahkan ke transaksi <ArrowRight size={14}/></button>
    </div>
  </section>;
}

function ReceiptPreview({ salon, customerName, customerWhatsapp, cashierName, previewDateTime, items, subtotal, discount, discountMode, discountValue, memberPromoApplied, total, paymentMethod, amountReceived, change, customerPointsBalance }: {
  salon: SalonId;
  customerName: string;
  customerWhatsapp: string;
  cashierName: string;
  previewDateTime: Date;
  items: CartLine[];
  subtotal: number;
  discount: number;
  discountMode: DiscountMode;
  discountValue: number;
  memberPromoApplied: boolean;
  total: number;
  paymentMethod: string;
  amountReceived: number;
  change: number;
  customerPointsBalance: number;
}) {
  const pointsEarned = pointsFromAmount(total);
  const receiptSettingsQuery = useGetReceiptSettings({ salon });
  const receiptCopy = receiptSettingsQuery.data ?? defaultReceiptCopy(salon);
  return <section className="mt-3 rounded-2xl border border-[#efdae5] bg-white p-3 soft-shadow" aria-labelledby="receipt-preview-title" data-testid="receipt-preview">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 id="receipt-preview-title" className="font-display text-base font-extrabold text-[#472538]">Struk transaksi</h2>
    </div>
    <div className="mx-auto max-w-[390px] rounded-xl border border-dashed border-[#e8d4de] bg-[#fffdfd] p-4">
      {items.length ? <>
        <div className="text-center">
          <ReceiptBrandHeading salon={salon}/>
        </div>
        <div className="my-3 border-t border-dashed border-[#e7d2dd]"/>
        <div className="space-y-1 text-[10px] text-[#765b6d]">
          <div className="flex justify-between gap-3"><span>Tanggal & jam</span><b className="text-right text-[#56374a]">{dateTimeId(previewDateTime)}</b></div>
          <div className="flex justify-between gap-3"><span>Pelanggan</span><b className="text-right text-[#56374a]">{customerName.trim()||'—'}</b></div>
          {customerWhatsapp.trim()&&<div className="flex justify-between gap-3"><span>Nomor HP pelanggan</span><b className="text-right text-[#56374a]">{normalizeCustomerPhone(customerWhatsapp)}</b></div>}
          <div className="flex justify-between gap-3"><span>Kasir</span><b className="text-right text-[#56374a]">{cashierName.trim()||'—'}</b></div>
        </div>
        <div className="my-3 border-t border-dashed border-[#e7d2dd]"/>
        <div className="space-y-2">
          {items.map((item,index)=><div key={`${item.serviceId}-${item.unitPrice}-${index}`} className="flex justify-between gap-3 text-[10px]">
            <div className="min-w-0"><p className="font-semibold text-[#56374a]">{item.name}</p><p className="text-[9px] text-[#9a7b8c]">{item.quantity} × {money(item.unitPrice)}</p>{serviceDiscount(item)>0&&<p className="text-[9px] text-primary">Diskon layanan − {money(serviceDiscount(item))}</p>}</div>
            <b className="shrink-0 text-[#56374a]">{money(item.quantity*item.unitPrice)}</b>
          </div>)}
        </div>
        <div className="my-3 border-t border-dashed border-[#e7d2dd]"/>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex justify-between text-[#765b6d]"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {discount>0&&<div className="flex justify-between font-semibold text-[#a9366b]"><span>{memberPromoApplied ? discountMode==='percent' ? `Total diskon (${discountValue}%)` : 'Potongan termasuk member' : discountMode==='percent'?`Diskon (${discountValue}%)`:'Potongan diskon'}</span><span>− {money(discount)}</span></div>}
          {memberPromoApplied&&<div className="flex justify-between text-[9px] font-semibold text-[#a9366b]"><span>Promo member Senin–Kamis</span><span>Tambahan 10%</span></div>}
          <div className="flex justify-between border-t border-[#f0e5eb] pt-2 text-sm font-extrabold text-[#472538]"><span>Total</span><span>{money(total)}</span></div>
          <div className="flex justify-between pt-1 text-[#765b6d]"><span>Metode pembayaran</span><span>{paymentMethod}</span></div>
          <div className="flex justify-between text-[#765b6d]"><span>Uang diterima</span><span>{money(amountReceived)}</span></div>
          {paymentMethod==='Tunai'&&<div className="flex justify-between font-semibold text-[#a9366b]"><span>Kembalian</span><span>{money(change)}</span></div>}
        </div>
        {customerWhatsapp.trim()&&<div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[#fbf0f5] px-3 py-2 text-[10px]"><span className="flex items-center gap-1.5 font-semibold text-[#8c6078]"><Coins size={13}/> Poin transaksi ini</span><b className="text-[#a9366b]">+{pointsEarned.toLocaleString('id-ID')} poin · saldo { (customerPointsBalance + pointsEarned).toLocaleString('id-ID') }</b></div>}
        <div className="mt-4 border-t border-dashed border-[#e7d2dd] pt-3 text-center">
          {receiptCopy.thankYouText && <p className="whitespace-pre-wrap text-[9px] leading-relaxed text-[#765b6d]">{receiptCopy.thankYouText}</p>}
          {receiptCopy.taglineText && <p className="mt-2 whitespace-pre-wrap text-[9px] font-semibold italic leading-relaxed text-[#bd3c76]">{receiptCopy.taglineText}</p>}
        </div>
        {receiptSettingsQuery.isError && <p role="alert" className="mt-2 text-center text-[9px] text-[#b2484f]">Pengaturan pesan struk belum termuat; teks bawaan ditampilkan.</p>}
        <ReceiptBrandContacts salon={salon}/>
      </> : <div className="py-6 text-center">
        <p className="text-[10px] text-[#a58a99]">Belum ada transaksi</p>
      </div>}
    </div>
  </section>;
}

function CheckoutPointRedemption({
  sale,
  onBalanceChange,
}: {
  sale: Sale;
  onBalanceChange: (balance: number) => void;
}) {
  const queryClient = useQueryClient();
  const rewardsQuery = useGetPointRewards(
    { salon: sale.salon },
    { query: { queryKey: getGetPointRewardsQueryKey({ salon: sale.salon }) } },
  );
  const redemptionMutation = useCreatePointRedemption();
  const [remainingPoints, setRemainingPoints] = useState(Math.max(0, sale.pointsBalance ?? 0));
  const [selectedReward, setSelectedReward] = useState<PointReward | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const eligibleRewards = (rewardsQuery.data ?? []).filter((reward) => reward.points <= remainingPoints);

  const redeem = async () => {
    if (!sale.customerPhone || !selectedReward || !confirming || redemptionMutation.isPending) return;
    setErrorMessage('');
    try {
      const redemption = await redemptionMutation.mutateAsync({
        data: {
          salon: sale.salon,
          customerPhone: sale.customerPhone,
          rewardPoints: selectedReward.points,
        },
      });
      const nextBalance = Math.max(0, remainingPoints - redemption.pointsSpent);
      setRemainingPoints(nextBalance);
      onBalanceChange(nextBalance);
      setSuccessMessage(`${redemption.rewardName} berhasil ditukar.`);
      setSelectedReward(null);
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey({ salon: sale.salon }) }),
        queryClient.invalidateQueries({ queryKey: getGetPointRedemptionsQueryKey({ salon: sale.salon, phone: sale.customerPhone }) }),
        queryClient.invalidateQueries({ queryKey: getGetPointActivityQueryKey() }),
      ]);
    } catch (error) {
      const apiMessage = error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: unknown } }).data?.error
        : null;
      setErrorMessage(typeof apiMessage === 'string'
        ? apiMessage
        : 'Penukaran belum berhasil. Periksa saldo poin lalu coba lagi.');
    }
  };

  if (!sale.customerPhone || remainingPoints < 1 || dismissed) return null;

  return (
    <section className="mt-4 rounded-2xl border border-[#ead3df] bg-[#fff8fb] p-4 print:hidden" aria-labelledby="checkout-points-title" data-testid="checkout-point-redemption">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4e3ec] text-[#a9366b]"><Gift size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 id="checkout-points-title" className="text-sm font-extrabold text-[#56374a]">Poin pelanggan bisa ditukar</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[#85697a]">
            Saldo {remainingPoints.toLocaleString('id-ID')} poin untuk nomor {sale.customerPhone} di {salonDetails[sale.salon].name}.
          </p>
        </div>
      </div>

      {rewardsQuery.isLoading ? (
        <p className="mt-3 text-xs text-[#85697a]" role="status">Memeriksa hadiah yang tersedia…</p>
      ) : rewardsQuery.isError ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#a34a54]" role="alert">
          <span>Daftar hadiah belum dapat dimuat.</span>
          <button type="button" onClick={() => void rewardsQuery.refetch()} className="font-bold underline">Coba lagi</button>
        </div>
      ) : eligibleRewards.length === 0 ? (
        <p className="mt-3 text-xs text-[#85697a]">Hadiah yang tersedia belum sesuai dengan saldo poin ini.</p>
      ) : (
        <>
          {successMessage && <p className="mt-3 rounded-lg bg-[#edf7ef] px-3 py-2 text-xs font-bold text-[#315f40]" role="status">{successMessage} Sisa saldo {remainingPoints.toLocaleString('id-ID')} poin.</p>}
          {!confirming ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="grid gap-1 text-[10px] font-bold text-[#806476]">
                Pilih hadiah
                <select
                  value={selectedReward ? String(selectedReward.points) : ''}
                  onChange={(event) => {
                    const reward = eligibleRewards.find((item) => String(item.points) === event.target.value) ?? null;
                    setSelectedReward(reward);
                    setErrorMessage('');
                  }}
                  className="min-h-10 rounded-lg border border-[#e7d4dd] bg-white px-3 text-xs font-semibold text-[#56374a]"
                  data-testid="select-checkout-point-reward"
                >
                  <option value="">Pilih hadiah yang ingin ditukar</option>
                  {eligibleRewards.map((reward) => (
                    <option key={`${reward.points}-${reward.reward}`} value={reward.points}>
                      {reward.reward} · {reward.points.toLocaleString('id-ID')} poin
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => { setConfirming(true); setErrorMessage(''); }}
                disabled={!selectedReward}
                className="self-end rounded-lg bg-[#a9366b] px-4 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="button-review-checkout-point-redemption"
              >
                Tukar hadiah
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="self-end rounded-lg border border-[#e7d4dd] bg-white px-4 py-2.5 text-xs font-bold text-[#765b6d]"
                data-testid="button-skip-checkout-point-redemption"
              >
                Tidak sekarang
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-[#e7d4dd] bg-white p-3" role="alert">
              <p className="text-xs leading-relaxed text-[#684d5f]">
                Tukar <b>{selectedReward?.reward}</b> dengan {selectedReward?.points.toLocaleString('id-ID')} poin?
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={redemptionMutation.isPending} className="rounded-lg border border-[#e7d4dd] px-3 py-2 text-xs font-bold text-[#765b6d]">Batal</button>
                <button type="button" onClick={() => void redeem()} disabled={redemptionMutation.isPending} className="rounded-lg bg-[#a9366b] px-3 py-2 text-xs font-extrabold text-white disabled:opacity-60" data-testid="button-confirm-checkout-point-redemption">
                  {redemptionMutation.isPending ? 'Menyimpan…' : 'Konfirmasi penukaran'}
                </button>
              </div>
            </div>
          )}
          {errorMessage && <p className="mt-3 rounded-lg bg-[#fff0f0] px-3 py-2 text-xs font-semibold text-[#a34a54]" role="alert">{errorMessage}</p>}
        </>
      )}
    </section>
  );
}

function Receipt({ sale, onClose, enablePointRedemption = false }: { sale: Sale; onClose: () => void; enablePointRedemption?: boolean }) {
  const receiptSettingsQuery = useGetReceiptSettings({ salon: sale.salon });
  const receiptCopy = receiptSettingsQuery.data ?? defaultReceiptCopy(sale.salon);
  const receiptElementRef = useRef<HTMLElement>(null);
  const [downloadError, setDownloadError] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(Math.max(0, sale.pointsBalance ?? 0));
  const handleDownloadPdf = async () => {
    const receiptElement = receiptElementRef.current;
    if (!receiptElement) {
      setDownloadError('Pratinjau struk tidak tersedia. Tutup lalu buka kembali struk.');
      return;
    }
    setDownloadBusy(true);
    try {
      await downloadReceiptPdf(receiptElement, sale.invoiceNumber);
      setDownloadError('');
    } catch {
      setDownloadError('Struk PDF tidak dapat dibuat. Silakan coba lagi.');
    } finally {
      setDownloadBusy(false);
    }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#321728]/50 p-4 backdrop-blur-[3px]" onMouseDown={(e) => { if(e.target===e.currentTarget) onClose(); }}>
    <section ref={receiptElementRef} className="receipt-print relative my-auto w-full max-w-[430px] rounded-[24px] border border-[#f0dce5] bg-white p-4 shadow-2xl fade-up sm:p-6" data-testid="receipt-transaction">
      <button onClick={onClose} data-receipt-export-hide data-testid="button-close-receipt" aria-label="Tutup receipt" className="absolute right-4 top-4 rounded-full p-2 text-[#8e6c7e] hover:bg-[#f8edf2] print:hidden"><X size={18}/></button>
      <div className="text-center"><span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${sale.salon === 'hair-studio' ? 'bg-[#ededed] text-[#151515]' : 'bg-[#f8eaf1] text-[#b93670]'}`}><Check size={23}/></span><h2 className="mt-3 font-display text-2xl font-extrabold text-[#45243a]">Pembayaran berhasil</h2>{receiptCopy.thankYouText && <p className="mx-auto mt-1 max-w-[290px] whitespace-pre-wrap text-xs leading-relaxed text-[#9a7b8c]">{receiptCopy.thankYouText}</p>}<div className="mt-4"><ReceiptBrandHeading salon={sale.salon}/></div></div>
      <div className="my-5 border-t border-dashed border-[#e7d2dd]"/>
      <div className="flex justify-between text-xs text-[#765b6d]"><span>No. invoice</span><b data-testid="text-receipt-invoice">{sale.invoiceNumber}</b></div>
      <div className="mt-2 flex justify-between text-xs text-[#765b6d]"><span>Waktu</span><b>{dateTimeId(new Date(sale.createdAt))}</b></div>
      <div className="mt-2 flex justify-between text-xs text-[#765b6d]"><span>Pelanggan</span><b>{sale.customerName || 'Pelanggan umum'}</b></div>
      {(sale.customerPhone||sale.customerWhatsapp)&&<div className="mt-2 flex justify-between gap-3 text-xs text-[#765b6d]"><span>Nomor HP</span><b className="text-right">{sale.customerPhone||sale.customerWhatsapp}</b></div>}
      {sale.cashierName&&<div className="mt-2 flex justify-between gap-3 text-xs text-[#765b6d]"><span>Kasir</span><b className="text-right">{sale.cashierName}</b></div>}
      <div className="my-4 border-t border-dashed border-[#e7d2dd]"/>
      <div className="space-y-3">{sale.items.map((item) => <div key={item.serviceId} className="flex justify-between gap-4 text-sm"><div><p className="font-semibold text-[#56374a]">{item.name}</p><p className="text-[11px] text-[#9a7b8c]">{item.quantity} × {money(item.unitPrice)}</p>{serviceDiscount(item)>0&&<p className="text-[10px] text-primary">Diskon layanan − {money(serviceDiscount(item))}</p>}</div><b className="shrink-0 text-[#56374a]">{money(item.quantity*item.unitPrice)}</b></div>)}</div>
      <div className="my-4 border-t border-dashed border-[#e7d2dd]"/>
       <div className="space-y-2 text-sm"><div className="flex justify-between text-[#765b6d]"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>{sale.discount>0&&<div className="flex justify-between font-semibold text-[#a9366b]"><span>{sale.discountMode==='percent'?`Diskon (${sale.discountValue ?? 0}%)`:'Potongan diskon'}</span><span>− {money(sale.discount)}</span></div>}<div className="flex justify-between border-t border-[#f0e5eb] pt-3 text-base font-extrabold text-[#472538]"><span>Total</span><span data-testid="text-receipt-total">{money(sale.total)}</span></div><div className="flex justify-between text-xs text-[#765b6d]"><span>{sale.paymentMethod} · Diterima</span><span>{money(sale.amountReceived)}</span></div>{sale.paymentMethod==='Tunai'&&<div className="flex justify-between text-xs font-bold text-[#b93670]"><span>Kembalian</span><span>{money(sale.change)}</span></div>}</div>
        {(sale.customerPhone||sale.customerWhatsapp)&&<div className="mt-3 rounded-xl bg-[#fbf0f5] p-3"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-semibold text-[#8c6078]"><Coins size={14}/> Poin didapat</span><b className="text-[#a9366b]">+{(sale.pointsEarned??pointsFromAmount(sale.total)).toLocaleString('id-ID')} poin</b></div><div className="mt-1 flex justify-between text-[10px] text-[#85697a]"><span>Saldo poin pelanggan</span><b data-testid="text-receipt-points-balance">{pointsBalance.toLocaleString('id-ID')} poin</b></div><p className="mt-2 border-t border-[#efdce5] pt-2 text-[9px] text-[#9a7b8c]">Setiap Rp1.000 transaksi mendapat 1 poin.</p></div>}
      {enablePointRedemption && <div data-receipt-export-hide><CheckoutPointRedemption sale={sale} onBalanceChange={setPointsBalance}/></div>}
      {receiptCopy.taglineText && <p className={`mt-6 whitespace-pre-wrap text-center text-[11px] font-semibold italic leading-relaxed ${sale.salon === 'hair-studio' ? 'text-[#282828]' : 'text-[#bd3c76]'}`}>{receiptCopy.taglineText}</p>}
      {receiptSettingsQuery.isError && <p role="alert" className="mt-3 text-center text-[10px] text-[#b2484f]">Pengaturan pesan struk belum termuat; teks bawaan ditampilkan.</p>}
      <ReceiptBrandContacts salon={sale.salon}/>
      {downloadError && <p data-receipt-export-hide role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{downloadError}</p>}
      <div data-receipt-export-hide className="mt-5 grid grid-cols-2 gap-2 print:hidden">
        <button onClick={() => void handleDownloadPdf()} disabled={downloadBusy} data-testid="button-download-receipt-pdf" className="flex items-center justify-center gap-2 rounded-xl bg-[#b93670] py-3 text-sm font-bold text-white hover:bg-[#a82d64] disabled:cursor-wait disabled:opacity-70"><Download size={16}/> {downloadBusy ? 'Menyiapkan PDF…' : 'Unduh PDF'}</button>
        <button onClick={() => window.print()} data-testid="button-print-receipt" className="flex items-center justify-center gap-2 rounded-xl border border-[#ecd9e2] py-3 text-sm font-bold text-[#765b6d] hover:bg-[#fbf3f7]"><Printer size={16}/> Cetak</button>
        <button onClick={onClose} className="col-span-2 rounded-xl border border-[#ecd9e2] px-4 py-3 text-sm font-bold text-[#765b6d] hover:bg-[#fbf3f7]">Selesai</button>
      </div>
    </section>
  </div>;
}

function DeleteConfirmation({
  title,
  description,
  endpoint,
  onCancel,
  onDeleted,
}: {
  title: string;
  description: string;
  endpoint: string;
  onCancel: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [cashierId, setCashierId] = useState('');
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onCancel]);

  const confirmDelete = async () => {
    setIsDeleting(true);
    setError('');
    try {
      await loginCashier({ id: cashierId.trim(), password });
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(typeof body.error === 'string' ? body.error : 'Data tidak dapat dihapus. Coba lagi.');
      }
      await onDeleted();
      onCancel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verifikasi atau penghapusan gagal. Coba lagi.');
    } finally {
      setIsDeleting(false);
    }
  };

  return <div
    className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#321728]/45 p-4 backdrop-blur-[3px]"
    onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) onCancel(); }}
  >
    <section role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description" className="my-auto w-full max-w-[440px] rounded-[22px] border border-[#f0dce5] bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff0f0] text-[#b54252]"><Trash2 size={18}/></span>
        <div className="min-w-0 flex-1">
          <h2 id="delete-confirm-title" className="font-display text-lg font-extrabold text-[#472538]">{title}</h2>
          <p id="delete-confirm-description" className="mt-1 text-sm leading-relaxed text-[#80697a]">{description}</p>
        </div>
        <button type="button" onClick={onCancel} disabled={isDeleting} aria-label="Tutup konfirmasi" className="rounded-lg p-2 text-[#9a7b8d] hover:bg-[#fbf3f7] disabled:opacity-50"><X size={17}/></button>
      </div>
      <div className="mt-4 rounded-xl border border-[#f1e3ea] bg-[#fffafb] px-3.5 py-3 text-xs leading-relaxed text-[#765b6d]">
        Aplikasi kasir tetap terbuka. Verifikasi kasir hanya diperlukan untuk tindakan hapus.
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold text-[#65485a]">ID kasir
          <input autoComplete="username" value={cashierId} onChange={(event) => setCashierId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#ead7e1] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[#bd3c76] focus:ring-2 focus:ring-[#bd3c76]/10"/>
        </label>
        <label className="block text-xs font-bold text-[#65485a]">Kata sandi kasir
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#ead7e1] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[#bd3c76] focus:ring-2 focus:ring-[#bd3c76]/10"/>
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-[#fff0f0] px-3 py-2 text-xs font-semibold text-[#a33c4a]">{error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={isDeleting} className="rounded-xl border border-[#ead7e1] px-4 py-2.5 text-sm font-bold text-[#765b6d] hover:bg-[#fbf3f7] disabled:opacity-50">Batal</button>
        <button type="button" onClick={confirmDelete} disabled={isDeleting || !cashierId.trim() || !password} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ad3d52] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#973146] disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={15}/>{isDeleting ? 'Memproses…' : 'Hapus permanen'}</button>
      </div>
    </section>
  </div>;
}

function DatabaseBootstrap({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const bootstrapSalon = auth?.salonScope ?? 'beauty';
  const salesQuery = useGetSales({ salon: bootstrapSalon });
  const customersQuery = useGetCustomers({ salon: bootstrapSalon });
  const importMutation = useImportLegacyData();
  const [ready, setReady] = useState(false);
  const [migrationError, setMigrationError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (salesQuery.isLoading || customersQuery.isLoading || salesQuery.isError || customersQuery.isError) return;
    if (auth?.salonScope) {
      setReady(true);
      return;
    }
    if (localStorage.getItem(DATA_MIGRATION_KEY) === 'done') {
      setReady(true);
      return;
    }
    if (started.current) return;
    started.current = true;
    setMigrationError('');

    const oldSales = readSales()
      .filter((sale) => typeof sale.id === 'string' && typeof sale.invoiceNumber === 'string')
      .map((sale) => ({
        salon: isSalonId(sale.salon) ? sale.salon : 'beauty',
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: new Date(sale.createdAt).toISOString(),
        customerName: sale.customerName || 'Pelanggan umum',
        customerPhone: sale.customerPhone
          ? normalizeCustomerPhone(sale.customerPhone)
          : sale.customerWhatsapp
            ? normalizeCustomerPhone(sale.customerWhatsapp)
            : null,
        customerWhatsapp: sale.customerWhatsapp ?? null,
        cashierName: sale.cashierName ?? null,
        paymentMethod: sale.paymentMethod || 'Tunai',
        discountMode: sale.discountMode ?? 'nominal' as const,
        discountValue: sale.discountValue ?? sale.discount,
        items: sale.items ?? [],
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        amountReceived: sale.amountReceived,
        change: sale.change,
      }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const oldCustomers = readCustomers()
      .flatMap((profile) => {
        const phone = normalizeCustomerPhone(profile.phone);
        if (!/^\d{8,15}$/.test(phone)) return [];
        const parsedDate = new Date(profile.lastTransactionAt || '');
        const salons = [...new Set(oldSales
          .filter((sale) => sale.customerPhone === phone)
          .map((sale) => sale.salon))];
        if (!salons.length) salons.push('beauty');
        return salons.map((salon) => ({
          salon,
          phone,
          name: profile.name,
          points: Math.max(0, profile.points || 0),
          transactionCount: Math.max(0, profile.transactionCount || 0),
          totalSpent: Math.max(0, profile.totalSpent || 0),
          lastTransactionAt: Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : new Date(0).toISOString(),
        }));
      });

    const importInChunks = async () => {
      try {
        const chunkSize = 500;
        for (let index = 0; index < oldSales.length; index += chunkSize) {
          await importMutation.mutateAsync({
            data: {
              sales: oldSales.slice(index, index + chunkSize),
              customers: [],
            },
          });
        }
        for (let index = 0; index < oldCustomers.length; index += chunkSize) {
          await importMutation.mutateAsync({
            data: {
              sales: [],
              customers: oldCustomers.slice(index, index + chunkSize),
            },
          });
        }
        localStorage.setItem(DATA_MIGRATION_KEY, 'done');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey() }),
        ]);
        setReady(true);
      } catch (error) {
        started.current = false;
        setMigrationError(error instanceof Error ? error.message : 'Data lama belum dapat dipindahkan.');
      }
    };
    if (!oldSales.length && !oldCustomers.length) {
      localStorage.setItem(DATA_MIGRATION_KEY, 'done');
      setReady(true);
    } else {
      void importInChunks();
    }
  }, [salesQuery.isLoading, salesQuery.isError, customersQuery.isLoading, customersQuery.isError, attempt, auth?.salonScope]);

  const refetch = async () => {
    await Promise.all([salesQuery.refetch(), customersQuery.refetch()]);
    started.current = false;
    setReady(false);
    setMigrationError('');
    setAttempt((value) => value + 1);
  };
  if (salesQuery.isError || customersQuery.isError) {
    return <div className="grid min-h-screen place-items-center bg-[#fbf6f8] p-4"><section className="max-w-md rounded-2xl border border-[#eedbe4] bg-white p-6 text-center"><h1 className="font-display text-xl font-extrabold text-[#472538]">Database belum dapat diakses</h1><p className="mt-2 text-sm text-[#927789]">Data kasir tidak dibuka dari penyimpanan lokal. Periksa koneksi lalu coba lagi.</p><button onClick={()=>void refetch()} className="mt-4 rounded-xl bg-[#b93670] px-4 py-2.5 text-sm font-bold text-white">Coba lagi</button></section></div>;
  }
  if (salesQuery.isLoading || customersQuery.isLoading || (!ready && !migrationError)) {
    return <div className="grid min-h-screen place-items-center bg-[#fbf6f8] p-4"><div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#f8eaf1] text-[#b93670]"><LockKeyhole size={19}/></span><p className="mt-4 text-sm font-bold text-[#56374a]">{ready?'Memuat data kasir...':'Menyiapkan database dan riwayat lama...'}</p><p className="mt-1 text-xs text-[#9a7b8d]">Data transaksi dan pelanggan dimuat dari database.</p></div></div>;
  }
  if (migrationError) {
    return <div className="grid min-h-screen place-items-center bg-[#fbf6f8] p-4"><section className="max-w-md rounded-2xl border border-[#eedbe4] bg-white p-6 text-center"><h1 className="font-display text-xl font-extrabold text-[#472538]">Riwayat lama belum tersimpan</h1><p className="mt-2 text-sm text-[#927789]">Transaksi lama tetap ada di browser sampai berhasil dipindahkan. Periksa koneksi lalu ulangi.</p><p className="mt-2 text-xs text-[#a34a4a]">{migrationError}</p><button onClick={()=>{started.current=false;setMigrationError('');setAttempt((value)=>value+1);}} className="mt-4 rounded-xl bg-[#b93670] px-4 py-2.5 text-sm font-bold text-white">Ulangi pemindahan</button></section></div>;
  }
  return children;
}

function OpenCashier() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><DatabaseBootstrap><Router/></DatabaseBootstrap></WouterRouter>;
}

function SalonSwitcher({
  salon,
  onSelect,
  context,
}: {
  salon: SalonId;
  onSelect: (salon: SalonId) => void;
  context: 'cashier' | 'history' | 'customers' | 'employees' | 'attendance' | 'security' | 'settings' | 'notifications' | 'queue';
}) {
  const auth = useContext(AuthContext);
  const label = context === 'cashier'
    ? 'Pilih kasir salon'
      : context === 'history'
        ? 'Pilih salon untuk riwayat'
        : context === 'employees'
          ? 'Pilih salon untuk kinerja staf'
        : context === 'notifications'
          ? 'Pilih salon untuk notifikasi pelanggan'
          : context === 'queue'
            ? 'Pilih salon untuk antrean booking'
          : context === 'attendance'
            ? 'Pilih salon untuk absensi'
            : context === 'security'
              ? 'Pilih salon untuk keamanan staf'
              : context === 'settings'
                ? 'Pilih salon untuk pengaturan struk'
                : 'Pilih salon untuk data pelanggan';
  return <div className="salon-tabs mb-3 rounded-2xl border border-[#efdae5] bg-white p-2 soft-shadow" role="tablist" aria-label={label}>
    <div className={`grid gap-2 ${auth?.salonScope ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {(auth?.salonScope ? [auth.salonScope] : ['beauty', 'hair-studio'] as SalonId[]).map((option) => {
        const selected = salon === option;
        const isHair = option === 'hair-studio';
        return <button
          key={option}
          type="button"
          role="tab"
          aria-selected={selected}
          disabled={Boolean(auth?.salonScope)}
          data-testid={`tab-${context}-${option}`}
          onClick={() => onSelect(option)}
          className={`flex min-h-[58px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition sm:px-4 ${selected ? isHair ? 'border-[#151515] bg-[#151515] text-white shadow-md' : 'border-[#b93670] bg-[#b93670] text-white shadow-md' : 'border-transparent bg-[#faf7f8] text-[#5e4653] hover:bg-[#f5edf1]'}`}
        >
          <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[.15em] opacity-75">{context === 'cashier' ? 'Kasir' : context === 'attendance' ? 'Absensi' : context === 'security' ? 'Keamanan' : context === 'settings' ? 'Pengaturan' : context === 'notifications' ? 'Notifikasi' : context === 'queue' ? 'Antrian' : 'Data'} {salonDetails[option].tabLabel}</span><span className="salon-tab-name mt-0.5 block truncate font-display text-sm font-extrabold sm:text-base">{salonDetails[option].name}</span></span>
          {isHair
            ? <HairStudioLogoMark className="h-9 w-9 shrink-0 rounded-full bg-white p-0.5"/>
            : <BeautyLogoMark className="h-9 w-9 shrink-0 rounded-full bg-white p-0.5"/>}
        </button>;
      })}
    </div>
    {context === 'cashier' && salon === 'hair-studio' && <p className="px-2 pb-1 pt-2 text-[10px] font-medium text-[#6e6668]">Daftar layanan dan harga awal GGS Hair Studio. Angka ini bisa disesuaikan nanti.</p>}
  </div>;
}

function Cashier() {
  const [activeSalon, setActiveSalon] = useActiveSalon();
  const salesQuery = useGetSales({ salon: activeSalon });
  const employeesQuery = useGetEmployees({ salon: activeSalon });
  const activeEmployees = useMemo(() => (employeesQuery.data ?? []).filter((employee) => employee.active && employee.salon === activeSalon), [employeesQuery.data, activeSalon]);
  const customersQuery = useGetCustomers({ salon: activeSalon });
  const createSaleMutation = useCreateSale();
  const sales = useMemo(() => (salesQuery.data ?? []).map(toUiSale), [salesQuery.data]);
  const customers = useMemo(() => (customersQuery.data ?? []).map(toUiCustomer), [customersQuery.data]);
  const serviceMenuQuery = useGetServices({ salon: activeSalon });
  const promoSettingsQuery = useGetPromoSettings({ salon: activeSalon }, {
    query: {
      queryKey: getGetPromoSettingsQueryKey({ salon: activeSalon }),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const cashierPromo = promoSettingsQuery.data?.salon === activeSalon ? promoSettingsQuery.data : null;
  const promoToday = businessDateKey(new Date());
  const isCashierPromoVisible = Boolean(
    cashierPromo?.isActive &&
    cashierPromo.title.trim() &&
    cashierPromo.startDate &&
    cashierPromo.endDate &&
    promoToday >= cashierPromo.startDate &&
    promoToday <= cashierPromo.endDate,
  );
  const [drafts, setDrafts] = useState<Record<SalonId, CashierDraft>>(readCashierDrafts);
  const draft = drafts[activeSalon];
  const setDraftField = <K extends keyof CashierDraft,>(field: K, nextValue: SetStateAction<CashierDraft[K]>) => {
    setDrafts((current) => {
      const currentValue = current[activeSalon][field];
      const resolvedValue = typeof nextValue === 'function'
        ? (nextValue as (previous: CashierDraft[K]) => CashierDraft[K])(currentValue)
        : nextValue;
      return {
        ...current,
        [activeSalon]: { ...current[activeSalon], [field]: resolvedValue } as CashierDraft,
      };
    });
  };
  const cart = draft.cart;
  const query = draft.query;
  const category = draft.category;
  const customer = draft.customer;
  const customerWhatsapp = draft.customerWhatsapp;
  const cashierName = draft.cashierName;
  const discountText = draft.discountText;
  const discountMode = draft.discountMode;
  const method = draft.method;
  const receivedText = draft.receivedText;
  const serviceFlow = draft.serviceFlow;
  const setCart = (value: SetStateAction<CartLine[]>) => setDraftField('cart', value);
  const setQuery = (value: SetStateAction<string>) => setDraftField('query', value);
  const setCategory = (value: SetStateAction<string>) => setDraftField('category', value);
  const setCustomer = (value: SetStateAction<string>) => setDraftField('customer', value);
  const setCustomerWhatsapp = (value: SetStateAction<string>) => setDraftField('customerWhatsapp', value);
  const setCashierName = (value: SetStateAction<string>) => setDraftField('cashierName', value);
  const setDiscountText = (value: SetStateAction<string>) => setDraftField('discountText', value);
  const setDiscountMode = (value: SetStateAction<DiscountMode>) => setDraftField('discountMode', value);
  const setMethod = (value: SetStateAction<string>) => setDraftField('method', value);
  const setReceivedText = (value: SetStateAction<string>) => setDraftField('receivedText', value);
  const setServiceFlow = (value: SetStateAction<CashierDraft['serviceFlow']>) => setDraftField('serviceFlow', value);
  const [priceService, setPriceService] = useState<Service | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [showMemberScanner, setShowMemberScanner] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [previewDateTime, setPreviewDateTime] = useState(() => new Date());
  const priceEntryRef = useRef<HTMLDivElement>(null);
  const activeServices: Service[] = useMemo(
    () => (serviceMenuQuery.data ?? []).map(({ id, name, category, minPrice, maxPrice, priceType }) => ({
      id,
      name,
      category,
      minPrice,
      maxPrice: maxPrice ?? undefined,
      priceType,
    })),
    [serviceMenuQuery.data],
  );
  const activeCategories = useMemo(
    () => [...new Set(activeServices.map((service) => service.category))],
    [activeServices],
  );
  useEffect(() => {
    localStorage.setItem(CASHIER_DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);
  const subtotal = cart.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  const discountInput = Math.max(0, Number(discountText)||0);
  const normalizedCustomerPhone = normalizeCustomerPhone(customerWhatsapp);
  const customerPhoneIsValid = /^\d{8,15}$/.test(normalizedCustomerPhone);
  const hasValidEmployeeAssignments = cart.length > 0 && cart.every((line) => !!line.employeeId && activeEmployees.some((employee) => employee.id === line.employeeId));
  const matchedCustomer = customers.find((profile) => profile.phone === normalizedCustomerPhone);
  const memberPromoActive = Boolean(matchedCustomer) && isMemberPromoWeekday(previewDateTime);
  const { itemDiscount, remaining, manualDiscount, memberDiscountAmount, appliedDiscountMode, appliedDiscountValue, discount, total } = calculateSaleDiscounts(cart, discountMode, discountInput, memberPromoActive);
  const received = method === 'Tunai' ? parseRupiahInput(receivedText) : total;
  const change = method === 'Tunai' ? Math.max(0, received-total) : 0;
  const pointsEarned = pointsFromAmount(total);
  const shownServices = useMemo(() => activeServices.filter((service) => (category==='SEMUA'||service.category===category) && `${service.name} ${service.category}`.toLowerCase().includes(query.toLowerCase())), [activeServices, category,query]);
  useEffect(() => {
    if (priceService) priceEntryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [priceService]);
  useEffect(() => {
    const timer = window.setInterval(() => setPreviewDateTime(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const todaySales = sales.filter((sale)=>sale.salon===activeSalon&&businessDateKey(new Date(sale.createdAt))===businessDateKey(new Date()));
  const addLine = (service: Service, unitPrice: number) => {
    setCart((existing) => [...existing, {
      serviceId: service.id,
      name: service.name,
      unitPrice,
      quantity: 1,
    }]);
  };
  const changeDiscountMode = (nextMode: DiscountMode) => {
    if (nextMode === discountMode) return;
    const nextValue = nextMode === 'percent'
      ? remaining > 0 ? Math.round((manualDiscount / remaining) * 100 * 1_000_000) / 1_000_000 : 0
      : manualDiscount;
    setDiscountText(String(nextValue));
    setDiscountMode(nextMode);
  };
  const handleReceivedInput = (input: HTMLInputElement) => {
    const currentValue = input.value;
    const selectionStart = input.selectionStart ?? currentValue.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const digitsBeforeStart = currentValue.slice(0, selectionStart).replace(/\D/g, '').length;
    const digitsBeforeEnd = currentValue.slice(0, selectionEnd).replace(/\D/g, '').length;
    const formattedValue = formatRupiahInput(currentValue);
    setReceivedText(formattedValue);
    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      input.setSelectionRange(
        caretPositionForDigitCount(formattedValue, digitsBeforeStart),
        caretPositionForDigitCount(formattedValue, digitsBeforeEnd),
      );
    });
  };
  const checkout = async () => {
    if (!cart.length || !hasValidEmployeeAssignments || !customer.trim() || !customerPhoneIsValid || !cashierName.trim() || createSaleMutation.isPending || (method==='Tunai'&&received<total)) return;
    setCheckoutError('');
    try {
      const createdSale = await createSaleMutation.mutateAsync({
        data: {
          salon: activeSalon,
          id: crypto.randomUUID(),
          customerName: customer.trim(),
          customerPhone: normalizedCustomerPhone,
          cashierName: cashierName.trim(),
          paymentMethod: method as 'Tunai' | 'Transfer / QRIS',
          discountMode,
          discountValue: discountMode === 'percent' ? Math.min(discountInput, 100) : manualDiscount,
          amountReceived: received,
          serviceFlow,
          items: cart.map(({ serviceId, name, unitPrice, quantity, employeeId, discount, discountType }) => ({
            serviceId, name, unitPrice, quantity, discount: discount ?? 0, discountType: discountType ?? 'nominal', employeeId: employeeId as string,
          })),
        },
      });
      const sale = toUiSale(createdSale);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey({ salon: activeSalon }) }),
        queryClient.invalidateQueries({ queryKey: getGetEmployeesQueryKey({ salon: activeSalon }) }),
        queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey() }),
        ...(serviceFlow === 'queue'
          ? [queryClient.invalidateQueries({
              queryKey: getGetQueueBookingsQueryKey({ salon: activeSalon, date: businessDateKey(new Date()) }),
            })]
          : []),
      ]);
      setCart([]); setCustomer(''); setCustomerWhatsapp(''); setCashierName(''); setDiscountText('0'); setDiscountMode('nominal'); setReceivedText(''); setServiceFlow('direct'); setReceipt(sale);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Transaksi belum berhasil disimpan.');
    }
  };
  const selectSalon = (salon: SalonId) => {
    setActiveSalon(salon);
    setPriceService(null);
    setCheckoutError('');
  };
  return <AppFrame salon={activeSalon}>
    <SalonSwitcher salon={activeSalon} onSelect={selectSalon} context="cashier"/>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#efdae5] bg-white px-4 py-3 soft-shadow">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f8eaf1] text-[#b93670]"><ShoppingBag size={18}/></span>
        <div>
          <p className="text-[9px] font-extrabold tracking-[.16em] text-[#bd3c76]">MEJA KASIR</p>
          <h1 className="font-display text-xl font-extrabold tracking-[-.035em] text-[#472538]">Transaksi baru</h1>
        </div>
        <span className="hidden h-8 w-px bg-[#f0dce5] sm:block"/>
        <div className="hidden sm:block">
          <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#a08394]">Transaksi hari ini</p>
          <p className="text-xs font-bold text-[#56374a]" data-testid="text-today-transactions">{todaySales.length} struk</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-xl bg-[#fbf5f8] px-3 py-2 sm:flex">
          <span className="text-[9px] font-bold uppercase tracking-[.1em] text-[#9a7b8d]">Penjualan hari ini</span>
          <b className="text-xs text-[#56374a]" data-testid="text-today-sales">{money(todaySales.reduce((sum,sale)=>sum+sale.total,0))}</b>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#efdae5] bg-white px-3 py-2 text-[11px] font-semibold text-[#765b6d]"><CalendarDays size={14} className="text-[#bd3c76]"/>{dateId()}</div>
      </div>
    </div>
    {promoSettingsQuery.isError
      ? <div className="mb-3 rounded-2xl border border-[#f0d8d8] bg-[#fff8f7] px-4 py-3 text-xs font-semibold text-[#a34a4a]" role="alert" data-testid="cashier-promo-load-error">
        Informasi promo belum dapat dimuat.
      </div>
      : isCashierPromoVisible && cashierPromo
        ? <section className="mb-3 flex items-start gap-3 rounded-2xl border border-[#f0d2e0] bg-gradient-to-r from-[#fff8fb] to-white px-4 py-3 shadow-[0_6px_18px_rgba(112,49,78,.06)]" aria-label="Informasi promo terbaru" data-testid="cashier-latest-promo">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f8eaf1] text-[#a9366b]"><Gift size={18}/></span>
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#bd3c76]">Promo terbaru</p>
            <h2 className="mt-0.5 text-sm font-extrabold text-[#472538]">{cashierPromo.title}</h2>
            {cashierPromo.startDate && cashierPromo.endDate && <p className="mt-1 text-[10px] font-bold text-[#a1768c]">Berlaku {promoDateLabel(cashierPromo.startDate)} – {promoDateLabel(cashierPromo.endDate)}</p>}
            {cashierPromo.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#765b6d]">{cashierPromo.description}</p>}
          </div>
        </section>
        : null}
    <div className="cashier-layout items-start gap-3">
      <section className="min-w-0">
        <div className="cashier-service-toolbar mb-3 flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[#ecd8e2] bg-white px-3.5 shadow-sm focus-within:border-[#c04b7e] focus-within:ring-2 focus-within:ring-[#c04b7e]/10">
            <Search size={16} className="shrink-0 text-[#aa8296]"/>
            <input aria-label="Cari layanan" data-testid="input-search-services" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Cari..." className="w-full bg-transparent py-2.5 text-xs text-[#56374a] outline-none placeholder:text-[#b59aab]"/>
          </label>
          <label className="cashier-category-filter relative shrink-0">
            <span className="sr-only">Kategori layanan</span>
            <select aria-label="Filter kategori layanan" data-testid="select-service-category" value={category} onChange={(e)=>setCategory(e.target.value)} className="cashier-category-select w-full appearance-none rounded-xl border border-[#ecd8e2] bg-white py-2.5 pl-3 pr-8 text-[10px] font-bold text-[#765b6d] outline-none transition focus:border-[#c04b7e] focus:ring-2 focus:ring-[#c04b7e]/10">
              <option value="SEMUA">Semua layanan</option>
              {activeCategories.map((item)=><option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aa8296]"/>
          </label>
          <span className="hidden items-center rounded-xl border border-[#ecd8e2] bg-white px-3 py-2.5 text-[10px] font-bold text-[#765b6d] sm:flex">{shownServices.length} layanan</span>
        </div>
        <div className="cashier-service-heading mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="cashier-service-heading__title min-w-0 text-xs font-extrabold text-[#56374a]">{category==='SEMUA'?'Semua layanan':category}</h2>
          <span className="cashier-service-heading__count shrink-0 text-[10px] font-semibold text-[#9a7b8d] xl:hidden">{shownServices.length} layanan</span>
        </div>
        {shownServices.some((service)=>service.priceType!=='fixed')&&<div className="mb-2 flex items-center gap-1.5 px-1 text-[9px] font-medium text-[#856b34]"><span className="h-3 w-3 shrink-0 rounded border border-[#e5cf93] bg-[#fff8e8]"/><span>Warna krem = harga fleksibel, bukan harga tetap</span></div>}
        {serviceMenuQuery.isLoading ? <div className="rounded-2xl border border-dashed border-[#e3c9d6] bg-white/70 px-5 py-12 text-center text-xs font-semibold text-[#927789]" role="status">Memuat daftar layanan salon...</div>
        : serviceMenuQuery.isError ? <div className="rounded-2xl border border-dashed border-[#e3c9d6] bg-white/70 px-5 py-12 text-center"><h3 className="font-display text-base font-bold text-[#58374c]">Menu belum dapat dimuat</h3><p className="mt-1 text-xs text-[#9a7c8d]">Periksa koneksi database lalu coba lagi.</p><button onClick={()=>void serviceMenuQuery.refetch()} className="mt-4 rounded-lg border border-[#e8cfdb] px-3 py-2 text-xs font-bold text-[#a83e70]">Coba lagi</button></div>
        : shownServices.length ? <div className="cashier-service-grid grid grid-cols-1 gap-2 sm:grid-cols-2">{shownServices.map((service)=>{
          const hasFlexiblePrice = service.priceType !== 'fixed';
          const cardStyle = hasFlexiblePrice
            ? 'border-[#e5cf93] bg-[#fff8e8] hover:border-[#d7b55c] hover:shadow-[0_6px_18px_rgba(139,105,34,.12)]'
            : 'border-[#efdae4] bg-white hover:border-[#dba1ba] hover:shadow-[0_6px_18px_rgba(112,49,78,.08)]';
          const addButtonStyle = hasFlexiblePrice
            ? 'bg-[#f1e4bc] text-[#8c6821] group-hover:bg-[#b93670] group-hover:text-white'
            : 'bg-[#f9edf3] text-[#bd3c76] group-hover:bg-[#b93670] group-hover:text-white';
          return <button key={service.id} data-testid={`button-service-${service.id}`} onClick={()=>service.priceType==='fixed'?addLine(service,service.minPrice):setPriceService(service)} className={`group flex min-h-[76px] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition ${cardStyle}`}>
            <span className="min-w-0"><span className="mb-1 block truncate text-[8px] font-extrabold tracking-[.1em] text-[#bd7293]">{service.category}</span><span className="block text-[11px] font-bold leading-snug text-[#54354a]">{service.name}</span><span className={`mt-1 block text-[10px] font-semibold ${hasFlexiblePrice?'text-[#866622]':'text-[#98788a]'}`}>{service.priceType==='fixed'?money(service.minPrice):service.priceType==='starting'?<>Mulai dari {money(service.minPrice)}</>:<>{money(service.minPrice)} <span className="text-[#bba35d]">—</span> {money(service.maxPrice ?? service.minPrice)}</>}</span></span>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition ${addButtonStyle}`}><Plus size={15}/></span>
          </button>;
        })}</div> : <div className="rounded-2xl border border-dashed border-[#e3c9d6] bg-white/70 px-5 py-12 text-center"><Search size={23} className="mx-auto text-[#c58aa6]"/><h3 className="mt-3 font-display text-base font-bold text-[#58374c]">Tidak ada layanan yang cocok</h3><p className="mt-1 text-xs text-[#9a7c8d]">Coba kata kunci lain atau pilih kategori berbeda.</p><button onClick={()=>{setQuery('');setCategory('SEMUA');}} className="mt-4 text-xs font-bold text-[#bd3c76]">Tampilkan semua layanan</button></div>}
      </section>
      <aside className="cashier-order-aside min-w-0" aria-label="Keranjang transaksi">
        <section className="cashier-order-panel flex w-full flex-col rounded-[22px] border border-[#eedbe4] bg-white shadow-[0_16px_46px_rgba(91,37,63,.16)] soft-shadow">
          <div className="cashier-order-panel__header flex shrink-0 items-center justify-between border-b border-[#f1e4ea] px-4 py-3">
            <div><p className="text-[9px] font-extrabold tracking-[.15em] text-[#bd3c76]">TRANSAKSI AKTIF</p><h2 className="mt-0.5 font-display text-lg font-extrabold text-[#472538]">Pesanan</h2></div>
            <span className="rounded-full bg-[#f8eaf1] px-2.5 py-1 text-[9px] font-bold text-[#a63c6e]" data-testid="text-cart-count">{cart.reduce((sum,line)=>sum+line.quantity,0)} item</span>
          </div>
          <div className="cashier-order-panel__body space-y-3 p-3">
            <label className="block text-[10px] font-bold text-[#806476]" htmlFor="input-customer-name">Nama pelanggan <span className="text-[#b93670]">* wajib</span>
              <input id="input-customer-name" data-testid="input-customer-name" type="text" autoComplete="name" required aria-required="true" value={customer} onChange={(e)=>setCustomer(e.target.value)} placeholder="Nama pelanggan" className="mt-1 block w-full rounded-xl border border-[#eddae4] bg-[#fffafb] px-3 py-2.5 text-xs font-normal text-[#56374a] outline-none focus:border-[#c04b7e]"/>
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-[10px] font-bold text-[#806476]" htmlFor="input-customer-whatsapp">Nomor HP pelanggan <span className="text-[#b93670]">* untuk poin</span></label>
                <button type="button" onClick={() => setShowMemberScanner(true)} disabled={customersQuery.isLoading || customersQuery.isError} data-testid="button-scan-member-card" className="flex shrink-0 items-center gap-1 rounded-lg border border-[#ecd8e2] bg-white px-2 py-1.5 text-[9px] font-bold text-[#a83e70] hover:bg-[#fdf3f7] disabled:cursor-not-allowed disabled:opacity-50"><ScanLine size={13}/> Scan kartu</button>
              </div>
              <input id="input-customer-whatsapp" data-testid="input-customer-whatsapp" type="tel" inputMode="tel" autoComplete="tel" required aria-required="true" value={customerWhatsapp} onChange={(e)=>{const nextPhone=e.target.value;setCustomerWhatsapp(nextPhone);const existing=customers.find((profile)=>profile.phone===normalizeCustomerPhone(nextPhone));if(existing)setCustomer(existing.name);else if(matchedCustomer)setCustomer('');}} placeholder="08xx atau +62..." className="block w-full rounded-xl border border-[#eddae4] bg-[#fffafb] px-3 py-2.5 text-xs font-normal text-[#56374a] outline-none focus:border-[#c04b7e]"/>
              <span className="mt-1 block text-[9px] font-normal text-[#a58a99]">Nomor HP menjadi identitas pelanggan dan saldo poin.</span>
            </div>
             {customerPhoneIsValid&&<div className="flex items-center justify-between gap-2 rounded-xl bg-[#fbf0f5] px-3 py-2 text-[10px]" data-testid="customer-points-summary"><span className="flex items-center gap-1.5 text-[#85697a]"><Coins size={13}/>{matchedCustomer?`Saldo ${matchedCustomer.points.toLocaleString('id-ID')} poin`:'Pelanggan baru'}</span><b className="text-[#a9366b]">Transaksi ini +{pointsEarned.toLocaleString('id-ID')} poin</b></div>}
             {memberPromoActive&&<div className="flex items-center justify-between gap-2 rounded-xl border border-[#f0d2e0] bg-[#fff7fb] px-3 py-2 text-[10px]" data-testid="member-discount-promo"><span className="font-semibold text-[#85697a]">Promo member · Senin–Kamis</span><b className="text-[#a9366b]">{discountMode==='percent'?`+10% · total ${appliedDiscountValue}%`:`+${money(memberDiscountAmount)}`}</b></div>}
            <label className="block text-[10px] font-bold text-[#806476]" htmlFor="input-cashier-name">Nama kasir <span className="text-[#b93670]">* wajib</span>
              <input id="input-cashier-name" data-testid="input-cashier-name" type="text" autoComplete="off" required aria-required="true" value={cashierName} onChange={(e)=>setCashierName(e.target.value)} placeholder="Nama kasir" className="mt-1 block w-full rounded-xl border border-[#eddae4] bg-[#fffafb] px-3 py-2.5 text-xs font-normal text-[#56374a] outline-none focus:border-[#c04b7e]"/>
            </label>
            {priceService&&<div ref={priceEntryRef} className="scroll-mt-24"><PriceEntryPanel key={priceService.id} service={priceService} onClose={()=>setPriceService(null)} onAdd={(price)=>addLine(priceService,price)}/></div>}
            {cart.length ? <div className="space-y-2">{cart.map((line,index)=>{
              const assignedEmployee = activeEmployees.find((employee) => employee.id === line.employeeId);
              const serviceCommissionPercent = serviceMenuQuery.data?.find((service) => service.id === line.serviceId)?.commissionPercent;
              return <div key={`${line.serviceId}-${line.unitPrice}-${line.employeeId ?? 'unassigned'}-${index}`} data-testid={`row-cart-item-${index}`} className="rounded-xl bg-[#fcf6f9] p-2.5">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-bold text-[#55374a]">{line.name}</p><p className="mt-0.5 text-[10px] text-[#9b7e8e]">{money(line.unitPrice)} / layanan</p></div><button data-testid={`button-remove-cart-item-${index}`} aria-label={`Hapus ${line.name}`} onClick={()=>setCart((items)=>items.filter((_,i)=>i!==index))} className="rounded-lg p-1.5 text-[#ad8397] hover:bg-[#f5e2eb] hover:text-[#ae3c69]"><Trash2 size={13}/></button></div>
                <label className="mt-2 block text-[9px] font-bold text-[#806476]" htmlFor={`cart-employee-${index}`}>Nama staf yang menangani layanan <span className="text-[#b93670]">* wajib</span>
                  <select id={`cart-employee-${index}`} data-testid={`select-cart-employee-${index}`} required value={assignedEmployee?.id ?? ''} onChange={(event)=>setCart((items)=>items.map((item,i)=>i===index?{...item,employeeId:event.target.value||undefined}:item))} className={`mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-[10px] font-semibold outline-none focus:border-[#c04b7e] ${assignedEmployee?'border-[#ecd8e2] text-[#56374a]':'border-[#dfb6c5] text-[#a17b8d]'}`}>
                    <option value="">Pilih nama staf</option>
                    {activeEmployees.map((employee)=><option key={employee.id} value={employee.id}>{displayStaffName(employee.name)}</option>)}
                  </select>
                </label>
                <div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-1 rounded-lg border border-[#ecd8e2] bg-white p-0.5"><button aria-label="Kurangi jumlah" data-testid={`button-decrease-cart-item-${index}`} onClick={()=>setCart((items)=>items.map((item,i)=>i===index?{...item,quantity:item.quantity-1,discount:item.discountType==='percent'?item.discount:serviceDiscount({...item,quantity:item.quantity-1})}:item).filter((item)=>item.quantity>0))} className="grid h-6 w-6 place-items-center rounded-md text-[#79586b] hover:bg-[#f8eaf1]"><Minus size={12}/></button><span className="w-5 text-center text-[11px] font-bold text-[#53374a]">{line.quantity}</span><button aria-label="Tambah jumlah" data-testid={`button-increase-cart-item-${index}`} onClick={()=>setCart((items)=>items.map((item,i)=>i===index?{...item,quantity:item.quantity+1}:item))} className="grid h-6 w-6 place-items-center rounded-md text-[#79586b] hover:bg-[#f8eaf1]"><Plus size={12}/></button></div><b className="text-[11px] text-[#55374a]">{money(line.unitPrice*line.quantity)}</b></div>
                <ServiceDiscountInput line={line} index={index} onChange={(discount,discountType)=>setCart(items=>items.map((item,i)=>i===index?{...item,discount,discountType}:item))}/>
                {serviceDiscount(line)>0&&<div className="mt-1 flex justify-between gap-2 text-[10px] text-primary"><span>Setelah diskon</span><b data-testid={`text-service-net-${index}`}>{money(line.unitPrice*line.quantity-serviceDiscount(line))}</b></div>}
                {assignedEmployee&&<p className="mt-1 text-[9px] font-semibold text-[#967387]" data-testid={`text-assigned-employee-${index}`}>{displayStaffName(assignedEmployee.name)} · staf yang menangani</p>}
              </div>;
            })}</div> : <div className="cashier-empty-cart rounded-xl border border-dashed border-[#e9d2de] px-4 py-7 text-center" data-testid="empty-cart"><span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-[#f8eaf1] text-[#bc6d91]"><ShoppingBag size={16}/></span><p className="mt-2 text-[11px] font-bold text-[#674a5b]">Belum ada layanan</p><p className="mt-0.5 text-[10px] text-[#a58a99]">Pilih layanan di menu untuk mulai.</p></div>}
            <div className="flex items-center justify-between gap-2 border-t border-dashed border-[#ead7e1] pt-2 text-[10px] text-[#85697a]"><span>Subtotal</span><b data-testid="text-cart-subtotal">{money(subtotal)}</b></div>
              <div className="space-y-1.5">
                {itemDiscount>0&&<div className="flex justify-between gap-2 text-[10px] text-primary" data-testid="text-service-discount-total"><span>Total diskon layanan</span><b>− {money(itemDiscount)}</b></div>}
                <span className="block text-[10px] text-[#85697a]">Diskon tambahan struk</span>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f8edf2] p-1">
                  {([['nominal', 'Nominal (Rp)'], ['percent', 'Persen (%)']] as const).map(([value, label]) => <button key={value} type="button" data-testid={`button-discount-mode-${value}`} aria-label={value==='nominal'?'Pilih diskon nominal dalam rupiah':'Pilih diskon persen'} aria-pressed={discountMode===value} onClick={()=>changeDiscountMode(value)} className={`rounded-md px-2 py-1.5 text-[9px] font-bold transition ${discountMode===value?'bg-white text-[#a9366b] shadow-sm':'text-[#85697a] hover:bg-white/70'}`}><span className="discount-mode-label">{label}</span><span className="discount-mode-short">{value==='nominal'?'Rp':'%'}</span></button>)}
                </div>
                <label className="flex items-center justify-between gap-3 text-[10px] text-[#85697a]"><span>{discountMode==='percent'?'Diskon (%)':'Diskon (Rp)'}</span><span className="cashier-discount-control flex items-center rounded-lg border border-[#eddae4] bg-[#fffafb] px-2.5 focus-within:border-[#c04b7e]"><input aria-label={discountMode==='percent'?'Persentase diskon':'Nominal diskon dalam rupiah'} data-testid="input-discount" type="number" min="0" max={discountMode==='percent'?100:remaining} step={discountMode==='percent'?'any':'1'} value={discountText} onChange={(e)=>setDiscountText(e.target.value)} className="cashier-discount-input bg-transparent py-2 text-right text-[11px] font-semibold text-[#56374a] outline-none"/><span className="ml-1 text-[10px] text-[#9a7b8d]">{discountMode==='percent'?'%':'Rp'}</span></span></label>
              </div>
              {discount>0&&<div className="flex items-center justify-between rounded-lg bg-[#fbf4f7] px-2.5 py-2 text-[10px]" data-testid="text-discount-deduction"><span className="text-[#85697a]">{itemDiscount>0?'Total potongan diskon':memberPromoActive?discountMode==='percent'?`Total diskon (${appliedDiscountValue}%)`:'Total potongan termasuk member':discountMode==='percent'?`Diskon (${Math.min(discountInput,100)}%)`:'Potongan diskon'}</span><b className="font-semibold text-[#a9366b]">− {money(discount)}</b></div>}
             <div><p className="mb-1.5 text-[9px] font-extrabold tracking-[.13em] text-[#9b7e8e]">METODE PEMBAYARAN</p><div className="grid grid-cols-2 gap-1.5">{['Tunai','Transfer / QRIS'].map((option)=><button key={option} data-testid={`button-payment-${option==='Tunai'?'cash':'noncash'}`} onClick={()=>{setMethod(option);setReceivedText('');}} className={`cashier-payment-button flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[10px] font-bold ${method===option?'border-[#bd3c76] bg-[#fbecf3] text-[#a9366b]':'border-[#eddae4] text-[#866b7b] hover:bg-[#fdf7fa]'}`}>{option==='Tunai'?<Banknote size={13}/>:<CreditCard size={13}/>} {option}</button>)}</div></div>
            {method==='Tunai'&&<div><label htmlFor="input-amount-received" className="mb-1 block text-[10px] font-bold text-[#806476]">Uang diterima</label><div className="flex rounded-lg border border-[#eddae4] bg-[#fffafb] px-3 focus-within:border-[#c04b7e]"><span className="mr-2 py-2 text-[11px] font-bold text-[#a18495]">Rp</span><input id="input-amount-received" data-testid="input-amount-received" type="text" inputMode="numeric" value={receivedText} onChange={(e)=>handleReceivedInput(e.currentTarget)} placeholder={formatRupiahInput(total)} className="w-full bg-transparent py-2 text-xs font-semibold text-[#56374a] outline-none"/></div><div className="mt-1.5 flex items-center justify-between rounded-lg bg-[#f8edf2] px-3 py-2 text-[10px]"><span className="text-[#8c6c7e]">Kembalian</span><b className={`font-display text-sm ${received>=total?'text-[#a9366b]':'text-[#b84e56]'}`} data-testid="text-change-due">{money(change)}</b></div></div>}
          </div>
          <div className="cashier-order-panel__footer shrink-0 space-y-2 border-t border-[#f1e4ea] bg-white p-3">
              <div className="space-y-1.5" role="group" aria-label="Cara pelanggan dilayani" data-testid="group-service-flow">
                <span className="block text-[9px] font-extrabold tracking-[.13em] text-[#9b7e8e]">CARA PELAYANAN</span>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f8edf2] p-1">
                  {([
                    ['queue', 'Masuk antrian'],
                    ['direct', 'Langsung'],
                  ] as const).map(([value, label]) => <button key={value} type="button" data-testid={`button-service-flow-${value}`} aria-pressed={serviceFlow === value} onClick={() => setServiceFlow(value)} className={`rounded-md px-2 py-2 text-[10px] font-bold transition ${serviceFlow === value ? 'bg-white text-[#a9366b] shadow-sm' : 'text-[#85697a] hover:bg-white/70'}`}>{label}</button>)}
                </div>
                <p className="text-[9px] leading-relaxed text-[#9a7b8d]" data-testid="text-service-flow-hint">
                  {serviceFlow === 'queue'
                    ? 'Pelanggan masuk ke menu Antrian dengan layanan dan nama staf pada struk.'
                    : 'Pelanggan langsung ditangani dan tidak ditambahkan ke menu Antrian.'}
                </p>
              </div>
             <div className="flex items-center justify-between text-[10px] text-[#85697a]"><span>Total bayar</span><b className="font-display text-xl font-extrabold text-[#472538]" data-testid="text-cart-total">{money(total)}</b></div>
              {checkoutError&&<p role="alert" className="rounded-lg bg-[#fff2f1] px-3 py-2 text-center text-[10px] font-semibold text-[#a34a4a]" data-testid="status-checkout-error">{checkoutError}</p>}
              <button data-testid="button-checkout" disabled={!cart.length||!hasValidEmployeeAssignments||!customer.trim()||!customerPhoneIsValid||!cashierName.trim()||createSaleMutation.isPending||(method==='Tunai'&&received<total)} onClick={()=>void checkout()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b93670] py-3 text-xs font-extrabold text-white shadow-[0_7px_14px_rgba(185,54,112,.18)] transition hover:bg-[#a92d65] disabled:cursor-not-allowed disabled:bg-[#d8b3c4] disabled:shadow-none">{method==='Tunai'?<Banknote size={16}/>:<CreditCard size={16}/>} {createSaleMutation.isPending?'Menyimpan transaksi...':'Selesaikan pembayaran'} <ArrowRight size={14}/></button>
              {cart.length>0&&!customer.trim()&&<p className="text-center text-[9px] font-semibold text-[#b45c68]" data-testid="status-customer-validation">Isi nama pelanggan untuk melanjutkan pembayaran.</p>}
              {cart.length>0&&!customerPhoneIsValid&&<p className="text-center text-[9px] font-semibold text-[#b45c68]" data-testid="status-phone-validation">Isi nomor HP yang valid (8–15 angka) untuk mencatat poin.</p>}
              {cart.length>0&&!cashierName.trim()&&<p className="text-center text-[9px] font-semibold text-[#b45c68]" data-testid="status-cashier-validation">Isi nama kasir untuk melanjutkan pembayaran.</p>}
              {cart.length>0&&!hasValidEmployeeAssignments&&<p className="text-center text-[9px] font-semibold text-[#b45c68]" data-testid="status-employee-validation">{activeEmployees.length ? 'Pilih staf aktif untuk setiap layanan.' : <>Belum ada staf aktif. <Link href="/kinerja" className="underline">Kelola staf</Link>.</>}</p>}
            {method==='Tunai'&&received<total&&cart.length>0&&<p className="text-center text-[9px] font-semibold text-[#b45c68]" data-testid="status-payment-validation">Nominal diterima belum mencukupi.</p>}
              <p className="flex items-center justify-center gap-1 text-[9px] text-[#a58a99]"><Check size={11}/> Disimpan di database saat pembayaran selesai</p>
          </div>
        </section>
        <ReceiptPreview
          salon={activeSalon}
          customerName={customer}
          customerWhatsapp={customerWhatsapp}
          cashierName={cashierName}
          previewDateTime={previewDateTime}
          items={cart}
          subtotal={subtotal}
          discount={discount}
          discountMode={appliedDiscountMode}
          discountValue={appliedDiscountValue}
          memberPromoApplied={memberPromoActive}
          total={total}
          paymentMethod={method}
          amountReceived={received}
          change={change}
          customerPointsBalance={matchedCustomer?.points ?? 0}
        />
      </aside>
    </div>
    {showMemberScanner&&<MemberCardScanner
      salon={activeSalon}
      customers={customers}
      onClose={()=>setShowMemberScanner(false)}
      onSelect={(profile)=>{setCustomer(profile.name);setCustomerWhatsapp(profile.phone);setShowMemberScanner(false);setCheckoutError('');}}
    />}
    {receipt&&<Receipt sale={receipt} onClose={()=>setReceipt(null)} enablePointRedemption/>}
  </AppFrame>;
}

const historyCsvCell = (value: string | number) => {
  const raw = String(value);
  const safe = typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(value) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

function downloadHistoryCsv(salon: SalonId, rows: Sale[]) {
  const headers = [
    'Tanggal & jam',
    'No. invoice',
    'Salon',
    'Pelanggan',
    'Nomor HP',
    'Kasir',
    'Layanan & staf',
    'Subtotal (Rp)',
    'Jenis diskon',
    'Diskon (Rp)',
    'Total (Rp)',
    'Metode pembayaran',
    'Diterima (Rp)',
    'Kembalian (Rp)',
    'Poin diperoleh',
    'Saldo poin',
  ];
  const dataRows = rows.map((sale) => [
    dateTimeId(new Date(sale.createdAt)),
    sale.invoiceNumber,
    salonDetails[sale.salon].name,
    sale.customerName || 'Pelanggan umum',
    sale.customerPhone || sale.customerWhatsapp || '',
    sale.cashierName || '',
    sale.items.map((item) => {
      const staffName = item.employeeName?.trim() ? displayStaffName(item.employeeName) : 'Staf tidak tercatat';
      return `${item.name} × ${item.quantity} @ ${money(item.unitPrice)} = ${money(item.unitPrice * item.quantity)}${serviceDiscount(item) > 0 ? ` · Diskon layanan ${money(serviceDiscount(item))}` : ""} · ${staffName}`;
    }).join(' | '),
    sale.subtotal,
    sale.discountMode === 'percent' ? `Persen (${sale.discountValue ?? 0}%)` : sale.discount > 0 ? 'Nominal' : '',
    sale.discount,
    sale.total,
    sale.paymentMethod,
    sale.amountReceived,
    sale.paymentMethod === 'Tunai' ? sale.change : 0,
    sale.pointsEarned ?? pointsFromAmount(sale.total),
    sale.pointsBalance ?? '',
  ]);
  const csv = `\uFEFF${[headers, ...dataRows].map((row) => row.map(historyCsvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const salonSlug = salon === 'beauty' ? 'ggs-beauty' : 'ggs-hair-studio';
  link.href = url;
  link.download = `riwayat-${salonSlug}-${businessDateKey(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function HistoryPage() {
  const [activeSalon, setActiveSalon] = useActiveSalon();
  const salesQuery = useGetSales({ salon: activeSalon });
  const sales = useMemo(() => (salesQuery.data ?? []).map(toUiSale), [salesQuery.data]);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('semua');
  const filtered = useMemo(() => sales.filter((sale) => {
    const text = `${sale.invoiceNumber} ${salonDetails[sale.salon].name} ${sale.customerName} ${sale.customerPhone || ''} ${sale.customerWhatsapp || ''} ${sale.cashierName || ''} ${sale.paymentMethod} ${sale.items.map((item) => item.name).join(' ')}`.toLocaleLowerCase('id');
    const dayDifference = businessDayNumber(new Date()) - businessDayNumber(new Date(sale.createdAt));
    const inPeriod = period === 'semua' || (period === 'hari-ini' && dayDifference === 0) || (period === '7-hari' && dayDifference >= 0 && dayDifference < 7);
    return text.includes(query.trim().toLocaleLowerCase('id')) && inPeriod && sale.salon === activeSalon;
  }), [sales, query, period, activeSalon]);
  const periodTotal = filtered.reduce((sum, sale) => sum + sale.total, 0);
  const averageSale = filtered.length ? Math.round(periodTotal / filtered.length) : 0;
  const periodLabel = period === 'hari-ini' ? 'Hari ini' : period === '7-hari' ? '7 hari terakhir' : 'Semua waktu';

  return <AppFrame salon={activeSalon}>
    <SalonSwitcher salon={activeSalon} onSelect={setActiveSalon} context="history"/>
    <div className="fade-up mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd3c76] sm:text-[11px]"><span className="h-px w-5 bg-[#d88cac]"/> Catatan penjualan</div>
        <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-[-.05em] text-[#472538] sm:text-[39px]">Riwayat transaksi<span className="text-[#c04b7e]">.</span></h1>
        <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-[#927789] sm:text-sm">Periksa layanan, pembayaran, poin loyalti, dan cetak ulang struk transaksi selesai.</p>
      </div>
      <div className="flex w-fit items-center gap-2 rounded-xl border border-[#efdae5] bg-white px-3.5 py-2.5 text-[10px] font-semibold text-[#765b6d] shadow-[0_4px_12px_rgba(91,37,63,.035)] sm:text-[11px]">
        <Clock3 size={14} className="text-[#bd3c76]"/> Tersimpan otomatis · data database
      </div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <HistoryMetric label="TRANSAKSI DITAMPILKAN" value={String(filtered.length).padStart(2, '0')} note={periodLabel} icon={ShoppingBag}/>
      <HistoryMetric label="TOTAL PENJUALAN" value={money(periodTotal)} note="Mengikuti pencarian dan rentang" icon={ArrowUpRight}/>
      <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-[#7c3155] p-4 text-white shadow-[0_12px_28px_rgba(91,37,63,.12)] sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#f4c5d7]"><Banknote size={18}/></span>
        <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[.14em] text-white/65">RATA-RATA TRANSAKSI</p><p className="mt-1 truncate font-display text-xl font-extrabold">{money(averageSale)}</p><p className="text-[10px] text-white/70">Dari {filtered.length} transaksi · {periodLabel.toLowerCase()}</p></div>
      </div>
    </div>

    <section className="overflow-hidden rounded-[22px] border border-[#efdae5] bg-white shadow-[0_14px_38px_rgba(91,37,63,.06)]">
      <div className="flex flex-col gap-4 border-b border-[#f1e4ea] p-4 sm:px-5 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f9edf3] text-[#b33d73]"><History size={18}/></span>
          <div><h2 className="font-display text-[17px] font-extrabold tracking-[-.03em] text-[#472538]">Daftar transaksi</h2><p className="mt-0.5 text-[11px] text-[#9a7b8d]">{filtered.length} catatan ditemukan</p></div>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(190px,1fr)_minmax(150px,.6fr)_auto] lg:w-[560px] lg:grid-cols-[minmax(180px,1fr)_minmax(130px,.7fr)_auto]">
          <label className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#ecd8e2] bg-[#fffafb] px-3 focus-within:border-[#c45a88] focus-within:ring-2 focus-within:ring-[#f6e4ec]">
            <Search size={15} className="shrink-0 text-[#aa8296]"/>
            <input data-testid="input-search-history" aria-label="Cari riwayat transaksi" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Cari nama, invoice, layanan..." className="min-w-0 w-full bg-transparent py-2.5 text-xs text-[#55374a] outline-none placeholder:text-[#b59aab]"/>
          </label>
          <label className="relative flex items-center">
            <CalendarDays size={14} className="pointer-events-none absolute left-3 text-[#aa8296]"/>
            <select data-testid="select-history-period" aria-label="Rentang tanggal riwayat" value={period} onChange={(event)=>setPeriod(event.target.value)} className="w-full appearance-none rounded-xl border border-[#ecd8e2] bg-[#fffafb] py-2.5 pl-9 pr-9 text-xs font-semibold text-[#765b6d] outline-none focus:border-[#c45a88] focus:ring-2 focus:ring-[#f6e4ec]">
              <option value="hari-ini">Hari ini</option><option value="7-hari">7 hari terakhir</option><option value="semua">Semua waktu</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 text-[#9b7e8e]"/>
          </label>
          <button
            type="button"
            onClick={() => downloadHistoryCsv(activeSalon, sales)}
            disabled={salesQuery.isLoading || salesQuery.isError || sales.length === 0}
            aria-label="Unduh semua transaksi pada salon yang dipilih, tanpa mengikuti filter pencarian atau periode"
            title="Mengunduh semua transaksi di salon ini, bukan hanya hasil filter"
            data-testid="button-download-all-history"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-[#ecd8e2] bg-white px-3 text-xs font-bold text-[#a83e70] transition hover:bg-[#fdf3f7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14}/> Unduh semua CSV
          </button>
        </div>
      </div>
      {salesQuery.isLoading ? (
        <div className="px-5 py-16 text-center text-sm text-[#927789]" role="status">Memuat riwayat transaksi…</div>
      ) : salesQuery.isError ? (
        <div className="px-5 py-16 text-center">
          <h3 className="font-display text-lg font-bold text-[#58374c]">Riwayat belum dapat dimuat</h3><p className="mt-1 text-sm text-[#9a7c8d]">Periksa koneksi database lalu coba lagi.</p>
          <button onClick={()=>void salesQuery.refetch()} className="mt-4 rounded-lg border border-[#e8cfdb] px-3 py-2 text-xs font-bold text-[#a83e70] hover:bg-[#fdf3f7]">Coba lagi</button>
        </div>
      ) : filtered.length ? (
        <div className="divide-y divide-[#f2e8ed]">{filtered.map((sale, index)=><HistoryRow key={sale.id} sale={sale} initialOpen={index===0}/>)}</div>
      ) : (
        <div className="px-5 py-14 text-center sm:py-16" data-testid="empty-history">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f9edf3] text-[#bd7194]"><History size={21}/></span>
          <h3 className="mt-4 font-display text-lg font-bold text-[#58374c]">{sales.length?'Tidak ada transaksi ditemukan':'Belum ada transaksi'}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#9a7c8d]">{sales.length?'Coba kata kunci atau rentang tanggal yang berbeda.':'Transaksi yang selesai dari menu Kasir akan tersimpan otomatis dan tampil di sini.'}</p>
          {(query||period!=='semua')&&<button onClick={()=>{setQuery('');setPeriod('semua');}} className="mt-4 rounded-lg border border-[#e8cfdb] px-3 py-2 text-xs font-bold text-[#a83e70] hover:bg-[#fdf3f7]">Atur ulang filter</button>}
        </div>
      )}
      <div className="border-t border-[#f1e4ea] bg-[#fffafb] px-4 py-3 text-[10px] leading-relaxed text-[#9a7b8d] sm:px-5">Informasi pelanggan, layanan, pembayaran, dan poin ditampilkan sesuai catatan transaksi tersimpan.</div>
    </section>
  </AppFrame>;
}

function HistoryMetric({ label, value, note, icon: Icon, valueTestId }: { label: string; value: string; note: string; icon: typeof ShoppingBag; valueTestId?: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-[#efdae5] bg-white p-4 shadow-[0_8px_24px_rgba(91,37,63,.045)] sm:p-5">
    <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[.14em] text-[#9a7b8d] sm:text-[10px]">{label}</p><p data-testid={valueTestId} className="mt-2 truncate font-display text-[22px] font-extrabold tracking-[-.04em] text-[#472538] sm:text-[26px]">{value}</p><p className="mt-1 text-[10px] text-[#a18696] sm:text-[11px]">{note}</p></div>
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f9edf3] text-[#bb477a]"><Icon size={16}/></span>
  </div>;
}

function MemberRegistrationDialog({ salon, customers, onClose, onCreated }: {
  salon: SalonId;
  customers: CustomerProfile[];
  onClose: () => void;
  onCreated: (profile: CustomerProfile) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const createCustomerMutation = useCreateCustomer();
  const normalizedPhone = normalizeCustomerPhone(phone);
  const phoneIsValid = /^\d{8,15}$/.test(normalizedPhone);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120 || !phoneIsValid) {
      setError('Isi nama dan nomor HP yang valid untuk mendaftar.');
      return;
    }
    const existingCustomer = customers.find((customer) => normalizeCustomerPhone(customer.phone) === normalizedPhone);
    if (existingCustomer) {
      setError('Nomor HP ini sudah terdaftar sebagai member. Cetak kartunya dari daftar member.');
      return;
    }
    try {
      const created = await createCustomerMutation.mutateAsync({
        data: { salon, name: trimmedName, phone: phone.trim() },
      });
      await queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey() });
      onCreated(toUiCustomer(created));
    } catch (requestError) {
      const responseData = requestError && typeof requestError === 'object' && 'data' in requestError
        ? (requestError as { data?: unknown }).data
        : null;
      const responseMessage = responseData && typeof responseData === 'object' && 'error' in responseData
        ? (responseData as { error?: unknown }).error
        : null;
      setError(typeof responseMessage === 'string'
        ? responseMessage
        : requestError instanceof Error ? requestError.message : 'Pendaftaran member belum berhasil. Coba lagi.');
    }
  };

  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#24131d]/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="w-full max-w-[460px] rounded-[24px] border border-[#f0dce5] bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="member-registration-title">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#bd3c76]">Member baru · {salonDetails[salon].name}</p><h2 id="member-registration-title" className="mt-1 font-display text-xl font-extrabold text-[#472538]">Daftarkan member</h2><p className="mt-1 text-xs text-[#927789]">Kartu dan ID member dibuat otomatis setelah pendaftaran.</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup pendaftaran member" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8e6c7e] hover:bg-[#f8edf2]"><X size={18}/></button>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="block text-[11px] font-bold text-[#806476]" htmlFor="input-new-member-name">Nama pelanggan
          <input id="input-new-member-name" data-testid="input-new-member-name" required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama sesuai kartu" className="mt-1.5 block w-full rounded-xl border border-[#eddae4] bg-[#fffafb] px-3 py-3 text-sm font-normal text-[#56374a] outline-none focus:border-[#c04b7e]"/>
        </label>
        <label className="block text-[11px] font-bold text-[#806476]" htmlFor="input-new-member-phone">Nomor HP
          <input id="input-new-member-phone" data-testid="input-new-member-phone" type="tel" inputMode="tel" required maxLength={24} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08xx atau +62..." className="mt-1.5 block w-full rounded-xl border border-[#eddae4] bg-[#fffafb] px-3 py-3 text-sm font-normal text-[#56374a] outline-none focus:border-[#c04b7e]"/>
          <span className="mt-1 block text-[10px] font-normal text-[#a58a99]">Nomor HP menjadi identitas member di salon ini.</span>
        </label>
        {error && <p role="alert" data-testid="status-member-registration-error" className="rounded-xl bg-[#fff2f1] px-3 py-2.5 text-xs font-semibold text-[#a34a4a]">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#ecd9e2] px-4 py-2.5 text-xs font-bold text-[#765b6d] hover:bg-[#fbf3f7]">Batal</button>
          <button type="submit" disabled={createCustomerMutation.isPending || !name.trim() || !phoneIsValid} data-testid="button-submit-member-registration" className="flex items-center justify-center gap-2 rounded-xl bg-[#a9366b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#922f5e] disabled:cursor-not-allowed disabled:opacity-55">
            {createCustomerMutation.isPending ? 'Mendaftarkan…' : <><Users size={15}/> Daftarkan &amp; buat kartu</>}
          </button>
        </div>
      </form>
    </section>
  </div>, document.body);
}

function CustomerPage() {
  const [activeSalon, setActiveSalon] = useActiveSalon();
  const customersQuery = useGetCustomers({ salon: activeSalon });
  const salesQuery = useGetSales({ salon: activeSalon });
  const serviceMenuQuery = useGetServices({ salon: activeSalon });
  const customers = useMemo(() => (customersQuery.data ?? []).map(toUiCustomer), [customersQuery.data]);
  const sales = useMemo(() => (salesQuery.data ?? []).map(toUiSale), [salesQuery.data]);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registeredMember, setRegisteredMember] = useState<CustomerProfile | null>(null);
  const [showMemberScanner, setShowMemberScanner] = useState(false);
  const [scannedMemberPhone, setScannedMemberPhone] = useState<string | null>(null);
  const salesByCustomer = useMemo(() => {
    const grouped = new Map<string, Sale[]>();
    for (const sale of sales) {
      const phone = normalizeCustomerPhone(sale.customerPhone || sale.customerWhatsapp || '');
      if (!phone) continue;
      grouped.set(phone, [...(grouped.get(phone) ?? []), sale]);
    }
    for (const customerSales of grouped.values()) {
      customerSales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return grouped;
  }, [sales]);
  const promoEligibleServiceIds = useMemo(() => new Set(
    (serviceMenuQuery.data ?? [])
      .filter((service) => !['ADDITION', 'ADDITIONAL'].includes(service.category.trim().toLocaleUpperCase('id')))
      .map((service) => service.id),
  ), [serviceMenuQuery.data]);
  const hairStudioPromoAlerts = useMemo(() => {
    if (activeSalon !== 'hair-studio') return [];
    return customers.flatMap((profile) => {
      const qualifiedTransactions = (salesByCustomer.get(normalizeCustomerPhone(profile.phone)) ?? [])
        .filter((sale) => sale.items.some((item) => promoEligibleServiceIds.has(item.serviceId)))
        .length;
      const visitsInCurrentCycle = qualifiedTransactions % 10;
      if (visitsInCurrentCycle < 7) return [];
      return [{
        name: profile.name,
        phone: profile.phone,
        visitCount: visitsInCurrentCycle,
        visitsRemaining: Math.max(0, 9 - visitsInCurrentCycle),
      }];
    }).sort((a, b) => b.visitCount - a.visitCount || customerDisplayName(a.name).localeCompare(customerDisplayName(b.name), 'id'));
  }, [activeSalon, customers, salesByCustomer, promoEligibleServiceIds]);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<CustomerSort>('points');
  const sortLabels: Record<CustomerSort, string> = {
    points: 'saldo poin tertinggi',
    spent: 'total belanja tertinggi',
    transactions: 'transaksi terbanyak',
    recent: 'transaksi terbaru',
    name: 'nama A–Z',
  };
  const rankedCustomers = useMemo(() => [...customers].sort((a, b) =>
    {
      const nameOrder = customerDisplayName(a.name).localeCompare(customerDisplayName(b.name), 'id');
      const spendOrder = (b.totalSpent ?? 0) - (a.totalSpent ?? 0);
      const pointsOrder = b.points - a.points;
      if (sortBy === 'name') return nameOrder || a.phone.localeCompare(b.phone, 'id');
      if (sortBy === 'spent') return spendOrder || pointsOrder || nameOrder;
      if (sortBy === 'transactions') return b.transactionCount - a.transactionCount || spendOrder || nameOrder;
      if (sortBy === 'recent') {
        const activityTime = (value: string | null) => {
          const timestamp = value ? Date.parse(value) : 0;
          return Number.isFinite(timestamp) ? timestamp : 0;
        };
        return activityTime(b.lastTransactionAt) - activityTime(a.lastTransactionAt) || pointsOrder || nameOrder;
      }
      return pointsOrder || spendOrder || nameOrder;
    },
  ), [customers, sortBy]);
  const normalizedQuery = query.trim().toLocaleLowerCase('id');
  const normalizedPhoneQuery = normalizeCustomerPhone(query);
  const filtered = useMemo(() => rankedCustomers
    .filter((profile) => customerDisplayName(profile.name).toLocaleLowerCase('id').includes(normalizedQuery)
      || (normalizedPhoneQuery.length > 0 && normalizeCustomerPhone(profile.phone).includes(normalizedPhoneQuery))),
  [rankedCustomers, normalizedQuery, normalizedPhoneQuery]);
  const totalPoints = customers.reduce((sum, profile) => sum + profile.points, 0);
  const totalSpent = customers.reduce((sum, profile) => sum + (profile.totalSpent ?? 0), 0);
  const returningCustomers = customers.filter((profile) => profile.transactionCount > 1).length;
  return <AppFrame salon={activeSalon}>
    <SalonSwitcher salon={activeSalon} onSelect={setActiveSalon} context="customers"/>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 fade-up">
       <div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#bd3c76]"><span className="h-px w-5 bg-[#d88cac]"/> Member &amp; loyalitas</div><h1 className="font-display text-[32px] font-extrabold tracking-[-.045em] text-[#472538] sm:text-[39px]">Member {salonDetails[activeSalon].name}<span className="text-[#c04b7e]">.</span></h1><p className="mt-1 text-sm text-[#927789]">Cari atau scan kartu untuk melihat profil, saldo poin, dan riwayat.</p></div>
        <div className="flex flex-wrap items-center gap-2">
           <button type="button" onClick={() => setShowMemberScanner(true)} disabled={customersQuery.isLoading || customersQuery.isError || customers.length === 0} data-testid="button-scan-member-directory" className="flex items-center justify-center gap-2 rounded-xl border border-[#e8cfdb] bg-white px-3.5 py-2.5 text-xs font-bold text-[#a83e70] transition hover:bg-[#fdf3f7] disabled:cursor-not-allowed disabled:opacity-50"><ScanLine size={15}/> Scan kartu</button>
          <button type="button" onClick={() => setShowRegistration(true)} data-testid="button-register-member" className="flex items-center justify-center gap-2 rounded-xl bg-[#a9366b] px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#922f5e]"><Plus size={15}/> Daftarkan member</button>
          <div className="flex items-center gap-2 rounded-xl border border-[#efdae5] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#765b6d]"><Coins size={15} className="text-[#bd3c76]"/> Rp1.000 = 1 poin</div>
        </div>
    </div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
       <HistoryMetric label="MEMBER TERDAFTAR" value={String(customers.length)} note={`Profil ${salonDetails[activeSalon].name}`} icon={Users} valueTestId="text-customer-count"/>
      <HistoryMetric label="POIN LOYALTI AKTIF" value={totalPoints.toLocaleString('id-ID')} note="Saldo profil di salon ini" icon={Coins} valueTestId="text-customer-points"/>
      <HistoryMetric label="TOTAL BELANJA" value={money(totalSpent)} note="Akumulasi pada salon terpilih" icon={ArrowUpRight} valueTestId="text-customer-spend"/>
      <HistoryMetric label="PELANGGAN KEMBALI" value={String(returningCustomers)} note="Lebih dari satu transaksi" icon={UserRound}/>
    </div>
    <p className="mb-3 text-[10px] text-[#9a7b8d]">Poin, belanja, dan riwayat hanya menghitung data {salonDetails[activeSalon].name}.</p>
    {activeSalon === 'hair-studio' && <HairStudioPromoNotifications
      alerts={hairStudioPromoAlerts}
      isLoading={salesQuery.isLoading || serviceMenuQuery.isLoading}
      isError={salesQuery.isError || serviceMenuQuery.isError}
      onRetry={() => {
        void salesQuery.refetch();
        void serviceMenuQuery.refetch();
      }}
    />}
    <section className="overflow-hidden rounded-[23px] border border-[#efdae5] bg-white soft-shadow">
      <div className="flex flex-col gap-3 border-b border-[#f1e4ea] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
         <div className="min-w-0">
           <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-extrabold text-[#472538]">Daftar member</h2><span className="rounded-full bg-[#f8eff3] px-2.5 py-1 text-[10px] font-bold text-[#8d6279]" aria-live="polite">{filtered.length} dari {customers.length} profil</span></div>
          <p className="mt-0.5 text-xs text-[#9a7b8d]">Urut berdasarkan {sortLabels[sortBy]}</p>
        </div>
        <div className="grid min-w-0 gap-2 sm:flex sm:items-center">
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-[#ecd8e2] bg-[#fffafb] px-3 focus-within:border-[#bd3c76] focus-within:ring-2 focus-within:ring-[#bd3c76]/15">
            <Search size={15} className="shrink-0 text-[#aa8296]"/>
            <input aria-label="Cari nama atau nomor HP pelanggan" data-testid="input-search-customers" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Cari nama atau nomor HP" className="min-w-0 flex-1 bg-transparent py-2.5 text-xs outline-none placeholder:text-[#b59aab] sm:w-[205px]"/>
            {query && <button type="button" onClick={()=>setQuery('')} aria-label="Bersihkan pencarian pelanggan" className="shrink-0 text-[10px] font-bold text-[#a83e70]">Hapus</button>}
          </label>
          <label className="flex min-h-[42px] items-center rounded-xl border border-[#ecd8e2] bg-white px-3">
            <span className="sr-only">Urutkan pelanggan</span>
            <select aria-label="Urutkan pelanggan" value={sortBy} onChange={(event)=>setSortBy(event.target.value as CustomerSort)} className="min-w-0 flex-1 bg-transparent py-2 text-xs font-semibold text-[#765b6d] outline-none">
              <option value="points">Poin tertinggi</option>
              <option value="spent">Belanja tertinggi</option>
              <option value="transactions">Transaksi terbanyak</option>
              <option value="recent">Transaksi terbaru</option>
              <option value="name">Nama A–Z</option>
            </select>
          </label>
        </div>
      </div>
      {customersQuery.isLoading ? <div className="px-5 py-16 text-center text-sm text-[#927789]">Memuat data pelanggan…</div> : customersQuery.isError ? <div className="px-5 py-16 text-center"><h3 className="font-display text-lg font-bold text-[#58374c]">Data pelanggan belum dapat dimuat</h3><p className="mt-1 text-sm text-[#9a7c8d]">Periksa koneksi database lalu coba lagi.</p><button onClick={()=>void customersQuery.refetch()} className="mt-4 rounded-lg border border-[#e8cfdb] px-3 py-2 text-xs font-bold text-[#a83e70]">Coba lagi</button></div> : filtered.length ? <div className="divide-y divide-[#f2e8ed]">{filtered.map((profile)=><CustomerRow key={profile.phone} salon={activeSalon} profile={profile} sales={salesByCustomer.get(normalizeCustomerPhone(profile.phone))??[]} salesLoading={salesQuery.isLoading} salesError={salesQuery.isError} openOnScan={scannedMemberPhone === profile.phone}/>)}</div> : <div className="px-5 py-16 text-center" data-testid="empty-customers"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f9edf3] text-[#bd7194]"><Users size={21}/></span><h3 className="mt-4 font-display text-lg font-bold text-[#58374c]">{customers.length?'Pelanggan tidak ditemukan':'Belum ada data pelanggan'}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-[#9a7c8d]">{customers.length?'Coba cari dengan nama atau nomor HP lain.':'Data pelanggan dan poin akan tersimpan otomatis setelah transaksi selesai.'}</p></div>}
   </section>
   {showRegistration && <MemberRegistrationDialog
     salon={activeSalon}
     customers={customers}
     onClose={() => setShowRegistration(false)}
     onCreated={(profile) => {
       setShowRegistration(false);
       setRegisteredMember(profile);
     }}
   />}
    {showMemberScanner && <MemberCardScanner
      salon={activeSalon}
      customers={customers}
      context="member"
      onClose={() => setShowMemberScanner(false)}
      onSelect={(profile) => {
        setQuery(profile.phone);
        setScannedMemberPhone(profile.phone);
        setShowMemberScanner(false);
      }}
    />}
   {registeredMember && <MemberCardDialog salon={registeredMember.salon} profile={registeredMember} onClose={() => setRegisteredMember(null)}/>}
  </AppFrame>;
}

type HairStudioPromoAlert = {
  name: string;
  phone: string;
  visitCount: number;
  visitsRemaining: number;
};

function HairStudioPromoNotifications({ alerts, isLoading, isError, onRetry }: {
  alerts: HairStudioPromoAlert[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const whatsappHref = (alert: HairStudioPromoAlert) => {
    const phone = toWhatsAppNumber(alert.phone);
    if (phone.length < 8 || phone.length > 15) return null;
    const firstName = customerDisplayName(alert.name).split(/\s+/)[0] || 'Pelanggan';
    const message = alert.visitsRemaining === 0
      ? `Selamat ${firstName}! Anda sudah menyelesaikan 9 kunjungan layanan di GGS Hair Studio. Anda berhak mendapatkan 1x potong rambut gratis. Tunjukkan pesan ini saat berkunjung.`
      : `Halo ${firstName}! Anda sudah ${alert.visitCount}x berkunjung ke GGS Hair Studio. Ayo ${alert.visitsRemaining}x lagi untuk mendapatkan 1x potong rambut gratis. Kami tunggu kedatangannya!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  return <section className="mb-5 overflow-hidden rounded-[22px] border border-[#dedede] bg-white shadow-[0_8px_24px_rgba(30,30,30,.06)]" aria-labelledby="hair-studio-promo-title" data-testid="hair-studio-promo-notifications">
    <header className="flex flex-col gap-3 bg-[#191919] p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#e8c987]"><Gift size={19}/></span>
        <div className="min-w-0">
          <p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#d9c59c]">Pengingat promo · GGS Hair Studio</p>
          <h2 id="hair-studio-promo-title" className="mt-1 font-display text-base font-extrabold sm:text-lg">Gratis 1x potong rambut setelah 9 kunjungan</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-white/70">Semua layanan selain kategori ADDITION dihitung satu kali per transaksi.</p>
        </div>
      </div>
      <span className="w-fit rounded-full bg-[#e8c987] px-3 py-1.5 text-[10px] font-extrabold text-[#202020]" aria-live="polite">
        {isLoading ? 'Memuat…' : `${alerts.length} pengingat`}
      </span>
    </header>

    {isLoading
      ? <div className="p-5 text-xs text-[#777]">Menghitung kunjungan pelanggan…</div>
      : isError
        ? <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-xs text-[#8b4a4a]" role="alert">Hitungan promo belum dapat dimuat.</p>
          <button type="button" onClick={onRetry} className="rounded-lg border border-[#d9d9d9] px-3 py-2 text-xs font-bold text-[#252525] hover:bg-[#f5f5f5]">Coba lagi</button>
        </div>
        : alerts.length
          ? <>
            <div className="divide-y divide-[#ededed]">
            {alerts.map((alert) => {
              const href = whatsappHref(alert);
              return <article key={alert.phone} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-extrabold text-[#272727]">{customerDisplayName(alert.name)}</h3>
                    <span className="rounded-full bg-[#f1f1f1] px-2 py-0.5 text-[9px] font-bold text-[#555]">{alert.visitCount}/9 kunjungan</span>
                  </div>
                  <p className={`mt-1 text-xs font-semibold ${alert.visitsRemaining === 0 ? 'text-[#8a6b24]' : 'text-[#565656]'}`}>
                    {alert.visitsRemaining === 0
                      ? 'Hadiah siap: gratis 1x potong rambut.'
                      : `Ayo ${alert.visitsRemaining}x lagi untuk gratis 1x potong rambut.`}
                  </p>
                  <div className="mt-2 h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-[#ededed]" role="progressbar" aria-label={`Progres promo ${customerDisplayName(alert.name)}`} aria-valuemin={0} aria-valuemax={9} aria-valuenow={alert.visitCount}>
                    <span className="block h-full rounded-full bg-[#b08c4c]" style={{ width: `${Math.min(100, (alert.visitCount / 9) * 100)}%` }}/>
                  </div>
                  <p className="mt-1 text-[10px] text-[#8b8b8b]">{alert.phone}</p>
                </div>
                {href
                  ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#191919] px-3.5 text-xs font-bold text-white transition hover:bg-[#333]" data-testid={`button-promo-whatsapp-${alert.phone}`}>
                    <MessageCircle size={15}/> Siapkan pesan WhatsApp
                  </a>
                  : <span className="text-[10px] font-semibold text-[#9a4d4d]">Nomor WhatsApp tidak valid</span>}
              </article>;
            })}
            </div>
            <p className="border-t border-[#ededed] px-4 py-3 text-[10px] leading-relaxed text-[#888] sm:px-5">Setelah hadiah digunakan, catat potong rambut gratis sebagai transaksi ke-10 agar putaran berikutnya dimulai.</p>
          </>
          : <div className="p-5">
            <p className="text-xs font-semibold text-[#454545]">Belum ada pelanggan di tahap pengingat.</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#888]">Setelah hadiah digunakan, catat potong rambut gratis sebagai transaksi ke-10 agar putaran berikutnya dimulai.</p>
          </div>}
  </section>;
}

function CustomerRow({ salon, profile, sales, salesLoading, salesError, openOnScan = false }: { salon: SalonId; profile: CustomerProfile; sales: Sale[]; salesLoading: boolean; salesError: boolean; openOnScan?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [openTransactionId, setOpenTransactionId] = useState<string | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [showMemberCard, setShowMemberCard] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const displayName = customerDisplayName(profile.name);
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toLocaleUpperCase('id');
  const visibleSales = showAllTransactions ? sales : sales.slice(0, 4);
  useEffect(() => {
    if (openOnScan) setOpen(true);
  }, [openOnScan]);

  return <article data-testid={`row-customer-${profile.phone}`} className={`px-4 py-4 transition-colors sm:px-5 ${open ? 'bg-[#fffafb]' : 'hover:bg-[#fffafb]'}`}>
    <div className="flex min-w-0 items-start gap-2">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={`customer-details-${profile.phone}`} data-testid={`button-expand-customer-${profile.phone}`} className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd3c76] sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#f8eaf1] text-xs font-extrabold text-[#a9366b]">{initials || <UserRound size={17}/>}</span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-extrabold text-[#55374a]">{displayName}</span>{profile.transactionCount > 1 && <span className="rounded-full bg-[#eef7f1] px-2 py-0.5 text-[9px] font-bold text-[#54856a]">Pelanggan kembali</span>}</span>
            <span className="mt-1 block text-xs text-[#9a7b8d]">{profile.phone}</span>
            <span className="mt-1 block text-[10px] text-[#a58a99]">Terakhir transaksi {profile.lastTransactionAt ? dateTimeId(new Date(profile.lastTransactionAt)) : '—'}</span>
          </span>
          <ChevronDown size={17} className={`shrink-0 text-[#aa8496] transition-transform sm:hidden ${open ? 'rotate-180' : ''}`}/>
        </span>
        <span className="grid w-full min-w-0 grid-cols-3 gap-2 border-t border-[#f4eaf0] pt-3 text-left sm:w-auto sm:min-w-[390px] sm:gap-4 sm:border-0 sm:pt-0 sm:text-right">
          <span><span className="block text-[9px] font-bold text-[#9a7b8d]">SALDO POIN</span><span className="mt-1 block text-sm font-extrabold text-[#a9366b]">{profile.points.toLocaleString('id-ID')}</span></span>
          <span><span className="block text-[9px] font-bold text-[#9a7b8d]">TRANSAKSI</span><span className="mt-1 block text-sm font-extrabold text-[#56374a]">{profile.transactionCount ?? 0}</span></span>
          <span><span className="block text-[9px] font-bold text-[#9a7b8d]">TOTAL BELANJA</span><span className="mt-1 block truncate text-sm font-extrabold text-[#56374a]">{money(profile.totalSpent ?? 0)}</span></span>
        </span>
        <ChevronDown size={17} className={`hidden shrink-0 text-[#aa8496] transition-transform sm:block ${open ? 'rotate-180' : ''}`}/>
      </button>
      <button type="button" onClick={() => setShowMemberCard(true)} aria-label={`Cetak kartu member ${displayName}`} title="Cetak kartu member" data-testid={`button-member-card-${profile.phone}`} className="mt-1 flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#e8cfdb] px-2 text-[10px] font-bold text-[#a83e70] transition hover:bg-[#fdf3f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd3c76] sm:px-2.5"><Printer size={14}/><span className="hidden md:inline">Kartu</span></button>
      <button type="button" onClick={() => setShowDelete(true)} aria-label={`Hapus profil ${displayName}`} title="Hapus profil pelanggan" className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#a97689] transition hover:bg-[#fff0f0] hover:text-[#ad3d52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ad3d52]"><Trash2 size={16}/></button>
    </div>

    {open && <div id={`customer-details-${profile.phone}`} className="mt-4 rounded-[16px] border border-[#f0e2e9] bg-white p-4 sm:ml-[56px] sm:p-5">
      <div className="grid gap-3 border-b border-[#f1e6eb] pb-4 sm:grid-cols-3">
        <CustomerDetail label="KONTAK PELANGGAN" value={profile.phone} note="Nomor yang digunakan untuk pencatatan poin" icon={UserRound}/>
        <CustomerDetail label="SALDO POIN SAAT INI" value={`${profile.points.toLocaleString('id-ID')} poin`} note="Akumulasi poin dari transaksi tersimpan" icon={Coins}/>
        <CustomerDetail label="PEMBELIAN TERAKHIR" value={profile.lastTransactionAt ? dateTimeId(new Date(profile.lastTransactionAt)) : 'Belum tercatat'} note={`${profile.transactionCount ?? 0} transaksi · total ${money(profile.totalSpent ?? 0)}`} icon={Clock3}/>
      </div>
      <div className="pt-4">
        <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div><h3 className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#9a7b8d]">Riwayat transaksi pelanggan</h3><p className="mt-1 text-[10px] text-[#a18696]">{sales.length} transaksi tercatat pada nomor ini</p></div>
          {sales.length > 4 && <button type="button" onClick={() => setShowAllTransactions((value) => !value)} className="w-fit rounded-lg border border-[#e8cfdb] px-3 py-1.5 text-[10px] font-bold text-[#a83e70] hover:bg-[#fdf3f7]">{showAllTransactions ? 'Tampilkan lebih sedikit' : 'Lihat semua transaksi'}</button>}
        </div>
        {salesLoading ? <div className="rounded-xl bg-[#fffafb] px-4 py-8 text-center text-xs text-[#927789]" role="status">Memuat riwayat transaksi…</div>
          : salesError ? <div className="rounded-xl border border-[#f0dce5] bg-[#fffafb] px-4 py-6 text-center text-xs text-[#9a7b8d]">Riwayat transaksi belum dapat dimuat. Coba lagi nanti.</div>
            : sales.length ? <div className="overflow-hidden rounded-xl border border-[#f0e3ea]">
              {visibleSales.map((sale) => <CustomerTransaction key={sale.id} sale={sale} open={openTransactionId === sale.id} onToggle={() => setOpenTransactionId((current) => current === sale.id ? null : sale.id)} onReceipt={() => setReceiptSale(sale)}/>)}
            </div>
              : <div className="rounded-xl bg-[#fffafb] px-4 py-8 text-center text-xs text-[#9a7b8d]">Belum ada transaksi yang cocok dengan nomor pelanggan ini.</div>}
      </div>
    </div>}

    {receiptSale && <Receipt sale={receiptSale} onClose={() => setReceiptSale(null)}/>}
    {showMemberCard && <MemberCardDialog salon={salon} profile={profile} onClose={() => setShowMemberCard(false)}/>}
    {showDelete && <DeleteConfirmation
      title={`Hapus profil ${displayName}?`}
      description="Profil dan saldo poinnya akan dihapus permanen. Riwayat transaksi lama tetap ada, termasuk nama dan nomor HP pada struk."
      endpoint={`/api/customers/${salon}/${encodeURIComponent(profile.phone)}`}
      onCancel={() => setShowDelete(false)}
      onDeleted={async () => { await queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey() }); }}
    />}
  </article>;
}

function MemberCardDialog({ salon, profile, onClose }: { salon: SalonId; profile: CustomerProfile; onClose: () => void }) {
  const brand = salonDetails[salon];
  const shortMemberCode = profile.memberCode.replace(/-/g, '').slice(0, 8).toUpperCase();
  const qrValue = memberCardScanValue(profile.memberCode);
  const frontCardRef = useRef<HTMLElement>(null);
  const backCardRef = useRef<HTMLElement>(null);
  const qrBadgeRef = useRef<HTMLCanvasElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const handleDownload = async () => {
    if (!frontCardRef.current || !backCardRef.current) {
      setDownloadError('Pratinjau kartu belum siap. Coba lagi.');
      return;
    }
    setDownloadError('');
    setIsDownloading(true);
    const safeName = profile.name.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
    try {
      await downloadMemberCardPdf(
        frontCardRef.current,
        backCardRef.current,
        `kartu-member-${salon}-${safeName}.pdf`,
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Kartu belum berhasil diunduh. Coba lagi.');
    } finally {
      setIsDownloading(false);
    }
  };
  useEffect(() => {
    document.body.classList.add('member-card-dialog-open');
    const badge = qrBadgeRef.current;
    if (badge) {
      const size = 34;
      const resolution = 4;
      badge.width = size * resolution;
      badge.height = size * resolution;
      const context = badge.getContext('2d');
      if (context) {
        context.scale(resolution, resolution);
        context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(0.5, 0.5, size - 1, size - 1, 9);
        context.stroke();
        const badgeStyle = window.getComputedStyle(badge);
        context.font = `${badgeStyle.fontWeight} ${badgeStyle.fontSize} ${badgeStyle.fontFamily}`;
        context.fillStyle = '#ffffff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('QR', size / 2, size / 2);
      }
    }
    return () => document.body.classList.remove('member-card-dialog-open');
  }, []);
  return createPortal(<div className="member-card-overlay fixed inset-0 z-[100] grid place-items-center bg-[#24131d]/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="member-card-dialog w-full max-w-[900px] rounded-[24px] border border-[#f0dce5] bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="member-card-title">
      <div className="member-card-controls mb-5 flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#bd3c76]">Pratinjau kartu</p><h2 id="member-card-title" className="mt-1 font-display text-xl font-extrabold text-[#472538]">Kartu member depan &amp; belakang</h2><p className="mt-1 text-xs text-[#927789]">Unduh satu PDF dua halaman ukuran kartu, atau cetak depan dan belakang.</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup pratinjau kartu member" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8e6c7e] hover:bg-[#f8edf2]"><X size={18}/></button>
      </div>
      <div className="member-card-preview-grid">
        <article ref={frontCardRef} className={`member-card-print member-card-print--front member-card-print--${salon}`} data-testid="member-card-front">
          <div className="member-card__brand">
            {salon === 'beauty'
              ? <BeautyLogoMark className="member-card__logo" alt="Logo GGS Beauty"/>
              : <HairStudioLogoMark className="member-card__logo" alt="Logo GGS Hair Studio"/>}
            <div className="member-card__brand-copy"><p className="member-card__salon">{brand.name}</p><p className="member-card__label">MEMBER CARD</p></div>
          </div>
          <div className="member-card__front-copy">
            <p className="member-card__caption">KARTU MEMBER</p>
            <p className="member-card__name">{customerDisplayName(profile.name)}</p>
          </div>
          <div className="member-card__front-bottom">
            <div><p className="member-card__caption">ID MEMBER</p><p className="member-card__code">{shortMemberCode}</p></div>
            <span className="member-card__front-tag">GGS MEMBER</span>
          </div>
        </article>
        <article ref={backCardRef} className={`member-card-print member-card-print--back member-card-print--${salon}`} data-testid="member-card-back">
          <div className="member-card__back-copy">
            <canvas ref={qrBadgeRef} className="member-card__back-icon" aria-hidden="true" />
            <p className="member-card__back-title">Scan kartu saat transaksi</p>
            <p className="member-card__back-description">Pindai QR atau barcode untuk membuka profil dan mencatat poin.</p>
            <p className="member-card__back-id">ID {shortMemberCode}</p>
          </div>
          <div className="member-card__qr" aria-label={`QR member ${customerDisplayName(profile.name)}`}>
            <QRCodeCanvas
              value={qrValue}
              size={360}
              level="M"
              bgColor="#ffffff"
              fgColor="#25131e"
              style={{
                position: 'absolute',
                top: '7px',
                left: '7px',
                width: 'calc(100% - 14px)',
                height: 'calc(100% - 14px)',
              }}
            />
          </div>
        </article>
      </div>
      {downloadError && <p className="mt-3 rounded-lg bg-[#fff2f1] px-3 py-2 text-center text-[10px] font-semibold text-[#a34a4a]" role="alert">{downloadError}</p>}
      <div className="member-card-controls mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="rounded-xl border border-[#ecd9e2] px-4 py-2.5 text-xs font-bold text-[#765b6d] hover:bg-[#fbf3f7]">Tutup</button>
        <button type="button" onClick={() => void handleDownload()} disabled={isDownloading} data-testid="button-download-member-card" className="flex items-center justify-center gap-2 rounded-xl border border-[#e8cfdb] px-4 py-2.5 text-xs font-bold text-[#a9366b] hover:bg-[#fdf3f7] disabled:cursor-wait disabled:opacity-60"><Download size={15}/>{isDownloading ? 'Menyiapkan PDF…' : 'Unduh kartu digital (PDF)'}</button>
        <button type="button" onClick={() => window.print()} data-testid="button-print-member-card" className="flex items-center justify-center gap-2 rounded-xl bg-[#a9366b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#922f5e]"><Printer size={15}/> Cetak depan &amp; belakang</button>
      </div>
    </section>
  </div>, document.body);
}

function MemberCardScanner({ salon, customers, onClose, onSelect, context = 'cashier' }: {
  salon: SalonId;
  customers: CustomerProfile[];
  onClose: () => void;
  onSelect: (profile: CustomerProfile) => void;
  context?: 'cashier' | 'member';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const customerRef = useRef(customers);
  const onSelectRef = useRef(onSelect);
  const [scanStatus, setScanStatus] = useState('Menyiapkan kamera...');
  const [scanError, setScanError] = useState('');
  const [manualCode, setManualCode] = useState('');
  customerRef.current = customers;
  onSelectRef.current = onSelect;

  const resolveMemberCode = (rawValue: string) => {
    const value = rawValue.trim();
    const memberCode = value.toUpperCase().startsWith(MEMBER_CODE_PREFIX)
      ? value.slice(MEMBER_CODE_PREFIX.length).trim()
      : value;
    const normalizedCode = memberCode.replace(/-/g, '').toLowerCase();
    const matches = customerRef.current.filter((profile) => {
      const fullCode = profile.memberCode.toLowerCase();
      const printedShortCode = profile.memberCode.replace(/-/g, '').slice(0, 8).toLowerCase();
      return fullCode === memberCode.toLowerCase() || (normalizedCode.length === 8 && printedShortCode === normalizedCode);
    });
    if (matches.length !== 1) {
      setScanError(matches.length > 1
        ? 'Kode member singkat tidak unik. Pindai QR di kartu untuk memilih member yang tepat.'
        : `Kartu tidak terdaftar di ${salonDetails[salon].name}. Pastikan salon yang dipilih sesuai.`);
      return false;
    }
    const matched = matches[0];
    if (!matched) {
      setScanError(`Kartu tidak terdaftar di ${salonDetails[salon].name}. Pastikan salon yang dipilih sesuai.`);
      return false;
    }
    onSelectRef.current(matched);
    return true;
  };

  useEffect(() => {
    let stopped = false;
    let scannerControls: { stop: () => void } | null = null;
    let lastRawValue = '';
    const video = videoRef.current;
    if (!video) {
      setScanStatus('Tampilan kamera belum siap. Gunakan scanner USB atau masukkan kode member.');
      return;
    }

    const startCamera = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        scannerControls = await reader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
          if (stopped || !result) return;
          const rawValue = result.getText().trim();
          if (!rawValue || rawValue === lastRawValue) return;
          lastRawValue = rawValue;
          setScanError('');
          if (resolveMemberCode(rawValue)) controls.stop();
        });
        if (stopped) {
          scannerControls.stop();
          return;
        }
        setScanStatus('Arahkan QR atau barcode di kartu ke kamera.');
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : '';
        setScanStatus(errorName === 'NotAllowedError'
          ? 'Izin kamera ditolak. Izinkan akses webcam di browser, lalu coba lagi.'
          : errorName === 'NotFoundError'
            ? 'Webcam desktop tidak ditemukan. Hubungkan kamera atau gunakan scanner USB.'
            : 'Kamera tidak dapat dibuka. Periksa izin webcam atau gunakan scanner USB.');
      }
    };

    void startCamera();
    return () => {
      stopped = true;
      scannerControls?.stop();
    };
  }, []);

  const submitManualCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScanError('');
    resolveMemberCode(manualCode);
  };

  return createPortal(<div className="member-scanner-overlay fixed inset-0 z-[110] grid place-items-center bg-[#24131d]/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="w-full max-w-[440px] rounded-[24px] border border-[#f0dce5] bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="member-scanner-title">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#bd3c76]">{context === 'member' ? 'Member' : 'Kasir'} · {salonDetails[salon].name}</p><h2 id="member-scanner-title" className="mt-1 font-display text-xl font-extrabold text-[#472538]">Scan kartu member</h2><p className="mt-1 text-xs text-[#927789]">{context === 'member' ? 'Pindai kartu untuk membuka profil dan melihat poin.' : 'Scan QR atau barcode kartu untuk memilih member dan menghitung promo.'}</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup pemindai kartu member" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8e6c7e] hover:bg-[#f8edf2]"><X size={18}/></button>
      </div>
      <div className="member-scanner__camera">
        <video ref={videoRef} autoPlay muted playsInline aria-label="Kamera untuk memindai QR kartu member"/>
        <span className="member-scanner__frame" aria-hidden="true"/>
        <span className="member-scanner__camera-label"><Camera size={15}/> Arahkan kode ke bingkai</span>
      </div>
      <p className="mt-3 min-h-5 text-center text-[11px] font-semibold text-[#806476]" role="status">{scanStatus}</p>
      {scanError && <p className="mt-2 rounded-lg bg-[#fff2f1] px-3 py-2 text-center text-[10px] font-semibold text-[#a34a4a]" role="alert">{scanError}</p>}
      <form onSubmit={submitManualCode} className="mt-4 border-t border-[#f1e4ea] pt-4">
        <label htmlFor="input-member-card-code" className="block text-[10px] font-bold text-[#806476]">Pakai scanner USB atau masukkan kode</label>
        <div className="mt-1.5 flex gap-2">
          <input id="input-member-card-code" data-testid="input-member-card-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Scan barcode atau masukkan ID member" autoComplete="off" autoFocus className="min-w-0 flex-1 rounded-xl border border-[#eddae4] bg-[#fffafb] px-3 py-2.5 text-xs text-[#56374a] outline-none focus:border-[#c04b7e]"/>
          <button type="submit" disabled={!manualCode.trim()} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#a9366b] px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#922f5e] disabled:cursor-not-allowed disabled:opacity-50"><QrCode size={14}/> Gunakan</button>
        </div>
      </form>
    </section>
  </div>, document.body);
}

function CustomerDetail({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof UserRound }) {
  return <div className="flex min-w-0 gap-2.5 rounded-xl bg-[#fffafb] p-3">
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f9edf3] text-[#ad4675]"><Icon size={14}/></span>
    <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[.1em] text-[#a18696]">{label}</p><p className="mt-1 break-words text-[11px] font-bold text-[#5c3b50]">{value}</p><p className="mt-0.5 text-[9px] leading-relaxed text-[#9a7b8d]">{note}</p></div>
  </div>;
}

function CustomerTransaction({ sale, open, onToggle, onReceipt }: { sale: Sale; open: boolean; onToggle: () => void; onReceipt: () => void }) {
  return <div className="border-b border-[#f2e8ed] last:border-0">
    <button type="button" onClick={onToggle} aria-expanded={open} data-testid={`button-customer-sale-${sale.id}`} className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-[#fffafb] sm:px-4">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f9edf3] text-[#ad4675]"><ShoppingBag size={14}/></span>
         <span className="min-w-0"><span className="block truncate text-[10px] font-extrabold text-[#55374a]">{salonDetails[sale.salon].name} · {sale.invoiceNumber}</span><span className="mt-1 block truncate text-[9px] text-[#9a7b8d]">{dateTimeId(new Date(sale.createdAt))} · {sale.items.length} jenis layanan · {sale.paymentMethod}</span></span>
      </span>
      <span className="flex shrink-0 items-center gap-2"><b className="text-right text-[11px] text-[#513146]">{money(sale.total)}</b><ChevronDown size={14} className={`text-[#aa8496] transition-transform ${open ? 'rotate-180' : ''}`}/></span>
    </button>
    {open && <div className="border-t border-[#f5edf1] bg-[#fffafb] px-3 py-3 sm:px-4">
      <div className="space-y-2">
        {sale.items.map((item, index) => <div key={`${sale.id}-${index}`} className="flex justify-between gap-3 text-[10px]"><span className="min-w-0 text-[#765b6d]">{item.name} <span className="text-[#a58a99]">× {item.quantity}</span><span className="mt-1 block text-[9px] text-[#9a7b8d]">{item.employeeName?.trim() ? `Dilayani oleh ${displayStaffName(item.employeeName)}` : 'Nama staf tidak tercatat'}</span>{serviceDiscount(item)>0&&<span className="mt-1 block text-[10px] text-primary">Diskon layanan − {money(serviceDiscount(item))}</span>}</span><b className="shrink-0 text-[#5c3b50]">{money(item.unitPrice * item.quantity)}</b></div>)}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-dashed border-[#e4cbd7] pt-3 text-[10px]">
        <HistoryMoneyRow label="Subtotal" value={money(sale.subtotal)}/>
        {sale.discount > 0 && <HistoryMoneyRow label={sale.discountMode === 'percent' ? `Diskon · ${sale.discountValue ?? 0}%` : 'Potongan diskon'} value={`− ${money(sale.discount)}`} highlight/>}
        <HistoryMoneyRow label={`Pembayaran · ${sale.paymentMethod}`} value={money(sale.amountReceived)}/>
        {sale.paymentMethod === 'Tunai' && <HistoryMoneyRow label="Kembalian" value={money(sale.change)}/>}
        {sale.customerPhone && <HistoryMoneyRow label="Poin diperoleh" value={`+${(sale.pointsEarned ?? pointsFromAmount(sale.total)).toLocaleString('id-ID')} poin`} highlight/>}
      </div>
      <button type="button" onClick={onReceipt} className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#e8cfdb] bg-white px-3 py-2 text-[10px] font-bold text-[#a83e70] hover:bg-[#fdf3f7]"><Printer size={13}/> Lihat / cetak struk</button>
    </div>}
  </div>;
}

function HistoryRow({ sale, initialOpen = false }: { sale: Sale; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [receipt, setReceipt] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const itemCount = sale.items.reduce((count, item) => count + item.quantity, 0);

  return <article className={`px-4 py-4 transition-colors sm:px-5 ${open?'bg-[#fffafb]':'hover:bg-[#fffafb]'}`} data-testid={`row-sale-${sale.id}`}>
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => setOpen((value)=>!value)} aria-expanded={open} aria-controls={`sale-details-${sale.id}`} data-testid={`button-expand-sale-${sale.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd3c76] sm:gap-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid ${open?'bg-[#f4e0e9] text-[#ad3c70]':'bg-[#faedf3] text-[#bd477b]'}`}><ShoppingBag size={17}/></span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-xs font-extrabold text-[#55374a] sm:text-[13px]">{sale.invoiceNumber}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${sale.salon === 'hair-studio' ? 'bg-[#ededed] text-[#202020]' : 'bg-[#f8eaf1] text-[#a9366b]'}`}>{salonDetails[sale.salon].name}</span>
            {sale.discount>0&&<span className="rounded-full bg-[#fff1f5] px-2 py-0.5 text-[9px] font-bold text-[#a9366b]">Diskon</span>}
            </span>
            <span className="mt-1 block truncate text-[10px] text-[#9a7b8d] sm:text-[11px]">{dateTimeId(new Date(sale.createdAt))}<span className="mx-1.5 text-[#d5bdca]">·</span>{sale.customerName||'Pelanggan umum'}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 sm:gap-4">
          <span className="hidden rounded-full bg-[#f8eff3] px-2.5 py-1 text-[10px] font-bold text-[#8d6279] sm:inline-flex">{sale.paymentMethod}</span>
          <span className="text-right"><b className="block text-xs text-[#513146] sm:text-sm">{money(sale.total)}</b><span className="mt-0.5 block text-[9px] text-[#9a7b8d] sm:text-[10px]">{itemCount} layanan</span></span>
          <span className="rounded-lg border border-[#e8cfdb] bg-white px-2 py-1 text-[9px] font-bold text-[#a83e70] sm:px-2.5 sm:text-[10px]">{open?'Tutup':'Detail'}</span>
          <ChevronDown size={16} className={`text-[#aa8496] transition-transform ${open?'rotate-180':''}`}/>
        </span>
      </button>
      <button type="button" onClick={()=>setShowDelete(true)} aria-label={`Hapus transaksi ${sale.invoiceNumber}`} title="Hapus transaksi" className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#f0d6d3] px-2 text-[9px] font-bold text-[#a9433c] transition hover:bg-[#fff0f0] hover:text-[#923832] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ad3d52] sm:px-2.5 sm:text-[10px]"><Trash2 size={13}/><span>Hapus</span></button>
    </div>
    {open&&<div id={`sale-details-${sale.id}`} className="mt-4 rounded-[16px] border border-[#f0e2e9] bg-white p-4 sm:ml-[52px] sm:p-5">
      <div className="grid gap-4 border-b border-[#f1e6eb] pb-4 sm:grid-cols-2 lg:grid-cols-[1.15fr_1fr_1fr]">
        <HistoryInfoBlock icon={UserRound} label="PELANGGAN" value={sale.customerName||'Pelanggan umum'} detail={sale.customerPhone||sale.customerWhatsapp||'Kontak tidak dicatat'}/>
         <HistoryInfoBlock icon={UserRound} label="KASIR" value={sale.cashierName||'Tidak tercatat'} detail={`${salonDetails[sale.salon].name} · Invoice ${sale.invoiceNumber}`}/>
        <HistoryInfoBlock icon={Clock3} label="WAKTU TRANSAKSI" value={dateTimeId(new Date(sale.createdAt))} detail="Waktu Indonesia Barat"/>
      </div>
      <div className="grid gap-5 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,.7fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#9a7b8d]">Layanan selesai</h3><span className="rounded-full bg-[#f8eff3] px-2 py-1 text-[9px] font-bold text-[#8d6279]">{itemCount} item</span></div>
          <div className="space-y-2.5">
             {sale.items.map((item,index)=><div key={`${sale.id}-${index}`} className="flex min-w-0 items-center justify-between gap-4 text-xs"><span className="min-w-0 break-words font-semibold text-[#765b6d]">{item.name}<span className="ml-1 font-medium text-[#a58a99]">× {item.quantity}</span><span className="mt-1 block text-[10px] font-medium text-[#9a7b8d]">{item.employeeName?.trim() ? `Dilayani oleh ${displayStaffName(item.employeeName)}` : 'Nama staf tidak tercatat'}</span>{serviceDiscount(item)>0&&<span className="mt-1 block text-[10px] text-primary">Diskon layanan − {money(serviceDiscount(item))}</span>}</span><b className="shrink-0 text-[#5c3b50]">{money(item.unitPrice*item.quantity)}</b></div>)}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-dashed border-[#e4cbd7] pt-3 text-[10px] text-[#9a7b8d]"><UserRound size={12}/>{sale.customerPhone||sale.customerWhatsapp?`Nomor pelanggan · ${sale.customerPhone||sale.customerWhatsapp}`:'Nomor kontak tidak tersedia'}</div>
        </div>
        <div className="rounded-xl bg-[#fcf7f9] p-3.5 sm:p-4">
          <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#9a7b8d]">Ringkasan pembayaran</h3>
          <div className="space-y-2 text-[11px]">
            <HistoryMoneyRow label="Subtotal" value={money(sale.subtotal)}/>
            {sale.discount>0&&<HistoryMoneyRow label={sale.discountMode==='percent'?`Diskon · ${sale.discountValue??0}%`:'Potongan diskon'} value={`− ${money(sale.discount)}`} highlight/>}
            <div className="flex justify-between gap-3 border-t border-[#ead9e2] pt-2 text-[13px] font-extrabold text-[#523348]"><span>Total</span><span>{money(sale.total)}</span></div>
            <HistoryMoneyRow label={`Diterima · ${sale.paymentMethod}`} value={money(sale.amountReceived)}/>
            {sale.paymentMethod==='Tunai'&&<HistoryMoneyRow label="Kembalian" value={money(sale.change)}/>}
          </div>
          {sale.customerPhone||sale.customerWhatsapp?<div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#efd9e4] bg-white px-3 py-2.5"><span className="text-[10px] font-bold text-[#8c6279]">Poin loyalti</span><span className="text-right text-[10px] font-extrabold text-[#a9366b]">+{(sale.pointsEarned??pointsFromAmount(sale.total)).toLocaleString('id-ID')}<span className="font-medium text-[#9a7b8d]"> · saldo {(sale.pointsBalance??0).toLocaleString('id-ID')}</span></span></div>:null}
        </div>
      </div>
      <div className="mt-4 flex flex-col-reverse justify-between gap-2 border-t border-[#f1e6eb] pt-3 sm:flex-row sm:items-center">
        <span className="text-[9px] text-[#a18696]">Transaksi selesai · detail tersimpan</span>
        <button type="button" onClick={()=>setReceipt(true)} data-testid={`button-reprint-${sale.id}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#e8cfdb] bg-white px-3 py-2 text-[10px] font-bold text-[#a83e70] hover:bg-[#fdf3f7]"><Printer size={13}/> Lihat / cetak struk</button>
      </div>
    </div>}
    {receipt && <Receipt sale={sale} onClose={() => setReceipt(false)}/>}
    {showDelete && <DeleteConfirmation
      title={`Hapus transaksi ${sale.invoiceNumber}?`}
      description="Transaksi dan rincian layanannya akan dihapus permanen. Poin, saldo, dan ringkasan pelanggan terkait akan dihitung ulang."
      endpoint={`/api/sales/${encodeURIComponent(sale.id)}`}
      onCancel={() => setShowDelete(false)}
      onDeleted={async () => {
        await queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey() });
      }}
    />}
  </article>;
}

function HistoryInfoBlock({ icon: Icon, label, value, detail }: { icon: typeof UserRound; label: string; value: string; detail: string }) {
  return <div className="flex min-w-0 gap-2.5">
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f9edf3] text-[#ad4675]"><Icon size={14}/></span>
    <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[.12em] text-[#a18696]">{label}</p><p className="mt-1 truncate text-[11px] font-bold text-[#5c3b50]">{value}</p><p className="mt-0.5 truncate text-[10px] text-[#9a7b8d]">{detail}</p></div>
  </div>;
}

function HistoryMoneyRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`flex justify-between gap-3 ${highlight?'font-semibold text-[#a9366b]':'text-[#84697a]'}`}><span>{label}</span><span className="shrink-0 text-right">{value}</span></div>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: true, retry: 1 },
    mutations: { retry: 0 },
  },
});
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function ServicesRoute() {
  const [salon, setSalon] = useActiveSalon();
  const auth = useContext(AuthContext);
  return <AppFrame salon={salon}><ServicesPage salon={salon} onSalonChange={setSalon} salonLocked={Boolean(auth?.salonScope)}/></AppFrame>;
}
function EmployeePerformanceRoute() {
  const [salon, setSalon] = useActiveSalon();
  return <AppFrame salon={salon}><SalonSwitcher salon={salon} onSelect={setSalon} context="employees"/><EmployeePerformancePage salon={salon}/></AppFrame>;
}
function PointsRoute() {
  const auth = useContext(AuthContext);
  const [salon] = useActiveSalon();
  return <AppFrame salon={salon}><PointsPage salonScope={auth?.salonScope ?? null} canManageRewards={auth?.salonScope === null}/></AppFrame>;
}
function ExpensesRoute() {
  const [salon] = useActiveSalon();
  return <AppFrame salon={salon}><ExpensesPage salon={salon}/></AppFrame>;
}
function FinanceRoute() {
  const [salon] = useActiveSalon();
  return <AppFrame salon={salon}><FinancePage salon={salon}/></AppFrame>;
}
function NotificationsRoute() {
  const [salon, setSalon] = useActiveSalon();
  return <AppFrame salon={salon}>
    <SalonSwitcher salon={salon} onSelect={setSalon} context="notifications"/>
    <NotificationsPage salon={salon}/>
  </AppFrame>;
}
function QueueRoute() {
  const [salon, setSalon] = useActiveSalon();
  return <AppFrame salon={salon}>
    <SalonSwitcher salon={salon} onSelect={setSalon} context="queue"/>
    <QueuePage salon={salon}/>
  </AppFrame>;
}
function BackupRoute() {
  const [salon] = useActiveSalon();
  return <AppFrame salon={salon}><BackupPage/></AppFrame>;
}
function AttendanceRoute() {
  const auth = useContext(AuthContext);
  const [savedSalon, setSavedSalon] = useActiveSalon();
  const [salon, setSalon] = useState<SalonId>(() => {
    const requestedSalon = new URLSearchParams(window.location.search).get('salon');
    return auth?.salonScope ?? (isSalonId(requestedSalon) ? requestedSalon : savedSalon);
  });
  const selectSalon = (nextSalon: SalonId) => {
    if (auth?.salonScope) return;
    setSalon(nextSalon);
    setSavedSalon(nextSalon);
    const search = new URLSearchParams(window.location.search);
    search.set('salon', nextSalon);
    window.history.replaceState(null, '', `${window.location.pathname}?${search.toString()}`);
  };
  return <AppFrame salon={salon}>
    <SalonSwitcher salon={salon} onSelect={selectSalon} context="attendance"/>
    <AttendancePage salon={salon}/>
  </AppFrame>;
}
function StaffSecurityRoute() {
  const [salon, setSalon] = useActiveSalon();
  return <AppFrame salon={salon}>
    <SalonSwitcher salon={salon} onSelect={setSalon} context="security"/>
    <StaffSecurityPage salon={salon}/>
  </AppFrame>;
}
function ReceiptSettingsRoute() {
  const [salon, setSalon] = useActiveSalon();
  return <AppFrame salon={salon}>
    <SalonSwitcher salon={salon} onSelect={setSalon} context="settings"/>
    <ReceiptSettingsPage salon={salon}/>
    <PromoSettingsSection salon={salon}/>
  </AppFrame>;
}
function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Cashier}/><Route path="/antrian" component={QueueRoute}/><Route path="/riwayat" component={HistoryPage}/><Route path="/pengeluaran" component={ExpensesRoute}/><Route path="/keuangan" component={FinanceRoute}/><Route path="/pelanggan" component={CustomerPage}/><Route path="/notifikasi" component={NotificationsRoute}/><Route path="/poin" component={PointsRoute}/><Route path="/kinerja" component={EmployeePerformanceRoute}/><Route path="/layanan" component={ServicesRoute}/><Route path="/absensi" component={AttendanceRoute}/><Route path="/keamanan-sistem" component={StaffSecurityRoute}/><Route path="/keamanan-staf" component={StaffSecurityRoute}/><Route path="/pengaturan" component={ReceiptSettingsRoute}/><Route path="/backup" component={BackupRoute}/><Route component={NotFound}/></Switch></RoutedErrorBoundary>;
}
type AuthGateState = 'checking' | 'authenticated' | 'anonymous' | 'unavailable';

function authErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Permintaan login belum berhasil. Periksa koneksi lalu coba lagi.';
}

function AppAuthGate() {
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthGateState>('checking');
  const [loginId, setLoginId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [salonScope, setSalonScope] = useState<SalonId | null>(null);
  const normalizedLoginId = loginId.trim().toLocaleLowerCase('id-ID');
  const isOwnerPinOnlyAccount = normalizedLoginId === 'ownerggs';

  const checkAuthStatus = async () => {
    setAuthState('checking');
    setLoginError('');
    try {
      const status = await getAuthStatus();
      const nextScope = status.authenticated && isSalonId(status.salonScope) ? status.salonScope : null;
      setSalonScope(nextScope);
      if (nextScope) localStorage.setItem(ACTIVE_SALON_KEY, nextScope);
      setAuthState(status.authenticated ? 'authenticated' : 'anonymous');
    } catch {
      setAuthState('unavailable');
      setLoginError('Server belum dapat memeriksa sesi login.');
    }
  };

  useEffect(() => {
    void checkAuthStatus();
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    setIsSubmitting(true);
    try {
      const status = await loginCashier({ id: loginId.trim(), pin: loginPin });
      if (!status.authenticated) throw new Error('ID atau kredensial tidak sesuai.');
      queryClient.clear();
      const nextScope = isSalonId(status.salonScope) ? status.salonScope : null;
      setSalonScope(nextScope);
      if (nextScope) localStorage.setItem(ACTIVE_SALON_KEY, nextScope);
      setLoginPin('');
      setAuthState('authenticated');
    } catch (error) {
      setLoginError(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    setIsSubmitting(true);
    setLoginError('');
    try {
      await logoutCashier();
      queryClient.clear();
      setSalonScope(null);
      setLoginId('');
      setLoginPin('');
      setAuthState('anonymous');
    } catch (error) {
      setLoginError(`Tidak dapat keluar: ${authErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authState === 'checking') {
    return <div className="grid min-h-screen place-items-center bg-[#fbf6f8] p-4"><p className="text-sm font-semibold text-[#765b6d]" role="status">Memeriksa akses web…</p></div>;
  }

  if (authState === 'unavailable') {
    return <main className="grid min-h-screen place-items-center bg-[#fbf6f8] p-4">
      <section className="w-full max-w-md rounded-3xl border border-[#eedbe4] bg-white p-7 text-center shadow-[0_20px_60px_rgba(91,40,66,.1)]">
        <LockKeyhole size={26} className="mx-auto text-[#b93670]"/>
        <h1 className="mt-3 font-display text-xl font-extrabold text-[#472538]">Akses web belum dapat diperiksa</h1>
        <p className="mt-2 text-sm text-[#927789]">{loginError}</p>
        <button className="mt-5 rounded-xl bg-[#b93670] px-5 py-3 text-sm font-bold text-white" type="button" onClick={() => void checkAuthStatus()}>Coba lagi</button>
      </section>
    </main>;
  }

  if (authState === 'authenticated') {
    return <AuthContext.Provider value={{ logout: () => { void signOut(); }, logoutError: loginError, salonScope }}><OpenCashier/></AuthContext.Provider>;
  }

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#fff_0,#fbf6f8_55%,#f3e9ee_100%)] p-4">
    <section className="w-full max-w-md overflow-hidden rounded-3xl border border-[#eedbe4] bg-white shadow-[0_20px_60px_rgba(91,40,66,.1)]">
      <div className="bg-gradient-to-br from-[#b93670] to-[#8f2f5c] px-7 py-7 text-white">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><LockKeyhole size={23}/></div>
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-white/75">GGS Beauty · Salon &amp; Beauty</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-[-.035em]">Masuk ke web kasir</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/80">Akses hanya untuk akun kasir yang sudah terdaftar.</p>
      </div>
      <form className="grid gap-4 p-7" onSubmit={(event) => void signIn(event)}>
        <p className="rounded-xl bg-[#f8eef3] px-3 py-2.5 text-xs font-bold text-[#9f2d61]" role="status">
          {isOwnerPinOnlyAccount ? 'Owner Global masuk menggunakan PIN akses.' : 'Masuk menggunakan PIN akses.'}
        </p>
        <label className="grid gap-1.5 text-xs font-bold text-[#684d5e]" htmlFor="app-login-id">
          ID akses
          <input id="app-login-id" className="h-11 rounded-xl border border-[#e6d5df] bg-white px-3 text-sm font-medium text-[#392839] outline-none focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10" autoComplete="username" value={loginId} onChange={(event) => { setLoginId(event.target.value); setLoginError(''); }} placeholder="ID akses kasir atau Owner" required data-testid="input-app-login-id"/>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-[#684d5e]" htmlFor="app-login-pin">
          PIN akses · 6 angka
          <input id="app-login-pin" className="h-11 rounded-xl border border-[#e6d5df] bg-white px-3 text-sm font-semibold tracking-[.2em] text-[#392839] outline-none focus:border-[#c36891] focus:ring-4 focus:ring-[#b93670]/10" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={loginPin} onChange={(event) => setLoginPin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Masukkan PIN akses" required data-testid="input-app-login-pin"/>
        </label>
        <p className="text-[11px] leading-relaxed text-[#927789]">{isOwnerPinOnlyAccount ? 'Jika PIN belum diatur, masuk dengan ID Owner lama dan PIN aksesnya, lalu atur PIN Owner Global di Keamanan Sistem.' : 'Gunakan PIN akses yang telah diatur di menu Keamanan Sistem.'}</p>
        {loginError && <p className="rounded-xl border border-[#f1d2d4] bg-[#fff7f7] px-3 py-2.5 text-xs text-[#a6444b]" role="alert">{loginError}</p>}
        <button className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#b93670] px-4 text-sm font-extrabold text-white transition hover:bg-[#9f2d61] disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={isSubmitting || !loginId.trim() || loginPin.length !== 6} data-testid="button-app-login">{isSubmitting ? 'Memeriksa…' : 'Masuk'}</button>
      </form>
    </section>
  </main>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AppAuthGate/><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
