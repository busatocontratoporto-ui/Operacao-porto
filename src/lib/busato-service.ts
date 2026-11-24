import { supabase } from "@/integrations/supabase/client";
import {
  buildAndDownloadStyledExecutiveExcel,
  buildAndDownloadStyledBoletimExcel,
  buildAndDownloadExecutivePdf,
} from "./cco-reports";

export interface CorretivaItem {
  paradaId: number;
  tipoParada: string;
  inicio: string;
  fim: string;
  duracaoMin: number;
  motivo: string;
  servico?: string;
  tipoManutencao?: string;
  localTipo?: "BASE" | "AREA";
  localParada: string;
  localRetorno: string;
  solucao: string;
  emAberto: boolean;
}

export interface DesvioItem {
  destino: string;
  solicitante: string;
  horario: string;
  descricao: string;
}

export interface AlmocoItem {
  inicio: string;
  fim: string;
  duracaoMin: number;
  retornoRegistrado: boolean;
}

export interface RegistroOperacional {
  id: number;
  data: string;
  setor: string;
  tipoEquipamento: string;
  subcategoria?: string;
  equipamentoNome: string;
  equipamentoBruto?: string;
  regimeHoras: number;
  ordemServico: string;
  responsavel: string;
  frenteServico: string;
  atividade: string;
  operador: string;
  placaPrincipal: string;
  placaReserva: string | null;
  houveTrocaEquipamento: boolean;
  statusEmoji: string;
  statusCodigo: string;
  statusLabel: string;
  horarioProgramadoApresentacao: string;
  horarioApresentacao: string;
  statusApresentacao: "NO_HORARIO" | "AGUARDANDO" | "ATRASADO" | "NAO_APRESENTOU" | string;
  atrasoMinutos: number;
  motivoAtrasoApresentacao: string;
  justificativaApresentacao: string;
  observacoesBrutas: string;
  observacaoExtra?: string;
  corretivas: CorretivaItem[];
  qtdFalhas: number;
  temParadaAberta: boolean;
  almoco: AlmocoItem | null;
  desvios: DesvioItem[];
  horasProgramadas: number;
  horasCorretiva: number;
  horasDisponiveis: number;
  minutosCorretiva: number;
  disponibilidadeFisica: number;
  origem?: string;
  letra?: string;
  area?: string;
}

export interface CadastrosData {
  operadores: any[];
  equipamentos: any[];
  locais: any[];
  servicos: any[];
  justificativas: any[];
}

export interface MetaOptions {
  dataMin: string;
  dataMax: string;
  datas: string[];
  tipos: string[];
  placas: string[];
  frentes: string[];
  setores: string[];
  operadores: string[];
  servicos: string[];
  justificativas: string[];
}

export interface ProgramacaoItem {
  id: number;
  sheetName: string;
  data: string;
  diaSemana: string;
  letra: string;
  secao: "EVENTUAL" | "HABITUAL_MFE" | "HABITUAL_TPM" | "HABITUAL_NOITE" | string;
  periodoTurno: "DIA" | "NOITE" | string;
  setor: string;
  tipoEquipamentoBruto: string;
  tipoEquipamento: string;
  placa: string;
  placaReserva: string | null;
  placaBruta: string;
  regime: string;
  regimeHoras: number;
  horarioVale: string;
  horarioInicio: string;
  horarioFim?: string;
  centroCusto: string;
  local: string;
  sublocal?: string;
  local1?: string;
  local2?: string;
  tagProgramacao: string;
  descricaoAtividade?: string;
  responsavelVale?: string;
  telefoneVale?: string;
  dono?: string;
  operador: string;
  os: string;
  os1?: string;
  os2?: string;
}

function timeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function recalculateRecordMetrics(rec: any): RegistroOperacional {
  // Base contratual padrão Vale = 10h30min (10.5h) líquidas por turno (07:00 às 17:30 / 19:00 às 05:30)
  const rawHorasProg = Number(rec.horasProgramadas);
  const horasProgramadas =
    !rawHorasProg || rawHorasProg === 12 ? 10.5 : rawHorasProg;
  const minutosProgramados = Math.round(horasProgramadas * 60);

  const horarioProgramadoApresentacao = String(rec.horarioProgramadoApresentacao || "07:00").padStart(5, "0");
  const horarioApresentacao = rec.horarioApresentacao ? String(rec.horarioApresentacao).padStart(5, "0") : "07:00";

  const minProgApres = timeToMinutes(horarioProgramadoApresentacao) ?? 7 * 60;
  const minRealApres = timeToMinutes(horarioApresentacao);

  let atrasoMinutos = 0;
  if (minRealApres !== null && minRealApres > minProgApres) {
    if (
      rec.origem === "PLANILHA_HISTORICA" &&
      horarioApresentacao === "08:00" &&
      !rec.motivoAtrasoApresentacao &&
      rec.statusCodigo !== "ATRASO_PORTARIA"
    ) {
      atrasoMinutos = 0;
    } else {
      atrasoMinutos = minRealApres - minProgApres;
    }
  }

  let statusApresentacao = rec.statusApresentacao || "";
  let motivoAtrasoApresentacao = rec.motivoAtrasoApresentacao || "";
  let justificativaApresentacao = rec.justificativaApresentacao || "";

  const uObs = (rec.observacoesBrutas || "").toUpperCase();
  if (!statusApresentacao) {
    if (
      rec.statusCodigo === "CANCELADA" ||
      uObs.includes("NÃO APRESENTOU") ||
      uObs.includes("NAO APRESENTOU") ||
      uObs.includes("FALTA DE OPERADOR") ||
      uObs.includes("SEM OPERADOR")
    ) {
      statusApresentacao = "NAO_APRESENTOU";
      if (!motivoAtrasoApresentacao) {
        motivoAtrasoApresentacao = uObs.includes("OPERADOR")
          ? "Falta / Ausência de Operador"
          : "Não Apresentação na Frente";
      }
    } else if (
      atrasoMinutos > 10 ||
      rec.statusCodigo === "ATRASO_PORTARIA" ||
      uObs.includes("PORTARIA") ||
      uObs.includes("ATRASO")
    ) {
      statusApresentacao = "ATRASADO";
      if (!motivoAtrasoApresentacao) {
        if (uObs.includes("PORTARIA") || rec.statusCodigo === "ATRASO_PORTARIA")
          motivoAtrasoApresentacao = "Retenção / Bloqueio na Portaria";
        else if (uObs.includes("CORRETIVA"))
          motivoAtrasoApresentacao = "Manutenção Corretiva no Início do Turno";
        else if (uObs.includes("ROF") || uObs.includes("TREINAMENTO"))
          motivoAtrasoApresentacao = "Treinamento / ROF";
        else motivoAtrasoApresentacao = "Atraso na Apresentação à Frente";
      }
    } else {
      statusApresentacao = "NO_HORARIO";
    }
  } else {
    if (statusApresentacao === "NO_HORARIO" && atrasoMinutos > 10) {
      statusApresentacao = "ATRASADO";
    } else if (statusApresentacao === "NO_HORARIO") {
      atrasoMinutos = 0;
    }
  }

  const corretivas: CorretivaItem[] = Array.isArray(rec.corretivas)
    ? rec.corretivas.map((c: any, idx: number) => {
        const ini = String(c.inicio || "07:00").padStart(5, "0");
        let emAberto = Boolean(c.emAberto);
        let fim = String(c.fim || "").trim().toUpperCase();

        if (!fim || fim === "XX:XX" || fim === "EM ABERTO") {
          emAberto = true;
          fim = "EM ABERTO";
        } else if (/^\d{1,2}:\d{2}$/.test(fim)) {
          fim = fim.padStart(5, "0");
        }

        let duracaoMin = Number(c.duracaoMin) || 0;
        const m1 = timeToMinutes(ini);
        if (!emAberto && /^\d{2}:\d{2}$/.test(fim)) {
          const m2 = timeToMinutes(fim);
          if (m1 !== null && m2 !== null) {
            duracaoMin = m2 >= m1 ? m2 - m1 : 24 * 60 - m1 + m2;
          }
        } else {
          // Parada EM ABERTO: calcula tempo real decorrido até AGORA (se for o turno de hoje)
          // ou até o fim do turno programado (se for data passada)
          const now = new Date();
          const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
            now.getDate()
          ).padStart(2, "0")}`;
          const nowMin = now.getHours() * 60 + now.getMinutes();

          if (m1 === null) {
            duracaoMin = 0;
          } else if (rec.data === todayIso) {
            duracaoMin = nowMin >= m1 ? Math.min(minutosProgramados, nowMin - m1) : 0;
          } else if (rec.data && rec.data > todayIso) {
            duracaoMin = 0;
          } else {
            // Turno encerrado de dia anterior (ou madrugada do turno noturno iniciado ontem à noite)
            const dtRec = new Date(`${rec.data}T00:00:00`);
            const dtToday = new Date(`${todayIso}T00:00:00`);
            const diffDays = Math.round((dtToday.getTime() - dtRec.getTime()) / 86400000);
            if (diffDays === 1 && m1 >= 19 * 60 && nowMin <= 6 * 60) {
              duracaoMin = Math.min(minutosProgramados, 24 * 60 - m1 + nowMin);
            } else {
              const isNoite = minProgApres >= 19 * 60 || m1 >= 19 * 60;
              const mFimTurno = isNoite ? 29 * 60 + 30 : 17 * 60 + 30;
              duracaoMin = mFimTurno > m1 ? Math.min(minutosProgramados, mFimTurno - m1) : 120;
            }
          }
        }

        return {
          ...c,
          paradaId: c.paradaId || idx + 1,
          tipoParada: c.tipoParada || "CORRETIVA",
          inicio: ini,
          fim,
          duracaoMin,
          motivo: c.motivo || "Manutenção Corretiva Geral",
          localParada: c.localParada || rec.frenteServico || "Frente Operacional",
          localRetorno: c.localRetorno || "",
          solucao: c.solucao || "",
          emAberto,
        };
      })
    : [];

  const temParadaAberta = corretivas.some((c) => c.emAberto);

  // Soma minutos das paradas registradas + eventual atraso de início de turno que ainda não esteja coberto por uma parada no mesmo intervalo
  const minutosParadasLista = corretivas.reduce((acc, c) => acc + (c.duracaoMin || 0), 0);
  let minutosAtrasoNaoCoberto = 0;

  if (statusApresentacao === "ATRASADO" && atrasoMinutos > 0) {
    // Verifica se já existe uma corretiva registrada cobrindo o intervalo [horarioProgramadoApresentacao -> horarioApresentacao]
    const jaTemParadaNoAtraso = corretivas.some((c) => {
      const cIni = timeToMinutes(c.inicio);
      const cFim = !c.emAberto && /^\d{2}:\d{2}$/.test(c.fim) ? timeToMinutes(c.fim) : null;
      if (cIni === null) return false;
      if (cFim !== null && minRealApres !== null) {
        return Math.abs(cIni - minProgApres) <= 5 && Math.abs(cFim - minRealApres) <= 5;
      }
      return Math.abs(cIni - minProgApres) <= 5;
    });
    if (!jaTemParadaNoAtraso) {
      minutosAtrasoNaoCoberto = atrasoMinutos;
    }
  }

  let minutosCorretiva = Math.min(
    minutosProgramados,
    minutosParadasLista + minutosAtrasoNaoCoberto
  );
  if (statusApresentacao === "NAO_APRESENTOU") {
    minutosCorretiva = minutosProgramados;
  }

  const horasCorretiva = Number((minutosCorretiva / 60).toFixed(2));
  const horasDisponiveis = Number(((minutosProgramados - minutosCorretiva) / 60).toFixed(2));
  const disponibilidadeFisica = Number(
    (((minutosProgramados - minutosCorretiva) / minutosProgramados) * 100).toFixed(2)
  );

  const obsParts: string[] = [];
  if (statusApresentacao === "ATRASADO") {
    obsParts.push(
      `APRESENTAÇÃO COM ATRASO ÀS ${horarioApresentacao} (+${atrasoMinutos} min) — MOTIVO: ${
        motivoAtrasoApresentacao || "A Justificar"
      }${justificativaApresentacao ? " (" + justificativaApresentacao + ")" : ""} ⏰`
    );
  } else if (statusApresentacao === "NAO_APRESENTOU") {
    obsParts.push(
      `NÃO SE APRESENTOU NA FRENTE — MOTIVO: ${motivoAtrasoApresentacao || "Não Informado"}${
        justificativaApresentacao ? " (" + justificativaApresentacao + ")" : ""
      } 🚫`
    );
  }
  for (const c of corretivas) {
    const locTxt = c.localParada ? ` [LOCAL: ${c.localParada}]` : "";
    const retTxt = c.localRetorno ? ` [RETORNO: ${c.localRetorno}]` : "";
    obsParts.push(
      `${c.tipoParada || "CORRETIVA"} DE ${c.inicio} ÀS ${c.emAberto ? "EM ABERTO" : c.fim} (${
        c.motivo
      })${locTxt}${retTxt} ❌`
    );
  }
  if (Array.isArray(rec.desvios)) {
    for (const d of rec.desvios) {
      obsParts.push(`DESVIO PARA ${d.destino}, SOLICITADO POR ${d.solicitante} ÀS ${d.horario} ⚠️`);
    }
  }
  if (rec.almoco && rec.almoco.inicio) {
    obsParts.push(`ALMOÇO ${rec.almoco.inicio} - ${rec.almoco.fim || "EM ANDAMENTO"} 🍽️`);
  }
  if (rec.observacaoExtra) {
    obsParts.push(rec.observacaoExtra);
  }

  let statusCodigo = rec.statusCodigo || "OPERANDO";
  let statusEmoji = "🟢";
  let statusLabel = "Operando Normal";

  if (statusApresentacao === "NAO_APRESENTOU") {
    statusCodigo = "NAO_APRESENTOU";
    statusEmoji = "🚫";
    statusLabel = "Não se Apresentou na Frente";
  } else if (temParadaAberta) {
    statusCodigo = "INDISPONIVEL";
    statusEmoji = "🔴";
    statusLabel = "EM PARADA AGORA (Aguardando Liberação)";
  } else if (corretivas.length > 0) {
    statusCodigo = "CORRETIVA_PARCIAL";
    statusEmoji = "🔴🟢";
    statusLabel = "Operando (Teve Parada Encerrada)";
  } else if (statusApresentacao === "ATRASADO") {
    statusCodigo = "ATRASO_PORTARIA";
    statusEmoji = "⚠️🟢";
    statusLabel = `Operando (Apresentou c/ Atraso +${atrasoMinutos}m)`;
  } else if (statusApresentacao === "AGUARDANDO") {
    statusCodigo = "AGUARDANDO_APRESENTACAO";
    statusEmoji = "⏳";
    statusLabel = "Aguardando Apresentação na Frente";
  } else if (statusCodigo === "TREINAMENTO") {
    statusEmoji = "🟡";
    statusLabel = "Treinamento / ROF";
  } else if (statusCodigo === "CANCELADA") {
    statusEmoji = "⚪";
    statusLabel = "Programação Cancelada";
  } else {
    statusCodigo = "OPERANDO";
    statusEmoji = "🟢";
    statusLabel = "Operando Normal";
  }

  return {
    ...rec,
    horarioProgramadoApresentacao,
    horarioApresentacao,
    statusApresentacao,
    atrasoMinutos,
    motivoAtrasoApresentacao,
    justificativaApresentacao,
    corretivas,
    temParadaAberta,
    qtdFalhas: corretivas.length + (minutosAtrasoNaoCoberto > 0 || statusApresentacao === "NAO_APRESENTOU" ? 1 : 0),
    horasProgramadas,
    horasCorretiva,
    horasDisponiveis,
    minutosCorretiva,
    disponibilidadeFisica,
    statusCodigo,
    statusEmoji,
    statusLabel,
    houveTrocaEquipamento: Boolean(rec.placaReserva && String(rec.placaReserva).trim() !== ""),
    observacoesBrutas: obsParts.length > 0 ? obsParts.join("\n") : rec.observacoesBrutas || "",
  };
}

// ── Client-side Fallback Store (for static deploy on Vercel/Cloudflare + Supabase sync) ──
let memoryRegistros: RegistroOperacional[] | null = null;
let memoryCadastros: CadastrosData | null = null;

const LS_REG_DIFF_KEY = "busato_registros_overrides_v1";
const LS_CAD_KEY = "busato_cadastros_v1";
const LS_CCO_CLEARED_KEY = "busato_cco_cleared_v1";

async function isCcoBaseCleared(): Promise<boolean> {
  try {
    if (localStorage.getItem(LS_CCO_CLEARED_KEY) === "true") return true;
  } catch {}
  try {
    const db = supabase as any;
    const { data } = await db
      .from("busato_cadastros")
      .select("payload")
      .eq("id", "default")
      .maybeSingle();
    if (data?.payload?._cleared === true) {
      try {
        localStorage.setItem(LS_CCO_CLEARED_KEY, "true");
      } catch {}
      return true;
    }
  } catch {}
  return false;
}

async function fetchAllCloudRows(tableName: string): Promise<{ id: number; payload: any }[]> {
  const db = supabase as any;
  const pageSize = 1000;
  const allRows: { id: number; payload: any }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from(tableName)
      .select("id, payload")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

async function ensureMemoryStore(): Promise<{
  registros: RegistroOperacional[];
  cadastros: CadastrosData;
}> {
  if (!memoryRegistros) {
    try {
      const map = new Map<number, RegistroOperacional>();
      let loadedFromCloud = false;

      // 1. Prioriza leitura paginada em nuvem (Supabase) para preservar todo o histórico (> 1.000 linhas)
      try {
        const sbRows = await fetchAllCloudRows("busato_registros");
        if (sbRows.length > 0) {
          for (const row of sbRows) {
            if (row?.payload) {
              const calc = recalculateRecordMetrics(row.payload);
              map.set(calc.id, calc);
            }
          }
          loadedFromCloud = true;
        }
      } catch {}

      // 2. Fallback estático + cache local quando ainda não houver dados no Supabase (exceto se base foi limpa)
      if (!loadedFromCloud) {
        const cleared = await isCcoBaseCleared();
        if (!cleared) {
          const res = await fetch("/data/registros.json");
          const raw: any[] = res.ok ? await res.json() : [];
          for (const r of raw) {
            const calc = recalculateRecordMetrics(r);
            map.set(calc.id, calc);
          }
        }
        try {
          const savedStr = localStorage.getItem(LS_REG_DIFF_KEY);
          if (savedStr) {
            const parsed = JSON.parse(savedStr);
            if (Array.isArray(parsed.upserted)) {
              for (const item of parsed.upserted) {
                const calc = recalculateRecordMetrics(item);
                map.set(calc.id, calc);
              }
            }
            if (Array.isArray(parsed.deletedIds)) {
              for (const delId of parsed.deletedIds) {
                map.delete(Number(delId));
              }
            }
          }
        } catch {}
      }

      memoryRegistros = Array.from(map.values());
    } catch {
      memoryRegistros = [];
    }
  } else {
    memoryRegistros = memoryRegistros.map((r) => recalculateRecordMetrics(r));
  }

  if (!memoryCadastros) {
    try {
      let loadedCadCloud = false;
      try {
        const db = supabase as any;
        const { data: sbCad, error } = await db
          .from("busato_cadastros")
          .select("payload")
          .eq("id", "default")
          .maybeSingle();
        if (!error && sbCad?.payload) {
          memoryCadastros = sbCad.payload;
          loadedCadCloud = true;
        }
      } catch {}

      if (!loadedCadCloud) {
        const cleared = await isCcoBaseCleared();
        const savedCad = localStorage.getItem(LS_CAD_KEY);
        if (savedCad) {
          memoryCadastros = JSON.parse(savedCad);
        } else if (cleared) {
          memoryCadastros = {
            operadores: [],
            equipamentos: [],
            locais: [],
            servicos: [],
            justificativas: [],
          };
        } else {
          const res = await fetch("/data/cadastros.json");
          memoryCadastros = res.ok
            ? await res.json()
            : { operadores: [], equipamentos: [], locais: [], servicos: [], justificativas: [] };
        }
      }
    } catch {
      memoryCadastros = {
        operadores: [],
        equipamentos: [],
        locais: [],
        servicos: [],
        justificativas: [],
      };
    }
  }

  return { registros: memoryRegistros!, cadastros: memoryCadastros! };
}

function saveOverrideRegistro(updated: RegistroOperacional | RegistroOperacional[], deletedId?: number) {
  try {
    const savedStr = localStorage.getItem(LS_REG_DIFF_KEY);
    const state = savedStr ? JSON.parse(savedStr) : { upserted: [], deletedIds: [] };
    const upMap = new Map<number, any>();
    for (const u of state.upserted || []) upMap.set(u.id, u);
    const delSet = new Set<number>(state.deletedIds || []);

    const items = Array.isArray(updated) ? updated : [updated];
    if (items.length > 0) {
      try {
        localStorage.removeItem(LS_CCO_CLEARED_KEY);
      } catch {}
    }
    for (const it of items) {
      if (it && it.id) {
        upMap.set(it.id, it);
        delSet.delete(it.id);
      }
    }
    if (deletedId !== undefined) {
      upMap.delete(deletedId);
      delSet.add(deletedId);
    }
    localStorage.setItem(
      LS_REG_DIFF_KEY,
      JSON.stringify({
        upserted: Array.from(upMap.values()),
        deletedIds: Array.from(delSet.values()),
      })
    );
  } catch {}

  // Sincronização em nuvem (Supabase) em lotes de 100 registros
  try {
    const db = supabase as any;
    if (deletedId !== undefined) {
      db.from("busato_registros").delete().eq("id", deletedId).then(() => {});
    } else {
      const items = Array.isArray(updated) ? updated : [updated];
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100).map((r) => ({
          id: r.id,
          data: r.data,
          payload: r,
          updated_at: new Date().toISOString(),
        }));
        db.from("busato_registros").upsert(chunk).then(() => {});
      }
    }
  } catch {}
}

function saveOverrideCadastros(cad: CadastrosData) {
  const cleanCad: CadastrosData = {
    operadores: cad.operadores || [],
    equipamentos: cad.equipamentos || [],
    locais: cad.locais || [],
    servicos: cad.servicos || [],
    justificativas: cad.justificativas || [],
  };
  try {
    localStorage.removeItem(LS_CCO_CLEARED_KEY);
    localStorage.setItem(LS_CAD_KEY, JSON.stringify(cleanCad));
  } catch {}
  try {
    const db = supabase as any;
    db.from("busato_cadastros")
      .upsert({ id: "default", payload: cleanCad, updated_at: new Date().toISOString() })
      .then(() => {});
  } catch {}
}

export function filterRegistrosList(
  registros: RegistroOperacional[],
  query: Record<string, string>
): RegistroOperacional[] {
  return registros.filter((r) => {
    if (query.dataExata && r.data !== query.dataExata) return false;
    if (query.dataInicio && r.data < query.dataInicio) return false;
    if (query.dataFim && r.data > query.dataFim) return false;
    if (query.setor && query.setor !== "TODOS" && r.setor !== query.setor) return false;
    if (
      query.tipoEquipamento &&
      query.tipoEquipamento !== "TODOS" &&
      r.tipoEquipamento !== query.tipoEquipamento
    )
      return false;
    if (
      query.placa &&
      query.placa !== "TODOS" &&
      r.placaPrincipal !== query.placa &&
      r.placaReserva !== query.placa
    )
      return false;
    if (
      query.frenteServico &&
      query.frenteServico !== "TODOS" &&
      r.frenteServico !== query.frenteServico
    )
      return false;
    if (
      query.responsavel &&
      query.responsavel !== "TODOS" &&
      !String(r.responsavel || "").includes(query.responsavel)
    )
      return false;
    if (query.statusCodigo && query.statusCodigo !== "TODOS" && r.statusCodigo !== query.statusCodigo)
      return false;
    if (query.apenasComCorretiva === "true" && r.qtdFalhas === 0) return false;
    if (query.apenasParadaAberta === "true" && !r.temParadaAberta) return false;
    if (query.busca) {
      const q = query.busca.toUpperCase();
      const hay = `${r.equipamentoNome} ${r.placaPrincipal} ${r.placaReserva || ""} ${r.operador} ${
        r.atividade
      } ${r.observacoesBrutas} ${r.ordemServico} ${r.frenteServico} ${
        r.motivoAtrasoApresentacao || ""
      }`.toUpperCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeAnalyticsData(filtered: RegistroOperacional[]) {
  const validRows = filtered.filter((r) => r.statusCodigo !== "CANCELADA");
  const totalTurnos = validRows.length;
  const horasProgramadas = Number(
    validRows.reduce((s, r) => s + r.horasProgramadas, 0).toFixed(2)
  );
  const horasCorretiva = Number(validRows.reduce((s, r) => s + r.horasCorretiva, 0).toFixed(2));
  const horasDisponiveis = Number((horasProgramadas - horasCorretiva).toFixed(2));
  const disponibilidadeFisica =
    horasProgramadas > 0
      ? Number(((horasDisponiveis / horasProgramadas) * 100).toFixed(2))
      : 100;

  const totalFalhas = validRows.reduce((s, r) => s + r.qtdFalhas, 0);
  const totalMinutosProgramados = Math.round(horasProgramadas * 60);
  const totalMinutosCorretiva = validRows.reduce((s, r) => s + (r.minutosCorretiva || 0), 0);
  const totalMinutosDisponiveis = Math.max(0, totalMinutosProgramados - totalMinutosCorretiva);
  const disponibilidadeFisicaExata =
    totalMinutosProgramados > 0
      ? Number(((totalMinutosDisponiveis / totalMinutosProgramados) * 100).toFixed(2))
      : 100;
  const mttrHoras = totalFalhas > 0 ? Number((horasCorretiva / totalFalhas).toFixed(2)) : 0;
  const mtbfHoras =
    totalFalhas > 0 ? Number((horasDisponiveis / totalFalhas).toFixed(2)) : horasDisponiveis;

  const turnosPontuais = validRows.filter((r) => r.statusApresentacao === "NO_HORARIO").length;
  const turnosAtrasados = validRows.filter((r) => r.statusApresentacao === "ATRASADO").length;
  const turnosNaoApresentou = validRows.filter(
    (r) => r.statusApresentacao === "NAO_APRESENTOU"
  ).length;
  const turnosAguardandoApres = validRows.filter(
    (r) => r.statusApresentacao === "AGUARDANDO"
  ).length;
  const taxaPontualidade =
    totalTurnos > 0 ? Number(((turnosPontuais / totalTurnos) * 100).toFixed(1)) : 100;

  const totalDesvios = validRows.reduce((s, r) => s + (r.desvios ? r.desvios.length : 0), 0);
  const totalTrocasReserva = validRows.filter((r) => r.houveTrocaEquipamento).length;
  const totalAlmocos = validRows.filter((r) => r.almoco).length;

  const paradasEmAberto: any[] = [];
  for (const r of validRows) {
    for (const c of r.corretivas || []) {
      if (c.emAberto) {
        paradasEmAberto.push({
          idRegistro: r.id,
          paradaId: c.paradaId,
          data: r.data,
          setor: r.setor,
          placa: r.placaPrincipal,
          placaReserva: r.placaReserva,
          equipamento: r.equipamentoNome,
          tipoEquipamento: r.tipoEquipamento,
          operador: r.operador,
          frenteServico: r.frenteServico,
          localParada: c.localParada || r.frenteServico,
          inicio: c.inicio,
          motivo: c.motivo,
          tipoParada: c.tipoParada || "CORRETIVA",
          duracaoHorasEstimada: Number(((c.duracaoMin || 0) / 60).toFixed(1)),
        });
      }
    }
  }

  const byDate: Record<string, any> = {};
  for (const r of validRows) {
    if (!byDate[r.data]) {
      byDate[r.data] = {
        data: r.data,
        turnos: 0,
        horasProgramadas: 0,
        horasCorretiva: 0,
        horasDisponiveis: 0,
        minProg: 0,
        minCorr: 0,
        falhas: 0,
        desvios: 0,
      };
    }
    const d = byDate[r.data];
    d.turnos++;
    d.horasProgramadas += r.horasProgramadas;
    d.horasCorretiva += r.horasCorretiva;
    d.horasDisponiveis += r.horasDisponiveis;
    d.minProg += Math.round((r.horasProgramadas || 10.5) * 60);
    d.minCorr += r.minutosCorretiva || 0;
    d.falhas += r.qtdFalhas;
    d.desvios += r.desvios ? r.desvios.length : 0;
  }
  const evolucaoDiaria = Object.values(byDate)
    .sort((a: any, b: any) => a.data.localeCompare(b.data))
    .map((d: any) => ({
      ...d,
      horasProgramadas: Number(d.horasProgramadas.toFixed(1)),
      horasCorretiva: Number((d.minCorr / 60).toFixed(2)),
      horasDisponiveis: Number((Math.max(0, d.minProg - d.minCorr) / 60).toFixed(2)),
      dfPct:
        d.minProg > 0
          ? Number(((Math.max(0, d.minProg - d.minCorr) / d.minProg) * 100).toFixed(2))
          : 100,
    }));

  const byPlate: Record<string, any> = {};
  for (const r of validRows) {
    const key = r.placaPrincipal || "S/PLACA";
    if (!byPlate[key]) {
      byPlate[key] = {
        placa: key,
        tipoEquipamento: r.tipoEquipamento,
        equipamentoNome: r.equipamentoNome,
        setorPredominante: r.setor,
        turnos: 0,
        horasProgramadas: 0,
        horasCorretiva: 0,
        horasDisponiveis: 0,
        falhas: 0,
        paradasAbertas: 0,
        ultimoIdRegistro: r.id,
        ultimoIdComParada: null,
        ultimoLocalParada: r.frenteServico,
        ultimoMotivoParada: "",
        desvios: 0,
        trocas: 0,
        almocos: 0,
        ultimoOperador: r.operador,
        ultimaData: r.data,
      };
    }
    const p = byPlate[key];
    p.turnos++;
    p.horasProgramadas += r.horasProgramadas;
    p.horasCorretiva += r.horasCorretiva;
    p.horasDisponiveis += r.horasDisponiveis;
    p.falhas += r.qtdFalhas;
    if (r.temParadaAberta) {
      p.paradasAbertas++;
      p.ultimoIdComParada = r.id;
      const openC = r.corretivas.find((c) => c.emAberto);
      if (openC) {
        p.ultimoLocalParada = openC.localParada || r.frenteServico;
        p.ultimoMotivoParada = openC.motivo;
      }
    } else if (r.qtdFalhas > 0 && !p.ultimoIdComParada) {
      p.ultimoIdComParada = r.id;
      const lastC = r.corretivas[r.corretivas.length - 1];
      if (lastC) {
        p.ultimoLocalParada = lastC.localParada || r.frenteServico;
        p.ultimoMotivoParada = lastC.motivo;
      }
    }
    p.desvios += r.desvios ? r.desvios.length : 0;
    if (r.houveTrocaEquipamento) p.trocas++;
    if (r.almoco) p.almocos++;
    if (r.data >= p.ultimaData) {
      p.ultimaData = r.data;
      p.ultimoOperador = r.operador;
      p.ultimoIdRegistro = r.id;
    }
  }
  const porPlaca = Object.values(byPlate)
    .map((p: any) => ({
      ...p,
      horasProgramadas: Number(p.horasProgramadas.toFixed(1)),
      horasCorretiva: Number(p.horasCorretiva.toFixed(2)),
      horasDisponiveis: Number(p.horasDisponiveis.toFixed(2)),
      dfPct:
        p.horasProgramadas > 0
          ? Number(((p.horasDisponiveis / p.horasProgramadas) * 100).toFixed(2))
          : 100,
      mttr: p.falhas > 0 ? Number((p.horasCorretiva / p.falhas).toFixed(2)) : 0,
      mtbf:
        p.falhas > 0
          ? Number((p.horasDisponiveis / p.falhas).toFixed(1))
          : Number(p.horasDisponiveis.toFixed(1)),
    }))
    .sort((a: any, b: any) => b.horasCorretiva - a.horasCorretiva);

  const byType: Record<string, any> = {};
  for (const r of validRows) {
    if (!byType[r.tipoEquipamento]) {
      byType[r.tipoEquipamento] = {
        tipo: r.tipoEquipamento,
        turnos: 0,
        horasProgramadas: 0,
        horasCorretiva: 0,
        horasDisponiveis: 0,
        falhas: 0,
        desvios: 0,
      };
    }
    const t = byType[r.tipoEquipamento];
    t.turnos++;
    t.horasProgramadas += r.horasProgramadas;
    t.horasCorretiva += r.horasCorretiva;
    t.horasDisponiveis += r.horasDisponiveis;
    t.falhas += r.qtdFalhas;
    t.desvios += r.desvios ? r.desvios.length : 0;
  }
  const porTipoEquipamento = Object.values(byType)
    .map((t: any) => ({
      ...t,
      horasProgramadas: Number(t.horasProgramadas.toFixed(1)),
      horasCorretiva: Number(t.horasCorretiva.toFixed(2)),
      horasDisponiveis: Number(t.horasDisponiveis.toFixed(2)),
      dfPct:
        t.horasProgramadas > 0
          ? Number(((t.horasDisponiveis / t.horasProgramadas) * 100).toFixed(2))
          : 100,
      mttr: t.falhas > 0 ? Number((t.horasCorretiva / t.falhas).toFixed(2)) : 0,
      mtbf:
        t.falhas > 0
          ? Number((t.horasDisponiveis / t.falhas).toFixed(1))
          : Number(t.horasDisponiveis.toFixed(1)),
    }))
    .sort((a: any, b: any) => b.turnos - a.turnos);

  const byFront: Record<string, any> = {};
  for (const r of validRows) {
    if (!byFront[r.frenteServico]) {
      byFront[r.frenteServico] = {
        frente: r.frenteServico,
        turnos: 0,
        horasProgramadas: 0,
        horasCorretiva: 0,
        horasDisponiveis: 0,
        falhas: 0,
        desvios: 0,
      };
    }
    const f = byFront[r.frenteServico];
    f.turnos++;
    f.horasProgramadas += r.horasProgramadas;
    f.horasCorretiva += r.horasCorretiva;
    f.horasDisponiveis += r.horasDisponiveis;
    f.falhas += r.qtdFalhas;
    f.desvios += r.desvios ? r.desvios.length : 0;
  }
  const porFrente = Object.values(byFront)
    .map((f: any) => ({
      ...f,
      horasProgramadas: Number(f.horasProgramadas.toFixed(1)),
      horasCorretiva: Number(f.horasCorretiva.toFixed(2)),
      horasDisponiveis: Number(f.horasDisponiveis.toFixed(2)),
      dfPct:
        f.horasProgramadas > 0
          ? Number(((f.horasDisponiveis / f.horasProgramadas) * 100).toFixed(2))
          : 100,
    }))
    .sort((a: any, b: any) => b.turnos - a.turnos);

  const byMotivo: Record<string, any> = {};
  const ultimasCorretivas: any[] = [];
  const listaAtrasos: any[] = [];
  const listaTrocasReserva: any[] = [];

  for (const r of validRows) {
    if (r.houveTrocaEquipamento && r.placaReserva) {
      listaTrocasReserva.push({
        idRegistro: r.id,
        data: r.data,
        setor: r.setor,
        letra: r.letra || "-",
        placaPrincipal: r.placaPrincipal,
        placaReserva: r.placaReserva,
        equipamento: r.equipamentoNome,
        operador: r.operador,
        frente: r.frenteServico,
        dfPct: r.disponibilidadeFisica,
      });
    }

    if (r.statusApresentacao === "ATRASADO" || r.statusApresentacao === "NAO_APRESENTOU") {
      const minPerdidosAtraso =
        r.statusApresentacao === "NAO_APRESENTOU"
          ? Math.round((r.horasProgramadas || 10.5) * 60)
          : Number(r.atrasoMinutos || 0);
      listaAtrasos.push({
        idRegistro: r.id,
        data: r.data,
        setor: r.setor,
        letra: r.letra || "-",
        placa: r.placaPrincipal,
        placaReserva: r.placaReserva || null,
        equipamento: r.equipamentoNome,
        tipoEquipamento: r.tipoEquipamento,
        operador: r.operador,
        frente: r.frenteServico,
        statusApresentacao: r.statusApresentacao,
        horaProg: r.horarioProgramadoApresentacao || "07:00",
        horaReal: r.statusApresentacao === "NAO_APRESENTOU" ? "NÃO APRESENTOU" : r.horarioApresentacao || "07:00",
        atrasoMinutos: minPerdidosAtraso,
        horasPerdidas: Number((minPerdidosAtraso / 60).toFixed(2)),
        motivo: r.motivoAtrasoApresentacao || (r.statusApresentacao === "NAO_APRESENTOU" ? "Não Apresentou" : "Atraso no Início"),
        justificativa: r.justificativaApresentacao || "",
        dfPct: r.disponibilidadeFisica,
      });
    }

    // 1. Paradas / Corretivas registradas na lista
    for (const c of r.corretivas || []) {
      const m = c.motivo || "Manutenção Corretiva Geral";
      if (!byMotivo[m]) byMotivo[m] = { motivo: m, ocorrencias: 0, minutos: 0, horas: 0 };
      byMotivo[m].ocorrencias++;
      byMotivo[m].minutos += c.duracaoMin || 0;
      byMotivo[m].horas = Number((byMotivo[m].minutos / 60).toFixed(2));
      const localTipo =
        c.localTipo ||
        (c.localParada &&
        (c.localParada.toUpperCase().includes("BASE") ||
          c.localParada.toUpperCase().includes("OFICINA") ||
          c.localParada.toUpperCase().includes("GARAGEM"))
          ? "BASE"
          : "AREA");
      ultimasCorretivas.push({
        idRegistro: r.id,
        paradaId: c.paradaId,
        data: r.data,
        letra: r.letra || "B",
        area: r.area || (r.setor === "TPM" ? "TPM" : "MINÉRIO"),
        placa: r.placaPrincipal,
        placaReserva: r.placaReserva || null,
        equipamento: r.equipamentoNome,
        tipoEquipamento: r.tipoEquipamento,
        operador: r.operador,
        frente: r.frenteServico,
        localTipo,
        localParada: c.localParada || r.frenteServico,
        localRetorno: c.localRetorno || "",
        inicio: c.inicio,
        fim: c.fim,
        duracaoMin: c.duracaoMin || 0,
        duracaoHoras: Number(((c.duracaoMin || 0) / 60).toFixed(2)),
        motivo: m,
        solucao: c.solucao || "",
        tipoEvento: "CORRETIVA",
        emAberto: c.emAberto,
      });
    }

    // 2. Atraso na apresentação de início de turno (quando não coberto por uma corretiva já lançada)
    if (r.statusApresentacao === "ATRASADO" && (r.atrasoMinutos || 0) > 0) {
      const mProg = timeToMinutes(r.horarioProgramadoApresentacao) ?? 7 * 60;
      const mReal = timeToMinutes(r.horarioApresentacao);
      const jaCoberto = (r.corretivas || []).some((c) => {
        const cIni = timeToMinutes(c.inicio);
        const cFim = !c.emAberto && /^\d{2}:\d{2}$/.test(c.fim) ? timeToMinutes(c.fim) : null;
        if (cIni === null) return false;
        if (cFim !== null && mReal !== null) {
          return Math.abs(cIni - mProg) <= 5 && Math.abs(cFim - mReal) <= 5;
        }
        return Math.abs(cIni - mProg) <= 5;
      });
      if (!jaCoberto) {
        const m = r.motivoAtrasoApresentacao
          ? `${r.motivoAtrasoApresentacao}${r.justificativaApresentacao ? " (" + r.justificativaApresentacao + ")" : ""}`
          : "Atraso na Apresentação (Início do Turno)";
        if (!byMotivo[m]) byMotivo[m] = { motivo: m, ocorrencias: 0, minutos: 0, horas: 0 };
        byMotivo[m].ocorrencias++;
        byMotivo[m].minutos += r.atrasoMinutos;
        byMotivo[m].horas = Number((byMotivo[m].minutos / 60).toFixed(2));
        const motivoUp = (r.motivoAtrasoApresentacao || "").toUpperCase();
        const isBase =
          motivoUp.includes("CORRETIVA") ||
          motivoUp.includes("MANUTENÇÃO") ||
          motivoUp.includes("RESERVA") ||
          motivoUp.includes("BASE");
        ultimasCorretivas.push({
          idRegistro: r.id,
          paradaId: 0,
          data: r.data,
          letra: r.letra || "B",
          area: r.area || (r.setor === "TPM" ? "TPM" : "MINÉRIO"),
          placa: r.placaPrincipal,
          placaReserva: r.placaReserva || null,
          equipamento: r.equipamentoNome,
          tipoEquipamento: r.tipoEquipamento,
          operador: r.operador,
          frente: r.frenteServico,
          localTipo: isBase ? "BASE" : "AREA",
          localParada: isBase ? "BASE / INÍCIO DO TURNO" : `INÍCIO / ${r.frenteServico}`,
          localRetorno: r.frenteServico,
          inicio: r.horarioProgramadoApresentacao || "07:00",
          fim: r.horarioApresentacao || "07:00",
          duracaoMin: r.atrasoMinutos || 0,
          duracaoHoras: Number(((r.atrasoMinutos || 0) / 60).toFixed(2)),
          motivo: m,
          solucao: `Apresentou às ${r.horarioApresentacao || "07:00"}`,
          tipoEvento: "ATRASO_INICIO",
          emAberto: false,
        });
      }
    } else if (r.statusApresentacao === "NAO_APRESENTOU") {
      const m = r.motivoAtrasoApresentacao
        ? `Não Apresentou: ${r.motivoAtrasoApresentacao}`
        : "Não Apresentou na Frente de Serviço";
      const minPerdidos = Math.round((r.horasProgramadas || 10.5) * 60);
      if (!byMotivo[m]) byMotivo[m] = { motivo: m, ocorrencias: 0, minutos: 0, horas: 0 };
      byMotivo[m].ocorrencias++;
      byMotivo[m].minutos += minPerdidos;
      byMotivo[m].horas = Number((byMotivo[m].minutos / 60).toFixed(2));
      ultimasCorretivas.push({
        idRegistro: r.id,
        paradaId: 0,
        data: r.data,
        letra: r.letra || "B",
        area: r.area || (r.setor === "TPM" ? "TPM" : "MINÉRIO"),
        placa: r.placaPrincipal,
        placaReserva: r.placaReserva || null,
        equipamento: r.equipamentoNome,
        tipoEquipamento: r.tipoEquipamento,
        operador: r.operador,
        frente: r.frenteServico,
        localTipo: "BASE",
        localParada: "BASE / NÃO APRESENTOU",
        localRetorno: "",
        inicio: r.horarioProgramadoApresentacao || "07:00",
        fim: "TURNO INTEGRAL",
        duracaoMin: minPerdidos,
        duracaoHoras: Number((minPerdidos / 60).toFixed(2)),
        motivo: m,
        solucao: r.justificativaApresentacao || "",
        tipoEvento: "NAO_APRESENTOU",
        emAberto: false,
      });
    }
  }
  const porMotivoCorretiva = Object.values(byMotivo).sort((a: any, b: any) => b.horas - a.horas);

  const bySolicitante: Record<string, number> = {};
  const listaDesvios: any[] = [];
  for (const r of validRows) {
    for (const d of r.desvios || []) {
      const sol = d.solicitante || "NÃO INFORMADO";
      bySolicitante[sol] = (bySolicitante[sol] || 0) + 1;
      listaDesvios.push({
        idRegistro: r.id,
        data: r.data,
        placa: r.placaPrincipal,
        placaReserva: r.placaReserva || null,
        equipamento: r.equipamentoNome,
        frenteOriginal: r.frenteServico,
        destino: d.destino,
        solicitante: sol,
        horario: d.horario,
        descricao: d.descricao,
      });
    }
  }
  const porSolicitanteDesvio = Object.entries(bySolicitante)
    .map(([solicitante, qtd]) => ({ solicitante, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  return {
    kpis: {
      totalTurnos,
      horasProgramadas,
      horasDisponiveis: Number((totalMinutosDisponiveis / 60).toFixed(2)),
      horasCorretiva: Number((totalMinutosCorretiva / 60).toFixed(2)),
      disponibilidadeFisica: disponibilidadeFisicaExata,
      totalFalhas,
      paradasEmAbertoCount: paradasEmAberto.length,
      mttrHoras,
      mtbfHoras,
      taxaPontualidade,
      turnosPontuais,
      turnosAtrasados,
      turnosNaoApresentou,
      turnosAguardandoApres,
      totalDesvios,
      totalTrocasReserva,
      totalAlmocos,
    },
    paradasEmAberto: paradasEmAberto.sort((a, b) => b.data.localeCompare(a.data)),
    evolucaoDiaria,
    porPlaca,
    porTipoEquipamento,
    porFrente,
    porMotivoCorretiva,
    ultimasCorretivas: ultimasCorretivas.sort((a, b) => b.data.localeCompare(a.data)),
    listaAtrasos: listaAtrasos.sort((a, b) => b.data.localeCompare(a.data)),
    listaTrocasReserva: listaTrocasReserva.sort((a, b) => b.data.localeCompare(a.data)),
    porSolicitanteDesvio,
    listaDesvios: listaDesvios.sort((a, b) => b.data.localeCompare(a.data)),
  };
}

export function computeCorretivasDiaData(registros: RegistroOperacional[], dataSel: string) {
  const registrosDia = registros.filter((r) => r.data === dataSel);
  const totalEquipamentos = Math.max(registrosDia.length, 41);
  const minutosPorEquipamento = 10.5 * 60;
  const totalMinutosContratados = totalEquipamentos * minutosPorEquipamento;

  const listaCorretivas: any[] = [];
  let totalMinutosPerdidos = 0;
  let paradasBase = 0;
  let paradasArea = 0;
  let paradasAbertas = 0;

  const formatHms = (m: number) => {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}:00`;
  };

  for (const r of registrosDia) {
    // 1. Paradas / Corretivas registradas durante o turno
    for (const c of r.corretivas || []) {
      const dur = Number(c.duracaoMin) || 0;
      totalMinutosPerdidos += dur;
      const localTipo =
        c.localTipo ||
        (c.localParada &&
        (c.localParada.toUpperCase().includes("BASE") ||
          c.localParada.toUpperCase().includes("OFICINA") ||
          c.localParada.toUpperCase().includes("GARAGEM"))
          ? "BASE"
          : "AREA");
      if (localTipo === "BASE") paradasBase++;
      else paradasArea++;
      if (c.emAberto) paradasAbertas++;

      const hIni = String(c.inicio || "07:00").padStart(5, "0");
      const hFim = c.emAberto
        ? "EM ABERTO"
        : c.fim
        ? String(c.fim).padStart(5, "0")
        : "EM ABERTO";

      listaCorretivas.push({
        idRegistro: r.id,
        paradaId: c.paradaId,
        data: r.data,
        placa: r.placaPrincipal,
        placaReserva: r.placaReserva || null,
        tipoEquipamento: r.tipoEquipamento,
        equipamentoNome: r.equipamentoNome,
        motorista: r.operador,
        letra: r.letra || "B",
        area: r.area || (r.setor === "TPM" ? "TPM" : "MINÉRIO"),
        servico: c.servico || c.motivo || "MANUTENÇÃO GERAL",
        tipoManutencao: c.tipoManutencao || c.motivo || "CORRETIVA",
        inicio: `${hIni}:00`,
        liberacao: c.emAberto ? "EM ABERTO" : `${hFim}:00`,
        duracaoMin: dur,
        horasPerdidas: formatHms(dur),
        localTipo,
        localParada: c.localParada || (localTipo === "BASE" ? "BASE / OFICINA" : "ÁREA OPERACIONAL"),
        solucao: c.solucao || "",
        emAberto: Boolean(c.emAberto),
      });
    }

    // 2. Atraso no início do atendimento (Apresentação na Frente com Atraso) ou Não Apresentação
    if (r.statusApresentacao === "ATRASADO" && (r.atrasoMinutos || 0) > 0) {
      const mProg = timeToMinutes(r.horarioProgramadoApresentacao) ?? 7 * 60;
      const mReal = timeToMinutes(r.horarioApresentacao);
      const jaCoberto = (r.corretivas || []).some((c) => {
        const cIni = timeToMinutes(c.inicio);
        const cFim = !c.emAberto && /^\d{2}:\d{2}$/.test(c.fim) ? timeToMinutes(c.fim) : null;
        if (cIni === null) return false;
        if (cFim !== null && mReal !== null) {
          return Math.abs(cIni - mProg) <= 5 && Math.abs(cFim - mReal) <= 5;
        }
        return Math.abs(cIni - mProg) <= 5;
      });

      if (!jaCoberto) {
        const dur = Number(r.atrasoMinutos) || 0;
        totalMinutosPerdidos += dur;
        const motivoUpper = (r.motivoAtrasoApresentacao || "").toUpperCase();
        const isBase =
          motivoUpper.includes("CORRETIVA") ||
          motivoUpper.includes("MANUTENÇÃO") ||
          motivoUpper.includes("RESERVA") ||
          motivoUpper.includes("BASE");
        const localTipo: "BASE" | "AREA" = isBase ? "BASE" : "AREA";
        if (localTipo === "BASE") paradasBase++;
        else paradasArea++;

        const hIni = String(r.horarioProgramadoApresentacao || "07:00").padStart(5, "0");
        const hFim = String(r.horarioApresentacao || "07:00").padStart(5, "0");
        const servicoLabel = r.justificativaApresentacao
          ? `${r.justificativaApresentacao.toUpperCase()} (${r.motivoAtrasoApresentacao || "ATRASO INÍCIO"})`
          : (r.motivoAtrasoApresentacao || "ATRASO NA APRESENTAÇÃO").toUpperCase();

        listaCorretivas.push({
          idRegistro: r.id,
          paradaId: 0,
          data: r.data,
          placa: r.placaPrincipal,
          placaReserva: r.placaReserva || null,
          tipoEquipamento: r.tipoEquipamento,
          equipamentoNome: r.equipamentoNome,
          motorista: r.operador,
          letra: r.letra || "B",
          area: r.area || (r.setor === "TPM" ? "TPM" : "MINÉRIO"),
          servico: servicoLabel,
          tipoManutencao: (r.motivoAtrasoApresentacao || "ATRASO NO INÍCIO DO TURNO").toUpperCase(),
          inicio: `${hIni}:00`,
          liberacao: `${hFim}:00`,
          duracaoMin: dur,
          horasPerdidas: formatHms(dur),
          localTipo,
          localParada: isBase ? "BASE / INÍCIO DO TURNO" : `APRESENTAÇÃO / ${r.frenteServico}`,
          solucao: `Apresentou na frente às ${hFim}`,
          emAberto: false,
        });
      }
    } else if (r.statusApresentacao === "NAO_APRESENTOU") {
      const dur = Math.round(minutosPorEquipamento);
      totalMinutosPerdidos += dur;
      paradasBase++;
      const hIni = String(r.horarioProgramadoApresentacao || "07:00").padStart(5, "0");
      const servicoLabel = r.justificativaApresentacao
        ? `${r.justificativaApresentacao.toUpperCase()} (${r.motivoAtrasoApresentacao || "NÃO APRESENTOU"})`
        : (r.motivoAtrasoApresentacao || "NÃO SE APRESENTOU NA FRENTE").toUpperCase();

      listaCorretivas.push({
        idRegistro: r.id,
        paradaId: 0,
        data: r.data,
        placa: r.placaPrincipal,
        placaReserva: r.placaReserva || null,
        tipoEquipamento: r.tipoEquipamento,
        equipamentoNome: r.equipamentoNome,
        motorista: r.operador,
        letra: r.letra || "B",
        area: r.area || (r.setor === "TPM" ? "TPM" : "MINÉRIO"),
        servico: servicoLabel,
        tipoManutencao: "NÃO APRESENTAÇÃO / INDISPONÍVEL",
        inicio: `${hIni}:00`,
        liberacao: "NÃO APRESENTOU",
        duracaoMin: dur,
        horasPerdidas: formatHms(dur),
        localTipo: "BASE",
        localParada: "BASE / NÃO APRESENTOU",
        solucao: r.justificativaApresentacao || "",
        emAberto: false,
      });
    }
  }

  const totalMinutosAtendimento = Math.max(0, totalMinutosContratados - totalMinutosPerdidos);
  const aderenciaPct =
    totalMinutosContratados > 0
      ? Number(((totalMinutosAtendimento / totalMinutosContratados) * 100).toFixed(2))
      : 100;

  return {
    resumo: {
      periodo: dataSel,
      totalEquipamentos,
      horaPorEquipamento: "10:30:00",
      totalHorasContratadas: formatHms(totalMinutosContratados),
      totalHorasPerdidas: formatHms(totalMinutosPerdidos),
      totalHorasAtendimento: formatHms(totalMinutosAtendimento),
      aderenciaPct,
      metaAderenciaPct: 95.0,
      dentroDaMeta: aderenciaPct >= 95.0,
      totalCorretivas: listaCorretivas.length,
      paradasBase,
      paradasArea,
      paradasAbertas,
      equipamentosOperandoNormal: totalEquipamentos - paradasAbertas,
    },
    corretivas: listaCorretivas,
  };
}

// ── Hybrid API Wrapper (calls /api/... first, falls back to client store + localStorage/Supabase) ──
export async function fetchMeta(): Promise<MetaOptions> {
  try {
    const res = await fetch("/api/meta");
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros, cadastros } = await ensureMemoryStore();
  const datas = [...new Set(registros.map((r) => r.data))].sort();
  const tipos = [
    ...new Set(
      [
        ...registros.map((r) => r.tipoEquipamento),
        ...(cadastros.equipamentos || []).map((e) => e.tipoEquipamento),
      ].filter(Boolean)
    ),
  ].sort();
  const placas = [
    ...new Set(
      [
        ...registros.map((r) => r.placaPrincipal),
        ...(cadastros.equipamentos || []).map((e) => e.placa),
      ].filter((p) => p && p !== "S/PLACA")
    ),
  ].sort();
  const frentes = [
    ...new Set(
      [
        ...registros.map((r) => r.frenteServico),
        ...(cadastros.locais || []).map((l) => l.nome),
      ].filter(Boolean)
    ),
  ].sort();
  const setores = [
    ...new Set(
      [
        ...registros.map((r) => r.setor),
        ...(cadastros.equipamentos || []).map((e) => e.setor),
        ...(cadastros.locais || []).map((l) => l.setor),
      ].filter(Boolean)
    ),
  ].sort();
  const operadores = [
    ...new Set(
      [
        ...registros.map((r) => r.operador),
        ...(cadastros.operadores || []).map((o) => o.nome),
      ].filter((o) => o && o !== "NÃO INFORMADO" && o !== "SEM OPERADOR")
    ),
  ].sort();
  const servicos = [...new Set((cadastros.servicos || []).map((s) => s.nome))].sort();
  const justificativas = [
    ...new Set((cadastros.justificativas || []).map((j) => j.motivo)),
  ].sort();

  return {
    dataMin: datas[0] || "2026-07-14",
    dataMax: datas[datas.length - 1] || "2026-11-16",
    datas,
    tipos,
    placas,
    frentes,
    setores,
    operadores,
    servicos,
    justificativas,
  };
}

export async function fetchAnalytics(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  try {
    const res = await fetch(`/api/analytics?${qs}`);
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const filtered = filterRegistrosList(registros, query);
  return computeAnalyticsData(filtered);
}

export async function fetchRegistros(query: Record<string, string>): Promise<{
  total: number;
  registros: RegistroOperacional[];
}> {
  const qs = new URLSearchParams(query).toString();
  try {
    const res = await fetch(`/api/registros?${qs}`);
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const filtered = filterRegistrosList(registros, query);
  const sorted = filtered.slice().sort((a, b) => {
    if (a.temParadaAberta !== b.temParadaAberta) return a.temParadaAberta ? -1 : 1;
    if (a.data !== b.data) return b.data.localeCompare(a.data);
    return a.id - b.id;
  });
  const limit = parseInt(query.limit, 10) || 500;
  return { total: sorted.length, registros: sorted.slice(0, limit) };
}

export async function fetchRegistroById(id: number): Promise<RegistroOperacional | null> {
  try {
    const res = await fetch(`/api/registros/${id}`);
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  return registros.find((r) => r.id === Number(id)) || null;
}

export async function fetchCorretivasDia(dataSel: string) {
  try {
    const res = await fetch(`/api/corretivas-dia?data=${encodeURIComponent(dataSel)}`);
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  return computeCorretivasDiaData(registros, dataSel);
}

export async function apiCreateRegistro(payload: any): Promise<RegistroOperacional> {
  try {
    const res = await fetch("/api/registros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const created = await res.json();
      saveOverrideRegistro(created);
      return created;
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const maxId = registros.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const newRec = recalculateRecordMetrics({
    id: maxId + 1,
    data: payload.data || new Date().toISOString().slice(0, 10),
    setor: payload.setor || "MFE",
    tipoEquipamento: payload.tipoEquipamento || "Caminhão Pipa",
    subcategoria: payload.subcategoria || "Padrão",
    equipamentoNome: payload.equipamentoNome || `${payload.tipoEquipamento || "Equipamento"} Busato`,
    regimeHoras: Number(payload.regimeHoras) || 12,
    ordemServico: payload.ordemServico || "",
    responsavel: payload.responsavel || "Operação Geral",
    frenteServico: payload.frenteServico || "Operação Portuária Geral",
    atividade: payload.atividade || "",
    operador: String(payload.operador || "NÃO INFORMADO").toUpperCase(),
    placaPrincipal: String(payload.placaPrincipal || "S/PLACA").toUpperCase(),
    placaReserva: payload.placaReserva ? String(payload.placaReserva).toUpperCase() : null,
    statusCodigo: payload.statusCodigo || "OPERANDO",
    statusApresentacao: payload.statusApresentacao || "AGUARDANDO",
    horarioProgramadoApresentacao: payload.horarioProgramadoApresentacao || "07:00",
    horarioApresentacao: payload.horarioApresentacao || "07:00",
    corretivas: [],
    almoco: null,
    desvios: [],
    horasProgramadas: 10.5,
    origem: "APONTAMENTO_PADRONIZADO",
  });
  registros.push(newRec);
  saveOverrideRegistro(newRec);
  return newRec;
}

export async function apiUpdateRegistro(id: number, payload: any): Promise<RegistroOperacional> {
  try {
    const res = await fetch(`/api/registros/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const updated = await res.json();
      saveOverrideRegistro(updated);
      return updated;
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const idx = registros.findIndex((r) => r.id === Number(id));
  if (idx === -1) throw new Error("Registro não encontrado");
  const merged = recalculateRecordMetrics({ ...registros[idx], ...payload, id: Number(id) });
  registros[idx] = merged;
  saveOverrideRegistro(merged);
  return merged;
}

export async function apiDeleteRegistro(id: number): Promise<void> {
  try {
    const res = await fetch(`/api/registros/${id}`, { method: "DELETE" });
    if (res.ok) {
      saveOverrideRegistro([], Number(id));
      return;
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const idx = registros.findIndex((r) => r.id === Number(id));
  if (idx !== -1) registros.splice(idx, 1);
  saveOverrideRegistro([], Number(id));
}

export async function apiConfirmarApresentacao(payload: {
  idRegistro: number;
  statusApresentacao: string;
  horarioProgramadoApresentacao?: string;
  horarioApresentacao?: string;
  motivoAtrasoApresentacao?: string;
  justificativaApresentacao?: string;
}): Promise<RegistroOperacional> {
  try {
    const res = await fetch("/api/apresentacao/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const updated = await res.json();
      saveOverrideRegistro(updated);
      return updated;
    }
  } catch {}

  return apiUpdateRegistro(payload.idRegistro, payload);
}

export async function apiConfirmarApresentacaoLote(data: string, horarioApresentacao = "07:00") {
  try {
    const res = await fetch("/api/apresentacao/confirmar-lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, horarioApresentacao }),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const updatedBatch: RegistroOperacional[] = [];
  for (let i = 0; i < registros.length; i++) {
    const r = registros[i];
    if (r.data === data && (r.statusApresentacao === "AGUARDANDO" || !r.statusApresentacao)) {
      const up = recalculateRecordMetrics({
        ...r,
        statusApresentacao: "NO_HORARIO",
        horarioApresentacao,
        motivoAtrasoApresentacao: "",
        justificativaApresentacao: "",
      });
      registros[i] = up;
      updatedBatch.push(up);
    }
  }
  if (updatedBatch.length > 0) saveOverrideRegistro(updatedBatch);
  return { ok: true, confirmados: updatedBatch.length };
}

export async function apiIniciarParada(payload: {
  idRegistro: number;
  tipoParada: string;
  motivo: string;
  localParada: string;
  inicio: string;
  fim?: string;
  emAberto: boolean;
  placaReserva?: string;
}): Promise<RegistroOperacional> {
  try {
    const res = await fetch("/api/paradas/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const updated = await res.json();
      saveOverrideRegistro(updated);
      return updated;
    }
  } catch {}

  const rec = await fetchRegistroById(payload.idRegistro);
  if (!rec) throw new Error("Turno não encontrado");
  const novaParada = {
    paradaId: Date.now(),
    tipoParada: payload.tipoParada || "CORRETIVA",
    inicio: payload.inicio || "08:00",
    fim: payload.emAberto ? "EM ABERTO" : payload.fim || "09:00",
    emAberto: Boolean(payload.emAberto),
    motivo: payload.motivo || "Manutenção Corretiva Geral",
    localParada: String(payload.localParada || rec.frenteServico).toUpperCase(),
    localRetorno: "",
    solucao: "",
  };
  return apiUpdateRegistro(payload.idRegistro, {
    corretivas: [...(rec.corretivas || []), novaParada],
  });
}

export async function apiEncerrarParada(payload: {
  idRegistro: number;
  paradaId?: number;
  fim: string;
  localParada?: string;
  localRetorno?: string;
  motivo?: string;
  solucao?: string;
}): Promise<RegistroOperacional> {
  try {
    const res = await fetch("/api/paradas/encerrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const updated = await res.json();
      saveOverrideRegistro(updated);
      return updated;
    }
  } catch {}

  const rec = await fetchRegistroById(payload.idRegistro);
  if (!rec) throw new Error("Registro não encontrado");
  const corretivas = (rec.corretivas || []).map((c) => {
    if (
      (payload.paradaId && Number(c.paradaId) === Number(payload.paradaId)) ||
      (!payload.paradaId && c.emAberto)
    ) {
      return {
        ...c,
        fim: String(payload.fim || "12:00").padStart(5, "0"),
        emAberto: false,
        localParada: payload.localParada ? payload.localParada.toUpperCase() : c.localParada,
        localRetorno: payload.localRetorno
          ? payload.localRetorno.toUpperCase()
          : c.localParada || rec.frenteServico,
        solucao: payload.solucao || c.solucao || "",
        motivo: payload.motivo || c.motivo,
      };
    }
    return c;
  });
  return apiUpdateRegistro(payload.idRegistro, {
    corretivas,
    frenteServico: payload.localRetorno ? payload.localRetorno.toUpperCase() : rec.frenteServico,
  });
}

export async function apiLancarCorretivaDia(payload: {
  data: string;
  idRegistro: number;
  localTipo: "BASE" | "AREA";
  servico: string;
  tipoManutencao: string;
  letra: string;
  area: string;
  inicio: string;
  fim?: string;
  emAberto: boolean;
}) {
  try {
    const res = await fetch("/api/corretivas-dia/lancar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const updated = await res.json();
      saveOverrideRegistro(updated);
      return updated;
    }
  } catch {}

  const rec = await fetchRegistroById(Number(payload.idRegistro));
  if (!rec) throw new Error("Equipamento não encontrado");
  const novaCorr = {
    paradaId: Date.now(),
    tipoParada: "CORRETIVA",
    inicio: String(payload.inicio || "07:00").slice(0, 5),
    fim: payload.emAberto ? "EM ABERTO" : String(payload.fim || "08:00").slice(0, 5),
    motivo: payload.tipoManutencao || payload.servico || "Manutenção Corretiva",
    servico: String(payload.servico || "MANUTENÇÃO GERAL").toUpperCase(),
    tipoManutencao: String(payload.tipoManutencao || payload.servico || "CORRETIVA").toUpperCase(),
    localTipo: payload.localTipo,
    localParada: (payload.localTipo === "AREA" ? payload.area || rec.frenteServico : "BASE / OFICINA").toUpperCase(),
    localRetorno: payload.area || rec.frenteServico,
    solucao: "",
    emAberto: Boolean(payload.emAberto),
  };
  return apiUpdateRegistro(Number(payload.idRegistro), {
    corretivas: [...(rec.corretivas || []), novaCorr],
    letra: payload.letra || "B",
    area: payload.area || "MINÉRIO",
  });
}

export async function apiLiberarCorretivaDia(payload: {
  idRegistro: number;
  paradaId: number;
  liberacaoHora: string;
  solucao?: string;
}) {
  try {
    const res = await fetch("/api/corretivas-dia/liberar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const updated = await res.json();
      saveOverrideRegistro(updated);
      return updated;
    }
  } catch {}

  return apiEncerrarParada({
    idRegistro: Number(payload.idRegistro),
    paradaId: Number(payload.paradaId),
    fim: payload.liberacaoHora,
    solucao: payload.solucao || "Liberado para operação",
  });
}

export async function apiClonarDia(dataOrigem: string, dataDestino: string) {
  try {
    const res = await fetch("/api/registros/clonar-dia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataOrigem, dataDestino }),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { registros } = await ensureMemoryStore();
  const sourceRows = registros.filter((r) => r.data === dataOrigem);
  if (sourceRows.length === 0) {
    throw new Error(`Nenhum registro encontrado na data de origem (${dataOrigem}).`);
  }
  let maxId = registros.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const created: RegistroOperacional[] = [];
  for (const src of sourceRows) {
    const cloned = recalculateRecordMetrics({
      ...src,
      id: ++maxId,
      data: dataDestino,
      statusCodigo: "AGUARDANDO_APRESENTACAO",
      statusApresentacao: "AGUARDANDO",
      horarioProgramadoApresentacao: src.horarioProgramadoApresentacao || "07:00",
      horarioApresentacao: "07:00",
      atrasoMinutos: 0,
      motivoAtrasoApresentacao: "",
      justificativaApresentacao: "",
      placaReserva: null,
      houveTrocaEquipamento: false,
      corretivas: [],
      almoco: null,
      desvios: [],
      observacaoExtra: "",
      observacoesBrutas: "",
      origem: "CLONADO_ESCALA_DIARIA",
    });
    registros.push(cloned);
    created.push(cloned);
  }
  saveOverrideRegistro(created);
  return { ok: true, clonados: created.length, dataOrigem, dataDestino };
}

// ── Cadastros CRUD ──────────────────────────────────────────────────────────
export async function fetchCadastros(): Promise<CadastrosData> {
  try {
    const res = await fetch("/api/cadastros");
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { cadastros } = await ensureMemoryStore();
  return cadastros;
}

export async function apiSaveCadastroItem(
  entidade: keyof CadastrosData,
  payload: any,
  id?: number | null
) {
  const isEdit = Boolean(id);
  const url = isEdit ? `/api/cadastros/${entidade}/${id}` : `/api/cadastros/${entidade}`;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      return await res.json();
    }
  } catch {}

  const { cadastros } = await ensureMemoryStore();
  const list = cadastros[entidade] || [];
  if (isEdit && id) {
    const idx = list.findIndex((x: any) => x.id === Number(id));
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...payload, id: Number(id) };
      saveOverrideCadastros(cadastros);
      return list[idx];
    }
  }
  const maxId = list.reduce((max: number, item: any) => Math.max(max, item.id || 0), 0);
  const novo = { ...payload, id: maxId + 1, status: payload.status || "ATIVO" };
  list.push(novo);
  cadastros[entidade] = list;
  saveOverrideCadastros(cadastros);
  return novo;
}

export async function apiDeleteCadastroItem(entidade: keyof CadastrosData, id: number) {
  try {
    const res = await fetch(`/api/cadastros/${entidade}/${id}`, { method: "DELETE" });
    if (res.ok) return;
  } catch {}

  const { cadastros } = await ensureMemoryStore();
  const list = cadastros[entidade] || [];
  const idx = list.findIndex((x: any) => x.id === Number(id));
  if (idx !== -1) list.splice(idx, 1);
  saveOverrideCadastros(cadastros);
}

// ── Client-side CSV Export Helpers ──────────────────────────────────────────
function toCsvValue(val: any): string {
  const s = String(val === null || val === undefined ? "" : val).replace(/\r?\n/g, " | ");
  if (s.includes(";") || s.includes('"') || s.includes(",")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerCsvDownload(filename: string, csvLines: string[]) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvLines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type TipoRelatorioCsv =
  | "medicao_frota"
  | "turnos_detalhados"
  | "corretivas_atrasos"
  | "atrasos_pontualidade";

function formatBrDateService(iso?: string | null) {
  if (!iso || !iso.includes("-")) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatHmsFromMin(totalMin: number) {
  const mInt = Math.max(0, Math.round(totalMin || 0));
  const hh = String(Math.floor(mInt / 60)).padStart(2, "0");
  const mm = String(mInt % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

async function getFilteredRowsForExport(query: Record<string, string>) {
  const { registros } = await ensureMemoryStore();
  let rows = filterRegistrosList(registros, query);
  try {
    const apiRes = await fetchRegistros({ ...query, limit: "10000" });
    if (apiRes.registros?.length) rows = apiRes.registros;
  } catch {}
  return rows;
}

export async function downloadRelatorioCsv(
  tipoRelatorio: TipoRelatorioCsv,
  query: Record<string, string>
) {
  const rows = await getFilteredRowsForExport(query);
  const csvLines: string[] = [];

  if (tipoRelatorio === "medicao_frota") {
    const analytics = computeAnalyticsData(rows);
    csvLines.push(
      [
        "PLACA_TAG",
        "TIPO_EQUIPAMENTO",
        "EQUIPAMENTO_NOME",
        "SETOR",
        "TURNOS_PROGRAMADOS",
        "HORAS_PROGRAMADAS_10H30",
        "HORAS_PERDIDAS_CORRETIVA_E_ATRASO",
        "HORAS_DISPONIVEIS_EFETIVAS",
        "DISPONIBILIDADE_FISICA_PCT",
        "QTD_OCORRENCIAS",
        "MTTR_HORAS",
        "MTBF_HORAS",
        "DESVIOS_ROTA",
        "TROCAS_RESERVA",
        "ALMOCOS_REGISTRADOS",
        "ULTIMO_OPERADOR",
      ].join(";")
    );
    for (const p of analytics.porPlaca) {
      csvLines.push(
        [
          p.placa,
          p.tipoEquipamento,
          p.equipamentoNome,
          p.setorPredominante,
          p.turnos,
          String(p.horasProgramadas).replace(".", ","),
          String(p.horasCorretiva).replace(".", ","),
          String(p.horasDisponiveis).replace(".", ","),
          String(p.dfPct).replace(".", ",") + "%",
          p.falhas,
          String(p.mttr).replace(".", ","),
          String(p.mtbf).replace(".", ","),
          p.desvios,
          p.trocas,
          p.almocos,
          p.ultimoOperador,
        ]
          .map(toCsvValue)
          .join(";")
      );
    }
  } else if (tipoRelatorio === "corretivas_atrasos") {
    const analytics = computeAnalyticsData(rows);
    csvLines.push(
      [
        "DATA",
        "TIPO_EVENTO",
        "PLACA",
        "TIPO_EQUIPAMENTO",
        "EQUIPAMENTO",
        "MOTORISTA_OPERADOR",
        "LETRA",
        "AREA",
        "INICIO",
        "LIBERACAO_FIM",
        "DURACAO_HH_MM_SS",
        "DURACAO_HORAS_DEC",
        "CLASSIFICACAO_LOCAL",
        "LOCAL_PARADA",
        "MOTIVO_SERVICO",
        "STATUS",
      ].join(";")
    );
    for (const c of analytics.ultimasCorretivas) {
      const tipoEv =
        c.tipoEvento === "ATRASO_INICIO"
          ? "ATRASO NO INICIO DO TURNO"
          : c.tipoEvento === "NAO_APRESENTOU"
          ? "NAO APRESENTOU"
          : "PARADA CORRETIVA";
      csvLines.push(
        [
          formatBrDateService(c.data),
          tipoEv,
          c.placa,
          c.tipoEquipamento || "",
          c.equipamento,
          c.operador,
          c.letra || "-",
          c.area || "-",
          c.inicio,
          c.emAberto ? "EM ABERTO" : c.fim,
          formatHmsFromMin(c.duracaoMin || Math.round((c.duracaoHoras || 0) * 60)),
          String(c.duracaoHoras).replace(".", ","),
          c.localTipo === "BASE" ? "BASE (OFICINA)" : "AREA (CAMPO)",
          c.localParada || c.frente,
          c.motivo,
          c.emAberto ? "EM ABERTO" : "ENCERRADA",
        ]
          .map(toCsvValue)
          .join(";")
      );
    }
  } else if (tipoRelatorio === "atrasos_pontualidade") {
    const analytics = computeAnalyticsData(rows);
    csvLines.push(
      [
        "DATA",
        "LETRA",
        "SETOR",
        "PLACA",
        "TIPO_EQUIPAMENTO",
        "OPERADOR",
        "FRENTE_SERVICO",
        "STATUS_APRESENTACAO",
        "HORA_PROGRAMADA",
        "HORA_REAL_NA_FRENTE",
        "ATRASO_MINUTOS",
        "HORAS_PERDIDAS",
        "DF_TURNO_PCT",
        "MOTIVO_ATRASO_OU_FALTA",
        "JUSTIFICATIVA",
      ].join(";")
    );
    for (const a of analytics.listaAtrasos) {
      csvLines.push(
        [
          formatBrDateService(a.data),
          a.letra,
          a.setor,
          a.placa,
          a.tipoEquipamento,
          a.operador,
          a.frente,
          a.statusApresentacao === "NAO_APRESENTOU" ? "NAO SE APRESENTOU" : "ATRASADO",
          a.horaProg,
          a.horaReal,
          a.atrasoMinutos,
          String(a.horasPerdidas).replace(".", ","),
          String(a.dfPct).replace(".", ",") + "%",
          a.motivo,
          a.justificativa,
        ]
          .map(toCsvValue)
          .join(";")
      );
    }
  } else {
    csvLines.push(
      [
        "ID",
        "DATA",
        "LETRA",
        "SETOR",
        "TIPO_EQUIPAMENTO",
        "EQUIPAMENTO",
        "REGIME_HS",
        "OS",
        "RESPONSAVEL",
        "FRENTE_SERVICO",
        "PLACA_PRINCIPAL",
        "PLACA_RESERVA",
        "OPERADOR",
        "STATUS_APRESENTACAO",
        "HORARIO_PROG_APRES",
        "HORARIO_REAL_APRES",
        "ATRASO_MIN",
        "MOTIVO_ATRASO_OU_FALTA",
        "JUSTIFICATIVA_APRESENTACAO",
        "STATUS_TURNO",
        "HORAS_PROGRAMADAS_10H30",
        "HORAS_PERDIDAS_TOTAL",
        "HORAS_DISPONIVEIS",
        "DF_PCT",
        "QTD_OCORRENCIAS",
        "DETALHE_CORRETIVAS",
        "ALMOCO",
        "DESVIOS",
        "OBSERVACOES",
      ].join(";")
    );
    for (const r of rows) {
      const detCorr = (r.corretivas || [])
        .map((c) => `${c.inicio}-${c.fim} [${c.localParada || ""}] (${c.motivo})`)
        .join(" / ");
      const detAlm = r.almoco ? `${r.almoco.inicio}-${r.almoco.fim}` : "";
      const detDesv = (r.desvios || [])
        .map((d) => `${d.destino} (${d.solicitante} ${d.horario})`)
        .join(" / ");
      csvLines.push(
        [
          r.id,
          r.data,
          r.letra || "-",
          r.setor,
          r.tipoEquipamento,
          r.equipamentoNome,
          r.regimeHoras,
          r.ordemServico,
          r.responsavel,
          r.frenteServico,
          r.placaPrincipal,
          r.placaReserva || "",
          r.operador,
          r.statusApresentacao,
          r.horarioProgramadoApresentacao,
          r.horarioApresentacao,
          r.atrasoMinutos,
          r.motivoAtrasoApresentacao || "",
          r.justificativaApresentacao || "",
          r.statusLabel,
          String(r.horasProgramadas).replace(".", ","),
          String(r.horasCorretiva).replace(".", ","),
          String(r.horasDisponiveis).replace(".", ","),
          String(r.disponibilidadeFisica).replace(".", ",") + "%",
          r.qtdFalhas,
          detCorr,
          detAlm,
          detDesv,
          r.observacoesBrutas,
        ]
          .map(toCsvValue)
          .join(";")
      );
    }
  }

  triggerCsvDownload(`relatorio_${tipoRelatorio}_busato.csv`, csvLines);
}

/**
 * Gera uma Pasta Excel Executiva Completa (.xlsx) com 6 abas estilizadas profissionalmente
 * para Medição, Auditoria e Envio à Gestão Vale / Busato.
 */
export async function downloadExcelExecutivo(
  query: Record<string, string>,
  periodoLabel?: { inicio: string; fim: string }
) {
  const rows = await getFilteredRowsForExport(query);
  const analytics = computeAnalyticsData(rows);
  buildAndDownloadStyledExecutiveExcel(rows, analytics, {
    inicio: periodoLabel?.inicio || query.dataInicio || "",
    fim: periodoLabel?.fim || query.dataFim || "",
  });
}

/**
 * Exporta o Boletim de Corretivas & Aderência (Padrão Vale/Busato 10:30h) em Excel (.xlsx) estilizado.
 */
export async function downloadBoletimAderenciaExcel(query: Record<string, string>) {
  const rows = await getFilteredRowsForExport(query);
  const analytics = computeAnalyticsData(rows);
  buildAndDownloadStyledBoletimExcel(analytics, {
    inicio: query.dataInicio || "",
    fim: query.dataFim || "",
  });
}

/**
 * Gera Relatório Executivo em PDF vetorial profissional (A4 Paisagem).
 */
export async function downloadPdfExecutivo(
  query: Record<string, string>,
  periodoLabel?: { inicio: string; fim: string }
) {
  const rows = await getFilteredRowsForExport(query);
  const analytics = computeAnalyticsData(rows);
  buildAndDownloadExecutivePdf(analytics, {
    inicio: periodoLabel?.inicio || query.dataInicio || "",
    fim: periodoLabel?.fim || query.dataFim || "",
  });
}

/**
 * Gera texto formatado de Resumo Gerencial para envio rápido via WhatsApp / E-mail CCO.
 */
export function buildResumoExecutivoTexto(analytics: any, dataInicio: string, dataFim: string): string {
  const k = analytics?.kpis;
  if (!k) return "";
  const minContratados = Math.round((k.horasProgramadas || 0) * 60);
  const minPerdidos = Math.round((k.horasCorretiva || 0) * 60);
  const minEfetivos = Math.max(0, minContratados - minPerdidos);
  const periodoTxt =
    dataInicio === dataFim
      ? formatBrDateService(dataInicio)
      : `${formatBrDateService(dataInicio)} a ${formatBrDateService(dataFim)}`;

  const topMotivos = (analytics.porMotivoCorretiva || [])
    .slice(0, 5)
    .map(
      (m: any, idx: number) =>
        `${idx + 1}. ${m.motivo}: ${String(m.horas).replace(".", ",")}h (${m.ocorrencias}x)`
    )
    .join("\n");

  const abertas = (analytics.paradasEmAberto || [])
    .slice(0, 8)
    .map((p: any) => `• ${p.placa} (${p.tipoEquipamento}) desde ${p.inicio} — ${p.motivo}`)
    .join("\n");

  return [
    `📊 *BOLETIM EXECUTIVO CCO PORTO — BUSATO*`,
    `📅 *Período:* ${periodoTxt} | *Turnos:* ${k.totalTurnos} (Base 10h30/eq.)`,
    ``,
    `🎯 *Aderência / DF%:* ${k.disponibilidadeFisica.toFixed(2).replace(".", ",")}% ${k.disponibilidadeFisica >= 95 ? "🟢 (Dentro da Meta >= 95%)" : "🔴 (Abaixo da Meta < 95%)"}`,
    `⏱️ *Contratado:* ${formatHmsFromMin(minContratados)} | *Efetivo:* ${formatHmsFromMin(minEfetivos)}`,
    `🚨 *Horas Perdidas (Corretivas + Atrasos):* ${formatHmsFromMin(minPerdidos)} (${k.totalFalhas} ocorrências)`,
    `📍 *Pontualidade na Frente:* ${k.taxaPontualidade.toFixed(1).replace(".", ",")}% (${k.turnosPontuais} pontuais | ${k.turnosAtrasados} atrasos | ${k.turnosNaoApresentou} faltas)`,
    `⚠️ *Desvios:* ${k.totalDesvios} | *Trocas p/ Reserva:* ${k.totalTrocasReserva}`,
    topMotivos ? `\n🔧 *Principais Causas de Perda:*\n${topMotivos}` : "",
    abertas ? `\n🔴 *Em Parada Aberta Agora (${analytics.paradasEmAberto.length}):*\n${abertas}` : `\n🟢 *Zero paradas em aberto no momento.*`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function downloadCorretivasDiaCsv(dataSel: string) {
  const data = await fetchCorretivasDia(dataSel);
  const { resumo, corretivas } = data;
  const csvLines: string[] = [];
  csvLines.push(
    [
      "DATA",
      "PLACA",
      "TIPO DE EQUIPAMENTO",
      "MOTORISTA",
      "LETRA",
      "ÁREA",
      "SERVIÇO",
      "TIPO DE MANUTENÇÃO",
      "INÍCIO",
      "LIBERAÇÃO",
      "HORAS PERDIDAS",
      "LOCAL",
    ].join(";")
  );

  for (const c of corretivas) {
    csvLines.push(
      [
        c.data,
        c.placa,
        c.tipoEquipamento,
        c.motorista,
        c.letra || "B",
        c.area || "MINÉRIO",
        c.servico,
        c.tipoManutencao,
        c.inicio,
        c.liberacao,
        c.horasPerdidas,
        c.localTipo === "BASE" ? "CORRETIVA NA BASE" : "CORRETIVA NA ÁREA",
      ]
        .map(toCsvValue)
        .join(";")
    );
  }

  csvLines.push("");
  csvLines.push("LEGENDA:");
  csvLines.push("CORRETIVA NA BASE (OFICINA)");
  csvLines.push("CORRETIVA NA ÁREA (CAMPO)");
  csvLines.push("");
  csvLines.push("RESUMO DO DIA:");
  csvLines.push(`PERÍODO:;${resumo.periodo}`);
  csvLines.push(`TOTAL DE EQUIPAMENTOS:;${resumo.totalEquipamentos}`);
  csvLines.push(`HORA POR EQUIPAMENTO:;${resumo.horaPorEquipamento}`);
  csvLines.push(`TOTAL DE HORAS:;${resumo.totalHorasContratadas}`);
  csvLines.push(`NÃO ATENDIMENTO (HORAS PERDIDAS):;${resumo.totalHorasPerdidas}`);
  csvLines.push(`ATENDIMENTO (HORAS EFETIVAS):;${resumo.totalHorasAtendimento}`);
  csvLines.push(`ADERÊNCIA / DISPONIBILIDADE (%):;${resumo.aderenciaPct}%`);

  triggerCsvDownload(`relatorio_corretivas_${dataSel}.csv`, csvLines);
}

// ── Programação PORTO11 Store & Sync with CCO Operation ──────────────────────
let memoryProgramacoes: ProgramacaoItem[] | null = null;
const LS_PROG_DIFF_KEY = "busato_programacao_porto11_v1";

export async function ensureProgramacaoStore(): Promise<ProgramacaoItem[]> {
  if (!memoryProgramacoes) {
    try {
      const map = new Map<number, ProgramacaoItem>();
      let loadedFromCloud = false;

      // 1. Prioriza leitura paginada em nuvem (Supabase)
      try {
        const sbRows = await fetchAllCloudRows("busato_programacao");
        if (sbRows.length > 0) {
          for (const row of sbRows) {
            if (row?.payload) map.set(row.payload.id, row.payload);
          }
          loadedFromCloud = true;
        }
      } catch {}

      // 2. Fallback JSON estático + cache local (exceto se base foi limpa pelo usuário)
      if (!loadedFromCloud) {
        const cleared = await isCcoBaseCleared();
        if (!cleared) {
          const res = await fetch("/data/programacao_porto11.json");
          const raw: ProgramacaoItem[] = res.ok ? await res.json() : [];
          for (const p of raw) {
            map.set(p.id, p);
          }
        }
        try {
          const savedStr = localStorage.getItem(LS_PROG_DIFF_KEY);
          if (savedStr) {
            const parsed = JSON.parse(savedStr);
            if (Array.isArray(parsed.upserted)) {
              for (const it of parsed.upserted) {
                map.set(it.id, it);
              }
            }
            if (Array.isArray(parsed.deletedIds)) {
              for (const delId of parsed.deletedIds) {
                map.delete(Number(delId));
              }
            }
          }
        } catch {}
      }

      memoryProgramacoes = Array.from(map.values());
    } catch {
      memoryProgramacoes = [];
    }
  }
  return memoryProgramacoes!;
}

function saveOverrideProgramacao(
  updated: ProgramacaoItem | ProgramacaoItem[],
  deletedId?: number
) {
  try {
    const savedStr = localStorage.getItem(LS_PROG_DIFF_KEY);
    const state = savedStr ? JSON.parse(savedStr) : { upserted: [], deletedIds: [] };
    const upMap = new Map<number, ProgramacaoItem>();
    for (const u of state.upserted || []) upMap.set(u.id, u);
    const delSet = new Set<number>(state.deletedIds || []);

    const items = Array.isArray(updated) ? updated : [updated];
    if (items.length > 0) {
      try {
        localStorage.removeItem(LS_CCO_CLEARED_KEY);
      } catch {}
    }
    for (const it of items) {
      if (it && it.id) {
        upMap.set(it.id, it);
        delSet.delete(it.id);
      }
    }
    if (deletedId !== undefined) {
      upMap.delete(deletedId);
      delSet.add(deletedId);
    }
    localStorage.setItem(
      LS_PROG_DIFF_KEY,
      JSON.stringify({
        upserted: Array.from(upMap.values()),
        deletedIds: Array.from(delSet.values()),
      })
    );
  } catch {}

  // Sincronização em nuvem (Supabase)
  try {
    const db = supabase as any;
    if (deletedId !== undefined) {
      db.from("busato_programacao").delete().eq("id", deletedId).then(() => {});
    } else {
      const items = Array.isArray(updated) ? updated : [updated];
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100).map((p) => ({
          id: p.id,
          data: p.data,
          payload: p,
          updated_at: new Date().toISOString(),
        }));
        db.from("busato_programacao").upsert(chunk).then(() => {});
      }
    }
  } catch {}
}

export async function fetchProgramacaoMeta() {
  const list = await ensureProgramacaoStore();
  const byDate = new Map<string, { data: string; diaSemana: string; letra: string; sheetName: string; count: number }>();
  for (const p of list) {
    const cur = byDate.get(p.data);
    if (!cur) {
      byDate.set(p.data, {
        data: p.data,
        diaSemana: p.diaSemana,
        letra: p.letra,
        sheetName: p.sheetName,
        count: 1,
      });
    } else {
      cur.count++;
    }
  }
  const dias = Array.from(byDate.values()).sort((a, b) => b.data.localeCompare(a.data));
  return {
    totalRegistros: list.length,
    totalDias: dias.length,
    dataMin: dias[dias.length - 1]?.data || "2026-02-21",
    dataMax: dias[0]?.data || "2026-11-18",
    dias,
  };
}

export async function fetchProgramacaoDia(dataIso: string): Promise<ProgramacaoItem[]> {
  const list = await ensureProgramacaoStore();
  return list.filter((p) => p.data === dataIso);
}

export async function apiSaveProgramacaoItem(
  payload: Partial<ProgramacaoItem>,
  id?: number | null
): Promise<ProgramacaoItem> {
  const list = await ensureProgramacaoStore();
  if (id) {
    const idx = list.findIndex((p) => p.id === Number(id));
    if (idx !== -1) {
      const merged: ProgramacaoItem = { ...list[idx], ...payload, id: Number(id) };
      list[idx] = merged;
      saveOverrideProgramacao(merged);
      return merged;
    }
  }
  const maxId = list.reduce((m, p) => Math.max(m, p.id || 0), 0);
  const dataIso = payload.data || "2026-11-18";
  const novo: ProgramacaoItem = {
    id: maxId + 1,
    sheetName: payload.sheetName || `PROGRAMAÇÃO ${dataIso}`,
    data: dataIso,
    diaSemana: payload.diaSemana || "DIA",
    letra: payload.letra || "A",
    secao: payload.secao || "HABITUAL_MFE",
    periodoTurno: payload.periodoTurno || "DIA",
    setor: payload.setor || "MFE",
    tipoEquipamentoBruto: payload.tipoEquipamentoBruto || "CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS",
    tipoEquipamento: payload.tipoEquipamento || "Caminhão Pipa",
    placa: String(payload.placa || "A DEFINIR").toUpperCase(),
    placaReserva: payload.placaReserva ? String(payload.placaReserva).toUpperCase() : null,
    placaBruta: String(payload.placa || "").toUpperCase(),
    regime: payload.regime || "12 HORAS",
    regimeHoras: Number(payload.regimeHoras) || 12,
    horarioVale: payload.horarioVale || (payload.periodoTurno === "NOITE" ? "19 X 05:30" : "07 X 17:30"),
    horarioInicio: payload.periodoTurno === "NOITE" ? "19:00" : "07:00",
    centroCusto: payload.centroCusto || "0001540098",
    local: payload.local || "PORTO",
    tagProgramacao: payload.tagProgramacao || payload.tipoEquipamentoBruto || "",
    operador: String(payload.operador || "A DEFINIR").toUpperCase(),
    os: payload.os || "",
  };
  list.push(novo);
  saveOverrideProgramacao(novo);
  return novo;
}

export async function apiDeleteProgramacaoItem(id: number): Promise<void> {
  const list = await ensureProgramacaoStore();
  const idx = list.findIndex((p) => p.id === Number(id));
  if (idx !== -1) list.splice(idx, 1);
  saveOverrideProgramacao([], Number(id));
}

export async function apiBulkImportProgramacaoItems(items: Partial<ProgramacaoItem>[]): Promise<number> {
  const list = await ensureProgramacaoStore();
  let maxId = list.reduce((m, p) => Math.max(m, p.id || 0), 0);
  const created: ProgramacaoItem[] = [];

  // Replace existing items on the same dates being imported (preserves all other dates/weeks)
  const importedDates = new Set(items.map((i) => i.data).filter(Boolean));
  const importedDatesArr = Array.from(importedDates) as string[];
  for (let i = list.length - 1; i >= 0; i--) {
    if (importedDates.has(list[i].data)) {
      list.splice(i, 1);
    }
  }
  if (importedDatesArr.length > 0) {
    try {
      const db = supabase as any;
      await Promise.all([
        db.from("busato_programacao").delete().in("data", importedDatesArr),
        db.from("busato_registros").delete().in("data", importedDatesArr),
      ]);
    } catch {}
  }

  for (const payload of items) {
    const novo: ProgramacaoItem = {
      id: ++maxId,
      sheetName: payload.sheetName || `PROGRAMAÇÃO ${payload.data}`,
      data: payload.data || "2026-11-18",
      diaSemana: payload.diaSemana || "DIA",
      letra: payload.letra || "A",
      secao: payload.secao || "HABITUAL_MFE",
      periodoTurno: payload.periodoTurno || "DIA",
      setor: payload.setor || "MFE",
      tipoEquipamentoBruto: payload.tipoEquipamentoBruto || "EQUIPAMENTO",
      tipoEquipamento: payload.tipoEquipamento || "Outro",
      placa: String(payload.placa || "A DEFINIR").toUpperCase(),
      placaReserva: payload.placaReserva ? String(payload.placaReserva).toUpperCase() : null,
      placaBruta: String(payload.placaBruta || payload.placa || ""),
      regime: payload.regime || "12 HORAS",
      regimeHoras: Number(payload.regimeHoras) || 12,
      horarioVale: payload.horarioVale || "07 X 17:30",
      horarioInicio: payload.horarioInicio || "07:00",
      horarioFim: payload.horarioFim || "17:30",
      centroCusto: payload.centroCusto || "",
      local: payload.local || "PORTO",
      sublocal: payload.sublocal || "",
      local1: payload.local1 || payload.local || "",
      local2: payload.local2 || "",
      tagProgramacao: payload.tagProgramacao || "",
      descricaoAtividade: payload.descricaoAtividade || "",
      responsavelVale: payload.responsavelVale || "",
      telefoneVale: payload.telefoneVale || "",
      dono: payload.dono || "BUSATO",
      operador: String(payload.operador || "A DEFINIR").toUpperCase(),
      os: payload.os || "",
      os1: payload.os1 || payload.os || "",
      os2: payload.os2 || "",
    };
    list.push(novo);
    created.push(novo);
  }
  saveOverrideProgramacao(created);

  // Automaticamente alimenta a operação do CCO (registros e cadastros) com os dados importados!
  const { registros, cadastros } = await ensureMemoryStore();
  for (let i = registros.length - 1; i >= 0; i--) {
    if (importedDates.has(registros[i].data)) {
      registros.splice(i, 1);
    }
  }
  let maxRegId = registros.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const novosRegistros: RegistroOperacional[] = [];

  const opSet = new Set<string>((cadastros.operadores || []).map((o: any) => o.nome));
  const eqSet = new Set<string>((cadastros.equipamentos || []).map((e: any) => e.placa));
  const locSet = new Set<string>((cadastros.locais || []).map((l: any) => l.nome));
  let maxOpId = (cadastros.operadores || []).reduce((m: number, x: any) => Math.max(m, x.id || 0), 0);
  let maxEqId = (cadastros.equipamentos || []).reduce((m: number, x: any) => Math.max(m, x.id || 0), 0);
  let maxLocId = (cadastros.locais || []).reduce((m: number, x: any) => Math.max(m, x.id || 0), 0);

  for (const p of created) {
    const cleanEquipName = (p.tagProgramacao || p.tipoEquipamentoBruto)
      .replace(/^BUSATO_/i, "")
      .replace(/\s*-\s*TERCEIROS/i, "")
      .trim();

    const novoReg = recalculateRecordMetrics({
      id: ++maxRegId,
      data: p.data,
      setor: p.setor,
      tipoEquipamento: p.tipoEquipamento,
      subcategoria:
        p.secao === "EVENTUAL"
          ? "Contingência / Eventual"
          : p.periodoTurno === "NOITE"
          ? "Turno Noite"
          : "Habitual",
      equipamentoNome: cleanEquipName,
      equipamentoBruto: p.tipoEquipamentoBruto,
      regimeHoras: p.regimeHoras,
      ordemServico: p.os,
      responsavel: p.responsavelVale
        ? `${p.responsavelVale} (Letra ${p.letra})`
        : `Letra ${p.letra} (${p.periodoTurno})`,
      frenteServico: p.sublocal ? `${p.local} - ${p.sublocal}` : p.local || "Operação Portuária Geral",
      atividade: p.descricaoAtividade || p.tagProgramacao || p.tipoEquipamentoBruto,
      operador: p.operador,
      placaPrincipal: p.placa,
      placaReserva: p.placaReserva,
      statusCodigo: "OPERANDO",
      statusApresentacao: "NO_HORARIO",
      horarioProgramadoApresentacao: p.horarioInicio,
      horarioApresentacao: p.horarioInicio,
      corretivas: [],
      almoco: null,
      desvios: [],
      horasProgramadas: 10.5,
      origem: "PORTO11_PROGRAMACAO",
      letra: p.letra,
      area: p.setor === "TPM" ? "TPM" : "MINÉRIO",
    });
    registros.push(novoReg);
    novosRegistros.push(novoReg);

    // Auto-popular Cadastros (Operadores, Equipamentos e Locais) a partir da planilha
    if (p.operador && p.operador !== "A DEFINIR" && !p.operador.includes("EXTRA") && !opSet.has(p.operador)) {
      opSet.add(p.operador);
      cadastros.operadores.push({
        id: ++maxOpId,
        nome: p.operador,
        funcao: "Operador / Motorista",
        turnoHabitual: p.letra,
        matricula: "",
        status: "ATIVO",
      });
    }
    if (p.placa && p.placa !== "A DEFINIR" && !eqSet.has(p.placa)) {
      eqSet.add(p.placa);
      cadastros.equipamentos.push({
        id: ++maxEqId,
        placa: p.placa,
        tipoEquipamento: p.tipoEquipamento,
        equipamentoNome: cleanEquipName,
        setor: p.setor,
        regimeHoras: p.regimeHoras,
        status: "ATIVO",
      });
    }
    if (p.local && !locSet.has(p.local)) {
      locSet.add(p.local);
      cadastros.locais.push({
        id: ++maxLocId,
        nome: p.local,
        tipo: "AREA",
        setor: p.setor,
        descricao: "Importado da Programação PORTO11",
        status: "ATIVO",
      });
    }
  }

  saveOverrideRegistro(novosRegistros);
  saveOverrideCadastros(cadastros);

  return created.length;
}

export async function apiLimparTodosDadosCCO(): Promise<void> {
  memoryProgramacoes = [];
  memoryRegistros = [];
  memoryCadastros = {
    operadores: [],
    equipamentos: [],
    locais: [],
    servicos: [],
    justificativas: [],
  };
  try {
    localStorage.removeItem(LS_PROG_DIFF_KEY);
    localStorage.removeItem(LS_REG_DIFF_KEY);
    localStorage.removeItem(LS_CAD_KEY);
    localStorage.setItem(LS_CCO_CLEARED_KEY, "true");
  } catch {}
  try {
    const db = supabase as any;
    await Promise.all([
      db.from("busato_programacao").delete().gte("id", 0),
      db.from("busato_registros").delete().gte("id", 0),
      db.from("busato_cadastros").upsert({
        id: "default",
        payload: {
          operadores: [],
          equipamentos: [],
          locais: [],
          servicos: [],
          justificativas: [],
          _cleared: true,
        },
        updated_at: new Date().toISOString(),
      }),
    ]);
  } catch {}
}

/**
 * Sincroniza toda a Programação de um dia (da planilha PORTO11) diretamente para a Operação CCO!
 * Cria ou atualiza os atendimentos em `registros` para que apareçam na Operação Diária ao Vivo,
 * Painel Analítico, Corretivas do Dia e Boletim de Medição.
 */
export async function apiSincronizarProgramacaoParaOperacao(
  dataIso: string,
  modoStatus: "NO_HORARIO" | "AGUARDANDO" = "NO_HORARIO"
): Promise<{ sincronizados: number; criados: number; atualizados: number }> {
  const progDia = await fetchProgramacaoDia(dataIso);
  if (progDia.length === 0) {
    throw new Error(`Nenhuma programação encontrada para a data ${dataIso}.`);
  }

  const { registros } = await ensureMemoryStore();
  let maxId = registros.reduce((m, r) => Math.max(m, r.id || 0), 0);

  const existentesDia = registros.filter((r) => r.data === dataIso);
  const upserted: RegistroOperacional[] = [];
  let criados = 0;
  let atualizados = 0;

  for (const p of progDia) {
    const cleanEquipName = (p.tagProgramacao || p.tipoEquipamentoBruto)
      .replace(/^BUSATO_/i, "")
      .replace(/\s*-\s*TERCEIROS/i, "")
      .trim();

    // Tenta achar registro existente do mesmo dia pela OS ou pela Placa + Turno
    const foundIdx = registros.findIndex(
      (r) =>
        r.data === dataIso &&
        ((p.os && r.ordemServico === p.os) ||
          (p.placa !== "A DEFINIR" &&
            r.placaPrincipal === p.placa &&
            (r.horarioProgramadoApresentacao || "07:00") === p.horarioInicio))
    );

    if (foundIdx !== -1 && existentesDia.length > 0) {
      const merged = recalculateRecordMetrics({
        ...registros[foundIdx],
        setor: p.setor,
        tipoEquipamento: p.tipoEquipamento,
        equipamentoNome: cleanEquipName,
        equipamentoBruto: p.tipoEquipamentoBruto,
        regimeHoras: p.regimeHoras,
        ordemServico: p.os,
        responsavel: p.responsavelVale
          ? `${p.responsavelVale} (Letra ${p.letra})`
          : `Letra ${p.letra} (${p.periodoTurno})`,
        frenteServico: p.sublocal
          ? `${p.local} - ${p.sublocal}`
          : p.local || registros[foundIdx].frenteServico,
        atividade: p.descricaoAtividade || p.tagProgramacao || p.tipoEquipamentoBruto,
        operador: p.operador,
        placaPrincipal: p.placa,
        placaReserva: p.placaReserva,
        letra: p.letra,
        area: p.setor === "TPM" ? "TPM" : "MINÉRIO",
      });
      registros[foundIdx] = merged;
      upserted.push(merged);
      atualizados++;
    } else {
      const novo = recalculateRecordMetrics({
        id: ++maxId,
        data: p.data,
        setor: p.setor,
        tipoEquipamento: p.tipoEquipamento,
        subcategoria:
          p.secao === "EVENTUAL"
            ? "Contingência / Eventual"
            : p.periodoTurno === "NOITE"
            ? "Turno Noite"
            : "Habitual",
        equipamentoNome: cleanEquipName,
        equipamentoBruto: p.tipoEquipamentoBruto,
        regimeHoras: p.regimeHoras,
        ordemServico: p.os,
        responsavel: p.responsavelVale
          ? `${p.responsavelVale} (Letra ${p.letra})`
          : `Letra ${p.letra} (${p.periodoTurno})`,
        frenteServico: p.sublocal
          ? `${p.local} - ${p.sublocal}`
          : p.local || "Operação Portuária Geral",
        atividade: p.descricaoAtividade || p.tagProgramacao || p.tipoEquipamentoBruto,
        operador: p.operador,
        placaPrincipal: p.placa,
        placaReserva: p.placaReserva,
        statusCodigo: modoStatus === "AGUARDANDO" ? "AGUARDANDO_APRESENTACAO" : "OPERANDO",
        statusApresentacao: modoStatus,
        horarioProgramadoApresentacao: p.horarioInicio,
        horarioApresentacao: p.horarioInicio,
        corretivas: [],
        almoco: null,
        desvios: [],
        horasProgramadas: 10.5,
        origem: "PORTO11_PROGRAMACAO",
        letra: p.letra,
        area: p.setor === "TPM" ? "TPM" : "MINÉRIO",
      });
      registros.push(novo);
      upserted.push(novo);
      criados++;
    }
  }

  if (upserted.length > 0) {
    saveOverrideRegistro(upserted);
  }

  return {
    sincronizados: upserted.length,
    criados,
    atualizados,
  };
}
