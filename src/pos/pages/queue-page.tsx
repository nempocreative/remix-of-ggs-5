import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  getGetQueueBookingsQueryKey,
  useCreateQueueBooking,
  useDeleteQueueBooking,
  useGetEmployees,
  useGetQueueBookings,
  useGetServices,
  useUpdateQueueBookingStatus,
  type QueueBooking,
} from '@/lib/api-client';
import type { SalonId } from '@/pos/lib/menu';
import { displayStaffName } from '@/lib/utils';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle, CalendarDays, Check, CheckCheck, Clock3, Megaphone, Plus, RefreshCw, Scissors, Trash2, UserRound, Users, X } from 'lucide-react';
import './queue-page.css';

type Props = { salon: SalonId };

const jakartaDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const bookingSchema = z.object({
  customerName: z.string().trim().min(1, 'Nama pelanggan wajib diisi.').max(120, 'Nama maksimal 120 karakter.'),
  customerPhone: z.string().trim().max(32, 'Nomor maksimal 32 karakter.'),
  serviceId: z.string().min(1, 'Pilih layanan.'),
  employeeId: z.string().min(1, 'Pilih staf.'),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pilih tanggal yang valid.'),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pilih jam yang valid.'),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter.'),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const errorText = (error: unknown) => error instanceof Error
  ? error.message
  : 'Permintaan belum berhasil. Periksa koneksi lalu coba lagi.';

const statusLabels: Record<QueueBooking['status'], string> = {
  waiting: 'Menunggu',
  called: 'Dipanggil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();

type SpeakBookingResult = 'queued' | 'unsupported' | 'missing-indonesian-voice';

const findIndonesianVoice = (voices: SpeechSynthesisVoice[]) =>
  voices.find((voice) => voice.lang.toLowerCase() === 'id-id' && voice.localService)
  ?? voices.find((voice) => voice.lang.toLowerCase() === 'id-id')
  ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('id') && voice.localService)
  ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('id'));

async function getIndonesianVoice(synthesis: SpeechSynthesis) {
  let voice = findIndonesianVoice(synthesis.getVoices());
  if (voice) return voice;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      synthesis.removeEventListener('voiceschanged', finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 1200);
    synthesis.addEventListener('voiceschanged', finish);
  });

  voice = findIndonesianVoice(synthesis.getVoices());
  return voice ?? null;
}

const spokenIndonesianName = (name: string) => name.replace(/\btion\b/giu, 'Ti-on');

async function speakBooking(booking: QueueBooking): Promise<SpeakBookingResult> {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return 'unsupported';

  const synthesis = window.speechSynthesis;
  const indonesianVoice = await getIndonesianVoice(synthesis);
  if (!indonesianVoice) return 'missing-indonesian-voice';

  const announcement = new SpeechSynthesisUtterance(
    `Booking atas nama ${spokenIndonesianName(booking.customerName)}, silakan menuju ke staf ${spokenIndonesianName(displayStaffName(booking.employeeName))}.`,
  );
  announcement.lang = 'id-ID';
  announcement.voice = indonesianVoice;
  synthesis.cancel();
  synthesis.speak(announcement);
  return 'queued';
}

function QueueSkeleton() {
  return <div className="queue-skeleton" role="status" aria-label="Memuat antrean">
    <span /><span /><span />
  </div>;
}

export default function QueuePage({ salon }: Props) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(jakartaDate);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<QueueBooking | null>(null);
  const salonName = salon === 'beauty' ? 'GGS Beauty' : 'GGS Hair Studio';
  const params = useMemo(() => ({ salon }), [salon]);
  const bookingsParams = useMemo(() => ({ salon, date }), [salon, date]);
  const queueQueryKey = getGetQueueBookingsQueryKey(bookingsParams);
  const bookingsQuery = useGetQueueBookings(bookingsParams, { query: { queryKey: queueQueryKey } });
  const employeesQuery = useGetEmployees(params);
  const servicesQuery = useGetServices(params);
  const createBooking = useCreateQueueBooking();
  const deleteBooking = useDeleteQueueBooking();
  const updateStatus = useUpdateQueueBookingStatus();

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      serviceId: '',
      employeeId: '',
      scheduledDate: date,
      scheduledTime: '10:00',
      notes: '',
    },
  });

  useEffect(() => {
    form.setValue('scheduledDate', date, { shouldValidate: true });
  }, [date, form]);

  const bookings = useMemo(
    () => (bookingsQuery.data ?? [])
      .filter((booking) => booking.salon === salon && booking.scheduledDate === date)
      .slice()
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime) || a.createdAt.localeCompare(b.createdAt)),
    [bookingsQuery.data, date, salon],
  );
  const employees = useMemo(
    () => (employeesQuery.data ?? []).filter((employee) => employee.salon === salon && employee.active),
    [employeesQuery.data, salon],
  );
  const services = useMemo(
    () => (servicesQuery.data ?? []).filter((service) => service.salon === salon),
    [servicesQuery.data, salon],
  );
  const counts = useMemo(() => ({
    waiting: bookings.filter((booking) => booking.status === 'waiting').length,
    called: bookings.filter((booking) => booking.status === 'called').length,
    completed: bookings.filter((booking) => booking.status === 'completed').length,
  }), [bookings]);

  const refreshQueue = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetQueueBookingsQueryKey({ salon, date }) });
  };

  const onCreate = async (values: BookingFormValues) => {
    setActionError('');
    setFeedback('');
    try {
      await createBooking.mutateAsync({
        params: { salon },
        data: {
          customerName: values.customerName.trim(),
          customerPhone: values.customerPhone.trim() || null,
          serviceId: values.serviceId,
          employeeId: values.employeeId,
          scheduledDate: values.scheduledDate,
          scheduledTime: values.scheduledTime,
          notes: values.notes.trim() || null,
        },
      });
      form.reset({
        customerName: '',
        customerPhone: '',
        serviceId: '',
        employeeId: '',
        scheduledDate: date,
        scheduledTime: '10:00',
        notes: '',
      });
      setFeedback('Booking berhasil ditambahkan ke antrean.');
      await refreshQueue();
    } catch (error) {
      setActionError(errorText(error));
    }
  };

  const updateBooking = async (booking: QueueBooking, status: QueueBooking['status']) => {
    setActionError('');
    setFeedback('');
    try {
      await updateStatus.mutateAsync({ salon, id: booking.id, data: { status } });
      setFeedback(status === 'completed' ? `${booking.customerName} ditandai selesai.` : `${booking.customerName} ${status === 'called' ? 'dipanggil.' : 'dibatalkan.'}`);
      await refreshQueue();
      return true;
    } catch (error) {
      setActionError(errorText(error));
      return false;
    }
  };

  const callBooking = async (booking: QueueBooking) => {
    setActionError('');
    setFeedback('');
    if (booking.status !== 'called') {
      const updated = await updateBooking(booking, 'called');
      if (!updated) return;
    }

    const speakResult = await speakBooking(booking);
    if (speakResult === 'unsupported') {
      setActionError('Booking sudah ditandai dipanggil, tetapi suara tidak tersedia di browser ini. Silakan panggil pelanggan secara langsung.');
      return;
    }
    if (speakResult === 'missing-indonesian-voice') {
      setActionError('Booking sudah ditandai dipanggil, tetapi suara Bahasa Indonesia tidak tersedia di perangkat ini. Silakan panggil pelanggan secara langsung.');
      return;
    }
    setFeedback(`Pengumuman diputar untuk ${booking.customerName}.`);
  };

  const confirmDeleteBooking = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setActionError('');
    setFeedback('');
    try {
      await deleteBooking.mutateAsync({ salon, id: target.id });
      setDeleteTarget(null);
      await refreshQueue();
      setFeedback(`${target.customerName} dihapus dari antrean.`);
    } catch (error) {
      setDeleteTarget(null);
      setActionError(errorText(error));
    }
  };

  const isLoading = bookingsQuery.isLoading || employeesQuery.isLoading || servicesQuery.isLoading;
  const queryError = bookingsQuery.error || employeesQuery.error || servicesQuery.error;
  const setupUnavailable = !employees.length || !services.length;

  return <main className={`queue-page${salon === 'hair-studio' ? ' queue-page--hair' : ''}`} data-salon={salon} data-testid="page-queue">
    <header className="queue-heading">
      <div>
        <div className="queue-eyebrow"><span /> OPERASIONAL KASIR <i>/</i> {salonName.toUpperCase()}</div>
        <h1>Antrean <em>hari ini.</em></h1>
        <p>Atur booking dan panggil pelanggan sesuai giliran.</p>
      </div>
      <label className="queue-date-control">
        <span><CalendarDays size={15} /> TANGGAL ANTREAN</span>
        <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setActionError(''); setFeedback(''); }} aria-label="Pilih tanggal antrean" data-testid="input-queue-date" />
      </label>
    </header>

    {(actionError || feedback) && <div className={`queue-notice${actionError ? ' queue-notice--error' : ''}`} role={actionError ? 'alert' : 'status'} aria-live="polite" data-testid="status-queue-feedback">
      {actionError ? <AlertCircle size={17} /> : <Check size={17} />}
      <span>{actionError || feedback}</span>
      <button type="button" onClick={() => { setActionError(''); setFeedback(''); }} aria-label="Tutup pemberitahuan" data-testid="button-dismiss-queue-feedback"><X size={15} /></button>
    </div>}

    {queryError && <section className="queue-query-error" role="alert" data-testid="status-queue-load-error">
      <AlertCircle size={18} />
      <div><strong>Data antrean belum tersedia</strong><span>{errorText(queryError)}</span></div>
      <button type="button" onClick={() => { void bookingsQuery.refetch(); void employeesQuery.refetch(); void servicesQuery.refetch(); }} data-testid="button-retry-queue">
        <RefreshCw size={15} /> Coba lagi
      </button>
    </section>}

    <section className="queue-summary" aria-label="Ringkasan antrean">
      <div className="queue-summary__date"><span className="queue-summary__date-icon"><CalendarDays size={17} /></span><div><small>JADWAL UNTUK</small><strong>{formatDate(date)}</strong></div></div>
      <div className="queue-summary__metrics">
        <div><span className="queue-count-dot queue-count-dot--waiting" /><strong>{counts.waiting}</strong><small>Menunggu</small></div>
        <div><span className="queue-count-dot queue-count-dot--called" /><strong>{counts.called}</strong><small>Dipanggil</small></div>
        <div><span className="queue-count-dot queue-count-dot--done" /><strong>{counts.completed}</strong><small>Selesai</small></div>
      </div>
    </section>

    <div className="queue-layout">
      <section className="queue-list-panel" aria-labelledby="queue-list-title">
        <div className="queue-panel-head">
          <div><span className="queue-kicker">DAFTAR BOOKING</span><h2 id="queue-list-title">Antrean pelanggan <b>{bookings.length}</b></h2></div>
          <span className="queue-live-mark"><i /> {salonName}</span>
        </div>
        {isLoading ? <QueueSkeleton />
          : bookingsQuery.isError ? <div className="queue-state"><AlertCircle size={24} /><h3>Antrean belum dapat dimuat</h3><p>Periksa koneksi lalu coba lagi.</p><button type="button" onClick={() => void bookingsQuery.refetch()} data-testid="button-retry-bookings"><RefreshCw size={14} /> Muat ulang</button></div>
            : bookings.length === 0 ? <div className="queue-state queue-state--empty" data-testid="state-queue-empty">
              <div className="queue-empty-mark"><Clock3 size={24} /></div><h3>Belum ada booking</h3><p>Booking baru untuk tanggal ini akan muncul di sini.</p>
            </div> : <div className="queue-booking-list">
              {bookings.map((booking, index) => <article className={`queue-booking queue-booking--${booking.status}`} key={booking.id} data-testid={`row-queue-booking-${booking.id}`}>
                <div className="queue-booking__order"><span>{String(index + 1).padStart(2, '0')}</span><strong>{booking.scheduledTime}</strong></div>
                <div className="queue-booking__main">
                  <div className="queue-booking__identity">
                    <span className="queue-avatar">{initials(booking.customerName)}</span>
                    <div className="queue-booking__copy"><h3 data-testid={`text-booking-customer-${booking.id}`}>{booking.customerName}</h3>{booking.customerPhone && <span>{booking.customerPhone}</span>}</div>
                  </div>
                  <div className="queue-booking__details">
                    <span><Scissors size={13} />{booking.serviceName}</span>
                    <span><UserRound size={13} />{displayStaffName(booking.employeeName)}</span>
                  </div>
                  {booking.notes && <p className="queue-booking__note">{booking.notes}</p>}
                </div>
                <div className="queue-booking__actions">
                  <span className={`queue-status queue-status--${booking.status}`} data-testid={`status-booking-${booking.id}`}>{statusLabels[booking.status]}</span>
                  <div className="queue-action-row">
                    {booking.status === 'called' || booking.status === 'completed'
                      ? <button className="queue-action queue-action--cancel" type="button" onClick={() => setDeleteTarget(booking)} disabled={deleteBooking.isPending} aria-label={`Hapus booking ${booking.customerName}`} data-testid={`button-delete-booking-${booking.id}`}>
                        <Trash2 size={14} /><span>Hapus</span>
                      </button>
                      : booking.status === 'waiting' && <>
                        <button className="queue-action queue-action--call" type="button" onClick={() => void callBooking(booking)} disabled={updateStatus.isPending} data-testid={`button-call-${booking.id}`}>
                          <Megaphone size={14} /> Panggil
                        </button>
                        <button className="queue-action queue-action--complete" type="button" onClick={() => void updateBooking(booking, 'completed')} disabled={updateStatus.isPending} aria-label={`Tandai ${booking.customerName} selesai`} data-testid={`button-complete-${booking.id}`}>
                          <CheckCheck size={14} /><span>Selesai</span>
                        </button>
                        <button className="queue-action queue-action--cancel" type="button" onClick={() => void updateBooking(booking, 'cancelled')} disabled={updateStatus.isPending} aria-label={`Batalkan booking ${booking.customerName}`} data-testid={`button-cancel-${booking.id}`}>
                          <X size={14} /><span>Batal</span>
                        </button>
                      </>}
                  </div>
                </div>
              </article>)}
            </div>}
      </section>

      <aside className="queue-create-panel" aria-labelledby="queue-create-title">
        <div className="queue-create-head">
          <span className="queue-create-icon"><Plus size={19} /></span>
          <div><span className="queue-kicker">BOOKING BARU</span><h2 id="queue-create-title">Tambah antrean</h2></div>
        </div>
        {setupUnavailable && !isLoading && <div className="queue-setup-note" role="status" data-testid="status-queue-setup">
          <Users size={15} /><span>{!employees.length ? 'Belum ada staf aktif untuk salon ini.' : 'Layanan salon belum tersedia.'}</span>
        </div>}
        <Form {...form}>
          <form className="queue-form" onSubmit={form.handleSubmit(onCreate)}>
            <FormField control={form.control} name="customerName" render={({ field }) => <FormItem className="queue-field">
              <FormLabel>Nama pelanggan</FormLabel><FormControl><input {...field} placeholder="Nama lengkap" autoComplete="name" data-testid="input-booking-customer" /></FormControl><FormMessage />
            </FormItem>} />
            <FormField control={form.control} name="customerPhone" render={({ field }) => <FormItem className="queue-field">
              <FormLabel>Nomor telepon <span>OPSIONAL</span></FormLabel><FormControl><input {...field} placeholder="08xx xxxx xxxx" inputMode="tel" autoComplete="tel" data-testid="input-booking-phone" /></FormControl><FormMessage />
            </FormItem>} />
            <FormField control={form.control} name="serviceId" render={({ field }) => <FormItem className="queue-field">
              <FormLabel>Layanan</FormLabel><FormControl><select {...field} data-testid="select-booking-service"><option value="">Pilih layanan</option>{services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></FormControl><FormMessage />
            </FormItem>} />
            <FormField control={form.control} name="employeeId" render={({ field }) => <FormItem className="queue-field">
              <FormLabel>Staf</FormLabel><FormControl><select {...field} data-testid="select-booking-employee"><option value="">Pilih staf aktif</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{displayStaffName(employee.name)}</option>)}</select></FormControl><FormMessage />
            </FormItem>} />
            <div className="queue-form-grid">
              <FormField control={form.control} name="scheduledDate" render={({ field }) => <FormItem className="queue-field">
                <FormLabel>Tanggal</FormLabel><FormControl><input {...field} type="date" onChange={(event) => { field.onChange(event); setDate(event.target.value); }} data-testid="input-booking-date" /></FormControl><FormMessage />
              </FormItem>} />
              <FormField control={form.control} name="scheduledTime" render={({ field }) => <FormItem className="queue-field">
                <FormLabel>Jam</FormLabel><FormControl><input {...field} type="time" data-testid="input-booking-time" /></FormControl><FormMessage />
              </FormItem>} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => <FormItem className="queue-field">
              <FormLabel>Catatan <span>OPSIONAL</span></FormLabel><FormControl><textarea {...field} rows={3} placeholder="Catatan untuk staf" data-testid="input-booking-notes" /></FormControl><FormMessage />
            </FormItem>} />
            <button className="queue-submit" type="submit" disabled={createBooking.isPending || isLoading || !!queryError || setupUnavailable} data-testid="button-create-booking">
              {createBooking.isPending ? <><span className="queue-button-pulse" /> Menyimpan booking…</> : <><Plus size={16} /> Tambahkan booking</>}
            </button>
          </form>
        </Form>
        <p className="queue-form-footnote"><Clock3 size={13} /> Booking tersimpan khusus untuk {salonName}.</p>
      </aside>
    </div>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
      if (!open && !deleteBooking.isPending) setDeleteTarget(null);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus booking ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Booking atas nama {deleteTarget?.customerName} yang sudah dipanggil atau selesai akan dihapus permanen dari antrean {salonName}. Tindakan ini tidak dapat dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteBooking.isPending}>Batal</AlertDialogCancel>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => void confirmDeleteBooking()}
            disabled={deleteBooking.isPending}
            data-testid="button-confirm-delete-booking"
          >
            {deleteBooking.isPending ? 'Menghapus…' : 'Hapus booking'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
