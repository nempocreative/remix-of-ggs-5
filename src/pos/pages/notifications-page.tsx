import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCustomersQueryKey,
  getGetSalesQueryKey,
  getGetServicesQueryKey,
  getGetWhatsAppCampaignsQueryKey,
  getGetWhatsAppTreatmentReminderAudienceQueryKey,
  useCreateWhatsAppCampaign,
  useGetCustomers,
  useGetSales,
  useGetServices,
  useGetWhatsAppCampaigns,
  useGetWhatsAppTreatmentReminderAudience,
  useMarkWhatsAppCampaignRecipientSent,
  type WhatsAppCampaign,
  type WhatsAppCampaignRecipient,
  type WhatsAppCampaignType,
} from '@/lib/api-client';
import { AlertCircle, ArrowUpRight, CalendarClock, Check, CheckCheck, ChevronDown, Clock3, Coins, Gift, MessageCircle, RefreshCw, Search, Send, Users, X } from 'lucide-react';
import type { SalonId } from '@/pos/lib/menu';
import './notifications-page.css';

type Props = { salon: SalonId };

const errorText = (error: unknown) => error instanceof Error
  ? error.message
  : 'Permintaan belum berhasil. Periksa koneksi lalu coba lagi.';

const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

const digitsOnly = (phone: string) => phone.replace(/\D/g, '');
const normalizeWhatsappPhone = (phone: string) => {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  if (digits.startsWith('0062')) return `62${digits.slice(4)}`;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits.startsWith('8') ? `62${digits}` : digits;
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();

const reminderTemplate = (salon: SalonId) => salon === 'beauty'
  ? 'Hai {{nama}}, sudah 2 minggu sejak treatment terakhir Anda di GGS Beauty. Saatnya merawat diri kembali. Kami siap membantu memilih jadwal yang nyaman untuk Anda. Sampai bertemu!'
  : 'Halo {{nama}}, sudah 2 minggu sejak kunjungan grooming terakhir Anda di GGS Hair Studio. Saatnya merapikan kembali penampilan. Kami siap membantu memilih jadwal yang nyaman. Sampai bertemu!';

const campaignTypeLabel = (type: WhatsAppCampaignType) => {
  switch (type) {
    case 'treatment-reminder': return 'Treatment 14 hari';
    case 'hair-studio-bonus': return 'Bonus potong gratis';
    case 'points-redemption': return 'Saldo & penukaran poin';
    default: return 'Kampanye biasa';
  }
};

type AudienceCustomer = {
  phone: string;
  name: string;
  memberCode: string;
  points?: number;
  visitCount?: number;
  visitsRemaining?: number;
};

type HairBonusCandidate = {
  phone: string;
  name: string;
  visitCount: number;
  visitsRemaining: number;
};

const pointsFormat = new Intl.NumberFormat('id-ID');

export default function NotificationsPage({ salon }: Props) {
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ salon }), [salon]);
  const customerQueryKey = getGetCustomersQueryKey(params);
  const salesQueryKey = getGetSalesQueryKey(params);
  const servicesQueryKey = getGetServicesQueryKey(params);
  const campaignsQueryKey = getGetWhatsAppCampaignsQueryKey(params);
  const reminderAudienceQueryKey = getGetWhatsAppTreatmentReminderAudienceQueryKey(params);
  const customersQuery = useGetCustomers(params, { query: { queryKey: customerQueryKey } });
  const campaignsQuery = useGetWhatsAppCampaigns(params, { query: { queryKey: campaignsQueryKey } });
  const reminderAudienceQuery = useGetWhatsAppTreatmentReminderAudience(params, { query: { queryKey: reminderAudienceQueryKey } });
  const salesQuery = useGetSales(params, { query: { queryKey: salesQueryKey, enabled: salon === 'hair-studio' } });
  const servicesQuery = useGetServices(params, { query: { queryKey: servicesQueryKey, enabled: salon === 'hair-studio' } });
  const createCampaign = useCreateWhatsAppCampaign();
  const markRecipientSent = useMarkWhatsAppCampaignRecipientSent();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [campaignType, setCampaignType] = useState<WhatsAppCampaignType>('campaign');
  const [search, setSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyRecipientId, setBusyRecipientId] = useState('');

  useEffect(() => {
    setTitle('');
    setMessage('');
    setCampaignType('campaign');
    setSearch('');
    setSelectedPhones([]);
    setActiveCampaignId('');
    setMutationError('');
    setFeedback('');
  }, [salon]);

  const salonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const customers = useMemo(
    () => (customersQuery.data ?? []).filter((customer) => customer.salon === salon),
    [customersQuery.data, salon],
  );
  const dueCandidates = useMemo(
    () => (reminderAudienceQuery.data ?? []).filter((candidate) => candidate.salon === salon),
    [reminderAudienceQuery.data, salon],
  );
  const treatmentCandidates = useMemo(
    () => dueCandidates.filter((candidate) => digitsOnly(candidate.phone).length >= 8),
    [dueCandidates],
  );
  const duePhones = useMemo(
    () => new Set(treatmentCandidates.map((candidate) => digitsOnly(candidate.phone))),
    [treatmentCandidates],
  );
  const hairStudioBonusCandidates = useMemo(() => {
    if (salon !== 'hair-studio') return [];
    const promoEligibleServiceIds = new Set((servicesQuery.data ?? [])
      .filter((service) => !['ADDITION', 'ADDITIONAL'].includes(service.category.trim().toLocaleUpperCase('id')))
      .map((service) => service.id));
    const visitCounts = new Map<string, number>();
    for (const sale of salesQuery.data ?? []) {
      if (sale.salon !== salon || !sale.customerPhone || !sale.items.some((item) => promoEligibleServiceIds.has(item.serviceId))) continue;
      const phone = digitsOnly(sale.customerPhone);
      if (phone.length >= 8) visitCounts.set(phone, (visitCounts.get(phone) ?? 0) + 1);
    }
    return customers.flatMap((customer): HairBonusCandidate[] => {
      const visitCount = (visitCounts.get(digitsOnly(customer.phone)) ?? 0) % 10;
      if (visitCount < 7 || digitsOnly(customer.phone).length < 8) return [];
      return [{
        phone: customer.phone,
        name: customer.name,
        visitCount,
        visitsRemaining: Math.max(0, 9 - visitCount),
      }];
    }).sort((a, b) => b.visitCount - a.visitCount || a.name.localeCompare(b.name, 'id'));
  }, [customers, salon, salesQuery.data, servicesQuery.data]);
  const pointsCandidates = useMemo(
    () => customers.filter((customer) => customer.points > 0 && digitsOnly(customer.phone).length >= 8),
    [customers],
  );
  const campaigns = useMemo(
    () => (campaignsQuery.data ?? []).filter((campaign) => campaign.salon === salon),
    [campaignsQuery.data, salon],
  );
  const availableCustomers = useMemo(() => customers.filter((customer) => digitsOnly(customer.phone).length >= 8), [customers]);
  const pickerCustomers = useMemo<AudienceCustomer[]>(() => {
    if (campaignType === 'treatment-reminder') {
      return treatmentCandidates.map((candidate) => ({
        phone: candidate.phone,
        name: candidate.name,
        memberCode: 'JATUH TEMPO',
      }));
    }
    if (campaignType === 'hair-studio-bonus') {
      return hairStudioBonusCandidates.map((candidate) => ({
        ...candidate,
        memberCode: candidate.visitsRemaining === 0 ? 'BONUS SIAP' : `${candidate.visitCount}/9 kunjungan`,
      }));
    }
    if (campaignType === 'points-redemption') {
      return pointsCandidates.map((customer) => ({
        phone: customer.phone,
        name: customer.name,
        memberCode: `${pointsFormat.format(customer.points)} poin`,
        points: customer.points,
      }));
    }
    return availableCustomers.map((customer) => ({
      phone: customer.phone,
      name: customer.name,
      memberCode: customer.memberCode,
      points: customer.points,
    }));
  }, [availableCustomers, campaignType, hairStudioBonusCandidates, pointsCandidates, treatmentCandidates]);
  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID');
    if (!term) return pickerCustomers;
    return pickerCustomers.filter((customer) =>
      customer.name.toLocaleLowerCase('id-ID').includes(term)
      || customer.phone.includes(term)
      || customer.memberCode.toLocaleLowerCase('id-ID').includes(term),
    );
  }, [pickerCustomers, search]);
  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [campaigns],
  );
  const activeCampaign = sortedCampaigns.find((campaign) => campaign.id === activeCampaignId) ?? sortedCampaigns[0];
  const eligiblePhones = useMemo(() => {
    if (campaignType === 'treatment-reminder') return duePhones;
    if (campaignType === 'hair-studio-bonus') return new Set(hairStudioBonusCandidates.map((candidate) => digitsOnly(candidate.phone)));
    if (campaignType === 'points-redemption') return new Set(pointsCandidates.map((customer) => digitsOnly(customer.phone)));
    return null;
  }, [campaignType, duePhones, hairStudioBonusCandidates, pointsCandidates]);
  const selectedCount = selectedPhones.filter((phone) => !eligiblePhones || eligiblePhones.has(phone)).length;
  const allVisibleSelected = filteredCustomers.length > 0
    && filteredCustomers.every((customer) => selectedPhones.includes(digitsOnly(customer.phone)));
  const pendingTotal = activeCampaign?.recipients.filter((recipient) => recipient.status === 'pending').length ?? 0;
  const isCreating = createCampaign.isPending;
  const activeAudienceLoading = customersQuery.isLoading
    || (campaignType === 'treatment-reminder' && reminderAudienceQuery.isLoading)
    || (campaignType === 'hair-studio-bonus' && (salesQuery.isLoading || servicesQuery.isLoading));
  const queryError = customersQuery.error
    || campaignsQuery.error
    || (campaignType === 'treatment-reminder' ? reminderAudienceQuery.error : null)
    || (campaignType === 'hair-studio-bonus' ? salesQuery.error || servicesQuery.error : null);
  const isLoading = customersQuery.isLoading || campaignsQuery.isLoading;

  const refreshCampaigns = async () => {
    await queryClient.invalidateQueries({ queryKey: campaignsQueryKey });
    await queryClient.invalidateQueries({ queryKey: reminderAudienceQueryKey });
  };

  const toggleCustomer = (phone: string) => {
    setFeedback('');
    const normalized = digitsOnly(phone);
    if (eligiblePhones && !eligiblePhones.has(normalized)) return;
    if (!selectedPhones.includes(normalized) && selectedPhones.length >= 500) {
      setMutationError('Maksimal 500 pelanggan dalam satu kampanye.');
      return;
    }
    setSelectedPhones((current) => current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized]);
  };

  const toggleVisible = () => {
    const visible = filteredCustomers.map((customer) => digitsOnly(customer.phone));
    const allowedVisible = eligiblePhones ? visible.filter((phone) => eligiblePhones.has(phone)) : visible;
    if (allVisibleSelected) {
      setSelectedPhones((current) => current.filter((phone) => !allowedVisible.includes(phone)));
      return;
    }
    const next = [...new Set([...selectedPhones, ...allowedVisible])];
    if (next.length > 500) {
      setMutationError('Maksimal 500 pelanggan dalam satu kampanye.');
      return;
    }
    setSelectedPhones(next);
  };

  const selectCategory = (type: WhatsAppCampaignType) => {
    const categoryCustomers = type === 'treatment-reminder'
      ? treatmentCandidates
      : type === 'hair-studio-bonus'
        ? hairStudioBonusCandidates
        : type === 'points-redemption'
          ? pointsCandidates
          : [];
    const categoryPhones = [...new Set(categoryCustomers
      .map((customer) => digitsOnly(customer.phone))
      .filter((phone) => phone.length >= 8))];
    const titleByType: Record<WhatsAppCampaignType, string> = {
      campaign: '',
      'treatment-reminder': 'Pengingat treatment 14 hari',
      'hair-studio-bonus': 'Pengingat bonus potong gratis',
      'points-redemption': 'Info saldo poin & penukaran',
    };
    const messageByType: Record<WhatsAppCampaignType, string> = {
      campaign: '',
      'treatment-reminder': reminderTemplate(salon),
      'hair-studio-bonus': 'Halo {{nama}}, progres bonus potong gratis Anda di GGS Hair Studio: {{statusBonus}}. Silakan tunjukkan pesan ini kepada kasir saat berkunjung.',
      'points-redemption': `Halo {{nama}}, saldo Anda saat ini {{poin}} poin di ${salonName}. Jika ingin menukarkan poin, silakan tanyakan kepada kasir kami untuk informasi lebih lanjut.`,
    };
    setCampaignType(type);
    setTitle(titleByType[type]);
    setMessage(messageByType[type]);
    setSelectedPhones(type === 'campaign' ? [] : categoryPhones.slice(0, 500));
    setSearch('');
    setMutationError('');
    setFeedback(type === 'campaign'
      ? 'Kampanye biasa dipilih. Tentukan penerima dan isi pesannya.'
      : `${Math.min(categoryPhones.length, 500)} pelanggan sesuai kategori dipilih${categoryPhones.length > 500 ? ' (batas 500 penerima per kampanye)' : ''}.`);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMutationError('');
    setFeedback('');
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const recipientPhones = selectedPhones.filter((phone) => !eligiblePhones || eligiblePhones.has(phone));
    if (!cleanTitle || !cleanMessage || recipientPhones.length === 0) return;
    try {
      const created = await createCampaign.mutateAsync({
        params: { salon },
        data: { title: cleanTitle, campaignType, message: cleanMessage, recipientPhones },
      });
      setTitle('');
      setMessage('');
      setCampaignType('campaign');
      setSelectedPhones([]);
      setSearch('');
      setActiveCampaignId(created.id);
      setFeedback(`Kampanye “${created.title}” siap. Buka WhatsApp satu per satu, lalu konfirmasi setelah pesan benar-benar terkirim.`);
      await refreshCampaigns();
    } catch (error) {
      setMutationError(errorText(error));
    }
  };

  const whatsappHref = (recipient: WhatsAppCampaignRecipient, campaign: WhatsAppCampaign) => {
    const phone = normalizeWhatsappPhone(recipient.phone);
    if (!phone) return '';
    const normalizedRecipientPhone = digitsOnly(recipient.phone);
    const currentCustomer = customers.find((customer) => digitsOnly(customer.phone) === normalizedRecipientPhone);
    const bonus = hairStudioBonusCandidates.find((candidate) => digitsOnly(candidate.phone) === normalizedRecipientPhone);
    const statusBonus = bonus
      ? bonus.visitsRemaining === 0
        ? 'hadiah 1x potong rambut gratis sudah siap setelah 9 kunjungan'
        : `${bonus.visitCount}/9 kunjungan, tinggal ${bonus.visitsRemaining} kunjungan lagi`
      : 'silakan tanyakan progres promo kepada kasir';
    const personalizedMessage = campaign.message
      .replace(/{{\s*nama\s*}}/gi, () => recipient.customerName)
      .replace(/{{\s*poin\s*}}/gi, () => currentCustomer ? pointsFormat.format(currentCustomer.points) : 'belum tersedia')
      .replace(/{{\s*statusBonus\s*}}/gi, () => statusBonus);
    return `https://wa.me/${phone}?text=${encodeURIComponent(personalizedMessage)}`;
  };

  const handleWhatsappClick = (recipient: WhatsAppCampaignRecipient) => {
    setMutationError('');
    setFeedback(`WhatsApp dibuka untuk ${recipient.customerName}. Pesan belum tercatat terkirim — kirim di WhatsApp, lalu konfirmasi di sini.`);
  };

  const confirmSent = async (campaign: WhatsAppCampaign, recipient: WhatsAppCampaignRecipient) => {
    setMutationError('');
    setFeedback('');
    setBusyRecipientId(recipient.id);
    try {
      await markRecipientSent.mutateAsync({
        params: { campaignId: campaign.id, recipientId: recipient.id, salon },
      });
      setFeedback(`Status terkirim untuk ${recipient.customerName} sudah dicatat.`);
      await refreshCampaigns();
    } catch (error) {
      setMutationError(errorText(error));
    } finally {
      setBusyRecipientId('');
    }
  };

  return (
    <main className={`notifications-page${salon === 'hair-studio' ? ' notifications-page--hair' : ''}`} data-salon={salon}>
      <header className="notifications-heading">
        <div>
          <div className="notifications-eyebrow"><span className="notifications-eyebrow__dot" /> RUANG KERJA KASIR <span className="notifications-eyebrow__divider">/</span> {salonName.toUpperCase()}</div>
          <h1>Pesan pelanggan<span>.</span></h1>
          <p>Siapkan pesan, buka WhatsApp untuk tiap pelanggan, lalu tandai setelah benar-benar terkirim.</p>
        </div>
        <div className="notifications-counter" aria-label="Pengiriman per pelanggan">
          <MessageCircle size={18} aria-hidden="true" />
          <span>Kontak satu per satu</span>
        </div>
      </header>

      {feedback && <div className="notifications-alert notifications-alert--success" role="status" aria-live="polite"><Check size={17} /><span>{feedback}</span><button type="button" onClick={() => setFeedback('')} aria-label="Tutup pemberitahuan"><X size={15} /></button></div>}
      {mutationError && <div className="notifications-alert notifications-alert--error" role="alert"><AlertCircle size={17} /><span>{mutationError}</span><button type="button" onClick={() => setMutationError('')} aria-label="Tutup pemberitahuan"><X size={15} /></button></div>}

      <section className="notifications-workflow" aria-label="Alur pengiriman pesan">
        <div className="workflow-step"><span className="workflow-step__number">01</span><span>Pilih pelanggan & siapkan kampanye</span></div>
        <span className="workflow-step__line" aria-hidden="true" />
        <div className="workflow-step"><span className="workflow-step__number">02</span><span>Kirim pesan di WhatsApp</span></div>
        <span className="workflow-step__line" aria-hidden="true" />
        <div className="workflow-step"><span className="workflow-step__number">03</span><span>Konfirmasi di kasir</span></div>
      </section>

      {queryError && <section className="notifications-query-error" role="alert">
        <AlertCircle size={18} /><div><strong>Data belum dapat dimuat</strong><span>{errorText(queryError)}</span></div>
        <button type="button" onClick={() => {
          void customersQuery.refetch();
          void campaignsQuery.refetch();
          if (campaignType === 'treatment-reminder') void reminderAudienceQuery.refetch();
          if (campaignType === 'hair-studio-bonus') {
            void salesQuery.refetch();
            void servicesQuery.refetch();
          }
        }}><RefreshCw size={15} /> Coba lagi</button>
      </section>}

      <div className="notifications-columns">
        <section className="campaign-builder panel" aria-labelledby="builder-title">
          <div className="panel-heading">
            <div><span className="panel-kicker">KAMPANYE BARU</span><h2 id="builder-title">Buat pesan</h2></div>
            <div className="panel-icon"><Send size={18} /></div>
          </div>
          <section className="notification-categories" aria-label="Pilih jenis notifikasi">
            <div className="notification-categories__heading">
              <span className="panel-kicker">JENIS NOTIFIKASI</span>
              <strong>Pilih kategori pesan</strong>
            </div>
            <div className="notification-category-grid">
              <button className={`notification-category${campaignType === 'treatment-reminder' ? ' is-active' : ''}`} type="button" onClick={() => selectCategory('treatment-reminder')} aria-pressed={campaignType === 'treatment-reminder'} data-testid="button-category-treatment-reminder">
                <span className="notification-category__icon"><CalendarClock size={16} /></span>
                <span className="notification-category__copy"><strong>Pengingat treatment 14 hari</strong><small>Pelanggan jatuh tempo sejak kunjungan terakhir</small></span>
                <span className="notification-category__count">{reminderAudienceQuery.isLoading ? '…' : treatmentCandidates.length}</span>
              </button>
              {salon === 'hair-studio' && <button className={`notification-category notification-category--bonus${campaignType === 'hair-studio-bonus' ? ' is-active' : ''}`} type="button" onClick={() => selectCategory('hair-studio-bonus')} aria-pressed={campaignType === 'hair-studio-bonus'} data-testid="button-category-hair-bonus">
                <span className="notification-category__icon"><Gift size={16} /></span>
                <span className="notification-category__copy"><strong>Bonus potong gratis · Hair Studio</strong><small>Progres 7–9 dari 9 kunjungan</small></span>
                <span className="notification-category__count">{salesQuery.isLoading || servicesQuery.isLoading ? '…' : hairStudioBonusCandidates.length}</span>
              </button>}
              <button className={`notification-category notification-category--points${campaignType === 'points-redemption' ? ' is-active' : ''}`} type="button" onClick={() => selectCategory('points-redemption')} aria-pressed={campaignType === 'points-redemption'} data-testid="button-category-points">
                <span className="notification-category__icon"><Coins size={16} /></span>
                <span className="notification-category__copy"><strong>Saldo & penukaran poin</strong><small>Pesan berisi jumlah poin terkini</small></span>
                <span className="notification-category__count">{customersQuery.isLoading ? '…' : pointsCandidates.length}</span>
              </button>
              <button className={`notification-category notification-category--general${campaignType === 'campaign' ? ' is-active' : ''}`} type="button" onClick={() => selectCategory('campaign')} aria-pressed={campaignType === 'campaign'} data-testid="button-category-campaign">
                <span className="notification-category__icon"><MessageCircle size={16} /></span>
                <span className="notification-category__copy"><strong>Kampanye biasa</strong><small>Pilih penerima dan tulis pesan sendiri</small></span>
                <span className="notification-category__count">{customersQuery.isLoading ? '…' : availableCustomers.length}</span>
              </button>
            </div>
          </section>
          <form onSubmit={handleCreate}>
            <label className="field-label" htmlFor="campaign-title">Nama kampanye</label>
            <input id="campaign-title" className="notification-input" maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Pengingat perawatan bulan ini" required data-testid="input-campaign-title" />

            <div className="customer-picker-heading">
              <div><label className="field-label" htmlFor="customer-search">Pilih penerima</label><span className="field-hint">{selectedCount} dipilih dari {pickerCustomers.length} {campaignType === 'treatment-reminder' ? 'pelanggan jatuh tempo' : campaignType === 'hair-studio-bonus' ? 'pelanggan tahap bonus' : campaignType === 'points-redemption' ? 'pelanggan berpoin' : 'pelanggan'}</span></div>
              <button className="text-button" type="button" onClick={toggleVisible} disabled={!filteredCustomers.length} data-testid="button-select-visible-customers">
                {allVisibleSelected ? 'Batalkan pilihan' : 'Pilih terlihat'}
              </button>
            </div>
            <div className="customer-search">
              <Search size={16} aria-hidden="true" />
              <input id="customer-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, nomor, atau kode member" aria-label="Cari pelanggan" data-testid="input-customer-search" />
              {search && <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')}><X size={14} /></button>}
            </div>

            <div className="customer-list" aria-label="Daftar pelanggan aktif">
              {activeAudienceLoading ? <div className="customer-state"><span className="skeleton-line skeleton-line--long" /><span className="skeleton-line" /><span className="skeleton-line skeleton-line--long" /></div>
                : filteredCustomers.length === 0 ? <div className="customer-empty"><Users size={20} /><span>{pickerCustomers.length === 0 ? (campaignType === 'treatment-reminder' ? 'Belum ada pelanggan jatuh tempo yang dapat dipilih.' : campaignType === 'hair-studio-bonus' ? 'Belum ada pelanggan di tahap bonus potong gratis.' : campaignType === 'points-redemption' ? 'Belum ada pelanggan dengan saldo poin.' : 'Belum ada pelanggan dengan nomor yang dapat dihubungi.') : 'Tidak ada pelanggan yang cocok dengan pencarian.'}</span></div>
                  : filteredCustomers.map((customer) => {
                    const phone = digitsOnly(customer.phone);
                    const checked = selectedPhones.includes(phone);
                    return <label className={`customer-option${checked ? ' is-selected' : ''}`} key={phone} data-testid={`row-customer-${phone}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCustomer(phone)} aria-label={`Pilih ${customer.name}`} />
                      <span className="customer-avatar" aria-hidden="true">{initials(customer.name)}</span>
                      <span className="customer-option__identity"><strong>{customer.name}</strong><small>{customer.memberCode} <i>·</i> {customer.phone}</small></span>
                      {checked && <Check size={16} className="customer-option__check" aria-hidden="true" />}
                    </label>;
                  })}
            </div>

            <label className="field-label" htmlFor="campaign-message">Isi pesan WhatsApp</label>
            <textarea id="campaign-message" className="notification-input notification-textarea" maxLength={2000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`Halo, ${salonName} ingin menyampaikan…`} required data-testid="input-campaign-message" />
            <div className="message-meta"><span>{'{{nama}}'} dipersonalisasi{campaignType === 'points-redemption' ? <> · {'{{poin}}'} diisi saldo terbaru</> : campaignType === 'hair-studio-bonus' ? <> · {'{{statusBonus}}'} diisi progres bonus</> : ' dengan nama tiap penerima.'}</span><span>{message.length}/2000</span></div>

            <div className="send-note"><MessageCircle size={17} /><p>WhatsApp hanya dibuka dengan pesan terisi. <strong>Kasir tetap perlu menekan Kirim di WhatsApp</strong>, lalu mengonfirmasi statusnya di daftar kampanye.</p></div>
            <button className="button-primary" type="submit" disabled={isCreating || activeAudienceLoading || !!queryError || !title.trim() || !message.trim() || selectedCount === 0} data-testid="button-create-campaign">
              {isCreating ? <><span className="button-loading" /> Menyiapkan kampanye…</> : <><Send size={16} /> Siapkan kampanye <span className="button-primary__count">{selectedCount}</span></>}
            </button>
          </form>
        </section>

        <section className="campaign-review panel" aria-labelledby="review-title">
          <div className="panel-heading">
            <div><span className="panel-kicker">RIWAYAT PENGIRIMAN</span><h2 id="review-title">Kampanye terbaru</h2></div>
            <span className="campaign-count">{sortedCampaigns.length} kampanye</span>
          </div>

          {isLoading ? <div className="campaign-loading" aria-label="Memuat kampanye"><span className="skeleton-line skeleton-line--long" /><span className="skeleton-line" /><span className="skeleton-line skeleton-line--long" /></div>
            : sortedCampaigns.length === 0 ? <div className="campaign-empty">
              <div className="campaign-empty__mark"><MessageCircle size={25} /></div>
              <h3>Belum ada kampanye</h3><p>Kampanye yang sudah disiapkan akan tersimpan di sini, terpisah untuk {salonName}.</p>
            </div> : <>
              {activeCampaign && <div className="active-campaign">
                <div className="active-campaign__top">
                  <div><span className="panel-kicker">SEDANG DITINJAU</span><h3>{activeCampaign.title}</h3><span className={`campaign-type-chip${activeCampaign.campaignType === 'treatment-reminder' ? ' campaign-type-chip--reminder' : activeCampaign.campaignType === 'hair-studio-bonus' ? ' campaign-type-chip--bonus' : activeCampaign.campaignType === 'points-redemption' ? ' campaign-type-chip--points' : ''}`}>{campaignTypeLabel(activeCampaign.campaignType)}</span></div>
                  {sortedCampaigns.length > 1 && <label className="campaign-select-wrap" aria-label="Pilih kampanye">
                    <select value={activeCampaign.id} onChange={(event) => setActiveCampaignId(event.target.value)} data-testid="select-campaign">
                      {sortedCampaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.title}</option>)}
                    </select><ChevronDown size={14} aria-hidden="true" />
                  </label>}
                </div>
                <div className="campaign-summary">
                  <div><strong>{activeCampaign.sentCount}</strong><span>Terkirim</span></div>
                  <div><strong>{pendingTotal}</strong><span>Menunggu konfirmasi</span></div>
                  <div className="campaign-progress"><span><i style={{ width: `${activeCampaign.recipientCount ? Math.min(100, activeCampaign.sentCount / activeCampaign.recipientCount * 100) : 0}%` }} /></span><small>{activeCampaign.recipientCount ? Math.round(activeCampaign.sentCount / activeCampaign.recipientCount * 100) : 0}%</small></div>
                </div>
                <div className="campaign-message-preview"><span>ISI PESAN</span><p>{activeCampaign.message}</p></div>
                <div className="recipient-list-heading"><span>PENERIMA</span><span>{activeCampaign.recipientCount} orang</span></div>
                <div className="recipient-list">
                  {activeCampaign.recipients.length === 0 ? <div className="recipient-empty">Belum ada detail penerima untuk kampanye ini.</div>
                     : activeCampaign.recipients.map((recipient) => {
                       const href = whatsappHref(recipient, activeCampaign);
                       return <article className="recipient-row" key={recipient.id} data-testid={`row-recipient-${recipient.id}`}>
                         <span className={`recipient-avatar${recipient.status === 'sent' ? ' recipient-avatar--sent' : ''}`}>{recipient.status === 'sent' ? <Check size={15} /> : initials(recipient.customerName)}</span>
                         <div className="recipient-row__details"><strong>{recipient.customerName}</strong><span>{recipient.phone}</span>
                           {recipient.status === 'sent' && recipient.sentAt && <small>Terkirim {formatDate(recipient.sentAt)}{recipient.sentBy ? ` · ${recipient.sentBy}` : ''}</small>}
                         </div>
                         {recipient.status === 'sent' ? <span className="status-chip status-chip--sent"><CheckCheck size={13} /> Terkirim</span>
                           : <div className="recipient-actions">
                             {href
                               ? <a className="button-open-whatsapp" href={href} target="_blank" rel="noopener noreferrer" onClick={() => handleWhatsappClick(recipient)} aria-label={`Buka WhatsApp untuk ${recipient.customerName}`} data-testid={`button-open-whatsapp-${recipient.id}`}><ArrowUpRight size={15} /> <span>Buka WA</span></a>
                               : <span className="recipient-phone-error">Nomor WhatsApp tidak valid</span>}
                             <button className="button-confirm-sent" type="button" disabled={busyRecipientId === recipient.id || markRecipientSent.isPending} onClick={() => void confirmSent(activeCampaign, recipient)} data-testid={`button-confirm-sent-${recipient.id}`}>
                               {busyRecipientId === recipient.id ? <span className="button-loading" /> : <Check size={14} />} Sudah terkirim
                             </button>
                           </div>}
                       </article>;
                     })}
                </div>
                {pendingTotal > 0 && <div className="pending-reminder"><Clock3 size={14} /><span>Konfirmasi hanya setelah pesan berhasil dikirim dari WhatsApp.</span></div>}
              </div>}
              {sortedCampaigns.length > 1 && <div className="recent-campaigns">
                <h3>Kampanye lain</h3>
                {sortedCampaigns.filter((campaign) => campaign.id !== activeCampaign?.id).slice(0, 4).map((campaign) => <button className="recent-campaign" type="button" key={campaign.id} onClick={() => setActiveCampaignId(campaign.id)} data-testid={`button-view-campaign-${campaign.id}`}>
                  <span className="recent-campaign__icon"><MessageCircle size={15} /></span><span className="recent-campaign__title"><strong>{campaign.title}</strong><small>{campaignTypeLabel(campaign.campaignType)} · {formatDate(campaign.createdAt)}</small></span><span className="recent-campaign__count">{campaign.sentCount}/{campaign.recipientCount}</span><ChevronDown size={15} className="recent-campaign__arrow" />
                </button>)}
              </div>}
            </>}
        </section>
      </div>
    </main>
  );
}
