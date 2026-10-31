import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCustomersQueryKey,
  getGetSalesQueryKey,
  getGetServicesQueryKey,
  getPosBackup,
  useRestorePosBackup,
  type BackupRestoreResult,
  type PosBackup,
} from '@/lib/api-client';
import { AlertTriangle, Check, ChevronRight, CloudDownload, Database, FileJson2, FolderUp, LockKeyhole, RotateCcw, ShieldCheck, X } from 'lucide-react';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kendala. Silakan coba lagi.';

function isPosBackup(value: unknown): value is PosBackup {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Record<string, unknown>;
  if (backup.format !== 'ggs-beauty-pos-backup' || backup.version !== 1 || typeof backup.createdAt !== 'string') return false;
  if (!backup.salons || typeof backup.salons !== 'object' || !Array.isArray(backup.legacyCustomers)) return false;
  const salons = backup.salons as Record<string, unknown>;
  return ['beauty', 'hair-studio'].every((salon) => {
    const data = salons[salon];
    if (!data || typeof data !== 'object') return false;
    const salonData = data as Record<string, unknown>;
    return Array.isArray(salonData.services) && Array.isArray(salonData.customers) && Array.isArray(salonData.sales);
  });
}

const restoreCounts: { key: keyof BackupRestoreResult; label: string }[] = [
  { key: 'employeesAdded', label: 'Karyawan ditambahkan' },
  { key: 'employeesUpdated', label: 'Karyawan diperbarui' },
  { key: 'servicesAdded', label: 'Layanan ditambahkan' },
  { key: 'servicesUpdated', label: 'Layanan diperbarui' },
  { key: 'customersAdded', label: 'Pelanggan ditambahkan' },
  { key: 'legacyCustomersAdded', label: 'Pelanggan lama ditambahkan' },
  { key: 'salesAdded', label: 'Transaksi ditambahkan' },
  { key: 'salesSkipped', label: 'Transaksi dilewati (sudah ada)' },
];

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'tanggal tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

export default function BackupPage() {
  const queryClient = useQueryClient();
  const restoreMutation = useRestorePosBackup();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [backup, setBackup] = useState<PosBackup | null>(null);
  const [fileError, setFileError] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoreSummary, setRestoreSummary] = useState<BackupRestoreResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const downloadBackup = async () => {
    setDownloadBusy(true);
    setDownloadError('');
    try {
      const payload = await getPosBackup();
      if (!isPosBackup(payload)) throw new Error('Data cadangan dari server tidak sesuai format yang diharapkan.');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ggs-beauty-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(errorMessage(error));
    } finally {
      setDownloadBusy(false);
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setRestoreSummary(null);
    setRestoreError('');
    setFileError('');
    setBackup(null);
    setSelectedFileName(file?.name ?? '');
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isPosBackup(parsed)) throw new Error('File bukan cadangan GGS Beauty POS yang valid. Pastikan format dan versi file sesuai.');
      setBackup(parsed);
    } catch (error) {
      setFileError(error instanceof SyntaxError
        ? 'File tidak dapat dibaca sebagai JSON. Pilih file cadangan .json yang valid.'
        : errorMessage(error));
    }
  };

  const restore = async () => {
    if (!backup) return;
    setConfirmOpen(false);
    setRestoreError('');
    setRestoreSummary(null);
    try {
      const result = await restoreMutation.mutateAsync({ data: backup });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetSalesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetServicesQueryKey() }),
      ]);
      setRestoreSummary(result);
      setBackup(null);
      setSelectedFileName('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      setRestoreError(errorMessage(error));
    }
  };

  return <div className="backup-page fade-up" data-testid="page-backup">
    <header className="backup-hero">
      <div className="backup-hero__copy">
        <p className="backup-eyebrow"><Database size={14}/> PENGELOLAAN DATA</p>
        <h1 className="font-display">Backup &amp; pemulihan</h1>
        <p className="backup-subtitle">Ekspor atau pulihkan data GGS Beauty dan GGS Hair Studio.</p>
        <div className="backup-hero__brands"><span>GGS Beauty</span><i/><span>GGS Hair Studio</span></div>
      </div>
      <div className="backup-hero__art" aria-hidden="true">
        <span className="backup-art-ring backup-art-ring--outer"/><span className="backup-art-ring backup-art-ring--inner"/>
        <span className="backup-art-mark"><Database size={31}/></span>
        <span className="backup-art-tag">DATA · AMAN</span>
      </div>
    </header>

    <section className="backup-privacy" aria-label="Peringatan privasi">
      <span className="backup-privacy__icon"><LockKeyhole size={18}/></span>
      <div><strong>File ini berisi data pribadi dan transaksi.</strong><p>Kontak pelanggan, riwayat layanan, dan informasi transaksi ikut tersimpan. Simpan file di tempat aman, jangan kirim atau bagikan kepada orang lain, dan hapus salinan yang tidak lagi diperlukan.</p></div>
    </section>

    <div className="backup-workflow">
      <section className="backup-panel backup-panel--export">
        <div className="backup-panel__top">
          <span className="backup-step">01 / EKSPOR</span>
          <span className="backup-icon"><CloudDownload size={19}/></span>
        </div>
        <h2>Unduh salinan lengkap</h2>
        <p>Ekspor layanan, karyawan dan persentase komisi, pelanggan, transaksi dari kedua salon, serta pelanggan lama dalam satu file JSON.</p>
        <div className="backup-includes">
          <span><Check size={13}/> GGS Beauty</span>
          <span><Check size={13}/> GGS Hair Studio</span>
          <span><Check size={13}/> Riwayat transaksi &amp; pelanggan</span>
        </div>
        {downloadError && <div className="backup-feedback backup-feedback--error" role="alert" data-testid="status-backup-download-error">{downloadError}</div>}
        <button type="button" className="backup-primary" onClick={() => void downloadBackup()} disabled={downloadBusy} data-testid="button-download-backup">
          {downloadBusy ? <><span className="backup-button-pulse"/> Menyiapkan file…</> : <><CloudDownload size={16}/> Unduh backup JSON</>}
        </button>
        <p className="backup-footnote">File diberi tanggal hari ini agar mudah dikenali.</p>
      </section>

      <section className="backup-panel backup-panel--restore">
        <div className="backup-panel__top">
          <span className="backup-step">02 / PEMULIHAN</span>
          <span className="backup-icon backup-icon--dark"><FolderUp size={19}/></span>
        </div>
        <h2>Pulihkan data</h2>
        <p>Pilih file backup untuk menggabungkan data ke aplikasi ini.</p>
        <label className={`backup-file-picker${backup ? ' has-file' : ''}`} htmlFor="backup-file">
          <input ref={inputRef} id="backup-file" type="file" accept=".json,application/json" onChange={(event) => void chooseFile(event)} data-testid="input-backup-file"/>
          <span className="backup-file-picker__icon"><FileJson2 size={21}/></span>
          <span className="backup-file-picker__copy"><strong>{selectedFileName || 'Pilih file backup JSON'}</strong><small>{backup ? `Cadangan dibuat ${dateLabel(backup.createdAt)}` : 'Pilih file .json dari perangkat'}</small></span>
          <ChevronRight size={17} className="backup-file-picker__arrow"/>
        </label>
        {fileError && <div className="backup-feedback backup-feedback--error" role="alert" data-testid="status-backup-file-error"><AlertTriangle size={15}/>{fileError}</div>}
        {restoreError && <div className="backup-feedback backup-feedback--error" role="alert" data-testid="status-backup-restore-error"><AlertTriangle size={15}/>{restoreError}</div>}
        <div className="backup-merge-note"><ShieldCheck size={17}/><span><strong>Data lama tetap aman.</strong> Pemulihan menggabungkan informasi; tidak menghapus transaksi atau profil pelanggan yang sudah ada.</span></div>
        <button type="button" className="backup-restore-button" onClick={() => setConfirmOpen(true)} disabled={!backup || restoreMutation.isPending} data-testid="button-restore-backup">
          <RotateCcw size={16}/> {restoreMutation.isPending ? 'Memulihkan data…' : 'Lanjutkan pemulihan'}
        </button>
        <p className="backup-footnote">File yang tidak sesuai format akan ditolak sebelum diimpor.</p>
      </section>
    </div>

    {restoreSummary && <section className="backup-result" role="status" data-testid="status-backup-restore-success">
      <div className="backup-result__heading"><span><Check size={17}/></span><div><p>PEMULIHAN SELESAI</p><h2>Data berhasil digabungkan</h2></div><button type="button" onClick={() => setRestoreSummary(null)} aria-label="Tutup ringkasan" data-testid="button-dismiss-backup-summary"><X size={17}/></button></div>
      <div className="backup-result__counts">{restoreCounts.map(({ key, label }) => <div key={key}><span>{label}</span><strong>{restoreSummary[key].toLocaleString('id-ID')}</strong></div>)}</div>
    </section>}

    {confirmOpen && <div className="backup-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !restoreMutation.isPending) setConfirmOpen(false); }}>
      <section className="backup-confirm" role="alertdialog" aria-modal="true" aria-labelledby="backup-confirm-title" aria-describedby="backup-confirm-description">
        <div className="backup-confirm__mark"><AlertTriangle size={21}/></div>
        <button type="button" className="backup-confirm__close" aria-label="Tutup konfirmasi" onClick={() => setConfirmOpen(false)} disabled={restoreMutation.isPending}><X size={17}/></button>
        <p className="backup-eyebrow">KONFIRMASI PEMULIHAN</p>
        <h2 id="backup-confirm-title">Gabungkan backup ini?</h2>
        <p id="backup-confirm-description">File <strong>{selectedFileName}</strong> akan diproses ke data GGS Beauty dan GGS Hair Studio. Data yang sudah ada tidak dihapus; layanan yang cocok dapat diperbarui dan transaksi duplikat akan dilewati.</p>
        <div className="backup-confirm__privacy"><LockKeyhole size={15}/> Pastikan file ini berasal dari sumber yang Anda percaya.</div>
        <div className="backup-confirm__actions"><button type="button" className="backup-cancel" onClick={() => setConfirmOpen(false)} disabled={restoreMutation.isPending}>Batal</button><button type="button" className="backup-confirm-button" onClick={() => void restore()} disabled={restoreMutation.isPending} data-testid="button-confirm-backup-restore">{restoreMutation.isPending ? 'Memulihkan…' : 'Ya, gabungkan data'}</button></div>
      </section>
    </div>}
  </div>;
}
