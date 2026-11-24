-- ============================================================
-- Migration: Auxiliary tables, missing columns, RLS & storage
-- Covers: access_profiles, access_profile_permissions,
-- user_roles.profile_id, profiles.departamento, audit_log,
-- app_collections, pdi_checkins, indicadores_metas,
-- n3_lancamentos, assessment_results fix, storage buckets
-- ============================================================

-- 1. Perfis de Acesso (Módulos / Páginas)
CREATE TABLE IF NOT EXISTS public.access_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_profile_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT access_profile_permissions_profile_page_key UNIQUE (profile_id, page)
);

-- 2. Colunas extras em user_roles e profiles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.access_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS departamento TEXT;

-- 3. Log de Auditoria
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  user_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Coleções Genéricas da Aplicação (useCollection)
CREATE TABLE IF NOT EXISTS public.app_collections (
  colecao TEXT PRIMARY KEY,
  dados JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Histórico de Check-ins do PDI
CREATE TABLE IF NOT EXISTS public.pdi_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdi_id UUID NOT NULL REFERENCES public.pdis(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  next_steps TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Metas e Indicadores (Metas Busato / Porto)
CREATE TABLE IF NOT EXISTS public.indicadores_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes TEXT NOT NULL,
  indicador TEXT NOT NULL,
  referencia NUMERIC,
  alcancado NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Lançamentos N3 SSMA (N3Dashboard)
CREATE TABLE IF NOT EXISTS public.n3_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_email TEXT NOT NULL,
  cargo TEXT,
  letra TEXT,
  periodo TEXT NOT NULL,
  total_verificacoes INTEGER NOT NULL DEFAULT 0,
  total_treinamentos INTEGER NOT NULL DEFAULT 0,
  total_assistencia INTEGER NOT NULL DEFAULT 0,
  verificacoes_nc INTEGER NOT NULL DEFAULT 0,
  perguntas_nc INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. RLS para todas as novas tabelas
ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_profile_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdi_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicadores_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n3_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access to access_profiles" ON public.access_profiles;
CREATE POLICY "Authenticated access to access_profiles" ON public.access_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access to access_profile_permissions" ON public.access_profile_permissions;
CREATE POLICY "Authenticated access to access_profile_permissions" ON public.access_profile_permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access to audit_log" ON public.audit_log;
CREATE POLICY "Authenticated access to audit_log" ON public.audit_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access to app_collections" ON public.app_collections;
CREATE POLICY "Authenticated access to app_collections" ON public.app_collections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access to pdi_checkins" ON public.pdi_checkins;
CREATE POLICY "Authenticated access to pdi_checkins" ON public.pdi_checkins
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access to indicadores_metas" ON public.indicadores_metas;
CREATE POLICY "Authenticated access to indicadores_metas" ON public.indicadores_metas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access to n3_lancamentos" ON public.n3_lancamentos;
CREATE POLICY "Authenticated access to n3_lancamentos" ON public.n3_lancamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Correção de assessment_results (remover policies dependentes antes do ALTER COLUMN)
DROP POLICY IF EXISTS "Allow all access to assessment_results" ON public.assessment_results;
DROP POLICY IF EXISTS "Users can read own assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Users can insert own assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Users can update own assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Users can view their own assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Users can insert their own assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Admins can view all assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Admins can insert all assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Admins can update all assessment results" ON public.assessment_results;
DROP POLICY IF EXISTS "Admins can delete all assessment results" ON public.assessment_results;

ALTER TABLE public.assessment_results DROP CONSTRAINT IF EXISTS assessment_results_user_id_fkey;
ALTER TABLE public.assessment_results ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to assessment_results" ON public.assessment_results
  FOR ALL USING (true) WITH CHECK (true);

-- 10. Storage Buckets (avatars e documentos) + Políticas
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('documentos', 'documentos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read avatars and documentos" ON storage.objects;
CREATE POLICY "Public read avatars and documentos" ON storage.objects
  FOR SELECT USING (bucket_id IN ('avatars', 'documentos'));

DROP POLICY IF EXISTS "Authenticated upload avatars and documentos" ON storage.objects;
CREATE POLICY "Authenticated upload avatars and documentos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('avatars', 'documentos'));

DROP POLICY IF EXISTS "Authenticated update avatars and documentos" ON storage.objects;
CREATE POLICY "Authenticated update avatars and documentos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id IN ('avatars', 'documentos'));

DROP POLICY IF EXISTS "Authenticated delete avatars and documentos" ON storage.objects;
CREATE POLICY "Authenticated delete avatars and documentos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id IN ('avatars', 'documentos'));
