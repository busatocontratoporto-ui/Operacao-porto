-- ==================== 20260224154330_6de1db08-63c3-44ef-8566-1b8ea39f620a.sql ====================

-- Ciclos de avaliaÃ§Ã£o (perÃ­odos)
CREATE TABLE public.evaluation_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CompetÃªncias (personalizÃ¡veis)
CREATE TABLE public.competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  cycle_id UUID REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AvaliaÃ§Ãµes 360Â° (quem avalia quem)
CREATE TABLE public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  evaluator_name TEXT NOT NULL,
  evaluator_role TEXT NOT NULL CHECK (evaluator_role IN ('self', 'manager', 'peer', 'subordinate')),
  evaluated_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Respostas das competÃªncias por avaliaÃ§Ã£o
CREATE TABLE public.evaluation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES public.competencies(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PDIs (Plano de Desenvolvimento Individual)
CREATE TABLE public.pdis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AÃ§Ãµes do PDI
CREATE TABLE public.pdi_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdi_id UUID NOT NULL REFERENCES public.pdis(id) ON DELETE CASCADE,
  competency_id UUID REFERENCES public.competencies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS - habilitar em todas as tabelas
ALTER TABLE public.evaluation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdi_actions ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas permissivas para leitura/escrita (sem auth por enquanto, serÃ¡ restrito depois)
CREATE POLICY "Allow all access to evaluation_cycles" ON public.evaluation_cycles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to competencies" ON public.competencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to evaluations" ON public.evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to evaluation_responses" ON public.evaluation_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pdis" ON public.pdis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pdi_actions" ON public.pdi_actions FOR ALL USING (true) WITH CHECK (true);

-- ==================== 20260224163758_f5dd3a63-f782-4dd9-97c7-23069001d2fb.sql ====================

-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- user_roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = id);

-- Create permissions table for granular access control
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  page text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, page)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================== 20260224163843_00927cb3-af00-43a8-9674-e5cc525087f2.sql ====================

-- Fix overly permissive RLS policies on existing tables
-- Replace with authenticated-only access

DROP POLICY IF EXISTS "Allow all access to competencies" ON public.competencies;
CREATE POLICY "Authenticated users can manage competencies" ON public.competencies
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to evaluation_cycles" ON public.evaluation_cycles;
CREATE POLICY "Authenticated users can manage evaluation_cycles" ON public.evaluation_cycles
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to evaluation_responses" ON public.evaluation_responses;
CREATE POLICY "Authenticated users can manage evaluation_responses" ON public.evaluation_responses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to evaluations" ON public.evaluations;
CREATE POLICY "Authenticated users can manage evaluations" ON public.evaluations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to pdi_actions" ON public.pdi_actions;
CREATE POLICY "Authenticated users can manage pdi_actions" ON public.pdi_actions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to pdis" ON public.pdis;
CREATE POLICY "Authenticated users can manage pdis" ON public.pdis
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================== 20260224175142_6f218730-ba36-499a-989a-6d735715941b.sql ====================

CREATE TABLE public.funcionarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  departamento TEXT NOT NULL,
  cargo TEXT NOT NULL,
  data_admissao DATE NOT NULL DEFAULT CURRENT_DATE,
  feedbacks_recebidos INTEGER NOT NULL DEFAULT 0,
  feedbacks_resolvidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view funcionarios" ON public.funcionarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert funcionarios" ON public.funcionarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update funcionarios" ON public.funcionarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete funcionarios" ON public.funcionarios FOR DELETE TO authenticated USING (true);

-- ==================== 20260224175701_fde4c3bc-254c-4881-b7a6-3195262a8c4c.sql ====================
ALTER TABLE public.funcionarios ALTER COLUMN email DROP NOT NULL, ALTER COLUMN email SET DEFAULT '';

-- ==================== 20260225104153_0b467c8d-03a5-4b33-a887-66efc0976d33.sql ====================

CREATE TABLE public.feedbacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  setor TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'media',
  status TEXT NOT NULL DEFAULT 'novo',
  autor TEXT NOT NULL,
  departamento TEXT NOT NULL DEFAULT '',
  pontos_positivos TEXT DEFAULT '',
  pontos_melhoria TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  votos INTEGER NOT NULL DEFAULT 0,
  comentarios INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view feedbacks" ON public.feedbacks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert feedbacks" ON public.feedbacks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update feedbacks" ON public.feedbacks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete feedbacks" ON public.feedbacks FOR DELETE TO authenticated USING (true);

-- ==================== 20260225125131_edb5f947-72b5-4ade-b02b-015b13a411c7.sql ====================

CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cargo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  peso NUMERIC NOT NULL,
  resultado NUMERIC NULL,
  muito_abaixo TEXT NOT NULL DEFAULT '',
  abaixo TEXT NOT NULL DEFAULT '',
  dentro TEXT NOT NULL DEFAULT '',
  acima TEXT NOT NULL DEFAULT '',
  muito_acima TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view goals" ON public.goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update goals" ON public.goals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete goals" ON public.goals FOR DELETE TO authenticated USING (true);

-- ==================== 20260225133055_e026a919-73e7-472e-ae5d-1a68b7841b06.sql ====================

-- Add gestor column to feedbacks
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS gestor text DEFAULT '';

-- Add foto_url column to funcionarios
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS foto_url text DEFAULT '';

-- Create storage bucket for employee photos
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars bucket
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- ==================== 20260225135456_cdf65a64-c4af-4f53-ab0e-ca40b478102c.sql ====================

-- ReuniÃµes 1:1
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE NOT NULL,
  manager_name TEXT NOT NULL,
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  action_items TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meetings"
ON public.meetings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Clima organizacional - Pesquisas
CREATE TABLE public.climate_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ
);

ALTER TABLE public.climate_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage climate_surveys"
ON public.climate_surveys FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Respostas das pesquisas
CREATE TABLE public.climate_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES public.climate_surveys(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.climate_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage climate_responses"
ON public.climate_responses FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Controle de ausÃªncias/fÃ©rias
CREATE TABLE public.absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'ferias',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage absences"
ON public.absences FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ==================== 20260225195032_0254409c-759e-425b-b9d9-97247d257067.sql ====================

CREATE TABLE public.fit_cultural (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  criteria text NOT NULL,
  stage text NOT NULL DEFAULT 'autoavaliacao',
  score integer DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fit_cultural ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage fit_cultural"
  ON public.fit_cultural
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ==================== 20260225204723_37b5c731-4a62-4e0c-a7f7-52ca6dedae61.sql ====================
ALTER TABLE public.funcionarios ADD COLUMN escolaridade text DEFAULT '' NOT NULL;
ALTER TABLE public.funcionarios ADD COLUMN graduacao text DEFAULT '' NOT NULL;

-- ==================== 20260225205409_d5a31a2f-50a2-4ebc-bce7-33a92a64ab1a.sql ====================
-- Add pos-graduaÃ§Ã£o fields to funcionarios
ALTER TABLE public.funcionarios ADD COLUMN pos_graduacao boolean DEFAULT false NOT NULL;
ALTER TABLE public.funcionarios ADD COLUMN pos_graduacao_tipo text DEFAULT '' NOT NULL;

-- Create employee_documents table for file uploads (CNH, certificates, etc.)
CREATE TABLE public.employee_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  document_type text NOT NULL DEFAULT 'geral',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage employee_documents" ON public.employee_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos', 'documentos', true);

-- Storage policies for documentos bucket
CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can view documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can delete documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documentos');

-- ==================== 20260225225008_277d36de-cf05-43b3-878c-e528e99b2157.sql ====================

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS letra text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS encarregado_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL;

-- ==================== 20260306154718_dab5d1f6-3b88-4c63-a172-31d9e5041801.sql ====================

-- CCO Fleet assignments table
CREATE TABLE public.cco_fleet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento text NOT NULL,
  placa text NOT NULL DEFAULT '',
  local text NOT NULL DEFAULT '',
  operador_turno_a text NOT NULL DEFAULT '',
  operador_turno_b text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT 'porto',
  tipo text NOT NULL DEFAULT 'operacional',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cco_fleet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cco_fleet"
  ON public.cco_fleet FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- CCO Maintenance records table
CREATE TABLE public.cco_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT CURRENT_DATE,
  placa text NOT NULL DEFAULT '',
  tipo_equipamento text NOT NULL DEFAULT '',
  motorista text NOT NULL DEFAULT '',
  letra text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  servico text NOT NULL DEFAULT '',
  tipo_manutencao text NOT NULL DEFAULT '',
  inicio time,
  liberacao time,
  horas_perdidas text NOT NULL DEFAULT '00:00:00',
  observacao text DEFAULT '',
  status text NOT NULL DEFAULT 'EM ANDAMENTO',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cco_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cco_maintenance"
  ON public.cco_maintenance FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ==================== 20260306164817_6f0a99fd-11ed-45e6-b885-12db153616e5.sql ====================

CREATE TABLE public.cco_third_party (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  os text NOT NULL DEFAULT '',
  data date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Finalizada',
  dono text NOT NULL DEFAULT '',
  tipo_equipamento text NOT NULL DEFAULT '',
  tag text NOT NULL DEFAULT '',
  atendimento text NOT NULL DEFAULT 'Sim',
  desvio text NOT NULL DEFAULT '',
  justificativa text NOT NULL DEFAULT '',
  df_percent numeric DEFAULT NULL,
  hora_prog_inicio text NOT NULL DEFAULT '',
  hora_prog_final text NOT NULL DEFAULT '',
  total_hora_prog numeric DEFAULT NULL,
  hora_real_inicio text NOT NULL DEFAULT '',
  hora_real_final text NOT NULL DEFAULT '',
  total_hora_real numeric DEFAULT NULL,
  aderencia numeric DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cco_third_party ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cco_third_party"
  ON public.cco_third_party
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================== 20260316125629_461ae6ce-f1a1-48a1-b3a0-6d93690720ef.sql ====================

-- Daily attendance records (ponto diÃ¡rio)
CREATE TABLE public.daily_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'presente',
  observation text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Vacation control (controle de fÃ©rias)
CREATE TABLE public.vacation_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  last_vacation_year1 text DEFAULT '',
  last_vacation_year2 text DEFAULT '',
  days_count integer DEFAULT 30,
  scheduled_month text DEFAULT '',
  start_date date,
  end_date date,
  remaining_days integer,
  observation text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);

-- Overtime control (controle de extras - mÃ¡x 3)
CREATE TABLE public.overtime_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  extras_count integer NOT NULL DEFAULT 0,
  max_extras integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_start, period_end)
);

-- Enable RLS
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_control ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can manage daily_attendance" ON public.daily_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage vacation_control" ON public.vacation_control FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage overtime_control" ON public.overtime_control FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==================== 20260316143425_ee24c049-1bcf-43f5-8d3d-75a220021a50.sql ====================

CREATE TABLE public.employee_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL DEFAULT '',
  applied BOOLEAN NOT NULL DEFAULT false,
  observation TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage employee_warnings"
  ON public.employee_warnings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================== 20260316204355_638b8527-d60d-4bb3-9ad2-a3862f1ad382.sql ====================

CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  event_time TEXT DEFAULT '',
  day_of_week TEXT DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT DEFAULT '',
  contract TEXT DEFAULT 'PORTO',
  equipment TEXT DEFAULT '',
  plate_tag TEXT DEFAULT '',
  shift TEXT DEFAULT '',
  supervisor TEXT DEFAULT '',
  involved_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================== 20260319154419_31c68929-8020-4d68-83b3-02c1cd2afd98.sql ====================

-- Add meeting_type column to meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_type text NOT NULL DEFAULT '1:1';

-- Add material_url column for PowerPoint/presentation uploads
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS material_url text DEFAULT '';

-- Add title column for meeting title
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS title text DEFAULT '';

-- Create meeting_attendees table for attendance tracking
CREATE TABLE public.meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES public.funcionarios(id) ON DELETE CASCADE NOT NULL,
  present boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, employee_id)
);

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meeting_attendees"
  ON public.meeting_attendees FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Create meeting_action_items table (5W2H structured)
CREATE TABLE public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE NOT NULL,
  what text NOT NULL DEFAULT '',
  why text DEFAULT '',
  who text NOT NULL DEFAULT '',
  "when" date DEFAULT NULL,
  where_location text DEFAULT '',
  how text DEFAULT '',
  how_much text DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  completed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meeting_action_items"
  ON public.meeting_action_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Create meeting_documents table for attendance list uploads and materials
CREATE TABLE public.meeting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE NOT NULL,
  document_type text NOT NULL DEFAULT 'material',
  file_name text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meeting_documents"
  ON public.meeting_documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ==================== 20260527131416_assessments_360.sql ====================
-- Create assessment_results table
CREATE TABLE IF NOT EXISTS public.assessment_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('disc', 'mbti', 'bigfive', 'gallup', 'lpi')),
    result_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

-- Policies for assessment_results
CREATE POLICY "Users can view their own assessment results" 
    ON public.assessment_results FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assessment results" 
    ON public.assessment_results FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all assessment results" 
    ON public.assessment_results FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

CREATE POLICY "Admins can insert all assessment results" 
    ON public.assessment_results FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update all assessment results" 
    ON public.assessment_results FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete all assessment results" 
    ON public.assessment_results FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

-- Create feedback_360_cycles table
CREATE TABLE IF NOT EXISTS public.feedback_360_cycles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.feedback_360_cycles ENABLE ROW LEVEL SECURITY;

-- Policies for feedback_360_cycles
CREATE POLICY "Anyone can view active and completed cycles" 
    ON public.feedback_360_cycles FOR SELECT 
    USING (status IN ('active', 'completed'));

CREATE POLICY "Admins have full access to feedback_360_cycles" 
    ON public.feedback_360_cycles FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

-- Create feedback_360_participants table
CREATE TABLE IF NOT EXISTS public.feedback_360_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cycle_id UUID NOT NULL REFERENCES public.feedback_360_cycles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- The leader being evaluated
    evaluator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- The person evaluating
    relationship TEXT NOT NULL CHECK (relationship IN ('self', 'manager', 'peer', 'subordinate')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.feedback_360_participants ENABLE ROW LEVEL SECURITY;

-- Policies for feedback_360_participants
CREATE POLICY "Evaluators can view their pending/completed evaluations" 
    ON public.feedback_360_participants FOR SELECT 
    USING (auth.uid() = evaluator_id);

CREATE POLICY "Evaluators can update their own evaluation status" 
    ON public.feedback_360_participants FOR UPDATE 
    USING (auth.uid() = evaluator_id);

CREATE POLICY "Users can view their own feedback participants if cycle is completed" 
    ON public.feedback_360_participants FOR SELECT 
    USING (
        auth.uid() = user_id AND 
        EXISTS (
            SELECT 1 FROM feedback_360_cycles WHERE feedback_360_cycles.id = cycle_id AND feedback_360_cycles.status = 'completed'
        )
    );

CREATE POLICY "Admins have full access to feedback_360_participants" 
    ON public.feedback_360_participants FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

-- Create feedback_360_responses table
CREATE TABLE IF NOT EXISTS public.feedback_360_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant_id UUID NOT NULL REFERENCES public.feedback_360_participants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.feedback_360_responses ENABLE ROW LEVEL SECURITY;

-- Policies for feedback_360_responses
CREATE POLICY "Evaluators can view and insert their own responses" 
    ON public.feedback_360_responses FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM feedback_360_participants WHERE feedback_360_participants.id = participant_id AND feedback_360_participants.evaluator_id = auth.uid()
        )
    );

CREATE POLICY "Users can view responses about them if cycle is completed (anonymous)" 
    ON public.feedback_360_responses FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM feedback_360_participants p
            JOIN feedback_360_cycles c ON c.id = p.cycle_id
            WHERE p.id = participant_id AND p.user_id = auth.uid() AND c.status = 'completed'
        )
    );

CREATE POLICY "Admins have full access to feedback_360_responses" 
    ON public.feedback_360_responses FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
        )
    );

-- ==================== 20260603155612_create_medicoes_table.sql ====================
create table public.medicoes (
  id uuid default gen_random_uuid() primary key,
  mes text not null,
  dados jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS (Row Level Security)
alter table public.medicoes enable row level security;

-- Criar polÃ­tica para permitir acesso anÃ´nimo/autenticado (conforme o padrÃ£o do projeto)
create policy "Permitir leitura para todos em medicoes"
  on public.medicoes for select
  using (true);

create policy "Permitir inserÃ§Ã£o para todos em medicoes"
  on public.medicoes for insert
  with check (true);

create policy "Permitir atualizaÃ§Ã£o para todos em medicoes"
  on public.medicoes for update
  using (true);

create policy "Permitir deleÃ§Ã£o para todos em medicoes"
  on public.medicoes for delete
  using (true);

-- ==================== 20260608170000_add_medical_fields_to_events.sql ====================
-- Migration para adicionar campos de SaÃºde e Severidade de OcorrÃªncias
ALTER TABLE events
ADD COLUMN IF NOT EXISTS cid text,
ADD COLUMN IF NOT EXISTS atestado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS afastamento boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS danos_materiais boolean DEFAULT false;

-- ==================== 20260609201000_create_treinamentos_table.sql ====================
CREATE TABLE treinamentos_ssma (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    cpf TEXT,
    funcao TEXT,
    situacao TEXT,
    cnh_categoria TEXT,
    cnh_vencimento DATE,
    treinamentos JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE treinamentos_ssma ENABLE ROW LEVEL SECURITY;

-- Criar polÃ­tica de acesso pÃºblico para testes/dev
CREATE POLICY "Acesso total publico para treinamentos_ssma" 
ON treinamentos_ssma FOR ALL USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION set_updated_at_treinamentos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_treinamentos_updated_at
BEFORE UPDATE ON treinamentos_ssma
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_treinamentos();

-- ==================== 20260624123500_create_ssma_n3_table.sql ====================
CREATE TABLE IF NOT EXISTS public.ssma_n3 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome_email TEXT NOT NULL,
    periodo TEXT NOT NULL,
    total_verificacoes INTEGER DEFAULT 0,
    total_treinamentos INTEGER DEFAULT 0,
    total_assistencia INTEGER DEFAULT 0,
    verificacoes_nc INTEGER DEFAULT 0,
    perguntas_nc INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.ssma_n3 ENABLE ROW LEVEL SECURITY;

-- Criar polÃ­ticas (todos podem ler e escrever por enquanto, seguindo o padrÃ£o)
CREATE POLICY "Permitir leitura para todos os usuÃ¡rios autenticados" ON public.ssma_n3
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserÃ§Ã£o/atualizaÃ§Ã£o para usuÃ¡rios autenticados" ON public.ssma_n3
    FOR ALL USING (true);

-- ==================== 20260629120000_add_cycle_to_fit_cultural.sql ====================
ALTER TABLE public.fit_cultural ADD COLUMN cycle_id uuid REFERENCES public.evaluation_cycles(id) ON DELETE SET NULL;

-- ==================== 20260701120000_create_nine_box_historico.sql ====================
CREATE TABLE IF NOT EXISTS public.nine_box_historico (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID REFERENCES public.funcionarios(id) ON DELETE CASCADE,
    desempenho TEXT NOT NULL,
    potencial TEXT NOT NULL,
    cycle TEXT NOT NULL,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS policies
ALTER TABLE public.nine_box_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.nine_box_historico
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON public.nine_box_historico
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON public.nine_box_historico
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON public.nine_box_historico
    FOR DELETE USING (true);

-- ==================== 20260701200000_fix_rls_policies.sql ====================
-- ============================================================
-- CORREÃ‡ÃƒO CRÃTICA DE SEGURANÃ‡A: PolÃ­ticas RLS Abertas v2
-- VersÃ£o segura: usa blocos DO para ignorar tabelas inexistentes
-- ============================================================

-- ---- evaluation_cycles ----
DROP POLICY IF EXISTS "Allow all access to evaluation_cycles" ON public.evaluation_cycles;
CREATE POLICY "Authenticated users can read evaluation_cycles" ON public.evaluation_cycles
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert evaluation_cycles" ON public.evaluation_cycles
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update evaluation_cycles" ON public.evaluation_cycles
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete evaluation_cycles" ON public.evaluation_cycles
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- competencies ----
DROP POLICY IF EXISTS "Allow all access to competencies" ON public.competencies;
CREATE POLICY "Authenticated users can read competencies" ON public.competencies
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert competencies" ON public.competencies
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update competencies" ON public.competencies
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete competencies" ON public.competencies
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- evaluations ----
DROP POLICY IF EXISTS "Allow all access to evaluations" ON public.evaluations;
CREATE POLICY "Authenticated users can read evaluations" ON public.evaluations
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert evaluations" ON public.evaluations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update evaluations" ON public.evaluations
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete evaluations" ON public.evaluations
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- evaluation_responses ----
DROP POLICY IF EXISTS "Allow all access to evaluation_responses" ON public.evaluation_responses;
CREATE POLICY "Authenticated users can read evaluation_responses" ON public.evaluation_responses
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert evaluation_responses" ON public.evaluation_responses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update evaluation_responses" ON public.evaluation_responses
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete evaluation_responses" ON public.evaluation_responses
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- pdis ----
DROP POLICY IF EXISTS "Allow all access to pdis" ON public.pdis;
CREATE POLICY "Authenticated users can read pdis" ON public.pdis
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert pdis" ON public.pdis
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update pdis" ON public.pdis
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete pdis" ON public.pdis
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- pdi_actions ----
DROP POLICY IF EXISTS "Allow all access to pdi_actions" ON public.pdi_actions;
CREATE POLICY "Authenticated users can read pdi_actions" ON public.pdi_actions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert pdi_actions" ON public.pdi_actions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update pdi_actions" ON public.pdi_actions
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete pdi_actions" ON public.pdi_actions
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- assessment_results ----
DROP POLICY IF EXISTS "Allow all access to assessment_results" ON public.assessment_results;
CREATE POLICY "Users can read own assessment results" ON public.assessment_results
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assessment results" ON public.assessment_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assessment results" ON public.assessment_results
  FOR UPDATE USING (auth.uid() = user_id);

-- ---- treinamentos (sÃ³ aplica se a tabela existir) ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'treinamentos') THEN
    DROP POLICY IF EXISTS "Allow all access to treinamentos" ON public.treinamentos;
    EXECUTE 'CREATE POLICY "Authenticated users can read treinamentos" ON public.treinamentos FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Authenticated users can insert treinamentos" ON public.treinamentos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Authenticated users can update treinamentos" ON public.treinamentos FOR UPDATE USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Authenticated users can delete treinamentos" ON public.treinamentos FOR DELETE USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;

-- ---- ssma_n3 (sÃ³ aplica se a tabela existir) ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ssma_n3') THEN
    DROP POLICY IF EXISTS "Allow all access to ssma_n3" ON public.ssma_n3;
    EXECUTE 'CREATE POLICY "Authenticated users can read ssma_n3" ON public.ssma_n3 FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Authenticated users can insert ssma_n3" ON public.ssma_n3 FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Authenticated users can update ssma_n3" ON public.ssma_n3 FOR UPDATE USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Authenticated users can delete ssma_n3" ON public.ssma_n3 FOR DELETE USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;

-- ---- nine_box_historico ----
DROP POLICY IF EXISTS "Allow all access to nine_box_historico" ON public.nine_box_historico;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.nine_box_historico;
DROP POLICY IF EXISTS "Enable select for all users" ON public.nine_box_historico;
DROP POLICY IF EXISTS "Enable update for all users" ON public.nine_box_historico;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.nine_box_historico;
CREATE POLICY "Authenticated users can read nine_box_historico" ON public.nine_box_historico
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert nine_box_historico" ON public.nine_box_historico
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update nine_box_historico" ON public.nine_box_historico
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete nine_box_historico" ON public.nine_box_historico
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ---- funcionarios ----
DROP POLICY IF EXISTS "Allow all access to funcionarios" ON public.funcionarios;
CREATE POLICY "Authenticated users can read funcionarios" ON public.funcionarios
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert funcionarios" ON public.funcionarios
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update funcionarios" ON public.funcionarios
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete funcionarios" ON public.funcionarios
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- TABELA DE AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user_id UUID,
  target_table TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit log" ON public.audit_log;
CREATE POLICY "Admins can read audit log" ON public.audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role can insert audit log" ON public.audit_log;
CREATE POLICY "Service role can insert audit log" ON public.audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==================== 20260708115933_fit_cultural_closures.sql ====================
-- Crie a tabela para registrar os encerramentos do Fit Cultural
CREATE TABLE public.fit_cultural_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE,
    closed_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Garante que um funcionÃ¡rio sÃ³ possa ter um encerramento por ciclo
    UNIQUE(employee_id, cycle_id)
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.fit_cultural_closures ENABLE ROW LEVEL SECURITY;

-- Criar polÃ­tica de acesso para permitir operaÃ§Ãµes apenas de usuÃ¡rios autenticados
CREATE POLICY "Permitir tudo para usuÃ¡rios autenticados" 
ON public.fit_cultural_closures FOR ALL 
USING (auth.role() = 'authenticated');

-- ==================== 20260731130000_fix_assessment_results_rls.sql ====================
-- Fix RLS policies and foreign key for assessment_results
ALTER TABLE public.assessment_results DROP CONSTRAINT IF EXISTS assessment_results_user_id_fkey;
ALTER TABLE public.assessment_results ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Allow all access to assessment_results" ON public.assessment_results
  FOR ALL USING (true) WITH CHECK (true);

-- ==================== 20260929170000_fix_funcionarios_rls.sql ====================
-- Corrige as polÃ­ticas RLS da tabela funcionarios
-- Garante que usuÃ¡rios autenticados podem fazer todas as operaÃ§Ãµes

-- 1. Remove polÃ­ticas existentes que possam estar conflitando
DROP POLICY IF EXISTS "Allow all access to funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can read funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can insert funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can update funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can delete funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_select_policy" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_insert_policy" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_update_policy" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_delete_policy" ON public.funcionarios;

-- 2. Garante que RLS estÃ¡ habilitado
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- 3. Recria as polÃ­ticas permitindo acesso total a usuÃ¡rios autenticados
CREATE POLICY "funcionarios_select_policy" ON public.funcionarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "funcionarios_insert_policy" ON public.funcionarios
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "funcionarios_update_policy" ON public.funcionarios
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "funcionarios_delete_policy" ON public.funcionarios
  FOR DELETE USING (auth.uid() IS NOT NULL);


-- ==================== 20261123150000_create_busato_cco_tables.sql ====================
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
