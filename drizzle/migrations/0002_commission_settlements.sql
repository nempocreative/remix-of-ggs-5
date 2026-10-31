CREATE TABLE IF NOT EXISTS public.pos_commission_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon text NOT NULL,
  employee_id text NOT NULL,
  employee_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('withdraw','save','savings_withdraw')),
  amount integer NOT NULL CHECK (amount >= 0),
  period_start timestamptz,
  period_end timestamptz NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_commission_settlements_emp_idx ON public.pos_commission_settlements (salon, employee_id, created_at);
GRANT ALL ON public.pos_commission_settlements TO service_role;
ALTER TABLE public.pos_commission_settlements ENABLE ROW LEVEL SECURITY;