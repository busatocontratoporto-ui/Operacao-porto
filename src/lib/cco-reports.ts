import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatBrDate(iso?: string | null) {
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

function formatNumBr(n: number, dec = 2) {
  return Number(n || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// ── Estilos Corporativos Busato / Vale para Excel (.xlsx) ────────────────────
const BORDER_THIN = {
  top: { style: "thin", color: { rgb: "CBD5E1" } },
  bottom: { style: "thin", color: { rgb: "CBD5E1" } },
  left: { style: "thin", color: { rgb: "CBD5E1" } },
  right: { style: "thin", color: { rgb: "CBD5E1" } },
};

const BORDER_HEADER = {
  top: { style: "thin", color: { rgb: "1E3A8A" } },
  bottom: { style: "medium", color: { rgb: "0F172A" } },
  left: { style: "thin", color: { rgb: "3B82F6" } },
  right: { style: "thin", color: { rgb: "3B82F6" } },
};

const STYLE_BANNER = {
  fill: { patternType: "solid", fgColor: { rgb: "0F2744" } },
  font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "left", vertical: "center" },
};

const STYLE_SUBBANNER = {
  fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
  font: { name: "Calibri", sz: 10, bold: false, color: { rgb: "E2E8F0" } },
  alignment: { horizontal: "left", vertical: "center" },
};

const STYLE_SECTION = {
  fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } },
  font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "1E3A8A" } },
  alignment: { horizontal: "left", vertical: "center" },
  border: BORDER_THIN,
};

const STYLE_TH = {
  fill: { patternType: "solid", fgColor: { rgb: "1E3A8A" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BORDER_HEADER,
};

const STYLE_TOTAL = {
  fill: { patternType: "solid", fgColor: { rgb: "EFF6FF" } },
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "medium", color: { rgb: "1E3A8A" } },
    bottom: { style: "double", color: { rgb: "1E3A8A" } },
    left: { style: "thin", color: { rgb: "CBD5E1" } },
    right: { style: "thin", color: { rgb: "CBD5E1" } },
  },
};

function makeCellStyle(
  zebra: boolean,
  align: "left" | "center" | "right" = "left",
  bold = false,
  badge?: "green" | "red" | "amber" | "orange" | "blue",
  numFmt?: string
) {
  let fillRgb = zebra ? "F8FAFC" : "FFFFFF";
  let fontRgb = "0F172A";

  if (badge === "green") {
    fillRgb = "DCFCE7";
    fontRgb = "166534";
    bold = true;
  } else if (badge === "red") {
    fillRgb = "FEE2E2";
    fontRgb = "991B1B";
    bold = true;
  } else if (badge === "amber") {
    fillRgb = "FEF3C7";
    fontRgb = "92400E";
    bold = true;
  } else if (badge === "orange") {
    fillRgb = "FFEDD5";
    fontRgb = "9A3412";
    bold = true;
  } else if (badge === "blue") {
    fillRgb = "DBEAFE";
    fontRgb = "1E40AF";
    bold = true;
  }

  return {
    fill: { patternType: "solid", fgColor: { rgb: fillRgb } },
    font: { name: "Calibri", sz: 10, bold, color: { rgb: fontRgb } },
    alignment: { horizontal: align, vertical: "center", wrapText: true },
    border: BORDER_THIN,
    ...(numFmt ? { numFmt } : {}),
  };
}

function setCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string | number,
  style: any,
  type?: "n" | "s"
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const t = type || (typeof value === "number" ? "n" : "s");
  ws[addr] = { v: value ?? "", t, s: style };
}

function fillBanner(
  ws: XLSX.WorkSheet,
  title: string,
  subtitle: string,
  colCount: number,
  merges: XLSX.Range[],
  rowHeights: { hpt: number }[]
) {
  for (let c = 0; c < colCount; c++) {
    setCell(ws, 0, c, c === 0 ? title : "", STYLE_BANNER, "s");
    setCell(ws, 1, c, c === 0 ? subtitle : "", STYLE_SUBBANNER, "s");
  }
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });
  rowHeights[0] = { hpt: 30 };
  rowHeights[1] = { hpt: 20 };
  rowHeights[2] = { hpt: 10 };
}

function finalizeSheet(
  ws: XLSX.WorkSheet,
  maxRow: number,
  colWidths: number[],
  merges: XLSX.Range[],
  rowHeights: { hpt: number }[],
  autoFilterRef?: string
) {
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(2, maxRow), c: colWidths.length - 1 },
  });
  ws["!cols"] = colWidths.map((wch) => ({ wch }));
  if (merges.length > 0) ws["!merges"] = merges;
  ws["!rows"] = rowHeights;
  if (autoFilterRef) ws["!autofilter"] = { ref: autoFilterRef };
}

/**
 * Gera Pasta Excel Executiva Completa (.xlsx) estilizada profissionalmente (6 abas).
 */
export function buildAndDownloadStyledExecutiveExcel(
  rows: any[],
  analytics: any,
  periodo: { inicio: string; fim: string }
) {
  const k = analytics.kpis;
  const wb = XLSX.utils.book_new();
  const periodoTxt = `${formatBrDate(periodo.inicio)} a ${formatBrDate(periodo.fim)}`;
  const geradoEm = new Date().toLocaleString("pt-BR");
  const minContratadosTotais = Math.round((k.horasProgramadas || 0) * 60);
  const minPerdidosTotais = Math.round((k.horasCorretiva || 0) * 60);
  const minEfetivosTotais = Math.max(0, minContratadosTotais - minPerdidosTotais);

  // ── ABA 1: RESUMO EXECUTIVO ──────────────────────────────────────────────────
  {
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    const rowHeights: { hpt: number }[] = [];
    const cols = [36, 22, 22, 22, 20, 18, 16, 16];
    fillBanner(
      ws,
      "BUSATO TRANSPORTES — RELATÓRIO EXECUTIVO CCO PORTO (CONTRATO VALE)",
      `Período: ${periodoTxt}   |   Base Contratual: 10:30h por turno   |   Meta DF%: 95,00%   |   Emitido em: ${geradoEm}`,
      cols.length,
      merges,
      rowHeights
    );

    // Seção KPI
    let r = 3;
    for (let c = 0; c < cols.length; c++) {
      setCell(ws, r, c, c === 0 ? "1. PAINEL DE INDICADORES CONTRATUAIS (KPIs)" : "", STYLE_SECTION, "s");
    }
    merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
    rowHeights[r] = { hpt: 22 };
    r++;

    // Cabeçalho tabela KPI
    setCell(ws, r, 0, "INDICADOR EXECUTIVO", STYLE_TH, "s");
    setCell(ws, r, 1, "RESULTADO", STYLE_TH, "s");
    setCell(ws, r, 2, "HORAS / BASE", STYLE_TH, "s");
    for (let c = 3; c < cols.length; c++) {
      setCell(ws, r, c, c === 3 ? "DETALHAMENTO & STATUS DA META" : "", STYLE_TH, "s");
    }
    merges.push({ s: { r, c: 3 }, e: { r, c: cols.length - 1 } });
    rowHeights[r] = { hpt: 24 };
    r++;

    const dfBadge = k.disponibilidadeFisica >= 95 ? "green" : k.disponibilidadeFisica >= 90 ? "amber" : "red";
    const pontBadge = k.taxaPontualidade >= 95 ? "green" : "amber";
    const kpiItems: [string, string | number, string, string, ("green" | "red" | "amber" | "blue")?][] = [
      ["Total de Turnos Medidos", k.totalTurnos, "41 máq/dia (padrão)", `${k.turnosPontuais} pontuais  |  ${k.turnosAtrasados} atrasos no início  |  ${k.turnosNaoApresentou} faltas`],
      ["Horas Contratadas (Base 10h30/eq.)", formatHmsFromMin(minContratadosTotais), `${formatNumBr(k.horasProgramadas, 1)} h`, "Base contratual líquida (07:00-17:30 / 19:00-05:30)", "blue"],
      ["Não Atendimento (Horas Perdidas)", formatHmsFromMin(minPerdidosTotais), `${formatNumBr(k.horasCorretiva, 2)} h`, `Corretivas + atrasos de apresentação (${k.totalFalhas} ocorrências)`, minPerdidosTotais > 0 ? "red" : "green"],
      ["Atendimento Efetivo (Operando)", formatHmsFromMin(minEfetivosTotais), `${formatNumBr(k.horasDisponiveis, 2)} h`, "Horas produtivas entregues na frente de serviço", "green"],
      ["Disponibilidade Física / Aderência (%)", `${formatNumBr(k.disponibilidadeFisica, 2)}%`, "Meta: 95,00%", k.disponibilidadeFisica >= 95 ? "DENTRO DA META CONTRATUAL (>= 95%)" : "ABAIXO DA META CONTRATUAL (< 95%)", dfBadge],
      ["Taxa de Pontualidade na Frente (%)", `${formatNumBr(k.taxaPontualidade, 1)}%`, `${k.turnosAtrasados} atraso(s)`, "Apresentação no horário programado na frente de serviço", pontBadge],
      ["MTTR (Tempo Médio de Reparo)", `${formatNumBr(k.mttrHoras, 2)} h`, "Meta: < 2,00 h", `${k.paradasEmAbertoCount} parada(s) em aberto no momento`, k.mttrHoras > 2 ? "amber" : "green"],
      ["MTBF (Tempo Médio Entre Falhas)", `${formatNumBr(k.mtbfHoras, 1)} h`, "Confiabilidade", "Intervalo médio operacional entre ocorrências"],
      ["Desvios de Rota & Trocas Reserva", `${k.totalDesvios} desvios`, `${k.totalTrocasReserva} trocas`, "Desvios solicitados pelo cliente e substituições por placa reserva"],
    ];

    kpiItems.forEach((item, idx) => {
      const z = idx % 2 === 1;
      setCell(ws, r, 0, item[0], makeCellStyle(z, "left", true), "s");
      setCell(ws, r, 1, item[1], makeCellStyle(z, "center", true, item[4]), typeof item[1] === "number" ? "n" : "s");
      setCell(ws, r, 2, item[2], makeCellStyle(z, "center", false), "s");
      for (let c = 3; c < cols.length; c++) {
        setCell(ws, r, c, c === 3 ? item[3] : "", makeCellStyle(z, "left", Boolean(item[4]), item[4]), "s");
      }
      merges.push({ s: { r, c: 3 }, e: { r, c: cols.length - 1 } });
      rowHeights[r] = { hpt: 21 };
      r++;
    });

    rowHeights[r] = { hpt: 12 };
    r++;

    // Seção Evolução Diária
    for (let c = 0; c < cols.length; c++) {
      setCell(ws, r, c, c === 0 ? "2. EVOLUÇÃO DIÁRIA DE ADERÊNCIA E DISPONIBILIDADE FÍSICA" : "", STYLE_SECTION, "s");
    }
    merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
    rowHeights[r] = { hpt: 22 };
    r++;

    const evHeaders = [
      "DATA OPERAÇÃO",
      "TURNOS",
      "CONTRATADO (h)",
      "PERDIDO (h)",
      "EFETIVO (h)",
      "DF% / ADERÊNCIA",
      "OCORRÊNCIAS",
      "STATUS META",
    ];
    evHeaders.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
    rowHeights[r] = { hpt: 26 };
    r++;

    analytics.evolucaoDiaria.forEach((d: any, idx: number) => {
      const z = idx % 2 === 1;
      const dBadge = d.dfPct >= 95 ? "green" : d.dfPct >= 90 ? "amber" : "red";
      setCell(ws, r, 0, formatBrDate(d.data), makeCellStyle(z, "center", true), "s");
      setCell(ws, r, 1, Number(d.turnos), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 2, Number(d.horasProgramadas), makeCellStyle(z, "right", false, undefined, "0.00"), "n");
      setCell(ws, r, 3, Number(d.horasCorretiva), makeCellStyle(z, "right", d.horasCorretiva > 0, d.horasCorretiva > 0 ? "red" : undefined, "0.00"), "n");
      setCell(ws, r, 4, Number(d.horasDisponiveis), makeCellStyle(z, "right", true, undefined, "0.00"), "n");
      setCell(ws, r, 5, Number((d.dfPct / 100).toFixed(4)), makeCellStyle(z, "center", true, dBadge, "0.00%"), "n");
      setCell(ws, r, 6, Number(d.falhas), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 7, d.dfPct >= 95 ? "DENTRO DA META" : "ABAIXO DA META", makeCellStyle(z, "center", true, dBadge), "s");
      rowHeights[r] = { hpt: 20 };
      r++;
    });

    // Linha Total Evolução
    setCell(ws, r, 0, "TOTAL CONSOLIDADO", STYLE_TOTAL, "s");
    setCell(ws, r, 1, k.totalTurnos, { ...STYLE_TOTAL, numFmt: "#,##0" }, "n");
    setCell(ws, r, 2, Number(k.horasProgramadas), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 3, Number(k.horasCorretiva), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 4, Number(k.horasDisponiveis), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 5, Number((k.disponibilidadeFisica / 100).toFixed(4)), { ...STYLE_TOTAL, numFmt: "0.00%" }, "n");
    setCell(ws, r, 6, k.totalFalhas, { ...STYLE_TOTAL, numFmt: "#,##0" }, "n");
    setCell(ws, r, 7, k.disponibilidadeFisica >= 95 ? "META ATINGIDA" : "ATENÇÃO", STYLE_TOTAL, "s");
    rowHeights[r] = { hpt: 24 };

    finalizeSheet(ws, r, cols, merges, rowHeights);
    XLSX.utils.book_append_sheet(wb, ws, "Resumo Executivo");
  }

  // ── ABA 2: MEDIÇÃO CONSOLIDADA POR PLACA ─────────────────────────────────────
  {
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    const rowHeights: { hpt: number }[] = [];
    const cols = [13, 21, 32, 9, 9, 17, 15, 15, 14, 12, 11, 11, 10, 13, 26];
    fillBanner(
      ws,
      "BOLETIM DE MEDIÇÃO CONSOLIDADO POR PLACA / TAG — BASE 10:30H",
      `Período: ${periodoTxt}   |   Ordenado por maior impacto de horas perdidas`,
      cols.length,
      merges,
      rowHeights
    );

    const headers = [
      "Placa / TAG",
      "Tipo Equipamento",
      "Identificação",
      "Setor",
      "Turnos",
      "Contratado (h)",
      "Perdido (h)",
      "Efetivo (h)",
      "DF% / Ader.",
      "Ocorrências",
      "MTTR (h)",
      "MTBF (h)",
      "Desvios",
      "Trocas Res.",
      "Último Operador",
    ];
    let r = 3;
    headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
    rowHeights[r] = { hpt: 28 };
    const headerRow = r;
    r++;

    analytics.porPlaca.forEach((p: any, idx: number) => {
      const z = idx % 2 === 1;
      const dfB = p.dfPct >= 95 ? "green" : p.dfPct >= 90 ? "amber" : "red";
      setCell(ws, r, 0, p.placa, makeCellStyle(z, "center", true), "s");
      setCell(ws, r, 1, p.tipoEquipamento, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 2, p.equipamentoNome, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 3, p.setorPredominante, makeCellStyle(z, "center", true, "blue"), "s");
      setCell(ws, r, 4, Number(p.turnos), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 5, Number(p.horasProgramadas), makeCellStyle(z, "right", false, undefined, "0.00"), "n");
      setCell(ws, r, 6, Number(p.horasCorretiva), makeCellStyle(z, "right", p.horasCorretiva > 0, p.horasCorretiva > 0 ? "red" : undefined, "0.00"), "n");
      setCell(ws, r, 7, Number(p.horasDisponiveis), makeCellStyle(z, "right", true, undefined, "0.00"), "n");
      setCell(ws, r, 8, Number((p.dfPct / 100).toFixed(4)), makeCellStyle(z, "center", true, dfB, "0.00%"), "n");
      setCell(ws, r, 9, Number(p.falhas), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 10, Number(p.mttr), makeCellStyle(z, "right", false, undefined, "0.00"), "n");
      setCell(ws, r, 11, Number(p.mtbf), makeCellStyle(z, "right", false, undefined, "0.0"), "n");
      setCell(ws, r, 12, Number(p.desvios), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 13, Number(p.trocas), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 14, p.ultimoOperador, makeCellStyle(z, "left", false), "s");
      rowHeights[r] = { hpt: 20 };
      r++;
    });

    setCell(ws, r, 0, "TOTAL FROTA", STYLE_TOTAL, "s");
    setCell(ws, r, 1, `${analytics.porPlaca.length} placas`, STYLE_TOTAL, "s");
    setCell(ws, r, 2, "", STYLE_TOTAL, "s");
    setCell(ws, r, 3, "", STYLE_TOTAL, "s");
    setCell(ws, r, 4, k.totalTurnos, { ...STYLE_TOTAL, numFmt: "#,##0" }, "n");
    setCell(ws, r, 5, Number(k.horasProgramadas), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 6, Number(k.horasCorretiva), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 7, Number(k.horasDisponiveis), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 8, Number((k.disponibilidadeFisica / 100).toFixed(4)), { ...STYLE_TOTAL, numFmt: "0.00%" }, "n");
    setCell(ws, r, 9, k.totalFalhas, { ...STYLE_TOTAL, numFmt: "#,##0" }, "n");
    setCell(ws, r, 10, Number(k.mttrHoras), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
    setCell(ws, r, 11, Number(k.mtbfHoras), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.0" }, "n");
    setCell(ws, r, 12, k.totalDesvios, { ...STYLE_TOTAL, numFmt: "#,##0" }, "n");
    setCell(ws, r, 13, k.totalTrocasReserva, { ...STYLE_TOTAL, numFmt: "#,##0" }, "n");
    setCell(ws, r, 14, "", STYLE_TOTAL, "s");
    rowHeights[r] = { hpt: 24 };

    finalizeSheet(ws, r, cols, merges, rowHeights, `A${headerRow + 1}:O${r}`);
    XLSX.utils.book_append_sheet(wb, ws, "Medição por Placa");
  }

  // ── ABA 3: CORRETIVAS & PERDAS NO INÍCIO ─────────────────────────────────────
  {
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    const rowHeights: { hpt: number }[] = [];
    const cols = [12, 8, 11, 18, 12, 20, 26, 10, 13, 15, 13, 16, 24, 34, 24, 14];
    fillBanner(
      ws,
      "REGISTRO CONSOLIDADO DE PARADAS CORRETIVAS & PERDAS NO INÍCIO DO TURNO",
      `Período: ${periodoTxt}   |   Contabilização integral de horas perdidas e aderência`,
      cols.length,
      merges,
      rowHeights
    );

    const headers = [
      "Data",
      "Letra",
      "Área",
      "Tipo Evento",
      "Placa",
      "Tipo Equipamento",
      "Motorista / Operador",
      "Início",
      "Liberação",
      "Perda (HH:MM)",
      "Perda (h)",
      "Local Tipo",
      "Local / Frente",
      "Motivo / Serviço",
      "Solução / Obs.",
      "Status",
    ];
    let r = 3;
    headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
    rowHeights[r] = { hpt: 28 };
    const headerRow = r;
    r++;

    if (analytics.ultimasCorretivas.length === 0) {
      for (let c = 0; c < cols.length; c++) {
        setCell(ws, r, c, c === 0 ? "Nenhuma parada corretiva ou atraso registrado no período selecionado." : "", makeCellStyle(false, "center", true, "green"), "s");
      }
      merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
      rowHeights[r] = { hpt: 24 };
    } else {
      analytics.ultimasCorretivas.forEach((cItem: any, idx: number) => {
        const z = idx % 2 === 1;
        const tipoLbl =
          cItem.tipoEvento === "ATRASO_INICIO"
            ? "ATRASO INÍCIO"
            : cItem.tipoEvento === "NAO_APRESENTOU"
            ? "NÃO APRESENTOU"
            : "PARADA CORRETIVA";
        const tipoB =
          cItem.tipoEvento === "ATRASO_INICIO"
            ? "amber"
            : cItem.tipoEvento === "NAO_APRESENTOU"
            ? "red"
            : "blue";
        const locB = cItem.localTipo === "BASE" ? "orange" : "blue";
        const stB = cItem.emAberto ? "red" : "green";
        const minDur = cItem.duracaoMin || Math.round((cItem.duracaoHoras || 0) * 60);

        setCell(ws, r, 0, formatBrDate(cItem.data), makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 1, cItem.letra || "-", makeCellStyle(z, "center", true), "s");
        setCell(ws, r, 2, cItem.area || "MINÉRIO", makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 3, tipoLbl, makeCellStyle(z, "center", true, tipoB), "s");
        setCell(ws, r, 4, cItem.placa, makeCellStyle(z, "center", true), "s");
        setCell(ws, r, 5, cItem.tipoEquipamento || cItem.equipamento, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 6, cItem.operador, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 7, cItem.inicio, makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 8, cItem.emAberto ? "EM ABERTO" : cItem.fim, makeCellStyle(z, "center", cItem.emAberto, cItem.emAberto ? "red" : undefined), "s");
        setCell(ws, r, 9, formatHmsFromMin(minDur), makeCellStyle(z, "center", true, "red"), "s");
        setCell(ws, r, 10, Number(cItem.duracaoHoras || 0), makeCellStyle(z, "right", true, undefined, "0.00"), "n");
        setCell(ws, r, 11, cItem.localTipo === "BASE" ? "BASE (OFICINA)" : "ÁREA (CAMPO)", makeCellStyle(z, "center", true, locB), "s");
        setCell(ws, r, 12, cItem.localParada || cItem.frente, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 13, cItem.motivo, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 14, cItem.solucao || "", makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 15, cItem.emAberto ? "EM ABERTO" : "ENCERRADA", makeCellStyle(z, "center", true, stB), "s");
        rowHeights[r] = { hpt: 22 };
        r++;
      });

      setCell(ws, r, 0, "TOTAL PERDAS", STYLE_TOTAL, "s");
      setCell(ws, r, 1, `${analytics.ultimasCorretivas.length} ev.`, STYLE_TOTAL, "s");
      for (let c = 2; c < 9; c++) setCell(ws, r, c, "", STYLE_TOTAL, "s");
      setCell(ws, r, 9, formatHmsFromMin(minPerdidosTotais), STYLE_TOTAL, "s");
      setCell(ws, r, 10, Number(k.horasCorretiva), { ...STYLE_TOTAL, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" }, "n");
      for (let c = 11; c < cols.length; c++) setCell(ws, r, c, "", STYLE_TOTAL, "s");
      rowHeights[r] = { hpt: 24 };
    }

    finalizeSheet(ws, r, cols, merges, rowHeights, `A${headerRow + 1}:P${r}`);
    XLSX.utils.book_append_sheet(wb, ws, "Corretivas e Perdas");
  }

  // ── ABA 4: AUDITORIA DE PONTUALIDADE & ATRASOS ──────────────────────────────
  {
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    const rowHeights: { hpt: number }[] = [];
    const cols = [12, 8, 9, 12, 20, 26, 26, 18, 13, 15, 13, 13, 12, 32, 32];
    fillBanner(
      ws,
      "AUDITORIA DE PONTUALIDADE & ATRASOS NA APRESENTAÇÃO DE INÍCIO DE TURNO",
      `Período: ${periodoTxt}   |   Impacto direto no cálculo de Horas Perdidas e Aderência`,
      cols.length,
      merges,
      rowHeights
    );

    const headers = [
      "Data", "Letra", "Setor", "Placa", "Tipo Equipamento", "Operador", "Frente de Serviço",
      "Situação", "Hora Prog.", "Hora Real", "Atraso (min)", "Perda (h)", "DF% Turno", "Motivo Padronizado", "Justificativa"
    ];
    let r = 3;
    headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
    rowHeights[r] = { hpt: 28 };
    const headerRow = r;
    r++;

    if (analytics.listaAtrasos.length === 0) {
      for (let c = 0; c < cols.length; c++) {
        setCell(ws, r, c, c === 0 ? "100% de pontualidade! Nenhum atraso ou falta registrado no período." : "", makeCellStyle(false, "center", true, "green"), "s");
      }
      merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
      rowHeights[r] = { hpt: 24 };
    } else {
      analytics.listaAtrasos.forEach((a: any, idx: number) => {
        const z = idx % 2 === 1;
        const sitB = a.statusApresentacao === "NAO_APRESENTOU" ? "red" : "amber";
        const dfB = a.dfPct >= 95 ? "green" : a.dfPct >= 90 ? "amber" : "red";
        setCell(ws, r, 0, formatBrDate(a.data), makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 1, a.letra, makeCellStyle(z, "center", true), "s");
        setCell(ws, r, 2, a.setor, makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 3, a.placa, makeCellStyle(z, "center", true), "s");
        setCell(ws, r, 4, a.tipoEquipamento, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 5, a.operador, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 6, a.frente, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 7, a.statusApresentacao === "NAO_APRESENTOU" ? "NÃO APRESENTOU" : "ATRASO INÍCIO", makeCellStyle(z, "center", true, sitB), "s");
        setCell(ws, r, 8, a.horaProg, makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 9, a.horaReal, makeCellStyle(z, "center", true, sitB), "s");
        setCell(ws, r, 10, Number(a.atrasoMinutos || 0), makeCellStyle(z, "center", true, "red", "#,##0"), "n");
        setCell(ws, r, 11, Number(a.horasPerdidas || 0), makeCellStyle(z, "right", true, "red", "0.00"), "n");
        setCell(ws, r, 12, Number((a.dfPct / 100).toFixed(4)), makeCellStyle(z, "center", true, dfB, "0.00%"), "n");
        setCell(ws, r, 13, a.motivo, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 14, a.justificativa || "", makeCellStyle(z, "left", false), "s");
        rowHeights[r] = { hpt: 22 };
        r++;
      });
    }

    finalizeSheet(ws, r, cols, merges, rowHeights, `A${headerRow + 1}:O${r}`);
    XLSX.utils.book_append_sheet(wb, ws, "Atrasos e Pontualidade");
  }

  // ── ABA 5: DESVIOS & TROCAS RESERVA ──────────────────────────────────────────
  {
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    const rowHeights: { hpt: number }[] = [];
    const cols = [22, 12, 13, 13, 28, 24, 28, 22, 11, 28];
    fillBanner(
      ws,
      "RASTREABILIDADE DE DESVIOS DE PROGRAMAÇÃO & TROCAS POR RESERVA",
      `Período: ${periodoTxt}`,
      cols.length,
      merges,
      rowHeights
    );

    const headers = [
      "Tipo Ocorrência", "Data", "Placa Titular", "Placa Reserva", "Equipamento",
      "Frente Origem", "Destino / Substituição", "Solicitante / Operador", "Horário", "Descrição"
    ];
    let r = 3;
    headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
    rowHeights[r] = { hpt: 26 };
    const headerRow = r;
    r++;

    const combined = [
      ...analytics.listaDesvios.map((d: any) => ({
        tipo: "DESVIO DE ROTA",
        badge: "amber" as const,
        data: formatBrDate(d.data),
        placa: d.placa,
        reserva: "-",
        equip: d.equipamento,
        origem: d.frenteOriginal,
        destino: d.destino,
        sol: d.solicitante,
        hora: d.horario,
        desc: d.descricao || "",
      })),
      ...analytics.listaTrocasReserva.map((t: any) => ({
        tipo: "TROCA RESERVA",
        badge: "blue" as const,
        data: formatBrDate(t.data),
        placa: t.placaPrincipal,
        reserva: t.placaReserva,
        equip: t.equipamento,
        origem: t.frente,
        destino: `Assumido por ${t.placaReserva}`,
        sol: t.operador,
        hora: "-",
        desc: `DF Turno: ${formatNumBr(t.dfPct, 2)}%`,
      })),
    ];

    if (combined.length === 0) {
      for (let c = 0; c < cols.length; c++) {
        setCell(ws, r, c, c === 0 ? "Nenhum desvio de programação ou troca por reserva no período." : "", makeCellStyle(false, "center", true), "s");
      }
      merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
      rowHeights[r] = { hpt: 24 };
    } else {
      combined.forEach((it, idx) => {
        const z = idx % 2 === 1;
        setCell(ws, r, 0, it.tipo, makeCellStyle(z, "center", true, it.badge), "s");
        setCell(ws, r, 1, it.data, makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 2, it.placa, makeCellStyle(z, "center", true), "s");
        setCell(ws, r, 3, it.reserva, makeCellStyle(z, "center", it.reserva !== "-", it.reserva !== "-" ? "amber" : undefined), "s");
        setCell(ws, r, 4, it.equip, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 5, it.origem, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 6, it.destino, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 7, it.sol, makeCellStyle(z, "left", false), "s");
        setCell(ws, r, 8, it.hora, makeCellStyle(z, "center", false), "s");
        setCell(ws, r, 9, it.desc, makeCellStyle(z, "left", false), "s");
        rowHeights[r] = { hpt: 20 };
        r++;
      });
    }

    finalizeSheet(ws, r, cols, merges, rowHeights, `A${headerRow + 1}:J${r}`);
    XLSX.utils.book_append_sheet(wb, ws, "Desvios e Trocas");
  }

  // ── ABA 6: BASE TURNOS COMPLETA ──────────────────────────────────────────────
  {
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];
    const rowHeights: { hpt: number }[] = [];
    const cols = [12, 7, 8, 16, 12, 12, 20, 28, 25, 25, 11, 11, 11, 24, 15, 13, 13, 11, 11, 42];
    fillBanner(
      ws,
      "BASE ANALÍTICA COMPLETA DE TURNOS OPERACIONAIS (HIGIENIZADA)",
      `Período: ${periodoTxt}   |   ${rows.length} turno(s) exportado(s)`,
      cols.length,
      merges,
      rowHeights
    );

    const headers = [
      "Data", "Letra", "Setor", "OS", "Placa", "Reserva", "Tipo Equip.", "Equipamento",
      "Operador", "Frente de Serviço", "Prog.", "Real", "Atraso (m)", "Status Operacional",
      "Contrat. (10h30)", "Perdido (h)", "Efetivo (h)", "DF%", "Ocorr.", "Observações"
    ];
    let r = 3;
    headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
    rowHeights[r] = { hpt: 28 };
    const headerRow = r;
    r++;

    rows.forEach((row, idx) => {
      const z = idx % 2 === 1;
      const dfB = row.disponibilidadeFisica >= 95 ? "green" : row.disponibilidadeFisica >= 90 ? "amber" : "red";
      setCell(ws, r, 0, formatBrDate(row.data), makeCellStyle(z, "center", false), "s");
      setCell(ws, r, 1, row.letra || "-", makeCellStyle(z, "center", true), "s");
      setCell(ws, r, 2, row.setor, makeCellStyle(z, "center", true, "blue"), "s");
      setCell(ws, r, 3, row.ordemServico || "", makeCellStyle(z, "center", false), "s");
      setCell(ws, r, 4, row.placaPrincipal, makeCellStyle(z, "center", true), "s");
      setCell(ws, r, 5, row.placaReserva || "", makeCellStyle(z, "center", false), "s");
      setCell(ws, r, 6, row.tipoEquipamento, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 7, row.equipamentoNome, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 8, row.operador, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 9, row.frenteServico, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 10, row.horarioProgramadoApresentacao, makeCellStyle(z, "center", false), "s");
      setCell(ws, r, 11, row.horarioApresentacao, makeCellStyle(z, "center", false), "s");
      setCell(ws, r, 12, Number(row.atrasoMinutos || 0), makeCellStyle(z, "center", row.atrasoMinutos > 0, row.atrasoMinutos > 0 ? "amber" : undefined, "#,##0"), "n");
      setCell(ws, r, 13, row.statusLabel, makeCellStyle(z, "left", false), "s");
      setCell(ws, r, 14, Number(row.horasProgramadas), makeCellStyle(z, "right", false, undefined, "0.00"), "n");
      setCell(ws, r, 15, Number(row.horasCorretiva), makeCellStyle(z, "right", row.horasCorretiva > 0, row.horasCorretiva > 0 ? "red" : undefined, "0.00"), "n");
      setCell(ws, r, 16, Number(row.horasDisponiveis), makeCellStyle(z, "right", true, undefined, "0.00"), "n");
      setCell(ws, r, 17, Number((row.disponibilidadeFisica / 100).toFixed(4)), makeCellStyle(z, "center", true, dfB, "0.00%"), "n");
      setCell(ws, r, 18, Number(row.qtdFalhas || 0), makeCellStyle(z, "center", false, undefined, "#,##0"), "n");
      setCell(ws, r, 19, (row.observacoesBrutas || "").replace(/\r?\n/g, " | "), makeCellStyle(z, "left", false), "s");
      rowHeights[r] = { hpt: 20 };
      r++;
    });

    finalizeSheet(ws, r - 1, cols, merges, rowHeights, `A${headerRow + 1}:T${r - 1}`);
    XLSX.utils.book_append_sheet(wb, ws, "Base Turnos Completa");
  }

  const pIni = (periodo.inicio || "geral").replace(/-/g, "");
  const pFim = (periodo.fim || "geral").replace(/-/g, "");
  XLSX.writeFile(wb, `Relatorio_Executivo_CCO_Busato_${pIni}_a_${pFim}.xlsx`);
}

/**
 * Gera Boletim de Corretivas & Aderência Contratual (.xlsx) estilizado no padrão Vale / Busato (10:30h).
 */
export function buildAndDownloadStyledBoletimExcel(
  analytics: any,
  periodo: { inicio: string; fim: string }
) {
  const k = analytics.kpis;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const rowHeights: { hpt: number }[] = [];
  const cols = [12, 12, 22, 26, 8, 11, 17, 34, 11, 13, 15, 24];

  const minContratados = Math.round((k.horasProgramadas || 0) * 60);
  const minPerdidos = Math.round((k.horasCorretiva || 0) * 60);
  const minAtendimento = Math.max(0, minContratados - minPerdidos);
  const baseCount = analytics.ultimasCorretivas.filter((c: any) => c.localTipo === "BASE").length;
  const areaCount = analytics.ultimasCorretivas.filter((c: any) => c.localTipo !== "BASE").length;
  const dfBadge = k.disponibilidadeFisica >= 95 ? "green" : "red";

  fillBanner(
    ws,
    "BOLETIM DE CORRETIVAS & CONTROLE DE ADERÊNCIA CONTRATUAL — BUSATO PORTO",
    `Período: ${formatBrDate(periodo.inicio)} a ${formatBrDate(periodo.fim)}   |   Turnos Medidos: ${k.totalTurnos}   |   Base Contratual: 10:30:00 / equip.`,
    cols.length,
    merges,
    rowHeights
  );

  // Quadro de Resumo de Aderência
  let r = 3;
  for (let c = 0; c < cols.length; c++) {
    setCell(ws, r, c, c === 0 ? "QUADRO DE APURAÇÃO DE ADERÊNCIA CONTRATUAL (META >= 95,00%)" : "", STYLE_SECTION, "s");
  }
  merges.push({ s: { r, c: 0 }, e: { r, c: cols.length - 1 } });
  rowHeights[r] = { hpt: 22 };
  r++;

  setCell(ws, r, 0, "TOTAL CONTRATADO (10h30/eq.)", STYLE_TH, "s");
  setCell(ws, r, 1, "", STYLE_TH, "s");
  setCell(ws, r, 2, "NÃO ATENDIMENTO (PERDIDAS)", STYLE_TH, "s");
  setCell(ws, r, 3, "ATENDIMENTO EFETIVO", STYLE_TH, "s");
  setCell(ws, r, 4, "ADERÊNCIA / DF%", STYLE_TH, "s");
  setCell(ws, r, 5, "", STYLE_TH, "s");
  setCell(ws, r, 6, "OCORRÊNCIAS", STYLE_TH, "s");
  for (let c = 7; c < cols.length; c++) {
    setCell(ws, r, c, c === 7 ? "STATUS DA META CONTRATUAL" : "", STYLE_TH, "s");
  }
  merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
  merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  merges.push({ s: { r, c: 7 }, e: { r, c: cols.length - 1 } });
  rowHeights[r] = { hpt: 24 };
  r++;

  setCell(ws, r, 0, formatHmsFromMin(minContratados), makeCellStyle(false, "center", true, "blue"), "s");
  setCell(ws, r, 1, "", makeCellStyle(false, "center", true, "blue"), "s");
  setCell(ws, r, 2, formatHmsFromMin(minPerdidos), makeCellStyle(false, "center", true, minPerdidos > 0 ? "red" : "green"), "s");
  setCell(ws, r, 3, formatHmsFromMin(minAtendimento), makeCellStyle(false, "center", true, "green"), "s");
  setCell(ws, r, 4, `${formatNumBr(k.disponibilidadeFisica, 2)}%`, makeCellStyle(false, "center", true, dfBadge), "s");
  setCell(ws, r, 5, "", makeCellStyle(false, "center", true, dfBadge), "s");
  setCell(ws, r, 6, `${analytics.ultimasCorretivas.length} (${baseCount} Base | ${areaCount} Área)`, makeCellStyle(false, "center", true), "s");
  for (let c = 7; c < cols.length; c++) {
    setCell(
      ws,
      r,
      c,
      c === 7 ? (k.disponibilidadeFisica >= 95 ? "DENTRO DA META CONTRATUAL (>= 95,00%)" : "ABAIXO DA META CONTRATUAL (< 95,00%)") : "",
      makeCellStyle(false, "center", true, dfBadge),
      "s"
    );
  }
  merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
  merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  merges.push({ s: { r, c: 7 }, e: { r, c: cols.length - 1 } });
  rowHeights[r] = { hpt: 26 };
  r++;

  rowHeights[r] = { hpt: 12 };
  r++;

  const headers = [
    "DATA", "PLACA", "TIPO EQUIPAMENTO", "MOTORISTA / OPERADOR", "LETRA", "ÁREA",
    "TIPO EVENTO", "SERVIÇO / MOTIVO", "INÍCIO", "LIBERAÇÃO", "HORAS PERDIDAS", "LOCAL (BASE VS ÁREA)"
  ];
  headers.forEach((h, c) => setCell(ws, r, c, h, STYLE_TH, "s"));
  rowHeights[r] = { hpt: 28 };
  const headerRow = r;
  r++;

  analytics.ultimasCorretivas.forEach((cItem: any, idx: number) => {
    const z = idx % 2 === 1;
    const minDur = cItem.duracaoMin || Math.round((cItem.duracaoHoras || 0) * 60);
    const tipoLbl =
      cItem.tipoEvento === "ATRASO_INICIO"
        ? "ATRASO INÍCIO"
        : cItem.tipoEvento === "NAO_APRESENTOU"
        ? "NÃO APRESENTOU"
        : "CORRETIVA";
    const tipoB = cItem.tipoEvento === "ATRASO_INICIO" ? "amber" : cItem.tipoEvento === "NAO_APRESENTOU" ? "red" : "blue";
    const locB = cItem.localTipo === "BASE" ? "orange" : "blue";

    setCell(ws, r, 0, formatBrDate(cItem.data), makeCellStyle(z, "center", false), "s");
    setCell(ws, r, 1, cItem.placa, makeCellStyle(z, "center", true), "s");
    setCell(ws, r, 2, cItem.tipoEquipamento || cItem.equipamento, makeCellStyle(z, "left", false), "s");
    setCell(ws, r, 3, cItem.operador, makeCellStyle(z, "left", false), "s");
    setCell(ws, r, 4, cItem.letra || "-", makeCellStyle(z, "center", true), "s");
    setCell(ws, r, 5, cItem.area || "MINÉRIO", makeCellStyle(z, "center", false), "s");
    setCell(ws, r, 6, tipoLbl, makeCellStyle(z, "center", true, tipoB), "s");
    setCell(ws, r, 7, cItem.motivo, makeCellStyle(z, "left", false), "s");
    setCell(ws, r, 8, cItem.inicio, makeCellStyle(z, "center", false), "s");
    setCell(ws, r, 9, cItem.emAberto ? "EM ABERTO" : cItem.fim, makeCellStyle(z, "center", cItem.emAberto, cItem.emAberto ? "red" : undefined), "s");
    setCell(ws, r, 10, formatHmsFromMin(minDur), makeCellStyle(z, "center", true, "red"), "s");
    setCell(ws, r, 11, cItem.localTipo === "BASE" ? "CORRETIVA NA BASE (OFICINA)" : "CORRETIVA NA ÁREA (CAMPO)", makeCellStyle(z, "center", true, locB), "s");
    rowHeights[r] = { hpt: 21 };
    r++;
  });

  setCell(ws, r, 0, "TOTAL", STYLE_TOTAL, "s");
  for (let c = 1; c < 10; c++) setCell(ws, r, c, "", STYLE_TOTAL, "s");
  setCell(ws, r, 10, formatHmsFromMin(minPerdidos), STYLE_TOTAL, "s");
  setCell(ws, r, 11, `${baseCount} Base | ${areaCount} Área`, STYLE_TOTAL, "s");
  rowHeights[r] = { hpt: 24 };

  finalizeSheet(ws, r, cols, merges, rowHeights, `A${headerRow + 1}:L${r}`);
  XLSX.utils.book_append_sheet(wb, ws, "Boletim Aderência");
  XLSX.writeFile(wb, `Boletim_Aderencia_Corretivas_Busato_${(periodo.inicio || "geral").replace(/-/g, "")}.xlsx`);
}

/**
 * Gera Relatório Executivo em PDF Vetorial Profissional (Paisagem A4) com cabeçalho Busato,
 * cartões de KPI, evolução diária, causas de perda e auditoria de corretivas/atrasos.
 */
export function buildAndDownloadExecutivePdf(
  analytics: any,
  periodo: { inicio: string; fim: string }
) {
  const k = analytics.kpis;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const periodoTxt = `${formatBrDate(periodo.inicio)} a ${formatBrDate(periodo.fim)}`;
  const minContratados = Math.round((k.horasProgramadas || 0) * 60);
  const minPerdidos = Math.round((k.horasCorretiva || 0) * 60);
  const minEfetivos = Math.max(0, minContratados - minPerdidos);

  // Banner Superior Corporativo
  doc.setFillColor(15, 39, 68);
  doc.rect(0, 0, pageW, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("BUSATO TRANSPORTES — RELATÓRIO EXECUTIVO CCO PORTO (CONTRATO VALE)", 12, 10.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Período: ${periodoTxt}   |   Base Contratual: 10:30h por turno   |   Meta Contratual: 95,00%   |   Emitido em: ${new Date().toLocaleString("pt-BR")}`,
    12,
    18
  );

  // 4 Cartões de KPI
  const cards = [
    {
      label: "ADERÊNCIA / DF% DO PERÍODO",
      value: `${formatNumBr(k.disponibilidadeFisica, 2)}%`,
      sub: k.disponibilidadeFisica >= 95 ? "DENTRO DA META (>= 95%)" : "ABAIXO DA META (< 95%)",
      accent: k.disponibilidadeFisica >= 95 ? [22, 163, 74] : [225, 29, 72],
    },
    {
      label: "HORAS CONTRATADAS VS EFETIVAS",
      value: `${formatHmsFromMin(minEfetivos)}`,
      sub: `de ${formatHmsFromMin(minContratados)} (${k.totalTurnos} turnos)`,
      accent: [2, 132, 199],
    },
    {
      label: "NÃO ATENDIMENTO (PERDAS)",
      value: `${formatHmsFromMin(minPerdidos)}`,
      sub: `${k.totalFalhas} ocorrências (${k.paradasEmAbertoCount} em aberto)`,
      accent: [225, 29, 72],
    },
    {
      label: "PONTUALIDADE & DESVIOS",
      value: `${formatNumBr(k.taxaPontualidade, 1)}%`,
      sub: `${k.turnosAtrasados} atrasos • ${k.turnosNaoApresentou} faltas • ${k.totalDesvios} desvios`,
      accent: [217, 119, 6],
    },
  ];

  const cardW = (pageW - 24 - 12) / 4;
  cards.forEach((c, idx) => {
    const x = 12 + idx * (cardW + 4);
    const y = 29;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, y, cardW, 22, 2, 2, "FD");
    doc.setFillColor(c.accent[0], c.accent[1], c.accent[2]);
    doc.rect(x, y, 1.8, 22, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 4.5, y + 5.5);

    doc.setFontSize(13);
    doc.setTextColor(c.accent[0], c.accent[1], c.accent[2]);
    doc.text(c.value, x + 4.5, y + 13.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(c.sub, x + 4.5, y + 19);
  });

  // Tabela 1: Evolução Diária
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 39, 68);
  doc.text("1. EVOLUÇÃO DIÁRIA DE ADERÊNCIA E DISPONIBILIDADE FÍSICA", 12, 59);

  autoTable(doc, {
    startY: 62,
    margin: { left: 12, right: 12 },
    head: [["Data", "Turnos", "Contratado (10h30)", "Perdido (h)", "Efetivo (h)", "DF% / Aderência", "Ocorrências", "Status Meta"]],
    body: analytics.evolucaoDiaria.map((d: any) => [
      formatBrDate(d.data),
      d.turnos,
      formatNumBr(d.horasProgramadas, 2),
      formatNumBr(d.horasCorretiva, 2),
      formatNumBr(d.horasDisponiveis, 2),
      `${formatNumBr(d.dfPct, 2)}%`,
      d.falhas,
      d.dfPct >= 95 ? "DENTRO DA META" : "ABAIXO DA META",
    ]),
    styles: { fontSize: 8, cellPadding: 2, halign: "center" },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === "body" && (data.column.index === 5 || data.column.index === 7)) {
        const row = analytics.evolucaoDiaria[data.row.index];
        if (row) {
          data.cell.styles.fontStyle = "bold";
          if (row.dfPct >= 95) {
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [22, 101, 52];
          } else {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
          }
        }
      }
    },
  });

  // Tabela 2: Paradas Corretivas & Perdas no Início
  const yAfter1 = (doc as any).lastAutoTable?.finalY || 110;
  const startY2 = yAfter1 + 8 > 165 ? (doc.addPage(), 16) : yAfter1 + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 39, 68);
  doc.text(`2. DETALHAMENTO DE CORRETIVAS & PERDAS NO INÍCIO (${analytics.ultimasCorretivas.length})`, 12, startY2);

  autoTable(doc, {
    startY: startY2 + 3,
    margin: { left: 12, right: 12 },
    head: [["Data", "Placa", "Tipo Evento", "Motorista", "Início", "Liberação", "Perda", "Local", "Motivo / Serviço"]],
    body:
      analytics.ultimasCorretivas.length > 0
        ? analytics.ultimasCorretivas.map((c: any) => [
            formatBrDate(c.data),
            c.placa,
            c.tipoEvento === "ATRASO_INICIO" ? "ATRASO INÍCIO" : c.tipoEvento === "NAO_APRESENTOU" ? "NÃO APRESENTOU" : "CORRETIVA",
            c.operador,
            c.inicio,
            c.emAberto ? "EM ABERTO" : c.fim,
            formatHmsFromMin(c.duracaoMin || Math.round((c.duracaoHoras || 0) * 60)),
            c.localTipo === "BASE" ? "BASE" : "ÁREA",
            c.motivo,
          ])
        : [["-", "-", "-", "Nenhuma perda registrada no período", "-", "-", "00:00:00", "-", "-"]],
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center", cellWidth: 19 },
      1: { halign: "center", fontStyle: "bold", cellWidth: 18 },
      2: { halign: "center", cellWidth: 26 },
      4: { halign: "center", cellWidth: 14 },
      5: { halign: "center", cellWidth: 18 },
      6: { halign: "center", fontStyle: "bold", textColor: [185, 28, 28], cellWidth: 18 },
      7: { halign: "center", cellWidth: 14 },
    },
  });

  // Tabela 3: Medição por Placa (Frota)
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 39, 68);
  doc.text(`3. BOLETIM DE MEDIÇÃO CONSOLIDADO POR PLACA / TAG (${analytics.porPlaca.length} ativos)`, 12, 16);

  autoTable(doc, {
    startY: 19,
    margin: { left: 12, right: 12 },
    head: [["Placa", "Tipo Equipamento", "Setor", "Turnos", "Contrat. (h)", "Perdido (h)", "Efetivo (h)", "DF%", "Ocorr.", "MTTR", "Último Operador"]],
    body: analytics.porPlaca.map((p: any) => [
      p.placa,
      p.tipoEquipamento,
      p.setorPredominante,
      p.turnos,
      formatNumBr(p.horasProgramadas, 1),
      formatNumBr(p.horasCorretiva, 2),
      formatNumBr(p.horasDisponiveis, 2),
      `${formatNumBr(p.dfPct, 2)}%`,
      p.falhas,
      formatNumBr(p.mttr, 2),
      p.ultimoOperador,
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 39, 68], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const row = analytics.porPlaca[data.row.index];
        if (row) {
          data.cell.styles.fontStyle = "bold";
          if (row.dfPct >= 95) {
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [22, 101, 52];
          } else if (row.dfPct >= 90) {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [146, 64, 14];
          } else {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
          }
        }
      }
    },
  });

  // Rodapé em todas as páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Busato Transportes — CCO Porto / Contrato Vale (Base 10:30h/turno)   |   Página ${i} de ${totalPages}`,
      12,
      pageH - 7
    );
  }

  const pIni = (periodo.inicio || "geral").replace(/-/g, "");
  const pFim = (periodo.fim || "geral").replace(/-/g, "");
  doc.save(`Relatorio_Executivo_CCO_Busato_${pIni}_a_${pFim}.pdf`);
}
