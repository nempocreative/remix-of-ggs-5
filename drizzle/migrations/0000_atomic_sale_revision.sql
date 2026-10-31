CREATE OR REPLACE FUNCTION public.pos_revise_sale(p_id uuid, p_salon_scope text, p_sale jsonb, p_items jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_sale public.pos_sales%ROWTYPE; profile public.pos_salon_customers%ROWTYPE; delta integer; target_phone text; earned_delta integer;
BEGIN
 SELECT * INTO old_sale FROM public.pos_sales WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan.'; END IF;
 IF p_salon_scope IS NOT NULL AND old_sale.salon <> p_salon_scope THEN RAISE EXCEPTION 'Akun tidak dapat mengakses salon ini.'; END IF;
 IF EXISTS (SELECT 1 FROM public.pos_commission_settlements c WHERE c.salon=old_sale.salon AND c.action IN ('withdraw','save') AND old_sale.created_at <= c.period_end AND (c.employee_id IN (SELECT employee_id FROM public.pos_sale_items WHERE sale_id=p_id) OR c.employee_id IN (SELECT x->>'employeeId' FROM jsonb_array_elements(p_items) x))) THEN RAISE EXCEPTION 'Komisi transaksi ini sudah ditarik atau disimpan. Revisi tidak dapat mengubah riwayat penarikan.'; END IF;
 target_phone := p_sale->>'customerPhone';
 PERFORM 1 FROM public.pos_salon_customers WHERE salon=old_sale.salon AND phone IN (old_sale.customer_phone,target_phone) ORDER BY phone FOR UPDATE;
 IF old_sale.customer_phone IS NOT NULL THEN
 SELECT * INTO profile FROM public.pos_salon_customers WHERE salon=old_sale.salon AND phone=old_sale.customer_phone;
 delta := CASE WHEN old_sale.customer_phone=target_phone THEN (p_sale->>'pointsEarned')::integer-old_sale.points_earned ELSE -old_sale.points_earned END;
 IF NOT FOUND OR profile.points+delta < 0 THEN RAISE EXCEPTION 'Poin transaksi sudah digunakan; revisi ini akan membuat saldo poin negatif.'; END IF;
 UPDATE public.pos_salon_customers SET points=points+delta, updated_at=now() WHERE salon=old_sale.salon AND phone=old_sale.customer_phone;
 END IF;
 IF old_sale.customer_phone IS DISTINCT FROM target_phone THEN
 INSERT INTO public.pos_salon_customers(salon,phone,name,points) VALUES(old_sale.salon,target_phone,p_sale->>'customerName',(p_sale->>'pointsEarned')::integer) ON CONFLICT(salon,phone) DO UPDATE SET points=pos_salon_customers.points+excluded.points, updated_at=now();
 END IF;
 UPDATE public.pos_sales SET customer_name=p_sale->>'customerName',customer_phone=target_phone,cashier_name=p_sale->>'cashierName',payment_method=p_sale->>'paymentMethod',discount_mode=p_sale->>'discountMode',discount_value=(p_sale->>'discountValue')::numeric,subtotal=(p_sale->>'subtotal')::integer,discount=(p_sale->>'discount')::integer,total=(p_sale->>'total')::integer,amount_received=(p_sale->>'amountReceived')::integer,change_amount=(p_sale->>'change')::integer,points_earned=(p_sale->>'pointsEarned')::integer WHERE id=p_id;
 DELETE FROM public.pos_sale_items WHERE sale_id=p_id;
 INSERT INTO public.pos_sale_items(sale_id,line_index,service_id,name,unit_price,quantity,discount,discount_type,employee_id,employee_name,commission_percent,commission_base,commission_amount)
 SELECT p_id,(x->>'lineIndex')::integer,x->>'serviceId',x->>'name',(x->>'unitPrice')::integer,(x->>'quantity')::integer,(x->>'discount')::integer,x->>'discountType',x->>'employeeId',x->>'employeeName',(x->>'commissionPercent')::numeric,(x->>'commissionBase')::integer,(x->>'commissionAmount')::integer FROM jsonb_array_elements(p_items) x;
 FOR profile IN SELECT * FROM public.pos_salon_customers WHERE salon=old_sale.salon AND phone IN (old_sale.customer_phone,target_phone) LOOP
 SELECT COALESCE(sum(points_earned),0) INTO earned_delta FROM public.pos_sales WHERE salon=old_sale.salon AND customer_phone=profile.phone;
 UPDATE public.pos_sales s SET points_balance=profile.points-earned_delta+(SELECT COALESCE(sum(t.points_earned),0) FROM public.pos_sales t WHERE t.salon=s.salon AND t.customer_phone=s.customer_phone AND (t.created_at,t.id)<=(s.created_at,s.id))+(SELECT COALESCE(sum(r.points_spent),0) FROM public.pos_salon_point_redemptions r WHERE r.salon=s.salon AND r.customer_phone=s.customer_phone AND r.created_at>s.created_at) WHERE s.salon=old_sale.salon AND s.customer_phone=profile.phone;
 IF EXISTS (SELECT 1 FROM public.pos_sales WHERE salon=old_sale.salon AND customer_phone=profile.phone AND points_balance<0) THEN RAISE EXCEPTION 'Poin transaksi sudah digunakan pada transaksi berikutnya.'; END IF;
 UPDATE public.pos_salon_customers SET transaction_count=(SELECT count(*) FROM public.pos_sales WHERE salon=old_sale.salon AND customer_phone=profile.phone),total_spent=(SELECT COALESCE(sum(total),0) FROM public.pos_sales WHERE salon=old_sale.salon AND customer_phone=profile.phone),last_transaction_at=(SELECT max(created_at) FROM public.pos_sales WHERE salon=old_sale.salon AND customer_phone=profile.phone),name=COALESCE((SELECT customer_name FROM public.pos_sales WHERE salon=old_sale.salon AND customer_phone=profile.phone ORDER BY created_at DESC,id DESC LIMIT 1),name),updated_at=now() WHERE salon=old_sale.salon AND phone=profile.phone;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.pos_revise_sale(uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_revise_sale(uuid,text,jsonb,jsonb) TO service_role;