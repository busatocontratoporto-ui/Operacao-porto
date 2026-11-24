-- Add RH, operational allocation, and vacation tracking fields to funcionarios
ALTER TABLE public.funcionarios
  ALTER COLUMN data_admissao DROP NOT NULL,
  ALTER COLUMN data_admissao DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS frente_atendimento TEXT,
  ADD COLUMN IF NOT EXISTS polivalencia TEXT,
  ADD COLUMN IF NOT EXISTS status_colaborador TEXT NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS contrato_vinculado TEXT,
  ADD COLUMN IF NOT EXISTS ultima_ferias DATE;

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_cpf_unique_idx
  ON public.funcionarios (cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';

NOTIFY pgrst, 'reload schema';
