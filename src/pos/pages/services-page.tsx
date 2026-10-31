import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetServicesQueryKey,
  useCreateSalonService,
  useGetServices,
  useUpdateSalonService,
  type SalonService,
  type SalonServiceInput,
} from '@/lib/api-client';
import { Check, ChevronDown, CircleDollarSign, Layers3, Pencil, Plus, RefreshCw, Scissors, Search, X } from 'lucide-react';
import type { SalonId } from '@/pos/lib/menu';

type Props = { salon: SalonId; onSalonChange: (salon: SalonId) => void; salonLocked: boolean };
type PriceType = SalonServiceInput['priceType'];
type PriceTypeFilter = 'all' | PriceType;
type FormState = { name: string; category: string; minPrice: string; maxPrice: string; priceType: PriceType; commissionPercent: string };

const blankForm: FormState = { name: '', category: '', minPrice: '', maxPrice: '', priceType: 'fixed', commissionPercent: '' };
const MAX_SERVICE_PRICE = 2_147_483_647;
const priceFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const formatPrice = (value: number) => `Rp ${priceFormat.format(value)}`;
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kendala. Silakan coba lagi.';

function formatPriceDraft(value: string) {
  if (!value) return '';
  const numeric = Number(digitsOnly(value));
  return Number.isSafeInteger(numeric) && numeric <= MAX_SERVICE_PRICE
    ? priceFormat.format(numeric)
    : value;
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

function servicePrice(service: SalonService) {
  if (service.priceType === 'range' && service.maxPrice !== null) {
    return `${formatPrice(service.minPrice)} – ${formatPrice(service.maxPrice)}`;
  }
  return service.priceType === 'starting' ? `Mulai dari ${formatPrice(service.minPrice)}` : formatPrice(service.minPrice);
}

export default function ServicesPage({ salon, onSalonChange, salonLocked }: Props) {
  const queryClient = useQueryClient();
  const queryKey = getGetServicesQueryKey({ salon });
  const servicesQuery = useGetServices({ salon }, {
    query: { queryKey, refetchInterval: 30_000, refetchOnWindowFocus: true },
  });
  const createService = useCreateSalonService();
  const updateService = useUpdateSalonService();
  const services = servicesQuery.data ?? [];
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priceTypeFilter, setPriceTypeFilter] = useState<PriceTypeFilter>('all');
  const [editing, setEditing] = useState<SalonService | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');

  const categories = useMemo(() => [...new Set(services.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'id')), [services]);
  const filteredServices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id');
    return services.filter((item) =>
      (!query || `${item.name} ${item.category}`.toLocaleLowerCase('id').includes(query))
      && (categoryFilter === 'all' || item.category === categoryFilter)
      && (priceTypeFilter === 'all' || item.priceType === priceTypeFilter),
    );
  }, [services, search, categoryFilter, priceTypeFilter]);
  const isPending = createService.isPending || updateService.isPending;
  const activeSalonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const legacyCommissionCount = services.filter((service) => service.commissionPercent === null).length;
  const flexiblePriceCount = services.filter((service) => service.priceType !== 'fixed').length;
  const isRefreshing = servicesQuery.isFetching;

  const draftMinPrice = form.minPrice ? Number(digitsOnly(form.minPrice)) : null;
  const draftMaxPrice = form.maxPrice ? Number(digitsOnly(form.maxPrice)) : null;
  const draftPriceIsRepresentable = draftMinPrice !== null
    && Number.isSafeInteger(draftMinPrice)
    && draftMinPrice >= 0
    && draftMinPrice <= MAX_SERVICE_PRICE;
  const draftMaxIsRepresentable = draftMaxPrice !== null
    && Number.isSafeInteger(draftMaxPrice)
    && draftMaxPrice >= 0
    && draftMaxPrice <= MAX_SERVICE_PRICE;
  const draftPriceLabel = draftMinPrice === null
    ? 'Harga belum diisi'
    : !draftPriceIsRepresentable
      ? 'Harga melewati batas yang dapat disimpan'
      : form.priceType === 'range'
        ? draftMaxPrice === null
          ? 'Lengkapi harga maksimum'
          : !draftMaxIsRepresentable
            ? 'Harga maksimum melewati batas yang dapat disimpan'
            : draftMaxPrice <= draftMinPrice
              ? 'Harga maksimum harus lebih besar'
              : `${formatPrice(draftMinPrice)} – ${formatPrice(draftMaxPrice)}`
        : form.priceType === 'starting'
          ? `Mulai dari ${formatPrice(draftMinPrice)}`
          : formatPrice(draftMinPrice);
  const draftCommission = form.commissionPercent.trim() === '' ? null : Number(form.commissionPercent);
  const draftCommissionLabel = draftCommission === null
    ? editing?.commissionPercent === null
      ? 'Tarif lama mengikuti komisi staf'
      : 'Komisi layanan belum diisi'
    : Number.isFinite(draftCommission) && draftCommission >= 0 && draftCommission <= 100
      ? `Komisi layanan ${draftCommission}%`
      : 'Persentase komisi di luar batas 0–100%';

  const beginCreate = () => {
    setEditing(null);
    setForm(blankForm);
    setFormError('');
    setFeedback('');
  };

  const beginEdit = (service: SalonService) => {
    setEditing(service);
    setForm({
      name: service.name,
      category: service.category,
      minPrice: String(service.minPrice),
      maxPrice: service.maxPrice === null ? '' : String(service.maxPrice),
      priceType: service.priceType,
      commissionPercent: service.commissionPercent === null ? '' : String(service.commissionPercent),
    });
    setFormError('');
    setFeedback('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');
    const name = form.name.trim();
    const category = form.category.trim();
    const minPrice = Number(digitsOnly(form.minPrice));
    const maxPrice = Number(digitsOnly(form.maxPrice));
    const commissionPercent = form.commissionPercent.trim() === '' ? null : Number(form.commissionPercent);
    if (!name || !category) {
      setFormError('Nama layanan dan kategori wajib diisi.');
      return;
    }
    if (!form.minPrice || !Number.isSafeInteger(minPrice) || minPrice < 0 || minPrice > MAX_SERVICE_PRICE) {
      setFormError(`Masukkan harga rupiah antara 0–${formatPrice(MAX_SERVICE_PRICE)}.`);
      return;
    }
    if (form.priceType === 'range' && (!form.maxPrice || !Number.isSafeInteger(maxPrice) || maxPrice > MAX_SERVICE_PRICE || maxPrice <= minPrice)) {
      setFormError('Harga maksimum harus lebih besar dari harga minimum.');
      return;
    }
    if ((!editing && commissionPercent === null) || (commissionPercent !== null && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100))) {
      setFormError('Masukkan persentase komisi layanan antara 0–100%.');
      return;
    }
    const data: SalonServiceInput = {
      name,
      category,
      minPrice,
      maxPrice: form.priceType === 'range' ? maxPrice : null,
      priceType: form.priceType,
      commissionPercent,
    };
    try {
      if (editing) {
        await updateService.mutateAsync({ salon, id: editing.id, data });
        setFeedback('Perubahan layanan berhasil disimpan.');
      } else {
        await createService.mutateAsync({ salon, data });
        setFeedback('Layanan baru berhasil ditambahkan.');
      }
      await queryClient.invalidateQueries({ queryKey });
      setEditing(null);
      setForm(blankForm);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const changeSalon = (nextSalon: SalonId) => {
    if (salonLocked) return;
    if (nextSalon === salon) return;
    setSearch('');
    setCategoryFilter('all');
    setPriceTypeFilter('all');
    setEditing(null);
    setForm(blankForm);
    setFormError('');
    setFeedback('');
    onSalonChange(nextSalon);
  };

  const refreshServices = () => {
    void servicesQuery.refetch();
  };

  return <div className={`services-page fade-up${salon === 'hair-studio' ? ' services-page--hair' : ''}`} data-testid="page-services">
    <header className="services-heading">
      <div>
        <p className="services-eyebrow"><Scissors size={13}/> PENGELOLAAN KASIR</p>
        <h1 className="font-display">Layanan &amp; Harga</h1>
        <p className="services-subtitle">Atur daftar layanan yang tampil di menu transaksi.</p>
      </div>
      {!salonLocked && <label className="salon-select-wrap" htmlFor="select-service-salon">
        <span>Salon aktif</span>
        <span className="salon-select-control">
          <select id="select-service-salon" data-testid="select-service-salon" value={salon} onChange={(event) => changeSalon(event.target.value as SalonId)}>
            <option value="beauty">GGS Beauty</option>
            <option value="hair-studio">GGS Hair Studio</option>
          </select>
          <ChevronDown size={15}/>
        </span>
      </label>}
    </header>

    <div className="services-context">
      <span className="services-context-mark"><Layers3 size={17}/></span>
      <div><b>{activeSalonName}</b><span>Perubahan hanya berlaku untuk salon ini. Daftar kasir akan diperbarui setelah disimpan.</span></div>
      <div className="service-sync-status">
        <span className={`service-sync-copy${servicesQuery.isError ? ' is-error' : ''}`} role="status">
          <span className={`service-sync-dot${isRefreshing ? ' is-refreshing' : ''}`} aria-hidden="true"/>
          {servicesQuery.isError && servicesQuery.data ? 'Gagal memperbarui · data terakhir ditampilkan' : isRefreshing ? 'Memperbarui daftar…' : formatUpdatedTime(servicesQuery.dataUpdatedAt)}
        </span>
        <button type="button" className="service-refresh-button" onClick={refreshServices} disabled={isRefreshing} aria-label="Perbarui daftar layanan" title="Perbarui daftar layanan">
          <RefreshCw size={14} className={isRefreshing ? 'is-spinning' : ''}/><span>{isRefreshing ? 'Memperbarui' : 'Perbarui'}</span>
        </button>
      </div>
    </div>

    {feedback && <div role="status" data-testid="status-service-save" className="service-feedback service-feedback--success"><Check size={16}/>{feedback}<button type="button" aria-label="Tutup pesan" onClick={() => setFeedback('')}><X size={15}/></button></div>}

    <section className="service-metrics" aria-label="Ringkasan menu layanan">
      <div><span>Layanan terdaftar</span><b>{services.length}</b><small>untuk {activeSalonName}</small></div>
      <div><span>Kategori</span><b>{categories.length}</b><small>tersedia di menu</small></div>
      <div><span>Harga variatif</span><b>{flexiblePriceCount}</b><small>rentang atau mulai dari</small></div>
      <div className={legacyCommissionCount ? 'has-legacy' : ''}><span>Komisi staf lama</span><b>{legacyCommissionCount}</b><small>{legacyCommissionCount ? 'belum memakai tarif layanan' : 'semua layanan teratur'}</small></div>
    </section>

    <div className="services-workspace">
      <section className="service-list-panel">
        <div className="service-list-header">
          <div><p className="services-eyebrow">DAFTAR MENU</p><h2>Layanan kasir <span className="service-list-total">{services.length}</span></h2></div>
          <button type="button" data-testid="button-add-service" onClick={beginCreate} className="service-primary-button"><Plus size={16}/> Tambah layanan</button>
        </div>
        <div className="service-tools">
          <label className="service-search">
            <Search size={16}/>
            <input type="search" aria-label="Cari layanan" data-testid="input-search-service" placeholder="Cari nama atau kategori..." value={search} onChange={(event) => setSearch(event.target.value)}/>
            {search && <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')}><X size={14}/></button>}
          </label>
          <div className="service-filter-controls">
            <label><span>Kategori</span><select data-testid="filter-service-category" aria-label="Filter kategori" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Semua kategori</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <label><span>Jenis harga</span><select data-testid="filter-service-price-type" aria-label="Filter jenis harga" value={priceTypeFilter} onChange={(event) => setPriceTypeFilter(event.target.value as PriceTypeFilter)}><option value="all">Semua jenis</option><option value="fixed">Tetap</option><option value="range">Rentang</option><option value="starting">Mulai dari</option></select></label>
          </div>
          <p className="service-results-count" aria-live="polite">Menampilkan <b>{filteredServices.length}</b> dari <b>{services.length}</b> layanan</p>
        </div>
        {servicesQuery.isError && servicesQuery.data && <div className="service-stale-warning" role="status">Pembaruan otomatis gagal. Data terakhir tetap ditampilkan.</div>}
        {servicesQuery.isLoading ? <div className="service-skeleton-list" aria-label="Memuat layanan">{[1, 2, 3, 4].map((item) => <div className="service-skeleton" key={item}><span/><span/><span/></div>)}</div>
          : servicesQuery.isError && !servicesQuery.data ? <div className="service-list-state"><CircleDollarSign size={25}/><h3>Daftar belum dapat dimuat</h3><p>Periksa koneksi, lalu coba muat ulang.</p><button type="button" onClick={refreshServices}>Coba lagi</button></div>
            : filteredServices.length ? <div className="service-rows">{filteredServices.map((service) => <article className="service-row" key={service.id} data-testid={`row-service-${service.id}`}>
               <div className="service-row-icon"><Scissors size={17}/></div>
              <div className="service-row-copy"><span className="service-category">{service.category}</span><h3>{service.name}</h3><span className="service-price">{servicePrice(service)}</span><span className={`service-commission-label${service.commissionPercent === null ? ' is-legacy' : ''}`}>{service.commissionPercent === null ? 'Tarif lama: mengikuti staf' : `Komisi layanan ${service.commissionPercent}%`}</span></div>
              <span className={`service-price-type service-price-type--${service.priceType}`}>{service.priceType === 'fixed' ? 'Tetap' : service.priceType === 'range' ? 'Rentang' : 'Mulai dari'}</span>
              <button type="button" className="service-edit-button" data-testid={`button-edit-service-${service.id}`} onClick={() => beginEdit(service)} aria-label={`Ubah ${service.name}`}><Pencil size={15}/><span>Ubah</span></button>
            </article>)}</div>
              : <div className="service-list-state"><Scissors size={26}/><h3>{services.length ? 'Layanan tidak ditemukan' : 'Belum ada layanan'}</h3><p>{services.length ? 'Ubah kata kunci atau hapus filter untuk melihat layanan lain.' : 'Tambahkan layanan pertama agar kasir dapat memilihnya saat transaksi.'}</p>{services.length ? <button type="button" onClick={() => { setSearch(''); setCategoryFilter('all'); setPriceTypeFilter('all'); }}>Hapus filter</button> : <button type="button" onClick={beginCreate}>Tambah layanan</button>}</div>}
      </section>

      <aside className="service-editor">
        <div className="service-editor-top">
          <span className="service-editor-icon">{editing ? <Pencil size={17}/> : <Plus size={18}/>}</span>
          <div><p className="services-eyebrow">{editing ? 'PERBARUI MENU' : 'MENU BARU'}</p><h2>{editing ? 'Ubah layanan' : 'Tambah layanan'}</h2></div>
          {editing && <button type="button" className="service-editor-reset" onClick={beginCreate} aria-label="Batal mengubah layanan"><X size={17}/></button>}
        </div>
        <p className="service-editor-intro">Isi detail layanan dan harga yang akan digunakan oleh kasir.</p>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <label className="service-field"><span className="service-field__label">Nama layanan <span>*</span></span>
            <input data-testid="input-service-name" maxLength={120} value={form.name} onChange={(event) => updateField('name', event.target.value)} required/>
          </label>
          <label className="service-field"><span className="service-field__label">Kategori <span>*</span></span>
            <input data-testid="input-service-category" maxLength={80} list="service-category-suggestions" value={form.category} onChange={(event) => updateField('category', event.target.value)} required/>
            <datalist id="service-category-suggestions">{categories.map((category) => <option key={category} value={category}/>)}</datalist>
          </label>
          <fieldset className="service-price-options">
            <legend>Jenis harga</legend>
            {([
              ['fixed', 'Harga tetap', 'Satu harga pasti'],
              ['range', 'Rentang harga', 'Minimum sampai maksimum'],
              ['starting', 'Harga mulai dari', 'Harga dasar layanan'],
            ] as const).map(([value, title, caption]) => <label key={value} className={`service-price-option${form.priceType === value ? ' is-selected' : ''}`}>
              <input type="radio" name="priceType" value={value} checked={form.priceType === value} onChange={() => updateField('priceType', value)}/>
              <span className="service-radio-mark"/>
              <span><b>{title}</b><small>{caption}</small></span>
            </label>)}
          </fieldset>
          <div className={`service-price-inputs${form.priceType === 'range' ? ' has-range' : ''}`}>
            <label className="service-field"><span className="service-field__label">{form.priceType === 'range' ? 'Harga minimum' : form.priceType === 'starting' ? 'Harga mulai' : 'Harga layanan'} <span>*</span></span>
              <span className="rupiah-input"><b>Rp</b><input inputMode="numeric" data-testid="input-service-min-price" value={formatPriceDraft(form.minPrice)} onChange={(event) => updateField('minPrice', digitsOnly(event.target.value))} placeholder="0" aria-label="Harga minimum dalam rupiah"/></span>
            </label>
            {form.priceType === 'range' && <label className="service-field"><span className="service-field__label">Harga maksimum <span>*</span></span>
              <span className="rupiah-input"><b>Rp</b><input inputMode="numeric" data-testid="input-service-max-price" value={formatPriceDraft(form.maxPrice)} onChange={(event) => updateField('maxPrice', digitsOnly(event.target.value))} placeholder="0" aria-label="Harga maksimum dalam rupiah"/></span>
            </label>}
          </div>
          <p className="service-helper service-price-limit">Harga dalam rupiah bulat, maksimal {formatPrice(MAX_SERVICE_PRICE)}.</p>
          <label className="service-field"><span className="service-field__label">Persentase komisi layanan {!editing && <span>*</span>}</span>
            <span className="service-percent-input">
              <input type="number" inputMode="decimal" min="0" max="100" step="any" data-testid="input-service-commission" value={form.commissionPercent} onChange={(event) => updateField('commissionPercent', event.target.value)} required={!editing}/>
              <b>%</b>
            </span>
          </label>
          <p className="service-helper">{editing && editing.commissionPercent === null ? 'Layanan lama yang belum diatur masih memakai tarif staf sebelumnya. Isi nilai untuk menetapkan komisi khusus layanan ini.' : 'Tarif ini otomatis dipakai untuk semua staf yang mengerjakan layanan ini.'}</p>
          {form.priceType === 'starting' && <p className="service-helper">Nominal yang dipilih kasir dapat disesuaikan saat transaksi.</p>}
          <div className="service-preview" aria-live="polite">
            <div className="service-preview-name"><span>Pratinjau di kasir</span><b>{form.name.trim() || 'Nama layanan'}</b><small>{form.category.trim() || 'Kategori layanan'}</small></div>
            <div className="service-preview-details"><b>{draftPriceLabel}</b><span className={draftCommission === null && editing?.commissionPercent === null ? 'is-legacy' : ''}>{draftCommissionLabel}</span></div>
          </div>
          {formError && <div className="service-feedback service-feedback--error" role="alert" data-testid="text-service-error">{formError}</div>}
          <button type="submit" data-testid="button-save-service" disabled={isPending} className="service-save-button">
            {isPending ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Simpan layanan'}
          </button>
          <p className="service-editor-note">Layanan tersimpan untuk {activeSalonName}.</p>
        </form>
      </aside>
    </div>
  </div>;
}
