CREATE OR REPLACE FUNCTION public.app_sql(q text, params jsonb DEFAULT '[]'::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
  v jsonb;
  lit text;
  res json;
  qq text := q;
  kind text;
BEGIN
  IF jsonb_array_length(params) > 0 THEN
    FOR i IN REVERSE jsonb_array_length(params)..1 LOOP
      v := params->(i-1);
      IF v IS NULL OR jsonb_typeof(v) = 'null' THEN lit := 'NULL';
      ELSIF jsonb_typeof(v) = 'boolean' THEN lit := v#>>'{}';
      ELSIF jsonb_typeof(v) IN ('string','number') THEN lit := quote_literal(v#>>'{}');
      ELSE lit := quote_literal(v::text);
      END IF;
      qq := replace(qq, '$' || i, lit);
    END LOOP;
  END IF;
  kind := lower(substring(ltrim(qq) from '^[A-Za-z]+'));
  IF kind IN ('select','with') THEN
    EXECUTE format('select coalesce(json_agg((select json_agg(value) from json_each(row_to_json(t)))), ''[]''::json) from (%s) t', qq) INTO res;
  ELSIF qq ~* '\sreturning\s' THEN
    EXECUTE format('with t as (%s) select coalesce(json_agg((select json_agg(value) from json_each(row_to_json(t)))), ''[]''::json) from t', qq) INTO res;
  ELSE
    EXECUTE qq;
    res := '[]'::json;
  END IF;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.app_sql(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_sql(text, jsonb) TO service_role;