-- Corrige as políticas RLS da tabela funcionarios
-- Garante que usuários autenticados podem fazer todas as operações

-- 1. Remove políticas existentes que possam estar conflitando
DROP POLICY IF EXISTS "Allow all access to funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can read funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can insert funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can update funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "Authenticated users can delete funcionarios" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_select_policy" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_insert_policy" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_update_policy" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios_delete_policy" ON public.funcionarios;

-- 2. Garante que RLS está habilitado
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- 3. Recria as políticas permitindo acesso total a usuários autenticados
CREATE POLICY "funcionarios_select_policy" ON public.funcionarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "funcionarios_insert_policy" ON public.funcionarios
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "funcionarios_update_policy" ON public.funcionarios
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "funcionarios_delete_policy" ON public.funcionarios
  FOR DELETE USING (auth.uid() IS NOT NULL);
