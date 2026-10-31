import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, CalendarDays, Check, Coins, Gift, Plus, RefreshCw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import {
  getGetPointActivityQueryKey,
  getGetCustomersQueryKey,
  getGetPointRewardsQueryKey,
  useGetPointActivity,
  useGetCustomers,
  useGetPointRewards,
  useUpdatePointRewards,
  type Customer,
  type PointActivity,
  type PointReward,
} from '@/lib/api-client';
import { PointRedemptionDialog } from './point-redemption-dialog';
import './points-page.css';

const pointsFormat = new Intl.NumberFormat('id-ID');
const emptyCustomers: Customer[] = [];

type RewardTier = PointReward;
type ActiveCustomer = { salon: 'beauty' | 'hair-studio'; customer: Customer; rewards: RewardTier[] };

const displayCustomerName = (name: string) => {
  const cleaned = name.replace(/^\s*contoh\b\s*(?:[•·|:/–—-]\s*)?/i, '').trim();
  return cleaned || name.trim();
};

const normalizeCustomerPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0062')) return `0${digits.slice(4)}`;
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;
  if (digits.startsWith('8')) return `0${digits}`;
  return digits;
};

type RankingProps = {
  title: string;
  brand: string;
  salon: 'beauty' | 'hair-studio';
  customers: Customer[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onRedeem: (customer: Customer) => void;
};

function RankingPanel({ title, brand, salon, customers, isLoading, isError, onRetry, onRedeem }: RankingProps) {
  const hair = salon === 'hair-studio';
  const [query, setQuery] = useState('');
  const [sortAscending, setSortAscending] = useState(false);
  const allCustomers = customers ?? emptyCustomers;

  const visibleCustomers = useMemo(() => {
    const nameQuery = query.trim().toLocaleLowerCase('id');
    const phoneQuery = normalizeCustomerPhone(query);
    const matchingCustomers = allCustomers.filter((customer) =>
      displayCustomerName(customer.name).toLocaleLowerCase('id').includes(nameQuery)
      || (phoneQuery.length > 0 && normalizeCustomerPhone(customer.phone).includes(phoneQuery)),
    );

    return [...matchingCustomers].sort((a, b) => {
      const pointsOrder = sortAscending ? a.points - b.points : b.points - a.points;
      return pointsOrder || displayCustomerName(a.name).localeCompare(displayCustomerName(b.name), 'id');
    });
  }, [allCustomers, query, sortAscending]);

  const totalPoints = allCustomers.reduce((sum, customer) => sum + customer.points, 0);
  const highestBalance = allCustomers.reduce((highest, customer) => Math.max(highest, customer.points), 0);
  const countLabel = isLoading
    ? 'Memuat'
    : query.trim()
      ? `${visibleCustomers.length} dari ${allCustomers.length}`
      : `${allCustomers.length} pelanggan`;

  return (
    <section className={`pp-panel${hair ? ' pp-panel--hair' : ''}`} aria-labelledby={`pp-ranking-${salon}`}>
      <header className="pp-panel__header">
        <span className="pp-brand-mark" aria-hidden="true">{hair ? 'H' : 'B'}</span>
        <div className="pp-panel__heading">
          <p>{brand}</p>
          <h2 id={`pp-ranking-${salon}`}>{title}</h2>
        </div>
        <span className="pp-count" data-testid={`text-customer-count-${salon}`}>{countLabel}</span>
      </header>

      {!isLoading && !isError && (
        <div className="pp-summary" aria-label={`Ringkasan poin ${brand}`}>
          <div className="pp-summary__item" data-testid={`text-total-points-${salon}`}>
            <span>Total saldo poin</span>
            <strong>{pointsFormat.format(totalPoints)} <small>poin</small></strong>
          </div>
          <div className="pp-summary__item" data-testid={`text-highest-points-${salon}`}>
            <span>Saldo tertinggi</span>
            <strong>{pointsFormat.format(highestBalance)} <small>poin</small></strong>
          </div>
        </div>
      )}

      {!isLoading && !isError && allCustomers.length > 0 && (
        <div className="pp-tools">
          <label className="pp-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Cari pelanggan {brand}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama atau nomor HP"
              aria-label={`Cari pelanggan ${brand} berdasarkan nama atau nomor HP`}
              data-testid={`input-search-points-${salon}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={`Hapus pencarian ${brand}`}
                className="pp-search__clear"
                data-testid={`button-clear-search-points-${salon}`}
              >
                Hapus
              </button>
            )}
          </label>
          <button
            className="pp-sort"
            type="button"
            onClick={() => setSortAscending((value) => !value)}
            aria-label={sortAscending ? 'Urutkan saldo poin tertinggi lebih dulu' : 'Urutkan saldo poin terendah lebih dulu'}
            aria-pressed={sortAscending}
            title={sortAscending ? 'Urutkan saldo poin tertinggi lebih dulu' : 'Urutkan saldo poin terendah lebih dulu'}
            data-testid={`button-sort-points-${salon}`}
          >
            <ArrowDownUp size={15} aria-hidden="true" />
            <span>{sortAscending ? 'Terendah' : 'Tertinggi'}</span>
          </button>
        </div>
      )}

      <div className="pp-list-heading" aria-hidden="true">
        <span>No.</span><span>Pelanggan</span><span>Saldo</span><span>Hadiah</span>
      </div>

      {isLoading ? (
        <div className="pp-skeleton" aria-label={`Memuat peringkat ${title}`} aria-busy="true">
          {[1, 2, 3, 4].map((row) => (
            <div className="pp-skeleton__row" key={row}><i /><span /><b /></div>
          ))}
        </div>
      ) : isError ? (
        <div className="pp-state pp-state--error" role="alert" data-testid={`error-ranking-${salon}`}>
          <RefreshCw size={21} aria-hidden="true" />
          <h3>Peringkat belum dapat dimuat</h3>
          <p>Periksa koneksi, lalu muat ulang daftar {hair ? 'GGS Hair Studio' : 'GGS Beauty'}.</p>
          <button type="button" onClick={onRetry} data-testid={`button-retry-ranking-${salon}`}>Coba lagi</button>
        </div>
      ) : allCustomers.length ? visibleCustomers.length ? (
        <ol className="pp-rows" data-testid={`list-ranking-${salon}`}>
          {visibleCustomers.map((customer, index) => {
            const customerName = displayCustomerName(customer.name);
            const initials = customerName.trim().split(/\s+/).slice(0, 2)
              .map((part) => part[0] ?? '').join('').toLocaleUpperCase('id');

            return (
              <li
                className="pp-row"
                key={`${salon}-${customer.phone}`}
                data-testid={`row-ranking-${salon}-${index + 1}`}
              >
                <span className="pp-rank"><span>{String(index + 1).padStart(2, '0')}</span></span>
                <span className="pp-customer">
                  <span className="pp-avatar" aria-hidden="true">{initials || <Users size={15} />}</span>
                  <span className="pp-customer__copy">
                    <b>{customerName}</b>
                    <small>{pointsFormat.format(customer.transactionCount)} transaksi</small>
                  </span>
                </span>
                <span className="pp-balance" data-testid={`text-points-${salon}-${index + 1}`}>
                  <b>{pointsFormat.format(customer.points)}</b><small>poin</small>
                </span>
                <button
                  className="pp-redeem-trigger"
                  type="button"
                  onClick={() => onRedeem(customer)}
                  aria-label={`Kelola hadiah untuk ${customerName}`}
                  data-testid={`button-manage-rewards-${salon}-${customer.phone}`}
                >
                  <Gift size={14} aria-hidden="true" />
                  <span>Hadiah</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="pp-state pp-state--search" data-testid={`empty-search-ranking-${salon}`}>
          <Search size={21} aria-hidden="true" />
          <h3>Pelanggan tidak ditemukan</h3>
          <p>Coba kata kunci nama atau nomor HP lain.</p>
          <button type="button" onClick={() => setQuery('')}>Hapus pencarian</button>
        </div>
      ) : (
        <div className="pp-state" data-testid={`empty-ranking-${salon}`}>
          <Users size={22} aria-hidden="true" />
          <h3>Belum ada pelanggan berpoin</h3>
          <p>Pelanggan akan tercatat di sini setelah memiliki saldo poin dari transaksi.</p>
        </div>
      )}

      {!isLoading && !isError && !!visibleCustomers.length && (
        <footer className="pp-panel__footer">
          <span>Urutan saldo {sortAscending ? 'terendah' : 'tertinggi'}</span>
          <span>{visibleCustomers.length} dari {allCustomers.length} pelanggan</span>
        </footer>
      )}
    </section>
  );
}

function RewardPanel({
  salon,
  brand,
  rewards,
  isLoading,
  isError,
  canManageRewards,
  onSaved,
}: {
  salon: 'beauty' | 'hair-studio';
  brand: string;
  rewards: RewardTier[];
  isLoading: boolean;
  isError: boolean;
  canManageRewards: boolean;
  onSaved: (salon: 'beauty' | 'hair-studio', rewards: PointReward[]) => Promise<void>;
}) {
  const hair = salon === 'hair-studio';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PointReward[]>(rewards.map((item) => ({ ...item })));
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const startEditing = () => {
    setDraft(rewards.map((item) => ({ ...item })));
    setSaveError('');
    setEditing(true);
  };
  const submit = async () => {
    const clean = draft.map((item) => ({ reward: item.reward.trim(), points: Number(item.points) }));
    if (!clean.length || clean.some((item) => !item.reward || !Number.isInteger(item.points) || item.points < 1 || item.points > 1000000)
      || new Set(clean.map((item) => item.points)).size !== clean.length) {
      setSaveError('Isi nama hadiah dan biaya poin yang valid. Biaya poin harus berbeda.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await onSaved(salon, clean);
      setEditing(false);
    } catch {
      setSaveError('Perubahan hadiah belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`pp-reward-panel${hair ? ' pp-reward-panel--hair' : ''}`} aria-labelledby={`pp-rewards-${salon}`} data-testid={`list-point-rewards-${salon}`}>
      <header className="pp-reward-panel__header">
        <span className="pp-reward-panel__mark" aria-hidden="true">{hair ? 'H' : 'B'}</span>
        <span>
          <small>{brand}</small>
          <h3 id={`pp-rewards-${salon}`}>{hair ? 'Poin Pria' : 'Poin Wanita'}</h3>
        </span>
      </header>
      {isLoading ? (
        <p className="pp-reward-state" role="status">Memuat daftar hadiah…</p>
      ) : isError ? (
        <p className="pp-reward-state pp-reward-state--error" role="alert">Daftar hadiah belum dapat dimuat.</p>
      ) : editing ? (
        <div className="pp-reward-editor" data-testid={`form-rewards-${salon}`}>
          <p className="pp-editor-caption">Ubah nama hadiah dan biaya poin untuk salon ini.</p>
          {draft.map((item, index) => <div className="pp-reward-editor__row" key={`draft-${index}`}>
            <label><span>Nama hadiah</span><input value={item.reward} maxLength={200} onChange={(event) => setDraft((items) => items.map((entry, row) => row === index ? { ...entry, reward: event.target.value } : entry))} data-testid={`input-reward-name-${salon}-${index}`} /></label>
            <label><span>Biaya poin</span><input type="number" min="1" max="1000000" step="1" value={item.points} onChange={(event) => setDraft((items) => items.map((entry, row) => row === index ? { ...entry, points: Number(event.target.value) } : entry))} data-testid={`input-reward-points-${salon}-${index}`} /></label>
            <button type="button" className="pp-icon-button" onClick={() => setDraft((items) => items.filter((_, row) => row !== index))} aria-label={`Hapus hadiah nomor ${index + 1}`} data-testid={`button-remove-reward-${salon}-${index}`}><X size={15} /></button>
          </div>)}
          {draft.length < 30 && <button type="button" className="pp-add-reward" onClick={() => setDraft((items) => [...items, { points: 1, reward: '' }])} data-testid={`button-add-reward-${salon}`}><Plus size={14} /> Tambah hadiah</button>}
          {saveError && <p className="pp-inline-error" role="alert">{saveError}</p>}
          <div className="pp-editor-actions">
            <button type="button" onClick={() => setEditing(false)} disabled={saving}>Batal</button>
            <button type="button" onClick={() => void submit()} disabled={saving || !draft.length} data-testid={`button-save-rewards-${salon}`}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
          </div>
        </div>
      ) : (
        <>
          {rewards.length ? <ol className="pp-reward-list">
            {rewards.map(({ points, reward }) => <li key={points}>
              <span className="pp-reward-list__points"><b>{pointsFormat.format(points)}</b><small>poin</small></span>
              <span className="pp-reward-list__copy">{reward}</span>
            </li>)}
          </ol> : <p className="pp-reward-state">Belum ada hadiah yang diatur.</p>}
          {canManageRewards && <div className="pp-reward-actions"><button type="button" onClick={startEditing} data-testid={`button-edit-rewards-${salon}`}>Atur hadiah</button></div>}
          <p className="pp-reward-panel__note">Saldo poin dikurangi sesuai nilai hadiah saat penukaran dikonfirmasi.</p>
        </>
      )}
    </section>
  );
}

type Salon = 'beauty' | 'hair-studio';
const salonNames: Record<Salon, string> = { beauty: 'GGS Beauty', 'hair-studio': 'GGS Hair Studio' };
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia' : new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
};

function ActivityPanel({ salons }: { salons: Salon[] }) {
  const [salon, setSalon] = useState<Salon>(salons[0] ?? 'beauty');
  const [kind, setKind] = useState<'all' | 'earned' | 'redeemed'>('all');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; rows: PointActivity[] }>({ key: '', rows: [] });
  const filterKey = `${salon}|${kind}|${search}|${startDate}|${endDate}`;
  const params = { salon, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}), ...(search.trim() ? { search: search.trim() } : {}), offset, limit: 50 };
  const query = useGetPointActivity(params, { query: { queryKey: getGetPointActivityQueryKey(params) } });
  const report = query.data;
  const activities = useMemo(() => {
    if (!report) return [];
    if (offset === 0 || loaded.key !== filterKey) return report.activities;
    return [...loaded.rows, ...report.activities];
  }, [report, offset, loaded, filterKey]);
  const shown = kind === 'all' ? activities : activities.filter((item) => item.kind === kind);
  const resetFilters = (update: () => void) => {
    update();
    setOffset(0);
    setLoaded({ key: '', rows: [] });
  };

  return <section className="pp-activity" aria-labelledby="pp-activity-title" data-testid="section-point-activity">
    <header className="pp-activity__header">
      <div><p className="pp-activity__eyebrow">CATATAN POIN</p><h2 id="pp-activity-title">Aktivitas & laporan</h2><p>Periksa poin yang diperoleh dan hadiah yang ditandai digunakan.</p></div>
      {salons.length > 1 && <label className="pp-select-label"><span>Salon</span><select value={salon} onChange={(event) => resetFilters(() => setSalon(event.target.value as Salon))} data-testid="select-activity-salon">{salons.map((item) => <option value={item} key={item}>{salonNames[item]}</option>)}</select></label>}
    </header>
    {query.isLoading ? <div className="pp-report-skeleton" aria-busy="true"><i /><i /><i /></div> : query.isError ? (
      <div className="pp-activity-state pp-state--error" role="alert"><RefreshCw size={20} /><p>Laporan aktivitas belum dapat dimuat.</p><button type="button" onClick={() => void query.refetch()}>Coba lagi</button></div>
    ) : <>
      <div className="pp-report-metrics" aria-label="Ringkasan laporan poin">
        <div><span>Poin diperoleh</span><strong>+{pointsFormat.format(report?.earnedPoints ?? 0)}</strong></div>
        <div><span>Poin ditukar</span><strong>−{pointsFormat.format(report?.redeemedPoints ?? 0)}</strong></div>
        <div><span>Pelanggan aktif</span><strong>{pointsFormat.format(report?.activeCustomers ?? 0)}</strong></div>
        <div><span>Aktivitas tercatat</span><strong>{pointsFormat.format(report?.activityCount ?? 0)}</strong></div>
      </div>
      <div className="pp-activity-filters">
        <label className="pp-activity-search"><Search size={16} /><span className="sr-only">Cari aktivitas poin</span><input value={search} onChange={(event) => resetFilters(() => setSearch(event.target.value))} placeholder="Cari pelanggan, nomor HP, atau detail" data-testid="input-search-point-activity" /></label>
        <label><span className="sr-only">Tanggal mulai</span><CalendarDays size={15} /><input type="date" value={startDate} onChange={(event) => resetFilters(() => setStartDate(event.target.value))} aria-label="Tanggal mulai aktivitas" data-testid="input-activity-start-date" /></label>
        <label><span className="sr-only">Tanggal akhir</span><CalendarDays size={15} /><input type="date" value={endDate} onChange={(event) => resetFilters(() => setEndDate(event.target.value))} aria-label="Tanggal akhir aktivitas" data-testid="input-activity-end-date" /></label>
        <label className="pp-kind-filter"><SlidersHorizontal size={15} /><span className="sr-only">Jenis aktivitas</span><select value={kind} onChange={(event) => resetFilters(() => setKind(event.target.value as typeof kind))} data-testid="select-activity-kind"><option value="all">Semua aktivitas</option><option value="earned">Poin diperoleh</option><option value="redeemed">Poin ditukar</option></select></label>
      </div>
      {shown.length ? <div className="pp-activity-list" data-testid="list-point-activity">
        {shown.map((activity) => <article className={`pp-activity-row pp-activity-row--${activity.kind}`} key={activity.id} data-testid={`row-point-activity-${activity.id}`}>
          <span className="pp-activity-kind" aria-hidden="true">{activity.kind === 'earned' ? <Coins size={17} /> : <Check size={17} />}</span>
          <div className="pp-activity-main">
            <div className="pp-activity-titleline"><strong>{activity.customerName}</strong><span className={`pp-activity-badge pp-activity-badge--${activity.kind}`}>{activity.kind === 'earned' ? 'Diperoleh' : 'Ditukar'}</span></div>
            <p>{activity.detail}</p>
            <div className="pp-activity-meta"><span>{activity.customerPhone}</span><span>{dateLabel(activity.createdAt)}</span>{activity.cashierName && <span>Kasir {activity.cashierName}</span>}{activity.reference && <span>Ref. {activity.reference}</span>}</div>
          </div>
          <strong className="pp-activity-points">{activity.kind === 'earned' ? '+' : '−'}{pointsFormat.format(activity.points)} <small>poin</small></strong>
        </article>)}
      </div> : <div className="pp-activity-state"><Search size={21} /><h3>Tidak ada aktivitas untuk filter ini</h3><p>Ubah pencarian atau rentang tanggal untuk melihat catatan lain.</p></div>}
      {report?.hasMore && <div className="pp-load-more"><button type="button" onClick={() => {
        setLoaded({ key: filterKey, rows: activities });
        setOffset((value) => value + 50);
      }} disabled={query.isFetching} data-testid="button-load-more-activity">{query.isFetching ? 'Memuat…' : 'Muat aktivitas berikutnya'}</button></div>}
    </>}
  </section>;
}

type SalonScope = 'beauty' | 'hair-studio' | null;

export default function PointsPage({ salonScope = null, canManageRewards = false }: { salonScope?: SalonScope; canManageRewards?: boolean } = {}) {
  const queryClient = useQueryClient();
  const rewardMutation = useUpdatePointRewards();
  const saveRewards = async (salon: Salon, rewards: PointReward[]) => {
    await rewardMutation.mutateAsync({ data: { salon, rewards } });
    await queryClient.invalidateQueries({ queryKey: getGetPointRewardsQueryKey({ salon }) });
  };
  const beautyQuery = useGetCustomers(
    { salon: 'beauty' },
    { query: { enabled: !salonScope || salonScope === 'beauty', queryKey: getGetCustomersQueryKey({ salon: 'beauty' }) } },
  );
  const hairQuery = useGetCustomers(
    { salon: 'hair-studio' },
    { query: { enabled: !salonScope || salonScope === 'hair-studio', queryKey: getGetCustomersQueryKey({ salon: 'hair-studio' }) } },
  );
  const beautyRewardsQuery = useGetPointRewards(
    { salon: 'beauty' },
    { query: { enabled: !salonScope || salonScope === 'beauty', queryKey: getGetPointRewardsQueryKey({ salon: 'beauty' }) } },
  );
  const hairRewardsQuery = useGetPointRewards(
    { salon: 'hair-studio' },
    { query: { enabled: !salonScope || salonScope === 'hair-studio', queryKey: getGetPointRewardsQueryKey({ salon: 'hair-studio' }) } },
  );
  const [activeCustomer, setActiveCustomer] = useState<ActiveCustomer | null>(null);
  const [redeemNotice, setRedeemNotice] = useState('');

  return (
    <main className="pp-page fade-up" data-testid="page-poin">
      <header className="pp-hero">
        <div className="pp-hero__copy">
          <div className="pp-eyebrow"><Users size={14} aria-hidden="true" /> LOYALITAS PELANGGAN</div>
          <h1>Saldo poin <span>pelanggan</span></h1>
          <p>{salonScope ? 'Pantau saldo pelanggan di salon yang ditetapkan untuk akun ini.' : 'Pantau saldo dengan cepat. Data GGS Beauty dan GGS Hair Studio ditampilkan terpisah.'}</p>
        </div>
        <div className="pp-rule" aria-label="Ketentuan poin">
          <span className="pp-rule__icon"><Coins size={18} aria-hidden="true" /></span>
          <span><small>Ketentuan poin</small><strong>1 poin per transaksi Rp1.000</strong></span>
        </div>
      </header>

      <div className="pp-section-label">
        <span>Hadiah poin</span>
        <span>Informasi hadiah tiap salon</span>
      </div>

      <div className="pp-reward-grid" data-testid="section-point-rewards">
        {salonScope !== 'hair-studio' && <RewardPanel
          salon="beauty"
          brand="GGS BEAUTY"
          rewards={beautyRewardsQuery.data ?? []}
          isLoading={beautyRewardsQuery.isLoading}
          isError={beautyRewardsQuery.isError}
          canManageRewards={canManageRewards}
          onSaved={saveRewards}
        />}
        {salonScope !== 'beauty' && <RewardPanel
          salon="hair-studio"
          brand="GGS HAIR STUDIO"
          rewards={hairRewardsQuery.data ?? []}
          isLoading={hairRewardsQuery.isLoading}
          isError={hairRewardsQuery.isError}
          canManageRewards={canManageRewards}
          onSaved={saveRewards}
        />}
      </div>
      {redeemNotice && (
        <p className="pp-redeem-notice" role="status" data-testid="status-point-redemption-success">
          <Gift size={15} aria-hidden="true" /> {redeemNotice}
          <button type="button" onClick={() => setRedeemNotice('')} aria-label="Tutup pemberitahuan">Tutup</button>
        </p>
      )}

      <div className="pp-section-label pp-section-label--rankings">
        <span>Daftar pelanggan</span>
        <span>Saldo diperbarui dari transaksi</span>
      </div>

      <div className="pp-rankings">
        {salonScope !== 'hair-studio' && <RankingPanel
          title="Pelanggan GGS Beauty"
          brand="GGS BEAUTY"
          salon="beauty"
          customers={beautyQuery.data}
          isLoading={beautyQuery.isLoading}
          isError={beautyQuery.isError}
          onRetry={() => void beautyQuery.refetch()}
          onRedeem={(customer) => {
            setRedeemNotice('');
            setActiveCustomer({ salon: 'beauty', customer, rewards: beautyRewardsQuery.data ?? [] });
          }}
        />}
        {salonScope !== 'beauty' && <RankingPanel
          title="Pelanggan GGS Hair Studio"
          brand="GGS HAIR STUDIO"
          salon="hair-studio"
          customers={hairQuery.data}
          isLoading={hairQuery.isLoading}
          isError={hairQuery.isError}
          onRetry={() => void hairQuery.refetch()}
          onRedeem={(customer) => {
            setRedeemNotice('');
            setActiveCustomer({ salon: 'hair-studio', customer, rewards: hairRewardsQuery.data ?? [] });
          }}
        />}
      </div>
      <ActivityPanel salons={salonScope ? [salonScope] : ['beauty', 'hair-studio']} />
      {activeCustomer && (
        <PointRedemptionDialog
          key={`${activeCustomer.salon}-${activeCustomer.customer.phone}`}
          salon={activeCustomer.salon}
          customer={activeCustomer.customer}
          rewards={activeCustomer.rewards}
          onClose={() => setActiveCustomer(null)}
          onSuccess={(redemption) => {
            setActiveCustomer(null);
            void queryClient.invalidateQueries({ queryKey: ['/api/points/activity'] });
            setRedeemNotice(`${redemption.rewardName} sudah ditandai digunakan. ${pointsFormat.format(redemption.pointsSpent)} poin dikurangi.`);
          }}
        />
      )}
    </main>
  );
}
