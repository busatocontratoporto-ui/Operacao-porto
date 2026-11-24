import * as XLSX from 'xlsx-js-style';
import { parseExcelDate } from './excel';

export interface ParsedColaboradorRecord {
  nome: string;
  cpf: string | null;
  email: string;
  telefone: string;
  cargo: string;
  departamento: string;
  contrato_vinculado: string | null;
  turno: string;
  letra: string;
  frente_atendimento: string;
  polivalencia: string;
  status_colaborador: 'ATIVO' | 'RESERVA/CB' | 'AFASTADO' | 'DESLIGADO';
  data_admissao: string | null;
  ultima_ferias: string | null;
  escolaridade: string;
  graduacao: string;
  pos_graduacao: boolean;
  pos_graduacao_tipo: string;
}

export function normalizeCpf(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 11 ? digits.padStart(11, '0') : digits.slice(0, 11);
}

export function formatCpf(cpf?: string | null): string {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function normalizeCargo(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return 'Operador';
  const upper = s.toUpperCase();
  if (upper === 'MOTORISTA') return 'Motorista';
  if (upper === 'OPERADOR DE MINI CARREGADEIRA') return 'Operador de Mini Carregadeira';
  if (upper === 'OPERADOR DE EQUIPAMENTOS') return 'Operador de Equipamentos';
  if (upper === 'ENCARREGADO') return 'Encarregado';
  if (upper === 'SUPERVISOR') return 'Supervisor';
  if (upper === 'CCO') return 'CCO';
  if (upper === 'AUXILIAR ADMINISTRATIVO') return 'Auxiliar Administrativo';
  if (upper.includes('TECNICO DE SEGURANCA') || upper.includes('TECNICO DE SEGURANÇA')) {
    return upper.includes('II') ? 'Técnico de Segurança do Trabalho II' : 'Técnico de Segurança do Trabalho';
  }
  if (upper.includes('GERENTE')) return 'Gerente / Preposto';
  return s;
}

export function parseLetraTurno(raw: unknown): {
  turno: string;
  letra: string;
  statusHint?: 'RESERVA/CB' | 'AFASTADO';
} {
  const text = String(raw ?? '').trim().toUpperCase();
  if (!text) return { turno: '', letra: '' };
  if (text.includes('AFAST')) return { turno: '', letra: '', statusHint: 'AFASTADO' };
  if (text === 'ADM' || text.includes('ADMINISTRAT')) return { turno: 'adm', letra: '' };
  if (text.includes('CB')) {
    return {
      turno: '',
      letra: 'CB',
      statusHint: text.includes('RESERVA') ? 'RESERVA/CB' : undefined,
    };
  }
  const letra = text.includes('A') && !text.includes('DIA B') && !text.includes('NOITE B')
    ? (text.startsWith('B') ? 'B' : 'A')
    : text.startsWith('B')
      ? 'B'
      : text.startsWith('A')
        ? 'A'
        : '';

  const isNoite = text.includes('NOITE');
  const isDia = text.includes('DIA');
  if (isDia && letra === 'A') return { turno: 'dia_a', letra: 'A' };
  if (isDia && letra === 'B') return { turno: 'dia_b', letra: 'B' };
  if (isNoite && letra === 'A') return { turno: 'noite_a', letra: 'A' };
  if (isNoite && letra === 'B') return { turno: 'noite_b', letra: 'B' };
  return { turno: '', letra };
}

function inferDepartamentoPorto(cargo: string, atendimento: string): string {
  const c = cargo.toUpperCase();
  const a = atendimento.toUpperCase();
  if (c.includes('SEGURANÇA') || c.includes('SEGURANCA') || a === 'TST') return 'SSMA';
  if (c === 'CCO') return 'CCO';
  return 'Contrato Porto';
}

function getCol(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const entries = Object.entries(row);
  for (const cand of candidates) {
    const target = cand.trim().toLowerCase();
    const hit = entries.find(([k]) => k.trim().toLowerCase() === target);
    if (hit !== undefined && String(hit[1] ?? '').trim() !== '') return hit[1];
  }
  return '';
}

function mergeRecord(
  map: Map<string, ParsedColaboradorRecord>,
  rec: ParsedColaboradorRecord
) {
  const key = rec.cpf ? `cpf:${rec.cpf}` : `nome:${rec.nome.toUpperCase()}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, rec);
    return;
  }
  // If collaborator already exists in main Porto sheet and also appears in USINA, link both contracts
  if (existing.departamento !== rec.departamento && rec.departamento === 'Contrato Usina') {
    existing.contrato_vinculado = 'Contrato Usina';
  }
  if (!existing.telefone && rec.telefone) existing.telefone = rec.telefone;
  if (!existing.data_admissao && rec.data_admissao) existing.data_admissao = rec.data_admissao;
  if (!existing.ultima_ferias && rec.ultima_ferias) existing.ultima_ferias = rec.ultima_ferias;
  if (!existing.frente_atendimento && rec.frente_atendimento) existing.frente_atendimento = rec.frente_atendimento;
  if (!existing.polivalencia && rec.polivalencia) existing.polivalencia = rec.polivalencia;
}

/**
 * Lê tanto a planilha multi-abas padrão COLABORADORES PORTO.xlsx (Colaboradores, USINA, DESLIGADOS)
 * quanto planilhas simples de 1 aba.
 */
export async function parseColaboradoresWorkbook(buffer: ArrayBuffer): Promise<ParsedColaboradorRecord[]> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const map = new Map<string, ParsedColaboradorRecord>();

  const hasPortoLayout = wb.SheetNames.some((n) => {
    const u = n.trim().toUpperCase();
    return u === 'COLABORADORES' || u === 'USINA' || u === 'DESLIGADOS';
  });

  if (hasPortoLayout) {
    // 1. Aba principal: Colaboradores
    const colabSheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'COLABORADORES');
    if (colabSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[colabSheetName], { defval: '' });
      for (const row of rows) {
        const nome = String(getCol(row, 'NOME', 'Nome') || '').trim();
        const cpf = normalizeCpf(getCol(row, 'CPF'));
        if (!nome || (!cpf && nome.toUpperCase() === 'AFASTADO')) continue;

        const cargo = normalizeCargo(getCol(row, 'FUNÇÃO', 'FUNCAO', 'Cargo'));
        const atendimento = String(getCol(row, 'ATENDIMENTO', 'Atendimento') || '').trim();
        const rawStatus = String(getCol(row, 'STATUS', 'Status') || '').trim();
        const { turno, letra, statusHint } = parseLetraTurno(getCol(row, 'LETRA / TURNO', 'Turno'));

        let status_colaborador: ParsedColaboradorRecord['status_colaborador'] = statusHint || 'ATIVO';
        if (rawStatus.toUpperCase().includes('AFAST')) status_colaborador = 'AFASTADO';

        const isSharedUsina = rawStatus.toUpperCase().includes('USINA');
        const departamento = inferDepartamentoPorto(cargo, atendimento);

        mergeRecord(map, {
          nome,
          cpf: cpf || null,
          email: String(getCol(row, 'E-MAIL', 'EMAIL', 'Email') || '').trim(),
          telefone: String(getCol(row, 'CONTATO', 'TELEFONE', 'Telefone') || '').trim(),
          cargo,
          departamento,
          contrato_vinculado: isSharedUsina ? 'Contrato Usina' : 'Contrato Porto',
          turno,
          letra,
          frente_atendimento: atendimento,
          polivalencia: rawStatus,
          status_colaborador,
          data_admissao: parseExcelDate(getCol(row, 'DATA DE ADMISSÃO', 'DATA ADMISSÃO', 'Data Admissão', 'Admissão')),
          ultima_ferias: parseExcelDate(getCol(row, 'ÚLTIMA DATA DE FÉRIAS', 'ÚLTIMA FÉRIAS', 'ULTIMA FERIAS', 'Última Férias')),
          escolaridade: String(getCol(row, 'ESCOLARIDADE', 'Escolaridade') || '').trim(),
          graduacao: String(getCol(row, 'GRADUAÇÃO', 'Graduacao') || '').trim(),
          pos_graduacao: String(getCol(row, 'PÓS-GRADUAÇÃO', 'Pos-Graduacao') || '').toLowerCase() === 'sim',
          pos_graduacao_tipo: String(getCol(row, 'TIPO PÓS-GRADUAÇÃO', 'Tipo Pos-Graduacao') || '').trim(),
        });
      }
    }

    // 2. Aba USINA (linha 0 contém apenas "USINA", registros a partir da linha 1)
    const usinaSheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'USINA');
    if (usinaSheetName) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[usinaSheetName], { header: 1, defval: '' });
      for (let i = 1; i < matrix.length; i++) {
        const r = matrix[i] || [];
        const nome = String(r[1] ?? '').trim();
        if (!nome) continue;
        const cpf = normalizeCpf(r[0]);
        const cargo = normalizeCargo(r[2]);
        const { turno, letra, statusHint } = parseLetraTurno(r[3]);
        const col4 = String(r[4] ?? '').trim();
        const col5 = String(r[5] ?? '').trim();
        const col6 = String(r[6] ?? '').trim();

        // Linha 1 de USINA às vezes tem telefone em col5 ou observação em col6
        const looksLikePhone = (v: string) => /\d{4,}/.test(v.replace(/\D/g, ''));
        const atendimento = looksLikePhone(col4) ? '' : col4;
        const telefone = looksLikePhone(col5) ? col5 : looksLikePhone(col4) ? col4 : '';
        const obs = col6 && col6.toUpperCase() !== 'USINA' ? col6 : '';

        mergeRecord(map, {
          nome,
          cpf: cpf || null,
          email: '',
          telefone,
          cargo,
          departamento: 'Contrato Usina',
          contrato_vinculado: 'Contrato Usina',
          turno,
          letra,
          frente_atendimento: atendimento,
          polivalencia: obs,
          status_colaborador: statusHint || 'ATIVO',
          data_admissao: null,
          ultima_ferias: null,
          escolaridade: '',
          graduacao: '',
          pos_graduacao: false,
          pos_graduacao_tipo: '',
        });
      }
    }

    // 3. Aba DESLIGADOS
    const desligadosSheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'DESLIGADOS');
    if (desligadosSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[desligadosSheetName], { defval: '' });
      for (const row of rows) {
        const nome = String(getCol(row, 'NOME', 'Nome') || '').trim();
        if (!nome) continue;
        const cpf = normalizeCpf(getCol(row, 'CPF'));
        const cargo = normalizeCargo(getCol(row, 'FUNÇÃO', 'FUNCAO', 'Cargo'));
        const atendimento = String(getCol(row, 'ATENDIMENTO', 'Atendimento') || '').trim();
        const rawStatus = String(getCol(row, 'STATUS', 'Status') || '').trim();
        const { turno, letra } = parseLetraTurno(getCol(row, 'LETRA / TURNO', 'Turno'));

        mergeRecord(map, {
          nome,
          cpf: cpf || null,
          email: '',
          telefone: String(getCol(row, 'CONTATO', 'TELEFONE') || '').trim(),
          cargo,
          departamento: inferDepartamentoPorto(cargo, atendimento),
          contrato_vinculado: 'Contrato Porto',
          turno,
          letra,
          frente_atendimento: atendimento,
          polivalencia: rawStatus || 'DESLIGADO',
          status_colaborador: 'DESLIGADO',
          data_admissao: parseExcelDate(getCol(row, 'DATA DE ADMISSÃO', 'DATA ADMISSÃO', 'Data Admissão')),
          ultima_ferias: parseExcelDate(getCol(row, 'ÚLTIMA DATA DE FÉRIAS', 'ÚLTIMA FÉRIAS')),
          escolaridade: '',
          graduacao: '',
          pos_graduacao: false,
          pos_graduacao_tipo: '',
        });
      }
    }

    return Array.from(map.values());
  }

  // Fallback para planilhas genéricas de 1 aba
  const sheetName = wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
  for (const row of rawRows) {
    const nome = String(getCol(row, 'Nome', 'NOME', 'Colaborador') || '').trim();
    if (!nome) continue;
    const cpf = normalizeCpf(getCol(row, 'CPF', 'cpf'));
    const cargo = normalizeCargo(getCol(row, 'Cargo', 'Função', 'FUNÇÃO'));
    const atendimento = String(getCol(row, 'Atendimento', 'ATENDIMENTO', 'Frente') || '').trim();
    const departamento = String(getCol(row, 'Departamento', 'DEPARTAMENTO') || '').trim() || inferDepartamentoPorto(cargo, atendimento);
    const { turno, letra, statusHint } = parseLetraTurno(getCol(row, 'Turno', 'LETRA / TURNO', 'Escala'));
    const letraExplicita = String(getCol(row, 'Letra', 'LETRA') || '').trim().toUpperCase();

    mergeRecord(map, {
      nome,
      cpf: cpf || null,
      email: String(getCol(row, 'Email', 'E-mail', 'EMAIL') || '').trim(),
      telefone: String(getCol(row, 'Telefone', 'Contato', 'CONTATO') || '').trim(),
      cargo,
      departamento,
      contrato_vinculado: String(getCol(row, 'Contrato', 'Contrato Vinculado') || '').trim() || null,
      turno,
      letra: letraExplicita || letra,
      frente_atendimento: atendimento,
      polivalencia: String(getCol(row, 'Polivalência', 'Polivalencia', 'Status') || '').trim(),
      status_colaborador: statusHint || 'ATIVO',
      data_admissao: parseExcelDate(getCol(row, 'Data Admissão', 'Data de Admissão', 'Data Admissao', 'Admissão')),
      ultima_ferias: parseExcelDate(getCol(row, 'Última Férias', 'Última Data de Férias', 'Ultima Ferias', 'Últimas Férias')),
      escolaridade: String(getCol(row, 'Escolaridade') || '').trim(),
      graduacao: String(getCol(row, 'Graduação', 'Graduacao') || '').trim(),
      pos_graduacao: String(getCol(row, 'Pós-Graduação', 'Pos-Graduacao') || '').toLowerCase() === 'sim',
      pos_graduacao_tipo: String(getCol(row, 'Tipo Pós-Graduação', 'Tipo Pos-Graduacao') || '').trim(),
    });
  }

  return Array.from(map.values());
}

export type FeriasSituacao = 'VENCIDA' | 'VENCENDO' | 'EM_DIA' | 'SEM_DATA';

export interface FeriasElegibilidade {
  dataBase: string | null; // última férias (preferencial) ou data de admissão
  origemBase: 'ULTIMA_FERIAS' | 'ADMISSAO' | null;
  proximoVencimento: string | null; // dataBase + 1 ano
  diasParaVencer: number | null;
  situacao: FeriasSituacao;
}

export function calcularSituacaoFerias(
  dataAdmissao?: string | null,
  ultimaFerias?: string | null
): FeriasElegibilidade {
  const baseStr = ultimaFerias || dataAdmissao || null;
  if (!baseStr) {
    return {
      dataBase: null,
      origemBase: null,
      proximoVencimento: null,
      diasParaVencer: null,
      situacao: 'SEM_DATA',
    };
  }
  const baseDate = new Date(`${baseStr}T00:00:00`);
  if (isNaN(baseDate.getTime())) {
    return {
      dataBase: null,
      origemBase: null,
      proximoVencimento: null,
      diasParaVencer: null,
      situacao: 'SEM_DATA',
    };
  }
  const venc = new Date(baseDate);
  venc.setFullYear(venc.getFullYear() + 1);
  const vencIso = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-${String(
    venc.getDate()
  ).padStart(2, '0')}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((venc.getTime() - today.getTime()) / 86400000);

  let situacao: FeriasSituacao = 'EM_DIA';
  if (diffDays <= 0) situacao = 'VENCIDA';
  else if (diffDays <= 60) situacao = 'VENCENDO';

  return {
    dataBase: baseStr,
    origemBase: ultimaFerias ? 'ULTIMA_FERIAS' : 'ADMISSAO',
    proximoVencimento: vencIso,
    diasParaVencer: diffDays,
    situacao,
  };
}
