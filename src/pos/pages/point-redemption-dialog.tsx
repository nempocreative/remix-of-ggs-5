import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, Coins, Gift, X } from 'lucide-react';
import {
  getGetCustomersQueryKey,
  getGetPointRedemptionsQueryKey,
  useCreatePointRedemption,
  useGetPointRedemptions,
  type Customer,
} from '@/lib/api-client';

type Salon = 'beauty' | 'hair-studio';
type PointReward = { points: number; reward: string };
type Redemption = {
  id: string;
  pointsSpent: number;
  rewardName: string;
  redeemedBy: string;
  createdAt: string | Date;
};

type Props = {
  salon: Salon;
  customer: Customer;
  rewards: PointReward[];
  onClose: () => void;
  onSuccess: (redemption: Redemption) => void;
};

const pointFormat = new Intl.NumberFormat('id-ID');

function redemptionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === 'string') return message;
    }
  }
  return 'Penukaran belum berhasil. Periksa saldo dan coba lagi.';
}

function formatRedeemedAt(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function PointRedemptionDialog({ salon, customer, rewards, onClose, onSuccess }: Props) {
  const [confirming, setConfirming] = useState<PointReward | null>(null);
  const queryClient = useQueryClient();
  const redemptionsQuery = useGetPointRedemptions(
    { salon, phone: customer.phone },
    { query: { queryKey: getGetPointRedemptionsQueryKey({ salon, phone: customer.phone }) } },
  );
  const redemptionMutation = useCreatePointRedemption();

  const submitRedemption = () => {
    if (!confirming || redemptionMutation.isPending) return;
    redemptionMutation.mutate(
      { data: { salon, customerPhone: customer.phone, rewardPoints: confirming.points } },
      {
        onSuccess: async (redemption) => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetCustomersQueryKey({ salon }) }),
            queryClient.invalidateQueries({
              queryKey: getGetPointRedemptionsQueryKey({ salon, phone: customer.phone }),
            }),
          ]);
          onSuccess(redemption);
        },
      },
    );
  };

  return createPortal(
    <div
      className="pp-redemption-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !redemptionMutation.isPending) onClose();
      }}
    >
      <section className="pp-redemption-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-redemption-title">
        <header className="pp-redemption-dialog__header">
          <div>
            <small>CATAT PENUKARAN HADIAH</small>
            <h2 id="pp-redemption-title">{customer.name}</h2>
            <p>{customer.phone}</p>
          </div>
          <button type="button" onClick={onClose} disabled={redemptionMutation.isPending} aria-label="Tutup">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="pp-redemption-balance">
          <Coins size={17} aria-hidden="true" />
          <span>Saldo saat ini</span>
          <strong>{pointFormat.format(customer.points)} poin</strong>
        </div>

        <section className="pp-redemption-options" aria-labelledby="pp-redemption-options-title">
          <div className="pp-redemption-section-heading">
            <h3 id="pp-redemption-options-title">Hadiah yang bisa ditukar</h3>
            <p>Saldo berkurang sesuai poin hadiah setelah dikonfirmasi.</p>
          </div>
          <ul>
            {rewards.map((reward) => {
              const eligible = customer.points >= reward.points;
              return (
                <li key={reward.points}>
                  <span className="pp-redemption-cost">{pointFormat.format(reward.points)} poin</span>
                  <span className="pp-redemption-reward">{reward.reward}</span>
                  <button
                    type="button"
                    disabled={!eligible || redemptionMutation.isPending}
                    onClick={() => {
                      redemptionMutation.reset();
                      setConfirming(reward);
                    }}
                    aria-label={`${eligible ? 'Tandai sudah digunakan' : 'Belum cukup poin'}: ${reward.reward}, ${pointFormat.format(reward.points)} poin`}
                  >
                    {eligible ? 'Tandai digunakan' : 'Belum cukup'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {confirming && (
          <div className="pp-redemption-confirm" role="alert">
            <div>
              <strong>Konfirmasi hadiah</strong>
              <p>{confirming.reward} akan ditukar dan saldo dikurangi {pointFormat.format(confirming.points)} poin.</p>
            </div>
            <div>
              <button
                type="button"
                className="pp-redemption-confirm__submit"
                onClick={submitRedemption}
                disabled={redemptionMutation.isPending}
              >
                {redemptionMutation.isPending ? 'Menyimpan…' : 'Konfirmasi penukaran'}
              </button>
              <button
                type="button"
                className="pp-redemption-confirm__cancel"
                onClick={() => setConfirming(null)}
                disabled={redemptionMutation.isPending}
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {redemptionMutation.error && (
          <p className="pp-redemption-error" role="alert">{redemptionErrorMessage(redemptionMutation.error)}</p>
        )}

        <section className="pp-redemption-history" aria-labelledby="pp-redemption-history-title">
          <div className="pp-redemption-section-heading">
            <h3 id="pp-redemption-history-title"><Clock3 size={15} aria-hidden="true" /> Riwayat hadiah digunakan</h3>
          </div>
          {redemptionsQuery.isLoading ? (
            <p className="pp-redemption-empty">Memuat riwayat penukaran…</p>
          ) : redemptionsQuery.isError ? (
            <p className="pp-redemption-error" role="alert">Riwayat penukaran belum dapat dimuat.</p>
          ) : redemptionsQuery.data?.length ? (
            <ul className="pp-redemption-history__list">
              {redemptionsQuery.data.map((redemption) => (
                <li key={redemption.id}>
                  <span className="pp-redemption-history__check"><Check size={13} aria-hidden="true" /></span>
                  <span>
                    <strong>{redemption.rewardName}</strong>
                    <small>{formatRedeemedAt(redemption.createdAt)} · Ditandai oleh {redemption.redeemedBy}</small>
                  </span>
                  <b>−{pointFormat.format(redemption.pointsSpent)} poin</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pp-redemption-empty"><Gift size={16} aria-hidden="true" /> Belum ada hadiah yang ditukar.</p>
          )}
        </section>
      </section>
    </div>,
    document.body,
  );
}
