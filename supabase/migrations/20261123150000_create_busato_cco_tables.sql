-- Tabelas em nuvem do Módulo CCO (Programação Semanal, Operação Diária / Corretivas e Cadastros)
-- Permite que todos os usuários operem o CCO em tempo real compartilhando o mesmo banco na Vercel + Supabase.

CREATE TABLE IF NOT EXISTS public.busato_programacao (
  id BIGINT PRIMARY KEY,
  data TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_busato_programacao_data ON public.busato_programacao (data);

ALTER TABLE public.busato_programacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "busato_programacao_auth_all" ON public.busato_programacao;
CREATE POLICY "busato_programacao_auth_all" ON public.busato_programacao
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.busato_registros (
  id BIGINT PRIMARY KEY,
  data TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_busato_registros_data ON public.busato_registros (data);

ALTER TABLE public.busato_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "busato_registros_auth_all" ON public.busato_registros;
CREATE POLICY "busato_registros_auth_all" ON public.busato_registros
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.busato_cadastros (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.busato_cadastros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "busato_cadastros_auth_all" ON public.busato_cadastros;
CREATE POLICY "busato_cadastros_auth_all" ON public.busato_cadastros
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
