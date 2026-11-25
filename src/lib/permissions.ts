export interface PermissionPageDef {
  key: string;
  label: string;
  path?: string;
  legacyAlias?: string;
}

export interface PageGroupDef {
  id: string;
  module: string;
  description: string;
  pages: PermissionPageDef[];
}

export const PAGE_GROUPS: PageGroupDef[] = [
  {
    id: 'visao_geral',
    module: 'Visão Geral',
    description: 'Painel inicial e indicadores executivos de movimentações',
    pages: [
      { key: 'dashboard', label: 'Central de Movimentações', path: '/' },
    ],
  },
  {
    id: 'gestao_pessoas',
    module: 'Gestão de Pessoas',
    description: 'Cadastro de colaboradores, ponto/banco de horas, férias e atestados médicos',
    pages: [
      { key: 'colaboradores', label: 'Colaboradores', path: '/colaboradores' },
      { key: 'ponto', label: 'Ponto & Banco de Horas', path: '/ponto', legacyAlias: 'ausencias' },
      { key: 'ferias', label: 'Férias & Vencimentos', path: '/ferias', legacyAlias: 'ausencias' },
      { key: 'atestados', label: 'Atestados Médicos', path: '/atestados', legacyAlias: 'ausencias' },
    ],
  },
  {
    id: 'cco',
    module: 'CCO — Centro de Controle Operacional',
    description: 'Controle operacional ao vivo, programação semanal, corretivas, medição e relatórios',
    pages: [
      { key: 'cco_painel', label: 'Painel Analítico & Paradas', path: '/cco', legacyAlias: 'cco' },
      { key: 'cco_programacao', label: 'Programação Semanal', path: '/cco/programacao', legacyAlias: 'cco' },
      { key: 'cco_operacao', label: 'Operação Diária ao Vivo', path: '/cco/operacao', legacyAlias: 'cco' },
      { key: 'cco_corretivas', label: 'Corretivas do Dia (Ao Vivo)', path: '/cco/corretivas', legacyAlias: 'cco' },
      { key: 'cco_medicao', label: 'Boletim de Medição por Placa', path: '/cco/medicao', legacyAlias: 'cco' },
      { key: 'cco_relatorios', label: 'Histórico & Exportação', path: '/cco/relatorios', legacyAlias: 'cco' },
      { key: 'cco_cadastros', label: 'Gestão de Cadastros (CCO)', path: '/cco/cadastros', legacyAlias: 'cco' },
    ],
  },
  {
    id: 'operacoes',
    module: 'Operações & Contratos',
    description: 'SSMA, treinamentos normativos, evolução de contratos e gestão de notificações/multas',
    pages: [
      { key: 'eventos', label: 'SSMA & Treinamentos', path: '/eventos' },
      { key: 'evolucao', label: 'Contratos', path: '/evolucao' },
      { key: 'notificacoes', label: 'Notificações/Multas', path: '/notificacoes' },
    ],
  },
  {
    id: 'sistema',
    module: 'Sistema & Governança',
    description: 'Configurações gerais e administração de usuários e acessos',
    pages: [
      { key: 'configuracoes', label: 'Configurações', path: '/configuracoes' },
      { key: 'admin', label: 'Administração & Controle de Usuários', path: '/admin' },
    ],
  },
];

export const PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

export const CCO_PAGE_KEYS = [
  'cco_painel',
  'cco_programacao',
  'cco_operacao',
  'cco_corretivas',
  'cco_medicao',
  'cco_relatorios',
  'cco_cadastros',
];

export const RH_AUSENCIAS_PAGE_KEYS = ['ponto', 'ferias', 'atestados'];
