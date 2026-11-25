-- ============================================================================
-- Links Externos de Lançamento de Ponto (sem acesso ao sistema interno)
-- Permite que encarregados/líderes lancem ponto via link dedicado e visualizem
-- apenas os lançamentos realizados através do seu link/dispositivo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ponto_external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  titulo text NOT NULL,
  responsavel_nome text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ponto_external_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage ponto_external_links" ON public.ponto_external_links;
CREATE POLICY "Authenticated users manage ponto_external_links"
  ON public.ponto_external_links
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.daily_attendance
  ADD COLUMN IF NOT EXISTS external_link_id uuid REFERENCES public.ponto_external_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS launched_by_name text,
  ADD COLUMN IF NOT EXISTS launched_by_device text;

CREATE INDEX IF NOT EXISTS idx_daily_attendance_external_link_id
  ON public.daily_attendance(external_link_id);

-- 1. Consultar contexto do link externo + lista enxuta de colaboradores ativos + histórico do próprio link/dispositivo
CREATE OR REPLACE FUNCTION public.get_external_ponto_context(
  p_token text,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.ponto_external_links%ROWTYPE;
  v_colaboradores jsonb;
  v_lancamentos jsonb;
BEGIN
  SELECT *
    INTO v_link
    FROM public.ponto_external_links
   WHERE token = trim(coalesce(p_token, ''))
     AND ativo = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'Este link de lançamento não existe ou foi desativado pela gestão.'
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'nome', f.nome,
        'cargo', f.cargo,
        'turno', f.turno,
        'letra', f.letra,
        'frente_atendimento', coalesce(f.frente_atendimento, '')
      )
      ORDER BY f.nome
    ),
    '[]'::jsonb
  )
  INTO v_colaboradores
  FROM public.funcionarios f
  WHERE upper(coalesce(f.status_colaborador, 'ATIVO')) <> 'DESLIGADO';

  -- Se o link tem responsável nominal definido, exibe todos os lançamentos daquele link;
  -- caso seja um link geral compartilhado (sem responsável fixo), filtra pelo dispositivo de quem lançou.
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', da.id,
        'employee_id', da.employee_id,
        'employee_name', coalesce(f.nome, 'Colaborador'),
        'cargo', coalesce(f.cargo, ''),
        'letra', coalesce(f.letra, ''),
        'date', da.date,
        'status', CASE WHEN da.status = 'falta' THEN 'falta_injustificada' ELSE da.status END,
        'observation', coalesce(da.observation, ''),
        'launched_by_name', coalesce(da.launched_by_name, ''),
        'created_at', da.created_at
      )
      ORDER BY da.date DESC, da.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_lancamentos
  FROM public.daily_attendance da
  LEFT JOIN public.funcionarios f ON f.id = da.employee_id
  WHERE da.external_link_id = v_link.id
    AND (
      trim(coalesce(v_link.responsavel_nome, '')) <> ''
      OR coalesce(da.launched_by_device, '') = coalesce(p_device_id, '')
    );

  RETURN jsonb_build_object(
    'valid', true,
    'link', jsonb_build_object(
      'id', v_link.id,
      'titulo', v_link.titulo,
      'responsavel_nome', v_link.responsavel_nome,
      'individual', trim(coalesce(v_link.responsavel_nome, '')) <> ''
    ),
    'colaboradores', v_colaboradores,
    'lancamentos', v_lancamentos
  );
END;
$$;

-- 2. Registrar apontamento externo de ponto com validação de ciclo e limite de 3 extras
CREATE OR REPLACE FUNCTION public.submit_external_ponto(
  p_token text,
  p_employee_id uuid,
  p_date date,
  p_status text,
  p_observation text DEFAULT '',
  p_launched_by_name text DEFAULT '',
  p_device_id text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.ponto_external_links%ROWTYPE;
  v_db_status text;
  v_period_start date;
  v_period_end date;
  v_extras_count integer;
  v_existing public.daily_attendance%ROWTYPE;
  v_saved_id uuid;
  v_launcher text;
BEGIN
  SELECT *
    INTO v_link
    FROM public.ponto_external_links
   WHERE token = trim(coalesce(p_token, ''))
     AND ativo = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Link inválido ou desativado.');
  END IF;

  IF p_employee_id IS NULL OR p_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Selecione o colaborador e a data.');
  END IF;

  IF p_status NOT IN ('falta', 'falta_injustificada', 'falta_justificada', 'extra', 'banco_horas', 'abono', 'presente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de apontamento inválido.');
  END IF;

  v_db_status := CASE WHEN p_status = 'falta_injustificada' THEN 'falta' ELSE p_status END;
  v_launcher := coalesce(nullif(trim(p_launched_by_name), ''), nullif(trim(v_link.responsavel_nome), ''), v_link.titulo);

  -- Ciclo operacional Porto: dia 21 ao dia 20
  IF EXTRACT(DAY FROM p_date) >= 21 THEN
    v_period_start := make_date(EXTRACT(YEAR FROM p_date)::int, EXTRACT(MONTH FROM p_date)::int, 21);
    v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  ELSE
    v_period_end := make_date(EXTRACT(YEAR FROM p_date)::int, EXTRACT(MONTH FROM p_date)::int, 20);
    v_period_start := (make_date(EXTRACT(YEAR FROM p_date)::int, EXTRACT(MONTH FROM p_date)::int, 21) - INTERVAL '1 month')::date;
  END IF;

  -- Verifica se já existe registro para este colaborador nesta data
  SELECT *
    INTO v_existing
    FROM public.daily_attendance
   WHERE employee_id = p_employee_id
     AND date = p_date
   LIMIT 1;

  IF FOUND THEN
    IF v_existing.external_link_id IS DISTINCT FROM v_link.id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um registro lançado para este colaborador nesta data.');
    END IF;
  END IF;

  -- Valida teto de 3 horas extras por ciclo
  IF v_db_status = 'extra' THEN
    SELECT count(*)
      INTO v_extras_count
      FROM public.daily_attendance
     WHERE employee_id = p_employee_id
       AND status = 'extra'
       AND date >= v_period_start
       AND date <= v_period_end
       AND (v_existing.id IS NULL OR id <> v_existing.id);

    IF v_extras_count >= 3 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Limite atingido: este colaborador já possui 3 horas extras neste ciclo (' || to_char(v_period_start, 'DD/MM') || ' a ' || to_char(v_period_end, 'DD/MM') || ').'
      );
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.daily_attendance
       SET status = v_db_status,
           observation = trim(coalesce(p_observation, '')),
           launched_by_name = v_launcher,
           launched_by_device = coalesce(p_device_id, '')
     WHERE id = v_existing.id
     RETURNING id INTO v_saved_id;
  ELSE
    INSERT INTO public.daily_attendance (
      employee_id,
      date,
      status,
      observation,
      external_link_id,
      launched_by_name,
      launched_by_device
    )
    VALUES (
      p_employee_id,
      p_date,
      v_db_status,
      trim(coalesce(p_observation, '')),
      v_link.id,
      v_launcher,
      coalesce(p_device_id, '')
    )
    RETURNING id INTO v_saved_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_saved_id);
END;
$$;

-- 3. Permitir excluir apenas o próprio lançamento feito pelo link externo ativo
CREATE OR REPLACE FUNCTION public.delete_external_ponto(
  p_token text,
  p_attendance_id uuid,
  p_device_id text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.ponto_external_links%ROWTYPE;
  v_deleted integer;
BEGIN
  SELECT *
    INTO v_link
    FROM public.ponto_external_links
   WHERE token = trim(coalesce(p_token, ''))
     AND ativo = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Link inválido ou desativado.');
  END IF;

  DELETE FROM public.daily_attendance
   WHERE id = p_attendance_id
     AND external_link_id = v_link.id
     AND (
       trim(coalesce(v_link.responsavel_nome, '')) <> ''
       OR coalesce(launched_by_device, '') = coalesce(p_device_id, '')
     );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Registro não encontrado ou sem permissão para remover.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_external_ponto_context(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_external_ponto(text, uuid, date, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_external_ponto(text, uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
