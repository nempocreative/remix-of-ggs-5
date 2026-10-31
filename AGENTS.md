<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Validate cashier login PINs exclusively against salted hashes in the server-only PIN table; no environment bootstrap or hardcoded PIN bypass, so account PIN changes take effect consistently.
- Keep the shared cashier account mapped to the admin role on the server; owner privileges remain exclusive to owner accounts.
- HTTPS cashier sessions use HttpOnly, Secure, SameSite=None, Partitioned cookies so embedded previews retain authentication; reject cross-site browser mutations to preserve CSRF protection.
- Keep the client JavaScript syntax target at Chrome/Edge 80, Firefox 78 and Safari 14 so older Android browsers do not receive baseline-only syntax; this does not polyfill browser APIs or lower the server runtime target.
- Persist manual service discounts (nominal or percent, via discount + discount_type) on sale items and use the shared sale-discounts calculation for checkout and server totals; this preserves per-service receipts and prevents calculation drift.
- Commission payouts/savings are an append-only ledger (pos_commission_settlements); performance hides an employee's sales at or before their latest withdraw/save cutoff, and the server computes amounts so the client cannot alter them.
- Revise sales through the shared sale editor and server validation; commit sale items, customer points and summaries atomically through the service-role-only revision RPC because the legacy SQL proxy cannot roll back multi-statement writes. Preserve invoice/date and unchanged commission rates; reject revisions in settled commission periods.
