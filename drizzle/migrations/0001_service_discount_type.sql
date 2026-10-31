ALTER TABLE public.pos_sale_items ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'nominal';
ALTER TABLE public.pos_sale_items ADD CONSTRAINT pos_sale_items_discount_type_check CHECK (discount_type IN ('nominal', 'percent'));
COMMENT ON COLUMN public.pos_sale_items.discount_type IS 'Jenis diskon layanan: nominal (rupiah) atau percent (persen dari harga layanan).';