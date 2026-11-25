export interface HierarchyLevel {
  level: number;
  name: string;
  description: string;
}

export const HIERARQUIA_NIVEIS: readonly HierarchyLevel[] = [
  { level: 1, name: 'Diretoria', description: 'Direção executiva' },
  { level: 2, name: 'Gerente Geral', description: 'Gestão geral de operações e contratos' },
  { level: 3, name: 'Gerente', description: 'Gestão operacional e contratual' },
  { level: 4, name: 'Coordenador', description: 'Coordenação operacional da equipe' },
  { level: 5, name: 'Supervisor', description: 'Supervisão direta de turno e operação' },
  { level: 6, name: 'Encarregado', description: 'Liderança de campo' },
  { level: 7, name: 'Analista', description: 'Análise técnica e controle operacional' },
  { level: 8, name: 'Assistente', description: 'Suporte administrativo e operacional' },
  { level: 9, name: 'Auxiliar', description: 'Execução operacional' },
] as const;

export function getHierarchyLevel(cargo?: string | null): number {
  if (!cargo) return 9;
  const lower = cargo.toLowerCase().trim();

  if (lower.includes('diretor') || lower.includes('diretoria') || lower.includes('vp') || lower.includes('presidente')) return 1;
  if (lower.includes('gerente geral') || lower.includes('superintendente')) return 2;
  if (lower.includes('gerente') || lower.includes('manager')) return 3;
  if (lower.includes('coordenador') || lower.includes('coordenacao')) return 4;
  if (lower.includes('supervisor')) return 5;
  if (lower.includes('encarregado') || lower.includes('líder') || lower.includes('lider')) return 6;
  if (lower.includes('analista') || lower.includes('especialista') || lower.includes('engenheiro')) return 7;
  if (lower.includes('assistente')) return 8;
  if (lower.includes('auxiliar') || lower.includes('operador') || lower.includes('motorista') || lower.includes('ajudante')) return 9;

  return 7;
}

export function getHierarchyName(cargo?: string | null): string {
  const level = getHierarchyLevel(cargo);
  const found = HIERARQUIA_NIVEIS.find((h) => h.level === level);
  return found ? found.name : 'Auxiliar';
}
