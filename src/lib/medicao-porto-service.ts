import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// CICLO FIXO DE FECHAMENTO PORTO: 21 DO MÊS ANTERIOR A 20 DO MÊS SEGUINTE
// Ex: Ciclo "2026-11" (Novembro/2026) => 2026-10-21 até 2026-11-20
// ============================================================================

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export interface MedicaoCycle {
  key: string; // YYYY-MM (mês de referência do fechamento, que termina no dia 20)
  year: number;
  month: number; // 1..12
  monthName: string;
  label: string; // "Novembro/2026"
  shortRangeLabel: string; // "21/10/2026 a 20/11/2026"
  fullLabel: string; // "Novembro/2026 (21/10/2026 a 20/11/2026)"
  startIso: string; // YYYY-MM-DD (dia 21 do mês anterior)
  endIso: string; // YYYY-MM-DD (dia 20 do mês de referência)
  totalDays: number;
  dates: string[]; // lista completa YYYY-MM-DD de 21..20
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatIsoToBr(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatShortDayMonth(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function buildCycleFromYearMonth(year: number, month: number): MedicaoCycle {
  // month is 1..12 (closing month ending on day 20)
  const prevDate = new Date(Date.UTC(year, month - 2, 21));
  const endDate = new Date(Date.UTC(year, month - 1, 20));

  const startIso = `${prevDate.getUTCFullYear()}-${pad2(prevDate.getUTCMonth() + 1)}-21`;
  const endIso = `${endDate.getUTCFullYear()}-${pad2(endDate.getUTCMonth() + 1)}-20`;

  const dates: string[] = [];
  const cursor = new Date(prevDate.getTime());
  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(
      `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const monthName = MONTH_NAMES_PT[month - 1] || `Mês ${month}`;
  const key = `${year}-${pad2(month)}`;
  const label = `${monthName}/${year}`;
  const shortRangeLabel = `${formatIsoToBr(startIso)} a ${formatIsoToBr(endIso)}`;

  return {
    key,
    year,
    month,
    monthName,
    label,
    shortRangeLabel,
    fullLabel: `${label} (${shortRangeLabel})`,
    startIso,
    endIso,
    totalDays: dates.length,
    dates,
  };
}

export function getCycleByKey(key: string): MedicaoCycle {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return getCurrentPortoCycle();
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return getCurrentPortoCycle();
  return buildCycleFromYearMonth(year, month);
}

/**
 * Dado uma data YYYY-MM-DD, retorna a chave YYYY-MM do ciclo 21..20 correspondente:
 * - Dias 01..20 pertencem ao fechamento do próprio mês (MM/YYYY)
 * - Dias 21..31 pertencem ao fechamento do mês seguinte (MM+1/YYYY)
 */
export function getCycleKeyForDate(dateIso: string): string {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return getCurrentPortoCycle().key;
  let year = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (day >= 21) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return `${year}-${pad2(month)}`;
}

export function getCurrentPortoCycle(): MedicaoCycle {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return getCycleByKey(getCycleKeyForDate(todayIso));
}

export function shiftCycleKey(key: string, deltaMonths: number): string {
  const cur = getCycleByKey(key);
  const d = new Date(Date.UTC(cur.year, cur.month - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function listCycleOptions(centerKey?: string): MedicaoCycle[] {
  const base = centerKey ? getCycleByKey(centerKey) : getCurrentPortoCycle();
  const list: MedicaoCycle[] = [];
  for (let offset = -12; offset <= 6; offset++) {
    list.push(getCycleByKey(shiftCycleKey(base.key, offset)));
  }
  return list;
}

// ============================================================================
// CONVERSÕES DE HORAS E MINUTOS (PADRÃO EXCEL HH:MM / HH:MM:SS)
// ============================================================================

export function parseDurationToMinutes(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;

  if (typeof val === 'number') {
    if (!isFinite(val)) return 0;
    // No Excel, fração de dia: 1.0 = 24h = 1440 min (ex: 0.4375 = 10:30 = 630 min)
    // Se alguém digitou horas decimais diretas > 2.5 em contexto manual tratamos separado,
    // mas células de tempo Excel vêm como fração de 24h.
    return Math.round(val * 24 * 60);
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return 0;
    return val.getHours() * 60 + val.getMinutes() + Math.round(val.getSeconds() / 60);
  }

  const s = String(val).trim();
  if (!s) return 0;

  // Formato com AM/PM vindo de w do Excel (ex: "12:30:00 AM" => 00:30, "10:30:00 AM" => 10:30)
  const ampm = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const sec = ampm[3] ? parseInt(ampm[3], 10) : 0;
    const period = ampm[4].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    else if (period === 'PM' && h < 12) h += 12;
    return h * 60 + m + Math.round(sec / 60);
  }

  // Formato HH:MM ou HHH:MM:SS (suporta negativo "-02:15")
  const sign = s.startsWith('-') ? -1 : 1;
  const clean = s.replace(/^-/, '').trim();
  const hm = clean.match(/^(\d{1,4}):(\d{2})(?::(\d{2}))?$/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const m = parseInt(hm[2], 10);
    const sec = hm[3] ? parseInt(hm[3], 10) : 0;
    return sign * (h * 60 + m + Math.round(sec / 60));
  }

  const num = Number(s.replace(',', '.'));
  if (!isNaN(num)) {
    if (Math.abs(num) <= 1) return Math.round(num * 24 * 60);
    return Math.round(num * 60);
  }

  return 0;
}

export function parseClockTimeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const s = String(hhmm).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 24 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function formatMinutesToHHMM(totalMin: number, showZero = true): string {
  if (!totalMin && !showZero) return '';
  const sign = totalMin < 0 ? '-' : '';
  const abs = Math.round(Math.abs(totalMin));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${pad2(h)}:${pad2(m)}`;
}

export function formatMinutesToHHMMSS(totalMin: number): string {
  const sign = totalMin < 0 ? '-' : '';
  const absSec = Math.round(Math.abs(totalMin) * 60);
  const h = Math.floor(absSec / 3600);
  const m = Math.floor((absSec % 3600) / 60);
  const s = absSec % 60;
  return `${sign}${h}:${pad2(m)}:${pad2(s)}`;
}

export function formatCurrencyBRL(val: number): string {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPct(ratioOrPct: number, isRatio = true, decimals = 2): string {
  const pct = isRatio ? (ratioOrPct || 0) * 100 : ratioOrPct || 0;
  return `${pct.toFixed(decimals).replace('.', ',')}%`;
}

// ============================================================================
// CATÁLOGO CONTRATUAL PADRÃO FROTA (QQP) - EXTRAÍDO DO MODELO OFICIAL
// ============================================================================

export interface QqpContractItem {
  ordem: number;
  tipoQqp: string;
  turno: '12h' | '24h';
  regimeDf: '12h' | '24h';
  frente: 'MFE' | 'TPM';
  grupo: string;
  valorEq: number; // K: Valor Unitário EQ (R$)
  valorHr: number; // L: Valor Unitário HR (R$)
  valorMo: number; // O: Valor Unitário MO (R$)
  valorHrCheia: number; // P: Valor Medição HR Cheia (R$)
}

export const DEFAULT_QQP_CATALOG: QqpContractItem[] = [
  { ordem: 1, tipoQqp: 'BUSATO_CAMINHÃO BASCULANTE 16TON - TPM - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'BASCULANTE 16TON', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 2, tipoQqp: 'BUSATO_CAMINHÃO BASCULANTE 16TON - TPM - TERCEIROS_02', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'BASCULANTE 16TON', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 3, tipoQqp: 'BUSATO_CAMINHÃO BASCULANTE 6M³ - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'BASCULANTE 6M³', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 4, tipoQqp: 'BUSATO_CAMINHÃO BROOK - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'BROOK', valorEq: 13556.36, valorHr: 65.65, valorMo: 18079.70, valorHrCheia: 20679.75 },
  { ordem: 5, tipoQqp: 'BUSATO_CAMINHÃO BROOK - TPM - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'BROOK', valorEq: 13556.36, valorHr: 65.65, valorMo: 18079.70, valorHrCheia: 20679.75 },
  { ordem: 6, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'PIPA ASPERSÃO', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 7, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_02', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'PIPA ASPERSÃO', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 8, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_03', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'PIPA ASPERSÃO', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 9, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_04', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'PIPA ASPERSÃO', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 10, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - TPM - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'PIPA ASPERSÃO', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 11, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - TPM - TERCEIROS_03', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'PIPA ASPERSÃO', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 12, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_05', turno: '24h', regimeDf: '24h', frente: 'MFE', grupo: 'PIPA ASPERSÃO 24h', valorEq: 15125.38, valorHr: 68.59, valorMo: 37485.27, valorHrCheia: 43211.70 },
  { ordem: 13, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO - TPM - TERCEIROS_02', turno: '24h', regimeDf: '24h', frente: 'TPM', grupo: 'PIPA ASPERSÃO 24h', valorEq: 15125.38, valorHr: 68.59, valorMo: 37485.27, valorHrCheia: 43211.70 },
  { ordem: 14, tipoQqp: 'BUSATO_CAMINHÃO PIPA LIMPEZA - MFE - TERCEIROS_02', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'PIPA LIMPEZA', valorEq: 15125.38, valorHr: 68.59, valorMo: 18079.70, valorHrCheia: 21605.85 },
  { ordem: 15, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO VIAS - MFE - TERCEIROS_02', turno: '12h', regimeDf: '24h', frente: 'MFE', grupo: 'PIPA LIMPEZA', valorEq: 15125.38, valorHr: 68.59, valorMo: 19732.04, valorHrCheia: 25839.45 },
  { ordem: 16, tipoQqp: 'BUSATO_CAMINHÃO PIPA LIMPEZA - MFE - TERCEIROS_01', turno: '24h', regimeDf: '24h', frente: 'MFE', grupo: 'PIPA LIMPEZA 24h', valorEq: 15125.38, valorHr: 68.59, valorMo: 37485.27, valorHrCheia: 43211.70 },
  { ordem: 17, tipoQqp: 'BUSATO_CAMINHÃO PIPA LIMPEZA - TPM - TERCEIROS_01', turno: '24h', regimeDf: '24h', frente: 'TPM', grupo: 'PIPA LIMPEZA 24h', valorEq: 15125.38, valorHr: 68.59, valorMo: 37485.27, valorHrCheia: 43211.70 },
  { ordem: 18, tipoQqp: 'BUSATO_CAMINHÃO PIPA ASPERSÃO VIAS - MFE - TERCEIROS_01', turno: '24h', regimeDf: '24h', frente: 'MFE', grupo: 'PIPA LIMPEZA 24h', valorEq: 15125.38, valorHr: 68.59, valorMo: 19732.04, valorHrCheia: 25839.45 },
  { ordem: 19, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_02', turno: '24h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI CARREGADEIRA 226B 24h', valorEq: 9037.57, valorHr: 86.40, valorMo: 37485.27, valorHrCheia: 43104.60 },
  { ordem: 20, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - TPM - TERCEIROS_01', turno: '24h', regimeDf: '12h', frente: 'TPM', grupo: 'MINI CARREGADEIRA 226B 24h', valorEq: 9037.57, valorHr: 86.40, valorMo: 64563.12, valorHrCheia: 21552.30 },
  { ordem: 21, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - TPM - TERCEIROS_03', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'MINI CARREGADEIRA 226B', valorEq: 9037.57, valorHr: 86.40, valorMo: 35754.06, valorHrCheia: 54432.00 },
  { ordem: 22, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI CARREGADEIRA 226B', valorEq: 9037.57, valorHr: 86.40, valorMo: 35754.06, valorHrCheia: 54432.00 },
  { ordem: 23, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_03', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI CARREGADEIRA 226B', valorEq: 9037.57, valorHr: 86.40, valorMo: 17253.53, valorHrCheia: 27216.00 },
  { ordem: 24, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_04', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI CARREGADEIRA 226B', valorEq: 9037.57, valorHr: 86.40, valorMo: 17253.53, valorHrCheia: 27216.00 },
  { ordem: 25, tipoQqp: 'BUSATO_MINI CARREGADEIRA 226B - TPM - TERCEIROS_02', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'MINI CARREGADEIRA 226B', valorEq: 9037.57, valorHr: 86.40, valorMo: 17253.53, valorHrCheia: 27216.00 },
  { ordem: 26, tipoQqp: 'BUSATO_MINI CARR. 226B REMOTA - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI CARR. 226B REMOTA', valorEq: 9037.57, valorHr: 86.40, valorMo: 17253.53, valorHrCheia: 27216.00 },
  { ordem: 27, tipoQqp: 'BUSATO_MINI ESCAVADEIRA 303.5 - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI ESCAVADEIRA 303.5', valorEq: 8033.40, valorHr: 78.61, valorMo: 17253.53, valorHrCheia: 27216.00 },
  { ordem: 28, tipoQqp: 'BUSATO_MINI ESCAVADEIRA 303.5 - MFE - TERCEIROS_02', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'MINI ESCAVADEIRA 303.5', valorEq: 8033.40, valorHr: 78.61, valorMo: 17253.53, valorHrCheia: 27216.00 },
  { ordem: 29, tipoQqp: 'BUSATO_MINI CARR. S70 REMOTA - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'S70 REMOTA', valorEq: 5271.92, valorHr: 78.61, valorMo: 19732.04, valorHrCheia: 24762.15 },
  { ordem: 30, tipoQqp: 'BUSATO_MINI CARR. S70 REMOTA - TPM - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'S70 REMOTA', valorEq: 5271.92, valorHr: 78.61, valorMo: 19732.04, valorHrCheia: 24762.15 },
  { ordem: 31, tipoQqp: 'BUSATO_RETROESCAVADEIRA 416D - MFE - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'RETROESCAVADEIRA 416D', valorEq: 11548.01, valorHr: 82.03, valorMo: 17253.53, valorHrCheia: 24762.15 },
  { ordem: 32, tipoQqp: 'BUSATO_RETROESCAVADEIRA 416D - MFE - TERCEIROS_02', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'RETROESCAVADEIRA 416D', valorEq: 11548.01, valorHr: 82.03, valorMo: 19732.04, valorHrCheia: 54009.90 },
  { ordem: 33, tipoQqp: 'BUSATO_RETROESCAVADEIRA 416D - MFE - TERCEIROS_03', turno: '12h', regimeDf: '12h', frente: 'MFE', grupo: 'RETROESCAVADEIRA 416D', valorEq: 11548.01, valorHr: 82.03, valorMo: 19732.04, valorHrCheia: 25839.45 },
  { ordem: 34, tipoQqp: 'BUSATO_RETROESCAVADEIRA 416D - TPM - TERCEIROS_01', turno: '12h', regimeDf: '12h', frente: 'TPM', grupo: 'RETROESCAVADEIRA 416D', valorEq: 11548.01, valorHr: 82.03, valorMo: 19732.04, valorHrCheia: 25839.45 },
];

// ============================================================================
// ESTRUTURAS DE DADOS DAS 4 SUBABAS
// ============================================================================

/** Subaba 1: Lançamentos (Espelho exato da aba BD do Excel) */
export interface BdLancamentoInput {
  id: string;
  os: string; // O: O.S + COMPLEMENTAR
  pde: string; // P: PDE
  tipoQqp: string; // Q: Tipo | QQP
  placaTag: string; // R: Placa / Tag
  matricula: string; // S: Matrícula / Operador
  operadorNome?: string;
  data: string; // T: Data ISO YYYY-MM-DD
  horaInicial: string; // V: HH:MM (ex: 07:00 ou 19:00)
  horaFinal: string; // W: HH:MM (ex: 17:30 ou 05:30)
  horaExtra50?: string; // X: HH:MM
  horaExtra100?: string; // Y: HH:MM
  intervalo?: string; // Z: HH:MM
  manutencao?: string; // AA: HH:MM
  desviosAtrasos?: string; // AB: HH:MM (Perdas p/ DF)
  diferencaGarantia?: string; // AD: HH:MM
  horimetroInicial?: number | null; // AF
  horimetroFinal?: number | null; // AG
  horimetroRealizadoManual?: number | null; // Caso lançado direto sem inicial/final
  ccVale?: string; // AL: CC / PA Vale
  localVale?: string; // AM: Local Vale
  observacao?: string; // AN: Observação
  empresa?: string; // AO: Empresa (ex: VALE)
}

export interface BdLancamentoComputed extends BdLancamentoInput {
  subtotalMin: number; // AC
  totalHorasMin: number; // AE
  manutencaoMin: number; // AA
  desviosMin: number; // AB
  perdaTotalMin: number; // AA + AB (ou AB conforme planilha)
  horasExecutadasMin: number; // CA = AE - AB
  aderenciaLinhaRatio: number; // BZ = 1 - (AB / AE)
  horimetroRealizado: number; // AH = AG - AF
  horimetroDisponivel: number; // AI = (AE em horas) - AH
}

/** Subaba 3: BD Vale (Espelho da aba BD Real importada da Vale) */
export interface BdValeRow {
  id: string;
  os: string; // A: OS (ex: 2026S31699)
  tipo: string; // B: Spot / Habitual
  dono: string; // C: BUSATO
  ga: string; // D: Gerência Área
  gg: string; // E: Gerência Geral
  dataProg: string; // F: YYYY-MM-DD
  horaInicioProg: string; // G: HH:MM
  horaFimProg: string; // H: HH:MM
  duracaoProgMin: number; // I: minutos programados
  semana: string; // J
  inicioLibParcial?: string; // O
  fimLibParcial?: string; // P
  duracaoLibParcialMin: number; // Q
  responsavelLibParcial?: string; // R
  justificativaLibParcial?: string; // S
  equipamento: string; // T / Y: BUSATO_...
  dataExec: string; // Z: YYYY-MM-DD
  inicioExec: string; // AA: HH:MM
  fimExec: string; // AB: HH:MM
  duracaoExecMin: number; // AC: minutos executados
  aderenciaStatus: string; // AD: "Sim" | "Não" | "Liberada"
  intersecaoPct: number; // AE (0..1)
  aderenciaRatio: number; // AG (0..1, ex: 1.0 = 100%, 0.9524 = 95.24%)
}

export interface DfCycleParams {
  diasMedicaoOverride?: number | null; // null = usa dias reais do ciclo 21..20 (ex: 31)
  horasTurnoMin: number; // padrão 630 (10:30)
  preventivaMfeMin: number; // padrão 240 (04:00)
  preventivaTpmMin: number; // padrão 240 (04:00)
  fonteAderenciaMemoria: 'BUSATO' | 'VALE';
}

export interface QqpCycleOverride {
  turno?: '12h' | '24h';
  regimeDf?: '12h' | '24h';
  grupo?: string;
  valorEq?: number;
  valorHr?: number;
  valorMo?: number;
  valorHrCheia?: number;
  aderenciaValeManualRatio?: number | null; // 0..1 (ex: 0.9928)
}

export interface MemoriaItemComplementar {
  id: string;
  categoria: 'CUSTO_INDIRETO' | 'MOBILIZACAO' | 'EVENTUAL' | 'AJUSTE_DESCONTO';
  descricao: string;
  referenciaCc?: string;
  horas?: number;
  valor: number; // positivo soma no fechamento, negativo desconta
}

export interface MedicaoPortoCyclePayload {
  cycleKey: string;
  lancamentos: BdLancamentoInput[];
  bdVale: BdValeRow[];
  dfParams: DfCycleParams;
  qqpOverrides: Record<string, QqpCycleOverride>;
  itensComplementares: MemoriaItemComplementar[];
  updatedAt: string;
}

export function createEmptyCyclePayload(cycleKey: string): MedicaoPortoCyclePayload {
  return {
    cycleKey,
    lancamentos: [],
    bdVale: [],
    dfParams: {
      diasMedicaoOverride: null,
      horasTurnoMin: 630, // 10:30
      preventivaMfeMin: 240, // 04:00
      preventivaTpmMin: 240, // 04:00
      fonteAderenciaMemoria: 'BUSATO',
    },
    qqpOverrides: {},
    itensComplementares: [
      {
        id: 'ci-loc',
        categoria: 'CUSTO_INDIRETO',
        descricao: 'CUSTO FIXO INDIRETO - LOCAÇÃO',
        valor: 0,
      },
      {
        id: 'ci-mo',
        categoria: 'CUSTO_INDIRETO',
        descricao: 'CUSTO FIXO INDIRETO - MO',
        valor: 0,
      },
      {
        id: 'mob-01',
        categoria: 'MOBILIZACAO',
        descricao: 'MOBILIZAÇÃO / DESMOBILIZAÇÃO',
        valor: 0,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// MOTOR DE CÁLCULO 1: LANÇAMENTOS (ABA BD)
// ============================================================================

export function computeBdLancamento(row: BdLancamentoInput): BdLancamentoComputed {
  const vMin = parseClockTimeToMinutes(row.horaInicial);
  const wMin = parseClockTimeToMinutes(row.horaFinal);
  const xMin = parseDurationToMinutes(row.horaExtra50);
  const yMin = parseDurationToMinutes(row.horaExtra100);
  const zMin = parseDurationToMinutes(row.intervalo);
  const aaMin = parseDurationToMinutes(row.manutencao);
  const abMin = parseDurationToMinutes(row.desviosAtrasos);
  const adMin = parseDurationToMinutes(row.diferencaGarantia);

  // Fórmula Excel AC:
  // =IF(V3>0, IF(V3<W3, W3-(V3+X3+Y3+Z3+AA3), (24:00-(V3+X3+Y3+AA3+Z3)+W3)), "")
  let subtotalMin = 0;
  if (vMin !== null && wMin !== null) {
    const deductions = vMin + xMin + yMin + zMin + aaMin;
    if (vMin < wMin) {
      subtotalMin = Math.max(0, wMin - deductions);
    } else if (vMin > wMin) {
      subtotalMin = Math.max(0, 1440 - deductions + wMin);
    } else {
      subtotalMin = 0;
    }
  }

  // Fórmula Excel AE: =AC + AD + X + Y
  const totalHorasMin = subtotalMin > 0 || adMin > 0 || xMin > 0 || yMin > 0
    ? Math.max(0, subtotalMin + adMin + xMin + yMin)
    : 0;

  // Fórmula Excel AH: =AG - AF (ou valor manual caso informado direto)
  let horimetroRealizado = 0;
  if (
    row.horimetroInicial !== null &&
    row.horimetroInicial !== undefined &&
    row.horimetroFinal !== null &&
    row.horimetroFinal !== undefined &&
    Number(row.horimetroFinal) >= Number(row.horimetroInicial)
  ) {
    horimetroRealizado = Number((Number(row.horimetroFinal) - Number(row.horimetroInicial)).toFixed(2));
  } else if (row.horimetroRealizadoManual !== null && row.horimetroRealizadoManual !== undefined) {
    horimetroRealizado = Number(Number(row.horimetroRealizadoManual).toFixed(2));
  }

  // Fórmula Excel AI: =(AE*24) - AH
  const totalHorasDecimal = totalHorasMin / 60;
  const horimetroDisponivel = totalHorasMin > 0
    ? Number((totalHorasDecimal - horimetroRealizado).toFixed(2))
    : 0;

  // Na planilha modelo, Desvios/Atrasos + Paradas que impactam DF vão em AB (e AA quando lançado em Manut.)
  const perdaTotalMin = abMin + aaMin;
  const horasExecutadasMin = Math.max(0, totalHorasMin - abMin);
  const aderenciaLinhaRatio = totalHorasMin > 0
    ? Math.max(0, Math.min(1, 1 - abMin / totalHorasMin))
    : 1;

  return {
    ...row,
    subtotalMin,
    totalHorasMin,
    manutencaoMin: aaMin,
    desviosMin: abMin,
    perdaTotalMin,
    horasExecutadasMin,
    aderenciaLinhaRatio,
    horimetroRealizado,
    horimetroDisponivel,
  };
}

// ============================================================================
// MOTOR DE CÁLCULO 2: DF / ADERÊNCIA (ABA DF - SOMENTE)
// ============================================================================

export interface DfEquipmentRow {
  ordem: number;
  tipoQqp: string;
  frente: 'MFE' | 'TPM';
  grupo: string;
  turnoMemoria: '12h' | '24h';
  regimeDf: '12h' | '24h';
  horasDiaMin: number; // AI: 10:30 (630 min)
  perdasMin: number; // AJ: SUMIF(BD!Q, item, BD!AB)
  limitePerda5PctMin: number; // AU / AL: 5% de AW
  limitePerda90PctMin: number; // AV: 10% (31:30 p/ 12h, 625:00 ou 10% p/ 24h)
  restanteEm95Min: number; // AM: AU - AJ (pode ficar negativo se estourou os 5%)
  restanteEm90Min: number; // AN: AV - AJ
  restanteTotalMin: number; // AP: AW - AJ (Horas Trabalhadas Mês)
  totalHorasMetaMin: number; // AW: Meta de Horas Mês (ex: 321:30 ou 647:00)
  saldoLimite95Ratio: number; // AQ: AM / AU
  aderenciaTotalRatio: number; // AS: AP / AW
  somaHorimetro: number; // D na Memória: SUMIF(BD!Q, item, BD!AH)
  qtdLancamentos: number;
  // Matriz diária 21..20
  perdasPorDiaMin: Record<string, number>;
  horasTotaisPorDiaMin: Record<string, number>;
  horimetroPorDia: Record<string, number>;
}

export function buildEffectiveCatalog(
  overrides: Record<string, QqpCycleOverride>,
  extraQqpNames: string[] = []
): QqpContractItem[] {
  const base = DEFAULT_QQP_CATALOG.map((item) => {
    const ov = overrides[item.tipoQqp];
    if (!ov) return { ...item };
    return {
      ...item,
      turno: ov.turno || item.turno,
      regimeDf: ov.regimeDf || item.regimeDf,
      grupo: ov.grupo ?? item.grupo,
      valorEq: ov.valorEq !== undefined ? ov.valorEq : item.valorEq,
      valorHr: ov.valorHr !== undefined ? ov.valorHr : item.valorHr,
      valorMo: ov.valorMo !== undefined ? ov.valorMo : item.valorMo,
      valorHrCheia: ov.valorHrCheia !== undefined ? ov.valorHrCheia : item.valorHrCheia,
    };
  });

  const known = new Set(base.map((b) => b.tipoQqp.trim().toUpperCase()));
  let maxOrdem = base.length;

  for (const rawName of extraQqpNames) {
    const clean = String(rawName || '').trim();
    if (!clean || known.has(clean.toUpperCase())) continue;
    known.add(clean.toUpperCase());
    const isTpm = clean.toUpperCase().includes('TPM');
    const is24 = clean.toUpperCase().includes('24H');
    const ov = overrides[clean] || {};
    base.push({
      ordem: ++maxOrdem,
      tipoQqp: clean,
      turno: ov.turno || (is24 ? '24h' : '12h'),
      regimeDf: ov.regimeDf || (is24 ? '24h' : '12h'),
      frente: isTpm ? 'TPM' : 'MFE',
      grupo: ov.grupo || 'OUTROS / EVENTUAL',
      valorEq: ov.valorEq ?? 0,
      valorHr: ov.valorHr ?? 0,
      valorMo: ov.valorMo ?? 0,
      valorHrCheia: ov.valorHrCheia ?? 0,
    });
  }

  return base;
}

export function computeDfTable(
  cycle: MedicaoCycle,
  catalog: QqpContractItem[],
  lancamentos: BdLancamentoComputed[],
  params: DfCycleParams
): {
  rows: DfEquipmentRow[];
  diasMedicao: number;
  mediaAderenciaRatio: number;
  totalMetaMin: number;
  totalPerdasMin: number;
  totalTrabalhadoMin: number;
} {
  const diasMedicao =
    params.diasMedicaoOverride && params.diasMedicaoOverride > 0
      ? params.diasMedicaoOverride
      : cycle.totalDays;
  const horasTurnoMin = params.horasTurnoMin || 630; // 10:30

  // Indexa lançamentos por Tipo | QQP normalizado
  const byQqp = new Map<string, BdLancamentoComputed[]>();
  for (const l of lancamentos) {
    const key = (l.tipoQqp || '').trim().toUpperCase();
    if (!key) continue;
    const arr = byQqp.get(key) || [];
    arr.push(l);
    byQqp.set(key, arr);
  }

  const rows: DfEquipmentRow[] = catalog.map((item) => {
    const key = item.tipoQqp.trim().toUpperCase();
    const itemLancs = byQqp.get(key) || [];

    const preventivaMin =
      item.frente === 'TPM'
        ? params.preventivaTpmMin ?? 240
        : params.preventivaMfeMin ?? 240;

    // Fórmula Excel AW:
    // 12h => (BE54 * BH57) - Preventiva   (ex: 31 * 10:30 - 4:00 = 325:30 - 4:00 = 321:30)
    // 24h => ((BE54 * BH57) * 2) - Preventiva (ex: 31 * 21:00 - 4:00 = 651:00 - 4:00 = 647:00)
    const mult = item.regimeDf === '24h' ? 2 : 1;
    const totalHorasMetaMin = Math.max(60, diasMedicao * horasTurnoMin * mult - preventivaMin);

    const perdasPorDiaMin: Record<string, number> = {};
    const horasTotaisPorDiaMin: Record<string, number> = {};
    const horimetroPorDia: Record<string, number> = {};

    let perdasMin = 0;
    let somaHorimetro = 0;

    for (const l of itemLancs) {
      // Na aba DF - somente: AJ = SUMIF(BD!Q, item, BD!AB) (se houver AA sem AB, somamos desviosMin + manutencaoMin)
      const rowLoss = l.desviosMin + l.manutencaoMin;
      perdasMin += rowLoss;
      somaHorimetro += l.horimetroRealizado || 0;

      if (l.data) {
        perdasPorDiaMin[l.data] = (perdasPorDiaMin[l.data] || 0) + rowLoss;
        horasTotaisPorDiaMin[l.data] = (horasTotaisPorDiaMin[l.data] || 0) + l.totalHorasMin;
        horimetroPorDia[l.data] = Number(
          ((horimetroPorDia[l.data] || 0) + (l.horimetroRealizado || 0)).toFixed(2)
        );
      }
    }

    const limitePerda5PctMin = Math.round(0.05 * totalHorasMetaMin);
    const limitePerda90PctMin = Math.round(0.10 * totalHorasMetaMin);
    const restanteEm95Min = limitePerda5PctMin - perdasMin;
    const restanteEm90Min = limitePerda90PctMin - perdasMin;
    const restanteTotalMin = Math.max(0, totalHorasMetaMin - perdasMin);

    const saldoLimite95Ratio =
      limitePerda5PctMin > 0 ? restanteEm95Min / limitePerda5PctMin : 0;
    const aderenciaTotalRatio =
      totalHorasMetaMin > 0 ? restanteTotalMin / totalHorasMetaMin : 1;

    return {
      ordem: item.ordem,
      tipoQqp: item.tipoQqp,
      frente: item.frente,
      grupo: item.grupo,
      turnoMemoria: item.turno,
      regimeDf: item.regimeDf,
      horasDiaMin: horasTurnoMin,
      perdasMin,
      limitePerda5PctMin,
      limitePerda90PctMin,
      restanteEm95Min,
      restanteEm90Min,
      restanteTotalMin,
      totalHorasMetaMin,
      saldoLimite95Ratio,
      aderenciaTotalRatio,
      somaHorimetro: Number(somaHorimetro.toFixed(2)),
      qtdLancamentos: itemLancs.length,
      perdasPorDiaMin,
      horasTotaisPorDiaMin,
      horimetroPorDia,
    };
  });

  const mediaAderenciaRatio =
    rows.length > 0
      ? rows.reduce((acc, r) => acc + r.aderenciaTotalRatio, 0) / rows.length
      : 1;
  const totalMetaMin = rows.reduce((acc, r) => acc + r.totalHorasMetaMin, 0);
  const totalPerdasMin = rows.reduce((acc, r) => acc + r.perdasMin, 0);
  const totalTrabalhadoMin = rows.reduce((acc, r) => acc + r.restanteTotalMin, 0);

  return {
    rows,
    diasMedicao,
    mediaAderenciaRatio,
    totalMetaMin,
    totalPerdasMin,
    totalTrabalhadoMin,
  };
}

// ============================================================================
// MOTOR DE CÁLCULO 3: CONCILIAÇÃO BD (BUSATO) x BD VALE (BD REAL)
// ============================================================================

export interface ValeEquipmentComparison {
  ordem: number;
  tipoQqp: string;
  frente: 'MFE' | 'TPM';
  grupo: string;
  osCountBusato: number;
  osCountVale: number;
  horasProgValeMin: number;
  horasExecValeMin: number;
  horasLibParcialValeMin: number;
  perdasValeMin: number;
  perdasBusatoMin: number;
  aderenciaBusatoRatio: number;
  aderenciaValeCalculadaRatio: number | null;
  deltaAderenciaPctPoints: number; // (Busato - Vale) em p.p.
}

export interface OsReconciliationRow {
  key: string;
  osTokens: string[];
  osDisplay: string;
  data: string;
  equipamento: string;
  placaBusato: string;
  horasBusatoTotalMin: number;
  horasBusatoExecMin: number;
  perdaBusatoMin: number;
  horasValeProgMin: number;
  horasValeExecMin: number;
  perdaValeMin: number;
  aderenciaValeStatus: string;
  justificativaVale: string;
  diffExecMin: number; // Busato Exec - Vale Exec
  statusConciliacao: 'OK' | 'DIVERGENCIA_HORAS' | 'SO_VALE' | 'SO_BUSATO';
}

export function extractOsTokens(rawOs: string): string[] {
  if (!rawOs) return [];
  const matches = String(rawOs)
    .toUpperCase()
    .match(/20\d{2}[A-Z]\d+/g);
  if (matches && matches.length > 0) return Array.from(new Set(matches));
  const clean = String(rawOs).trim().toUpperCase();
  return clean ? [clean] : [];
}

export function computeValeComparison(
  catalog: QqpContractItem[],
  lancamentos: BdLancamentoComputed[],
  bdVale: BdValeRow[],
  dfRows: DfEquipmentRow[]
): {
  byEquipment: ValeEquipmentComparison[];
  byOs: OsReconciliationRow[];
  valeAderenciaMap: Record<string, number>;
} {
  const dfMap = new Map<string, DfEquipmentRow>();
  dfRows.forEach((r) => dfMap.set(r.tipoQqp.trim().toUpperCase(), r));

  const busatoByEq = new Map<string, BdLancamentoComputed[]>();
  lancamentos.forEach((l) => {
    const k = (l.tipoQqp || '').trim().toUpperCase();
    if (!k) return;
    const arr = busatoByEq.get(k) || [];
    arr.push(l);
    busatoByEq.set(k, arr);
  });

  const valeByEq = new Map<string, BdValeRow[]>();
  bdVale.forEach((v) => {
    const k = (v.equipamento || '').trim().toUpperCase();
    if (!k) return;
    const arr = valeByEq.get(k) || [];
    arr.push(v);
    valeByEq.set(k, arr);
  });

  const valeAderenciaMap: Record<string, number> = {};

  const byEquipment: ValeEquipmentComparison[] = catalog.map((item) => {
    const key = item.tipoQqp.trim().toUpperCase();
    const bRows = busatoByEq.get(key) || [];
    const vRows = valeByEq.get(key) || [];
    const dfRow = dfMap.get(key);

    let horasProgValeMin = 0;
    let horasExecValeMin = 0;
    let horasLibParcialValeMin = 0;
    let perdasValeMin = 0;

    for (const vr of vRows) {
      const statusNorm = (vr.aderenciaStatus || '').trim().toUpperCase();
      horasLibParcialValeMin += vr.duracaoLibParcialMin || 0;

      // Linhas "Liberada" no relatório da Vale não penalizam aderência
      if (statusNorm === 'LIBERADA') {
        continue;
      }
      const prog = vr.duracaoProgMin || 0;
      const exec = statusNorm === 'NÃO' || statusNorm === 'NAO' ? 0 : vr.duracaoExecMin || 0;
      horasProgValeMin += prog;
      horasExecValeMin += exec;
      perdasValeMin += Math.max(0, prog - exec);
    }

    const metaMin = dfRow?.totalHorasMetaMin || 19290;
    let aderenciaValeCalculadaRatio: number | null = null;
    if (vRows.length > 0) {
      // Na metodologia Porto/Vale, a aderência mensal desconta as perdas válidas sobre a meta de horas do ciclo (ou horasExec / horasProg quando meta coincide)
      if (horasProgValeMin > 0) {
        aderenciaValeCalculadaRatio = Math.max(
          0,
          Math.min(1, (metaMin - perdasValeMin) / metaMin)
        );
      } else {
        aderenciaValeCalculadaRatio = 1;
      }
      valeAderenciaMap[item.tipoQqp] = aderenciaValeCalculadaRatio;
    }

    const aderenciaBusatoRatio = dfRow?.aderenciaTotalRatio ?? 1;
    const deltaAderenciaPctPoints =
      aderenciaValeCalculadaRatio !== null
        ? (aderenciaBusatoRatio - aderenciaValeCalculadaRatio) * 100
        : 0;

    return {
      ordem: item.ordem,
      tipoQqp: item.tipoQqp,
      frente: item.frente,
      grupo: item.grupo,
      osCountBusato: bRows.length,
      osCountVale: vRows.length,
      horasProgValeMin,
      horasExecValeMin,
      horasLibParcialValeMin,
      perdasValeMin,
      perdasBusatoMin: dfRow?.perdasMin || 0,
      aderenciaBusatoRatio,
      aderenciaValeCalculadaRatio,
      deltaAderenciaPctPoints,
    };
  });

  // Conciliação linha a linha por OS (suportando OS dupla de virada noturna no BD!)
  const valeByOs = new Map<string, BdValeRow[]>();
  for (const v of bdVale) {
    const tokens = extractOsTokens(v.os);
    for (const tk of tokens) {
      const arr = valeByOs.get(tk) || [];
      arr.push(v);
      valeByOs.set(tk, arr);
    }
  }

  // Agrupa lançamentos Busato que compartilham a mesma OS (ex: troca de placa no meio do turno!)
  const busatoGroups = new Map<
    string,
    { tokens: string[]; rows: BdLancamentoComputed[] }
  >();
  let noOsCounter = 0;
  for (const b of lancamentos) {
    const tokens = extractOsTokens(b.os);
    const groupKey =
      tokens.length > 0
        ? tokens.slice().sort().join('+')
        : `SEM_OS_${++noOsCounter}_${b.id}`;
    const existing = busatoGroups.get(groupKey);
    if (existing) {
      existing.rows.push(b);
    } else {
      busatoGroups.set(groupKey, { tokens, rows: [b] });
    }
  }

  const matchedValeIds = new Set<string>();
  const byOs: OsReconciliationRow[] = [];

  for (const [gKey, grp] of busatoGroups.entries()) {
    const matchedValeMap = new Map<string, BdValeRow>();
    for (const tk of grp.tokens) {
      const found = valeByOs.get(tk) || [];
      for (const vr of found) {
        matchedValeMap.set(vr.id, vr);
        matchedValeIds.add(vr.id);
      }
    }

    const vList = Array.from(matchedValeMap.values());
    const firstB = grp.rows[0];
    const placas = Array.from(new Set(grp.rows.map((r) => r.placaTag).filter(Boolean))).join(' / ');

    const horasBusatoTotalMin = grp.rows.reduce((s, r) => s + r.totalHorasMin, 0);
    const perdaBusatoMin = grp.rows.reduce((s, r) => s + r.desviosMin + r.manutencaoMin, 0);
    const horasBusatoExecMin = Math.max(0, horasBusatoTotalMin - perdaBusatoMin);

    if (vList.length === 0) {
      byOs.push({
        key: `B_${gKey}`,
        osTokens: grp.tokens,
        osDisplay: grp.tokens.join(' + ') || firstB.os || '(Sem OS)',
        data: firstB.data,
        equipamento: firstB.tipoQqp,
        placaBusato: placas,
        horasBusatoTotalMin,
        horasBusatoExecMin,
        perdaBusatoMin,
        horasValeProgMin: 0,
        horasValeExecMin: 0,
        perdaValeMin: 0,
        aderenciaValeStatus: '-',
        justificativaVale: '',
        diffExecMin: horasBusatoExecMin,
        statusConciliacao: 'SO_BUSATO',
      });
      continue;
    }

    let horasValeProgMin = 0;
    let horasValeExecMin = 0;
    let perdaValeMin = 0;
    const statuses = new Set<string>();
    const justs = new Set<string>();

    for (const vr of vList) {
      const st = (vr.aderenciaStatus || 'Sim').trim();
      statuses.add(st);
      if (vr.justificativaLibParcial) justs.add(vr.justificativaLibParcial);
      if (st.toUpperCase() === 'LIBERADA') {
        horasValeProgMin += vr.duracaoProgMin;
        horasValeExecMin += vr.duracaoProgMin; // Liberada abona perda na Vale
      } else {
        const exec = st.toUpperCase() === 'NÃO' || st.toUpperCase() === 'NAO' ? 0 : vr.duracaoExecMin;
        horasValeProgMin += vr.duracaoProgMin;
        horasValeExecMin += exec;
        perdaValeMin += Math.max(0, vr.duracaoProgMin - exec);
      }
    }

    // Tolerância de 2 minutos (ex: 23:59 da Vale em virada de turno dá 10:29 vs 10:30 = 1 min)
    const diffExecMin = horasBusatoExecMin - horasValeExecMin;
    const diffLossMin = Math.abs(perdaBusatoMin - perdaValeMin);
    const isOk = Math.abs(diffExecMin) <= 2 || diffLossMin <= 2;

    byOs.push({
      key: `M_${gKey}`,
      osTokens: grp.tokens,
      osDisplay: grp.tokens.join(' + '),
      data: firstB.data || vList[0].dataProg,
      equipamento: firstB.tipoQqp || vList[0].equipamento,
      placaBusato: placas,
      horasBusatoTotalMin,
      horasBusatoExecMin,
      perdaBusatoMin,
      horasValeProgMin,
      horasValeExecMin,
      perdaValeMin,
      aderenciaValeStatus: Array.from(statuses).join(' / '),
      justificativaVale: Array.from(justs).join(' | '),
      diffExecMin,
      statusConciliacao: isOk ? 'OK' : 'DIVERGENCIA_HORAS',
    });
  }

  // Adiciona registros da Vale que não existem nos lançamentos Busato
  for (const vr of bdVale) {
    if (matchedValeIds.has(vr.id)) continue;
    const st = (vr.aderenciaStatus || '').trim();
    const exec = st.toUpperCase() === 'NÃO' || st.toUpperCase() === 'NAO' ? 0 : vr.duracaoExecMin;
    byOs.push({
      key: `V_${vr.id}`,
      osTokens: extractOsTokens(vr.os),
      osDisplay: vr.os || '(Sem OS)',
      data: vr.dataProg || vr.dataExec,
      equipamento: vr.equipamento,
      placaBusato: '-',
      horasBusatoTotalMin: 0,
      horasBusatoExecMin: 0,
      perdaBusatoMin: 0,
      horasValeProgMin: vr.duracaoProgMin,
      horasValeExecMin: exec,
      perdaValeMin: Math.max(0, vr.duracaoProgMin - exec),
      aderenciaValeStatus: st || '-',
      justificativaVale: vr.justificativaLibParcial || '',
      diffExecMin: -exec,
      statusConciliacao: 'SO_VALE',
    });
  }

  byOs.sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.equipamento.localeCompare(b.equipamento));

  return { byEquipment, byOs, valeAderenciaMap };
}

// ============================================================================
// MOTOR DE CÁLCULO 4: MEMÓRIA DE CÁLCULO / FECHAMENTO (ABA MEMORIAL DE CÁLCULO)
// ============================================================================

export interface MemoriaEquipmentRow {
  ordem: number;
  tipoQqp: string; // A: FROTA (QQP)
  turno: '12h' | '24h'; // B: Turno
  frente: 'MFE' | 'TPM';
  grupo: string; // W: GRUPOS
  somaManutMin: number; // C: Soma de Manut.
  somaHorimetro: number; // D: Soma de Horí.
  metaHorasMin: number; // E: Meta de Horas Mês
  horasTrabalhadasMin: number; // F: Horas Trabalhadas Mês HOR.
  aderenciaBusatoRatio: number; // G: F / E
  aderenciaValeRatio: number | null; // H: Aderência VALE
  aderenciaConsideradaRatio: number; // I: Aderência considerada
  qntAderencia: number; // J: =IF(I>=0.95, 1, I*1)
  valorUnitEq: number; // K: Valor Unitário EQ (R$)
  valorUnitHr: number; // L: Valor Unitário HR (R$)
  valorEqReal: number; // M: = K * J
  valorMedicaoHrReal: number; // N: = L * D
  valorUnitMo: number; // O: Valor Unitário MO (R$)
  valorMedicaoHrCheia: number; // P: Valor Medição HR Cheia
  valorMedicaoMoReal: number; // Q: = O * J
  valorEsperado: number; // R: = K + O + P
  valorFechamento: number; // S: = M + N + Q
  descontosVariacao: number; // T: = R - S
}

export interface MemoriaGroupSummary {
  grupo: string;
  qtdEquipamentos: number;
  horasSomadas: number; // U: Quantidade (Horas) Somada
  qntAderenciaSomada: number; // V: Qnt (Aderência) Somado
  aderenciaMediaRatio: number;
  valorEsperadoGrupo: number;
  valorFechamentoGrupo: number;
  descontosGrupo: number;
}

export interface MemoriaCalculoConsolidado {
  rows: MemoriaEquipmentRow[];
  grupos: MemoriaGroupSummary[];
  itensComplementares: MemoriaItemComplementar[];
  aderenciaMediaBusatoRatio: number;
  aderenciaMediaValeRatio: number | null;
  aderenciaMediaConsideradaRatio: number;
  totalHorimetroFrota: number;
  totalLocacaoEqReal: number;
  totalLocacaoHrReal: number;
  totalMaoDeObraReal: number;
  totalEsperadoFrota: number;
  totalFechamentoFrota: number;
  totalDescontosFrota: number;
  totalComplementares: number;
  valorTotalFechamentoGeral: number; // S46 = SUM(S3:S45)
}

export function computeMemoriaCalculo(
  catalog: QqpContractItem[],
  dfRows: DfEquipmentRow[],
  valeAderenciaMap: Record<string, number>,
  qqpOverrides: Record<string, QqpCycleOverride>,
  dfParams: DfCycleParams,
  itensComplementares: MemoriaItemComplementar[]
): MemoriaCalculoConsolidado {
  const dfByQqp = new Map<string, DfEquipmentRow>();
  dfRows.forEach((r) => dfByQqp.set(r.tipoQqp.trim().toUpperCase(), r));

  const rows: MemoriaEquipmentRow[] = catalog.map((item) => {
    const df = dfByQqp.get(item.tipoQqp.trim().toUpperCase());
    const ov = qqpOverrides[item.tipoQqp] || {};

    const somaManutMin = df?.perdasMin ?? 0;
    const somaHorimetro = df?.somaHorimetro ?? 0;
    const metaHorasMin = df?.totalHorasMetaMin ?? 19290;
    const horasTrabalhadasMin = df?.restanteTotalMin ?? metaHorasMin;
    const aderenciaBusatoRatio = df?.aderenciaTotalRatio ?? 1;

    const aderenciaValeRatio =
      ov.aderenciaValeManualRatio !== undefined && ov.aderenciaValeManualRatio !== null
        ? ov.aderenciaValeManualRatio
        : valeAderenciaMap[item.tipoQqp] !== undefined
        ? valeAderenciaMap[item.tipoQqp]
        : null;

    const aderenciaConsideradaRatio =
      dfParams.fonteAderenciaMemoria === 'VALE' && aderenciaValeRatio !== null
        ? aderenciaValeRatio
        : aderenciaBusatoRatio;

    // Regra Contratual Porto (Coluna J): =IF(I>=0.95, 1, I*1)
    const qntAderencia = aderenciaConsideradaRatio >= 0.95 ? 1 : aderenciaConsideradaRatio;

    const valorUnitEq = item.valorEq || 0;
    const valorUnitHr = item.valorHr || 0;
    const valorUnitMo = item.valorMo || 0;
    const valorMedicaoHrCheia = item.valorHrCheia || 0;

    const valorEqReal = valorUnitEq * qntAderencia;
    const valorMedicaoHrReal = valorUnitHr * somaHorimetro;
    const valorMedicaoMoReal = valorUnitMo * qntAderencia;

    const valorEsperado = valorUnitEq + valorUnitMo + valorMedicaoHrCheia;
    const valorFechamento = valorEqReal + valorMedicaoHrReal + valorMedicaoMoReal;
    const descontosVariacao = valorEsperado - valorFechamento;

    return {
      ordem: item.ordem,
      tipoQqp: item.tipoQqp,
      turno: item.turno,
      frente: item.frente,
      grupo: item.grupo,
      somaManutMin,
      somaHorimetro,
      metaHorasMin,
      horasTrabalhadasMin,
      aderenciaBusatoRatio,
      aderenciaValeRatio,
      aderenciaConsideradaRatio,
      qntAderencia,
      valorUnitEq,
      valorUnitHr,
      valorEqReal,
      valorMedicaoHrReal,
      valorUnitMo,
      valorMedicaoHrCheia,
      valorMedicaoMoReal,
      valorEsperado,
      valorFechamento,
      descontosVariacao,
    };
  });

  // Agrupamento por Grupo (Colunas U, V, W da Memória de Cálculo)
  const grpOrder: string[] = [];
  const grpMap = new Map<string, MemoriaEquipmentRow[]>();
  for (const r of rows) {
    const g = (r.grupo || 'OUTROS').trim();
    if (!grpMap.has(g)) {
      grpOrder.push(g);
      grpMap.set(g, []);
    }
    grpMap.get(g)!.push(r);
  }

  const grupos: MemoriaGroupSummary[] = grpOrder.map((grupo) => {
    const items = grpMap.get(grupo) || [];
    return {
      grupo,
      qtdEquipamentos: items.length,
      horasSomadas: Number(items.reduce((s, x) => s + x.somaHorimetro, 0).toFixed(2)),
      qntAderenciaSomada: Number(items.reduce((s, x) => s + x.qntAderencia, 0).toFixed(3)),
      aderenciaMediaRatio:
        items.length > 0
          ? items.reduce((s, x) => s + x.aderenciaConsideradaRatio, 0) / items.length
          : 1,
      valorEsperadoGrupo: items.reduce((s, x) => s + x.valorEsperado, 0),
      valorFechamentoGrupo: items.reduce((s, x) => s + x.valorFechamento, 0),
      descontosGrupo: items.reduce((s, x) => s + x.descontosVariacao, 0),
    };
  });

  const aderenciaMediaBusatoRatio =
    rows.length > 0
      ? rows.reduce((s, r) => s + r.aderenciaBusatoRatio, 0) / rows.length
      : 1;

  const valeRows = rows.filter((r) => r.aderenciaValeRatio !== null);
  const aderenciaMediaValeRatio =
    valeRows.length > 0
      ? valeRows.reduce((s, r) => s + (r.aderenciaValeRatio || 0), 0) / valeRows.length
      : null;

  const aderenciaMediaConsideradaRatio =
    rows.length > 0
      ? rows.reduce((s, r) => s + r.aderenciaConsideradaRatio, 0) / rows.length
      : 1;

  const totalHorimetroFrota = rows.reduce((s, r) => s + r.somaHorimetro, 0);
  const totalLocacaoEqReal = rows.reduce((s, r) => s + r.valorEqReal, 0);
  const totalLocacaoHrReal = rows.reduce((s, r) => s + r.valorMedicaoHrReal, 0);
  const totalMaoDeObraReal = rows.reduce((s, r) => s + r.valorMedicaoMoReal, 0);
  const totalEsperadoFrota = rows.reduce((s, r) => s + r.valorEsperado, 0);
  const totalFechamentoFrota = rows.reduce((s, r) => s + r.valorFechamento, 0);
  const totalDescontosFrota = rows.reduce((s, r) => s + r.descontosVariacao, 0);
  const totalComplementares = itensComplementares.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const valorTotalFechamentoGeral = totalFechamentoFrota + totalComplementares;

  return {
    rows,
    grupos,
    itensComplementares,
    aderenciaMediaBusatoRatio,
    aderenciaMediaValeRatio,
    aderenciaMediaConsideradaRatio,
    totalHorimetroFrota,
    totalLocacaoEqReal,
    totalLocacaoHrReal,
    totalMaoDeObraReal,
    totalEsperadoFrota,
    totalFechamentoFrota,
    totalDescontosFrota,
    totalComplementares,
    valorTotalFechamentoGeral,
  };
}

// ============================================================================
// PERSISTÊNCIA (SUPABASE busato_cadastros + CACHE LOCAL)
// ============================================================================

const LS_PREFIX = 'medicao_porto_v1_';

export async function loadCycleData(cycleKey: string): Promise<MedicaoPortoCyclePayload> {
  const docId = `medicao_porto_ciclo_${cycleKey}`;

  try {
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { payload?: MedicaoPortoCyclePayload } | null; error: unknown }>;
          };
        };
      };
    };
    const { data, error } = await db
      .from('busato_cadastros')
      .select('payload')
      .eq('id', docId)
      .maybeSingle();

    if (!error && data?.payload && data.payload.cycleKey) {
      try {
        localStorage.setItem(LS_PREFIX + cycleKey, JSON.stringify(data.payload));
      } catch {
        // ignore quota errors
      }
      return normalizeLoadedPayload(cycleKey, data.payload);
    }
  } catch {
    // fallback localStorage
  }

  try {
    const raw = localStorage.getItem(LS_PREFIX + cycleKey);
    if (raw) {
      return normalizeLoadedPayload(cycleKey, JSON.parse(raw));
    }
  } catch {
    // ignore
  }

  return createEmptyCyclePayload(cycleKey);
}

function normalizeLoadedPayload(
  cycleKey: string,
  raw: Partial<MedicaoPortoCyclePayload>
): MedicaoPortoCyclePayload {
  const empty = createEmptyCyclePayload(cycleKey);
  return {
    cycleKey,
    lancamentos: Array.isArray(raw.lancamentos) ? raw.lancamentos : [],
    bdVale: Array.isArray(raw.bdVale) ? raw.bdVale : [],
    dfParams: {
      ...empty.dfParams,
      ...(raw.dfParams || {}),
    },
    qqpOverrides: raw.qqpOverrides || {},
    itensComplementares: Array.isArray(raw.itensComplementares)
      ? raw.itensComplementares
      : empty.itensComplementares,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export async function saveCycleData(payload: MedicaoPortoCyclePayload): Promise<void> {
  const updated: MedicaoPortoCyclePayload = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LS_PREFIX + payload.cycleKey, JSON.stringify(updated));
  } catch {
    // ignore local quota
  }

  try {
    const docId = `medicao_porto_ciclo_${payload.cycleKey}`;
    const db = supabase as unknown as {
      from: (t: string) => {
        upsert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    await db.from('busato_cadastros').upsert({
      id: docId,
      payload: updated,
      updated_at: updated.updatedAt,
    });
  } catch (err) {
    console.warn('[MedicaoPorto] Salvamento local ativo (nuvem indisponível):', err);
  }
}

// ============================================================================
// IMPORTAÇÃO E EXPORTAÇÃO EXCEL DE ALTA PERFORMANCE (.XLSX)
// ============================================================================

function parseExcelSerialToIso(
  serial: number,
  is1904: boolean,
  targetYearHint?: number
): string | null {
  if (!isFinite(serial) || serial < 1000) return null;
  // Em 1904 date system, o serial 0 corresponde a 1904-01-01 (+1462 dias em relação ao sistema 1900)
  const adjusted = is1904 ? serial + 1462 : serial;
  const d = new Date(Math.round((adjusted - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return null;
  let y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  // Correção inteligente: se uma aba BD Real gerada no sistema 1900 for colada num arquivo 1904
  // (ex: 46316 => 22/10/2030 em vez de 22/10/2026), detectamos o deslocamento exato de +1462 dias!
  if (is1904 && targetYearHint && y === targetYearHint + 4) {
    const d1900 = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d1900.getTime())) {
      y = d1900.getUTCFullYear();
      return `${y}-${pad2(d1900.getUTCMonth() + 1)}-${pad2(d1900.getUTCDate())}`;
    }
  }

  return `${y}-${pad2(m)}-${pad2(day)}`;
}

function extractCellDateIso(
  cell: XLSX.CellObject | undefined,
  is1904: boolean,
  targetYearHint?: number
): string {
  if (!cell) return '';
  if (typeof cell.v === 'number') {
    return parseExcelSerialToIso(cell.v, is1904, targetYearHint) || '';
  }
  const raw = String(cell.w ?? cell.v ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // Tenta DD/MM/YYYY ou MM/DD/YY: usamos cell.v numérico sempre que existir; para texto:
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (targetYearHint && y === targetYearHint + 4) y = targetYearHint;
    // Se p1 > 12 é certeza absoluta de DD/MM/YYYY
    if (p1 > 12) return `${y}-${pad2(p2)}-${pad2(p1)}`;
    // Se p2 > 12 é MM/DD/YYYY
    if (p2 > 12) return `${y}-${pad2(p1)}-${pad2(p2)}`;
    // Padrão BR DD/MM/YYYY
    return `${y}-${pad2(p2)}-${pad2(p1)}`;
  }
  return '';
}

function extractCellClockHHMM(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === '') return '';
  if (typeof cell.v === 'number') {
    const totalMin = Math.round(cell.v * 24 * 60);
    const wrapped = ((totalMin % 1440) + 1440) % 1440;
    return formatMinutesToHHMM(wrapped, true);
  }
  const s = String(cell.w ?? cell.v ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${pad2(parseInt(m[1], 10))}:${m[2]}`;
  return '';
}

function extractCellDurationHHMM(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === '') return '';
  const min =
    typeof cell.v === 'number'
      ? Math.round(cell.v * 24 * 60)
      : parseDurationToMinutes(cell.w ?? cell.v);
  return min > 0 ? formatMinutesToHHMM(min, false) : '';
}

function extractCellNumber(cell: XLSX.CellObject | undefined): number | null {
  if (!cell || cell.v === undefined || cell.v === '') return null;
  if (typeof cell.v === 'number') return isFinite(cell.v) ? cell.v : null;
  const cleaned = String(cell.v)
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

export interface WorkbookImportResult {
  detectedCycleKey: string | null;
  importedBdCount: number;
  importedValeCount: number;
  importedMemoriaOverrides: number;
  importedComplementares: number;
  lancamentos: BdLancamentoInput[];
  bdVale: BdValeRow[];
  qqpOverrides: Record<string, QqpCycleOverride>;
  itensComplementares: MemoriaItemComplementar[];
}

/**
 * Importador universal ultrarrápido (<0.5s mesmo com 1.048.576 linhas formatadas no Excel):
 * Reconhece:
 * 1) Planilha completa modelo (`BD`, `DF - somente`, `BD Real`, `Memorial de Cálculo...`)
 * 2) Planilha avulsa de `Lançamentos (BD)`
 * 3) Relatório avulso `BD Vale / BD Real` exportado do sistema da Vale
 */
export function parseMedicaoExcelBuffer(
  buffer: ArrayBuffer,
  targetCycle: MedicaoCycle,
  mode: 'FULL' | 'ONLY_BD' | 'ONLY_VALE' = 'FULL'
): WorkbookImportResult {
  const wb = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    cellNF: true,
    cellFormula: false,
  });

  const is1904 = Boolean(
    (wb.Workbook as { WBProps?: { date1904?: boolean } } | undefined)?.WBProps?.date1904
  );

  const findSheet = (pred: (name: string) => boolean): XLSX.WorkSheet | undefined => {
    const found = wb.SheetNames.find((n) => pred(n.trim().toUpperCase()));
    return found ? wb.Sheets[found] : undefined;
  };

  const lancamentos: BdLancamentoInput[] = [];
  const bdVale: BdValeRow[] = [];
  const qqpOverrides: Record<string, QqpCycleOverride> = {};
  const itensComplementares: MemoriaItemComplementar[] = [];
  const dateVotes = new Map<string, number>();

  // 1. Parse aba BD (Lançamentos)
  if (mode === 'FULL' || mode === 'ONLY_BD') {
    const bdSheet =
      findSheet((n) => n === 'BD' || n === 'LANCAMENTOS' || n === 'LANÇAMENTOS') ||
      (mode === 'ONLY_BD' ? wb.Sheets[wb.SheetNames[0]] : undefined);

    if (bdSheet) {
      // Detecta se é layout oficial BD (cabeçalho na linha 2: O2=O.S, Q2=Tipo | QQP, T2=Data)
      // ou tabela exportada simples com cabeçalho na linha 1
      const q2 = String(bdSheet['Q2']?.v || '').toUpperCase();
      const q1 = String(bdSheet['C1']?.v || bdSheet['Q1']?.v || '').toUpperCase();
      const isOfficialBdLayout = q2.includes('QQP') || q2.includes('TIPO') || Boolean(bdSheet['Q3']);

      if (isOfficialBdLayout) {
        let emptyStreak = 0;
        for (let r = 3; r <= 20000; r++) {
          const cO = bdSheet[`O${r}`];
          const cP = bdSheet[`P${r}`];
          const cQ = bdSheet[`Q${r}`];
          const cR = bdSheet[`R${r}`];
          const cT = bdSheet[`T${r}`];

          if (!cO && !cP && !cQ && !cR && !cT) {
            emptyStreak++;
            if (emptyStreak > 50) break;
            continue;
          }
          emptyStreak = 0;

          const tipoQqp = String(cQ?.v ?? '').trim();
          const os = String(cO?.w ?? cO?.v ?? '').trim();
          const pde = String(cP?.w ?? cP?.v ?? '').trim();
          const placaTag = String(cR?.w ?? cR?.v ?? '').trim();
          if (!tipoQqp && !os && !placaTag) continue;

          const dataIso = extractCellDateIso(cT, is1904, targetCycle.year);
          if (dataIso) {
            const ck = getCycleKeyForDate(dataIso);
            dateVotes.set(ck, (dateVotes.get(ck) || 0) + 1);
          }

          const af = extractCellNumber(bdSheet[`AF${r}`]);
          const ag = extractCellNumber(bdSheet[`AG${r}`]);
          const ah = extractCellNumber(bdSheet[`AH${r}`]);

          lancamentos.push({
            id: `bd-${r}-${Math.random().toString(36).slice(2, 7)}`,
            os,
            pde,
            tipoQqp,
            placaTag,
            matricula: String(bdSheet[`S${r}`]?.w ?? bdSheet[`S${r}`]?.v ?? '').trim(),
            data: dataIso || targetCycle.startIso,
            horaInicial: extractCellClockHHMM(bdSheet[`V${r}`]) || '07:00',
            horaFinal: extractCellClockHHMM(bdSheet[`W${r}`]) || '17:30',
            horaExtra50: extractCellDurationHHMM(bdSheet[`X${r}`]),
            horaExtra100: extractCellDurationHHMM(bdSheet[`Y${r}`]),
            intervalo: extractCellDurationHHMM(bdSheet[`Z${r}`]),
            manutencao: extractCellDurationHHMM(bdSheet[`AA${r}`]),
            desviosAtrasos: extractCellDurationHHMM(bdSheet[`AB${r}`]),
            diferencaGarantia: extractCellDurationHHMM(bdSheet[`AD${r}`]),
            horimetroInicial: af,
            horimetroFinal: ag,
            horimetroRealizadoManual: af === null && ag === null ? ah : null,
            ccVale: String(bdSheet[`AL${r}`]?.w ?? bdSheet[`AL${r}`]?.v ?? '').trim(),
            localVale: String(bdSheet[`AM${r}`]?.w ?? bdSheet[`AM${r}`]?.v ?? '').trim(),
            observacao: String(bdSheet[`AN${r}`]?.w ?? bdSheet[`AN${r}`]?.v ?? '').trim(),
            empresa: String(bdSheet[`AO${r}`]?.w ?? bdSheet[`AO${r}`]?.v ?? 'VALE').trim(),
          });
        }
      } else if (q1 || mode === 'ONLY_BD') {
        // Fallback genérico por nome de coluna na linha 1
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(bdSheet, { defval: '' });
        rows.forEach((row, idx) => {
          const get = (...keys: string[]) => {
            for (const k of Object.keys(row)) {
              const kn = k.trim().toUpperCase();
              if (keys.some((target) => kn.includes(target))) return row[k];
            }
            return '';
          };
          const tipoQqp = String(get('QQP', 'EQUIPAMENTO', 'FROTA') || '').trim();
          const os = String(get('O.S', 'OS') || '').trim();
          if (!tipoQqp && !os) return;
          const rawData = get('DATA');
          const dataIso =
            typeof rawData === 'number'
              ? parseExcelSerialToIso(rawData, is1904, targetCycle.year) || targetCycle.startIso
              : String(rawData || targetCycle.startIso).slice(0, 10);

          lancamentos.push({
            id: `bd-imp-${idx}-${Date.now()}`,
            os,
            pde: String(get('PDE', 'BOLETIM') || '').trim(),
            tipoQqp,
            placaTag: String(get('PLACA', 'TAG') || '').trim(),
            matricula: String(get('MATRICULA', 'MATRÍCULA', 'OPERADOR') || '').trim(),
            data: dataIso,
            horaInicial: String(get('HORA INICIAL', 'INÍCIO') || '07:00').trim(),
            horaFinal: String(get('HORA FINAL', 'FIM') || '17:30').trim(),
            manutencao: String(get('MANUT') || '').trim(),
            desviosAtrasos: String(get('DESVIO', 'ATRASO', 'PERDA') || '').trim(),
            horimetroInicial: Number(get('HORIMETRO INICIAL', 'HORÍMETRO INICIAL')) || null,
            horimetroFinal: Number(get('HORIMETRO FINAL', 'HORÍMETRO FINAL')) || null,
            horimetroRealizadoManual: Number(get('HORÍMETRO REALIZADO', 'HORIMETRO REALIZADO')) || null,
            ccVale: String(get('CC', 'CENTRO') || '').trim(),
            localVale: String(get('LOCAL') || '').trim(),
            observacao: String(get('OBS') || '').trim(),
          });
        });
      }
    }
  }

  // 2. Parse aba BD Real (BD Vale)
  if (mode === 'FULL' || mode === 'ONLY_VALE') {
    const valeSheet =
      findSheet((n) => n === 'BD REAL' || n === 'BD VALE' || n.includes('BD REAL')) ||
      (mode === 'ONLY_VALE' ? wb.Sheets[wb.SheetNames[0]] : undefined);

    if (valeSheet) {
      // Descobre linha de cabeçalho (normalmente linha 4 na aba BD Real ou linha 1 em relatório direto)
      let headerRow = 4;
      for (let hr = 1; hr <= 10; hr++) {
        const aVal = String(valeSheet[`A${hr}`]?.v || '').trim().toUpperCase();
        const tVal = String(valeSheet[`T${hr}`]?.v || '').trim().toUpperCase();
        if (aVal === 'OS' || tVal === 'EQUIPAMENTO') {
          headerRow = hr;
          break;
        }
      }

      let emptyStreak = 0;
      for (let r = headerRow + 1; r <= 20000; r++) {
        const cA = valeSheet[`A${r}`];
        const cT = valeSheet[`T${r}`] || valeSheet[`Y${r}`];
        if (!cA && !cT) {
          emptyStreak++;
          if (emptyStreak > 40) break;
          continue;
        }
        emptyStreak = 0;

        const os = String(cA?.w ?? cA?.v ?? '').trim();
        const equipamento = String(cT?.w ?? cT?.v ?? '').trim();
        if (!os && !equipamento) continue;

        const dataProg = extractCellDateIso(valeSheet[`F${r}`], is1904, targetCycle.year);
        const dataExec = extractCellDateIso(valeSheet[`Z${r}`], is1904, targetCycle.year);

        const durProgCell = valeSheet[`I${r}`] || valeSheet[`N${r}`];
        const durExecCell = valeSheet[`AC${r}`];
        const durLibCell = valeSheet[`Q${r}`];

        const duracaoProgMin = durProgCell
          ? parseDurationToMinutes(durProgCell.v ?? durProgCell.w)
          : 0;
        const duracaoExecMin = durExecCell
          ? parseDurationToMinutes(durExecCell.v ?? durExecCell.w)
          : 0;
        const duracaoLibParcialMin = durLibCell
          ? parseDurationToMinutes(durLibCell.v ?? durLibCell.w)
          : 0;

        const agNum = extractCellNumber(valeSheet[`AG${r}`]);
        const aeNum = extractCellNumber(valeSheet[`AE${r}`]);

        bdVale.push({
          id: `vale-${r}-${Math.random().toString(36).slice(2, 7)}`,
          os,
          tipo: String(valeSheet[`B${r}`]?.v ?? 'Spot').trim(),
          dono: String(valeSheet[`C${r}`]?.v ?? 'BUSATO').trim(),
          ga: String(valeSheet[`D${r}`]?.v ?? '').trim(),
          gg: String(valeSheet[`E${r}`]?.v ?? '').trim(),
          dataProg: dataProg || dataExec || targetCycle.startIso,
          horaInicioProg: extractCellClockHHMM(valeSheet[`G${r}`]),
          horaFimProg: extractCellClockHHMM(valeSheet[`H${r}`]),
          duracaoProgMin,
          semana: String(valeSheet[`J${r}`]?.v ?? '').trim(),
          inicioLibParcial: extractCellClockHHMM(valeSheet[`O${r}`]),
          fimLibParcial: extractCellClockHHMM(valeSheet[`P${r}`]),
          duracaoLibParcialMin,
          responsavelLibParcial: String(valeSheet[`R${r}`]?.v ?? '').trim(),
          justificativaLibParcial: String(valeSheet[`S${r}`]?.v ?? '').trim(),
          equipamento,
          dataExec: dataExec || dataProg || targetCycle.startIso,
          inicioExec: extractCellClockHHMM(valeSheet[`AA${r}`]),
          fimExec: extractCellClockHHMM(valeSheet[`AB${r}`]),
          duracaoExecMin,
          aderenciaStatus: String(valeSheet[`AD${r}`]?.v ?? '').trim(),
          intersecaoPct: aeNum !== null ? (aeNum > 1 ? aeNum / 100 : aeNum) : 0,
          aderenciaRatio: agNum !== null ? (agNum > 1 ? agNum / 100 : agNum) : 0,
        });
      }
    }
  }

  // 3. Parse aba Memorial de Cálculo (Preços unitários, Aderência Vale e Itens Complementares)
  if (mode === 'FULL') {
    const memSheet = findSheet(
      (n) => n.includes('MEMORIAL') || n.includes('MEMÓRIA') || n.includes('MEMORIA')
    );
    const dfSheet = findSheet((n) => n.includes('DF'));

    const dfRegimeMap = new Map<string, '12h' | '24h'>();
    if (dfSheet) {
      for (let r = 2; r <= 60; r++) {
        const eq = String(dfSheet[`A${r}`]?.v ?? '').trim();
        const turn = String(dfSheet[`C${r}`]?.v ?? '').trim().toLowerCase();
        if (eq && (turn === '12h' || turn === '24h')) {
          dfRegimeMap.set(eq.toUpperCase(), turn);
        }
      }
    }

    if (memSheet) {
      let curGrupo = '';
      for (let r = 3; r <= 55; r++) {
        const nome = String(memSheet[`A${r}`]?.v ?? '').trim();
        const sVal = extractCellNumber(memSheet[`S${r}`]);

        if (nome.toUpperCase().startsWith('BUSATO_')) {
          const grpCell = String(memSheet[`W${r}`]?.v ?? '').trim();
          if (grpCell) curGrupo = grpCell;

          const turnoRaw = String(memSheet[`B${r}`]?.v ?? '12h').trim().toLowerCase();
          const turno: '12h' | '24h' = turnoRaw === '24h' ? '24h' : '12h';
          const regimeDf = dfRegimeMap.get(nome.toUpperCase()) || turno;

          const hVal = extractCellNumber(memSheet[`H${r}`]);
          const kVal = extractCellNumber(memSheet[`K${r}`]);
          const lVal = extractCellNumber(memSheet[`L${r}`]);
          const oVal = extractCellNumber(memSheet[`O${r}`]);
          const pVal = extractCellNumber(memSheet[`P${r}`]);

          qqpOverrides[nome] = {
            turno,
            regimeDf,
            grupo: curGrupo || undefined,
            valorEq: kVal !== null ? kVal : undefined,
            valorHr: lVal !== null ? lVal : undefined,
            valorMo: oVal !== null ? oVal : undefined,
            valorHrCheia: pVal !== null ? pVal : undefined,
            aderenciaValeManualRatio:
              hVal !== null ? (hVal > 1 ? hVal / 100 : hVal) : null,
          };
        } else if (nome && !nome.toUpperCase().includes('ADERÊNCIA')) {
          // Linhas como CUSTO FIXO INDIRETO - LOCAÇÃO, MO, MOBILIZAÇÃO
          itensComplementares.push({
            id: `comp-${r}`,
            categoria: nome.toUpperCase().includes('MOBILIZA')
              ? 'MOBILIZACAO'
              : 'CUSTO_INDIRETO',
            descricao: nome,
            valor: sVal || 0,
          });
        } else if (!nome && sVal !== null && sVal > 0 && !memSheet[`S${r}`]?.f) {
          // Linhas complementares numéricas de fechamento (ex: S42..S45 na planilha modelo)
          itensComplementares.push({
            id: `comp-extra-${r}`,
            categoria: 'EVENTUAL',
            descricao: `Adicional / Serviço Complementar Fechamento (Linha ${r})`,
            valor: sVal,
          });
        }
      }
    }
  }

  let detectedCycleKey: string | null = null;
  let bestVotes = 0;
  for (const [ck, count] of dateVotes.entries()) {
    if (count > bestVotes) {
      bestVotes = count;
      detectedCycleKey = ck;
    }
  }

  return {
    detectedCycleKey,
    importedBdCount: lancamentos.length,
    importedValeCount: bdVale.length,
    importedMemoriaOverrides: Object.keys(qqpOverrides).length,
    importedComplementares: itensComplementares.length,
    lancamentos,
    bdVale,
    qqpOverrides,
    itensComplementares,
  };
}

/**
 * Exporta o fechamento completo do ciclo (21..20) em um único arquivo Excel (.xlsx)
 * com as 4 abas estruturadas iguais ao modelo:
 * 1) BD (Lançamentos)
 * 2) DF - somente
 * 3) BD Real (BD Vale + Conciliação)
 * 4) Memória de Cálculo
 */
export function exportMedicaoCycleToExcel(
  cycle: MedicaoCycle,
  lancamentos: BdLancamentoComputed[],
  dfResult: ReturnType<typeof computeDfTable>,
  valeResult: ReturnType<typeof computeValeComparison>,
  bdValeRaw: BdValeRow[],
  memoria: MemoriaCalculoConsolidado
): void {
  const wb = XLSX.utils.book_new();

  const styleHeader = (ws: XLSX.WorkSheet, headerRowIdx = 0, bgRgb = '0F172A') => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRowIdx, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' },
        fill: { fgColor: { rgb: bgRgb } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
  };

  // 1) Aba BD
  const bdExport = lancamentos.map((l) => ({
    'O.S + COMPLEMENTAR': l.os,
    PDE: l.pde,
    'Tipo | QQP': l.tipoQqp,
    'Placa / Tag': l.placaTag,
    Matrícula: l.matricula,
    Data: formatIsoToBr(l.data),
    'Hora Inicial': l.horaInicial,
    'Hora Final': l.horaFinal,
    'H.E 50%': l.horaExtra50 || '',
    'H.E 100%': l.horaExtra100 || '',
    Intervalo: l.intervalo || '',
    'Manut.': l.manutencao || '',
    'Desvios/Atrasos': l.desviosAtrasos || '',
    Subtotal: formatMinutesToHHMM(l.subtotalMin),
    'Total Horas': formatMinutesToHHMM(l.totalHorasMin),
    'Horímetro Inicial': l.horimetroInicial ?? '',
    'Horímetro Final': l.horimetroFinal ?? '',
    'Horímetro Realizado': l.horimetroRealizado,
    'Horímetro Disponível': l.horimetroDisponivel,
    'CC / PA Vale': l.ccVale || '',
    'Local Vale': l.localVale || '',
    Observação: l.observacao || '',
    '% Aderência': formatPct(l.aderenciaLinhaRatio),
    'h/exec': formatMinutesToHHMM(l.horasExecutadasMin),
  }));
  const wsBd = XLSX.utils.json_to_sheet(
    bdExport.length > 0 ? bdExport : [{ Aviso: 'Sem lançamentos no ciclo selecionado' }]
  );
  wsBd['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 52 }, { wch: 13 }, { wch: 14 }, { wch: 12 }];
  styleHeader(wsBd, 0, '0F172A');
  XLSX.utils.book_append_sheet(wb, wsBd, 'BD');

  // 2) Aba DF - somente
  const dfExport = dfResult.rows.map((r) => {
    const baseRow: Record<string, string | number> = {
      'Tipo | QQP': r.tipoQqp,
      LOCAL: 'PORTO',
      TURNO: r.regimeDf,
    };
    for (const dt of cycle.dates) {
      const loss = r.perdasPorDiaMin[dt] || 0;
      baseRow[formatShortDayMonth(dt)] = loss > 0 ? formatMinutesToHHMM(loss, false) : '';
    }
    baseRow['Horas dia'] = formatMinutesToHHMM(r.horasDiaMin);
    baseRow['Perdas horas'] = formatMinutesToHHMMSS(r.perdasMin);
    baseRow['Limite Perda 5%'] = formatMinutesToHHMMSS(r.limitePerda5PctMin);
    baseRow['RESTANTE EM 95%'] = formatMinutesToHHMMSS(r.restanteEm95Min);
    baseRow['RESTANTE TOTAL'] = formatMinutesToHHMMSS(r.restanteTotalMin);
    baseRow['Total de horas (Meta)'] = formatMinutesToHHMMSS(r.totalHorasMetaMin);
    baseRow['% Limite 95%'] = formatPct(r.saldoLimite95Ratio, true, 0);
    baseRow['ADERÊNCIA TOTAL'] = formatPct(r.aderenciaTotalRatio);
    return baseRow;
  });
  const wsDf = XLSX.utils.json_to_sheet(dfExport);
  wsDf['!cols'] = [{ wch: 52 }, { wch: 8 }, { wch: 8 }];
  styleHeader(wsDf, 0, '1E3A8A');
  XLSX.utils.book_append_sheet(wb, wsDf, 'DF - somente');

  // 3) Aba BD Real
  const valeExport = bdValeRaw.map((v) => ({
    OS: v.os,
    Tipo: v.tipo,
    Dono: v.dono,
    GA: v.ga,
    Data: formatIsoToBr(v.dataProg),
    'Hora Início': v.horaInicioProg,
    'Hora Fim': v.horaFimProg,
    Duração: formatMinutesToHHMM(v.duracaoProgMin),
    'Lib. Parcial': formatMinutesToHHMM(v.duracaoLibParcialMin, false),
    'Justificativa Lib.': v.justificativaLibParcial || '',
    Equipamento: v.equipamento,
    'Início Execução': v.inicioExec,
    'Final Execução': v.fimExec,
    'Duração Exec.': formatMinutesToHHMM(v.duracaoExecMin),
    Aderência: v.aderenciaStatus,
    '% Aderência Vale': formatPct(v.aderenciaRatio),
  }));
  const wsVale = XLSX.utils.json_to_sheet(
    valeExport.length > 0 ? valeExport : [{ Aviso: 'Nenhum BD Vale importado neste ciclo' }]
  );
  wsVale['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 52 }];
  styleHeader(wsVale, 0, '065F46');
  XLSX.utils.book_append_sheet(wb, wsVale, 'BD Real');

  // 4) Aba Conciliação OS
  const concExport = valeResult.byOs.map((c) => ({
    Status: c.statusConciliacao,
    'O.S.': c.osDisplay,
    Data: formatIsoToBr(c.data),
    Equipamento: c.equipamento,
    'Placa Busato': c.placaBusato,
    'Exec. Busato': formatMinutesToHHMM(c.horasBusatoExecMin),
    'Perda Busato': formatMinutesToHHMM(c.perdaBusatoMin),
    'Prog. Vale': formatMinutesToHHMM(c.horasValeProgMin),
    'Exec. Vale': formatMinutesToHHMM(c.horasValeExecMin),
    'Perda Vale': formatMinutesToHHMM(c.perdaValeMin),
    'Diferença Exec.': formatMinutesToHHMM(c.diffExecMin),
    'Status Vale': c.aderenciaValeStatus,
    Justificativa: c.justificativaVale,
  }));
  if (concExport.length > 0) {
    const wsConc = XLSX.utils.json_to_sheet(concExport);
    wsConc['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 50 }, { wch: 14 }];
    styleHeader(wsConc, 0, '7C2D12');
    XLSX.utils.book_append_sheet(wb, wsConc, 'Conciliação Vale');
  }

  // 5) Aba Memória de Cálculo
  const memExport: Record<string, string | number>[] = memoria.rows.map((m) => ({
    'FROTA (QQP)': m.tipoQqp,
    Turno: m.turno,
    'Soma de Manut.': formatMinutesToHHMMSS(m.somaManutMin),
    'Soma de Horí.': Number(m.somaHorimetro.toFixed(2)),
    'Meta de Horas Mês': formatMinutesToHHMMSS(m.metaHorasMin),
    'Horas Trabalhadas Mês': formatMinutesToHHMMSS(m.horasTrabalhadasMin),
    'Aderência %': formatPct(m.aderenciaBusatoRatio),
    'Aderência VALE': m.aderenciaValeRatio !== null ? formatPct(m.aderenciaValeRatio) : '-',
    Aderência: formatPct(m.aderenciaConsideradaRatio),
    'Qnt Aderência': Number(m.qntAderencia.toFixed(3)),
    'Valor Unitário EQ (R$)': Number(m.valorUnitEq.toFixed(2)),
    'Valor Unitário HR (R$)': Number(m.valorUnitHr.toFixed(2)),
    'Valor Unitário EQ Real (R$)': Number(m.valorEqReal.toFixed(2)),
    'Valor Medição HR Real (R$)': Number(m.valorMedicaoHrReal.toFixed(2)),
    'Valor Unitário MO (R$)': Number(m.valorUnitMo.toFixed(2)),
    'Valor Medição HR Cheia (R$)': Number(m.valorMedicaoHrCheia.toFixed(2)),
    'Valor Medição MO Real (R$)': Number(m.valorMedicaoMoReal.toFixed(2)),
    'Valor Esperado (R$)': Number(m.valorEsperado.toFixed(2)),
    'Valor Fechamento (R$)': Number(m.valorFechamento.toFixed(2)),
    'Descontos (R$)': Number(m.descontosVariacao.toFixed(2)),
    GRUPOS: m.grupo,
  }));

  for (const comp of memoria.itensComplementares) {
    if (!comp.valor && comp.categoria === 'CUSTO_INDIRETO') continue;
    memExport.push({
      'FROTA (QQP)': comp.descricao,
      Turno: '',
      'Soma de Manut.': '',
      'Soma de Horí.': comp.horas ?? '',
      'Meta de Horas Mês': '',
      'Horas Trabalhadas Mês': '',
      'Aderência %': '',
      'Aderência VALE': '',
      Aderência: '',
      'Qnt Aderência': '',
      'Valor Unitário EQ (R$)': '',
      'Valor Unitário HR (R$)': '',
      'Valor Unitário EQ Real (R$)': '',
      'Valor Medição HR Real (R$)': '',
      'Valor Unitário MO (R$)': '',
      'Valor Medição HR Cheia (R$)': '',
      'Valor Medição MO Real (R$)': '',
      'Valor Esperado (R$)': '',
      'Valor Fechamento (R$)': Number((comp.valor || 0).toFixed(2)),
      'Descontos (R$)': '',
      GRUPOS: comp.categoria,
    });
  }

  memExport.push({
    'FROTA (QQP)': `TOTAL FECHAMENTO (${cycle.shortRangeLabel})`,
    Turno: '',
    'Soma de Manut.': '',
    'Soma de Horí.': Number(memoria.totalHorimetroFrota.toFixed(2)),
    'Meta de Horas Mês': '',
    'Horas Trabalhadas Mês': '',
    'Aderência %': formatPct(memoria.aderenciaMediaBusatoRatio),
    'Aderência VALE':
      memoria.aderenciaMediaValeRatio !== null ? formatPct(memoria.aderenciaMediaValeRatio) : '-',
    Aderência: formatPct(memoria.aderenciaMediaConsideradaRatio),
    'Qnt Aderência': '',
    'Valor Unitário EQ (R$)': '',
    'Valor Unitário HR (R$)': '',
    'Valor Unitário EQ Real (R$)': Number(memoria.totalLocacaoEqReal.toFixed(2)),
    'Valor Medição HR Real (R$)': Number(memoria.totalLocacaoHrReal.toFixed(2)),
    'Valor Unitário MO (R$)': '',
    'Valor Medição HR Cheia (R$)': '',
    'Valor Medição MO Real (R$)': Number(memoria.totalMaoDeObraReal.toFixed(2)),
    'Valor Esperado (R$)': Number(memoria.totalEsperadoFrota.toFixed(2)),
    'Valor Fechamento (R$)': Number(memoria.valorTotalFechamentoGeral.toFixed(2)),
    'Descontos (R$)': Number(memoria.totalDescontosFrota.toFixed(2)),
    GRUPOS: 'TOTAL GERAL',
  });

  const wsMem = XLSX.utils.json_to_sheet(memExport);
  wsMem['!cols'] = [{ wch: 52 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 26 }];
  styleHeader(wsMem, 0, '0F172A');
  XLSX.utils.book_append_sheet(wb, wsMem, 'Memoria de Calculo');

  XLSX.writeFile(wb, `Medicao_Porto_${cycle.key}_${cycle.startIso}_a_${cycle.endIso}.xlsx`);
}
