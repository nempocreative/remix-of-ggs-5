import { Link } from '@/pos/router-compat';
import { ArrowLeft, CircleAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-card" aria-labelledby="not-found-title">
        <div className="not-found-brand">
          <img src="/ggs-beauty-logo.jpg" alt="" />
          <span>GGS BEAUTY POS <i/> OPERASIONAL SALON</span>
        </div>
        <div className="not-found-rule"/>
        <div className="not-found-mark"><CircleAlert size={22}/></div>
        <p className="not-found-code">HALAMAN TIDAK TERSEDIA · 404</p>
        <h1 id="not-found-title">Alamat ini tidak ditemukan.</h1>
        <p className="not-found-copy">Periksa kembali alamat yang dibuka, atau kembali ke kasir untuk melanjutkan pekerjaan.</p>
        <Link href="/" className="not-found-action"><ArrowLeft size={16}/> Kembali ke kasir</Link>
        <p className="not-found-foot">GGS Beauty Salon &amp; GGS Hair Studio</p>
      </section>
      <style>{`
        .not-found-page{display:grid;min-height:100dvh;place-items:center;background:#f5f2ef;padding:24px;color:#342a2f;font-family:var(--app-font-sans)}
        .not-found-card{width:min(100%,480px);border:1px solid #ded4d5;border-radius:14px;background:#fbf9f7;padding:clamp(24px,6vw,42px);box-shadow:0 12px 36px rgba(53,38,45,.06)}
        .not-found-brand{display:flex;align-items:center;gap:11px;color:#7b626c;font-size:9px;font-weight:800;letter-spacing:.13em}
        .not-found-brand img{width:38px;height:38px;border:1px solid #e3d7d8;border-radius:9px;background:#fff;object-fit:contain}
        .not-found-brand i{display:inline-block;width:3px;height:3px;margin:0 7px 2px;border-radius:50%;background:#a97689}
        .not-found-rule{height:1px;margin:22px 0;background:#e8dfde}
        .not-found-mark{display:grid;width:42px;height:42px;place-items:center;border:1px solid #e6d4d9;border-radius:11px;background:#f5e9ec;color:#803e58}
        .not-found-code{margin:21px 0 7px;color:#87556a;font-size:9px;font-weight:800;letter-spacing:.14em}
        .not-found-card h1{margin:0;color:#352a30;font-size:clamp(23px,5vw,30px);font-weight:750;letter-spacing:-.045em;line-height:1.2}
        .not-found-copy{max-width:350px;margin:10px 0 22px;color:#786b70;font-size:12px;line-height:1.7}
        .not-found-action{display:inline-flex;min-height:41px;align-items:center;gap:8px;border-radius:8px;background:#71334e;padding:0 14px;color:#fff;font-size:11px;font-weight:700;text-decoration:none;transition:background .15s,transform .15s}
        .not-found-action:hover{transform:translateY(-1px);background:#5c293f}
        .not-found-foot{margin:27px 0 0;border-top:1px solid #e8dfde;padding-top:13px;color:#a08e94;font-size:9px;letter-spacing:.04em}
        @media(prefers-reduced-motion:reduce){.not-found-action{transition:none}}
      `}</style>
    </main>
  );
}
