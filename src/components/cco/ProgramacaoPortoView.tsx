import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useBusato, formatBrDate } from "@/contexts/BusatoContext";
import {
  fetchProgramacaoMeta,
  fetchProgramacaoDia,
  apiSaveProgramacaoItem,
  apiDeleteProgramacaoItem,
  apiBulkImportProgramacaoItems,
  apiSincronizarProgramacaoParaOperacao,
  apiLimparTodosDadosCCO,
  type ProgramacaoItem,
} from "@/lib/busato-service";

// ─── Catálogo de TAG Programação Vale ➔ Placa Titular, Regime e Operadores (Letra A / B) ───
export const TAG_VALE_FLEET_MAP: Record<
  string,
  {
    placa: string;
    placaReserva?: string | null;
    regime: string;
    operadores: { A_DIA?: string; B_DIA?: string; A_NOITE?: string; B_NOITE?: string };
  }
> = {
  "BUSATO_CAMINHÃO BASCULANTE 6M³ - MFE - TERCEIROS_01": {
    placa: "TOR0C66",
    regime: "12 HORAS",
    operadores: { A_DIA: "ODAIR", B_DIA: "JEREMIAS" },
  },
  "BUSATO_CAMINHÃO BROOK - MFE - TERCEIROS_01": {
    placa: "PPG9G09",
    regime: "12 HORAS",
    operadores: { A_DIA: "GEDEON", B_DIA: "RODRIGO MIRANDA" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_01": {
    placa: "TOM6D10",
    regime: "12 HORAS",
    operadores: { A_DIA: "LUIZ CLAUDIO", B_DIA: "TIAGO PATRICIO" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_02": {
    placa: "TOO0B01",
    regime: "12 HORAS",
    operadores: { A_DIA: "WANDERSON", B_DIA: "LUCAS BERGENS" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_03": {
    placa: "TOO0A75",
    regime: "12 HORAS",
    operadores: { A_DIA: "FABIO JUNIOR", B_DIA: "VANDO" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_04": {
    placa: "SFS5D63",
    regime: "12 HORAS",
    operadores: { A_DIA: "ROBSON CHARLES", B_DIA: "PAULO SERGIO" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_05": {
    placa: "TOO0A37",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "FABIO SANTOS",
      A_NOITE: "ELIZABETE",
      B_DIA: "HARTUIQUE",
      B_NOITE: "ROSIMERE",
    },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO VIAS - MFE - TERCEIROS_01": {
    placa: "SFX7E23",
    placaReserva: "QRJ4H20",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "EDER",
      A_NOITE: "ADEILSON CARVALHO",
      B_DIA: "UBIRAGÊ",
      B_NOITE: "MARCELO COELHO",
    },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO VIAS - MFE - TERCEIROS_02": {
    placa: "RBC9D49",
    regime: "12 HORAS",
    operadores: { A_DIA: "EDNEI", B_DIA: "MAGNO" },
  },
  "BUSATO_CAMINHÃO PIPA LIMPEZA - TPM - TERCEIROS_01": {
    placa: "TOL2A83",
    placaReserva: "PPV6E80",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "JOSÉ RICARDO",
      A_NOITE: "RICARDO FERREIRA",
      B_DIA: "ALEXANDRE PESTANA",
      B_NOITE: "RODRIGO",
    },
  },
  "BUSATO_CAMINHÃO PIPA LIMPEZA - MFE - TERCEIROS_01": {
    placa: "RQO6D90",
    placaReserva: "QRJ4H24",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "MARCOS ROBSON",
      A_NOITE: "CRISONALDO DA SILVA",
      B_DIA: "JONAS",
      B_NOITE: "MARCELO BASTOS",
    },
  },
  "BUSATO_CAMINHÃO PIPA LIMPEZA - MFE - TERCEIROS_02": {
    placa: "TOL2A34",
    regime: "12 HORAS",
    operadores: { A_DIA: "ALEX SILVERIO", B_DIA: "INGRID" },
  },
  "BUSATO_MINI CARR. 226B REMOTA - MFE - TERCEIROS_01": {
    placa: "MC750",
    regime: "12 HORAS",
    operadores: { A_DIA: "LUCAS GABRIEL", B_DIA: "GABRIEL DUARTE" },
  },
  "BUSATO_MINI CARR. S70 REMOTA - MFE - TERCEIROS_01": {
    placa: "MC693",
    regime: "12 HORAS",
    operadores: { A_DIA: "ALEXANDRE GRISMONDE", B_DIA: "LUCAS VARGAS" },
  },
  "BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_01": {
    placa: "MC708",
    regime: "12 HORAS",
    operadores: { A_DIA: "LEANDRO MARTINS", B_DIA: "ALEX PEREIRA" },
  },
  "BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_02": {
    placa: "MC722",
    placaReserva: "MC710",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "MARIO SILVA",
      A_NOITE: "LUCAS CORREA",
      B_DIA: "DANIEL BARBOSA",
      B_NOITE: "LUCAS MATHEUS",
    },
  },
  "BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_03": {
    placa: "MC710",
    regime: "12 HORAS",
    operadores: { A_DIA: "LUCAS FELIX", B_DIA: "GILENO" },
  },
  "BUSATO_MINI CARREGADEIRA 226B - MFE - TERCEIROS_04": {
    placa: "MC723",
    regime: "12 HORAS",
    operadores: { A_DIA: "ADRIAN", B_DIA: "GABRIEL POLICARPO" },
  },
  "BUSATO_MINI ESCAVADEIRA 303.5 - MFE - TERCEIROS_01": {
    placa: "MEH659",
    regime: "12 HORAS",
    operadores: { A_DIA: "VANILDO", B_DIA: "JOÃO NILTON" },
  },
  "BUSATO_MINI ESCAVADEIRA 303.5 - MFE - TERCEIROS_02": {
    placa: "MEH706",
    regime: "12 HORAS",
    operadores: { A_DIA: "IZAIAS DA PENHA", B_DIA: "HUDSON" },
  },
  "BUSATO_RETROESCAVADEIRA 416D - MFE - TERCEIROS_01": {
    placa: "RE504",
    regime: "12 HORAS",
    operadores: { A_DIA: "ANDRÉ FERREIRA", B_DIA: "RENAN GAUDIO" },
  },
  "BUSATO_RETROESCAVADEIRA 416D - MFE - TERCEIROS_02": {
    placa: "RE503",
    regime: "12 HORAS",
    operadores: { A_DIA: "MARCELO SACRAMENTO", B_DIA: "RICARDO" },
  },
  "BUSATO_RETROESCAVADEIRA 416D - MFE - TERCEIROS_03": {
    placa: "RE699",
    regime: "12 HORAS",
    operadores: { A_DIA: "EDMILSON", B_DIA: "ADELSON" },
  },
  "BUSATO_CAMINHÃO BASCULANTE 16TON - TPM - TERCEIROS_01": {
    placa: "TOK8A96",
    regime: "12 HORAS",
    operadores: { A_DIA: "PAULO HUMBERTO", B_DIA: "JOSE PATRICIO" },
  },
  "BUSATO_CAMINHÃO BASCULANTE 16TON - TPM - TERCEIROS_02": {
    placa: "TOK8B40",
    regime: "12 HORAS",
    operadores: { A_DIA: "RODRIGO GOMES SOUZA", B_DIA: "REINAN" },
  },
  "BUSATO_CAMINHÃO BROOK - TPM - TERCEIROS_01": {
    placa: "PPG9G01",
    regime: "12 HORAS",
    operadores: { A_DIA: "VALMIR C.", B_DIA: "FERNANDO ANTÔNIO" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - TPM - TERCEIROS_01": {
    placa: "TOO0A88",
    regime: "12 HORAS",
    operadores: { A_DIA: "FELIPE DOS REIS", B_DIA: "EDVAN" },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - TPM - TERCEIROS_02": {
    placa: "TOO0A45",
    placaReserva: "SFX7E36",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "ANTÔNIO MARCOS",
      A_NOITE: "CHARLES MONTEIRO",
      B_DIA: "FILIPI NOVAES",
      B_NOITE: "RENAN SOARES",
    },
  },
  "BUSATO_CAMINHÃO PIPA ASPERSÃO - TPM - TERCEIROS_03": {
    placa: "SFX7E36",
    regime: "12 HORAS",
    operadores: { A_DIA: "JOSENILTON", B_DIA: "CARLOS EDUARDO" },
  },
  "BUSATO_MINI CARR. S70 REMOTA - TPM - TERCEIROS_01": {
    placa: "MC694",
    placaReserva: "MC560",
    regime: "12 HORAS",
    operadores: { A_DIA: "EBISLEY", B_DIA: "JOSÉ CARLOS" },
  },
  "BUSATO_MINI CARREGADEIRA 226B - TPM - TERCEIROS_01": {
    placa: "MC709",
    placaReserva: "MC752",
    regime: "24 HORAS",
    operadores: {
      A_DIA: "DEIVISON",
      A_NOITE: "JUELSON",
      B_DIA: "WESLEY",
      B_NOITE: "CHARLES LASTRA",
    },
  },
  "BUSATO_MINI CARREGADEIRA 226B - TPM - TERCEIROS_02": {
    placa: "MC724",
    regime: "24 HORAS",
    operadores: { A_DIA: "JULIO CESAR", B_DIA: "PABLO VINICIUS" },
  },
  "BUSATO_MINI CARREGADEIRA 226B - TPM - TERCEIROS_03": {
    placa: "MC725",
    regime: "12 HORAS",
    operadores: { A_DIA: "KAWAN", B_DIA: "THIAGO SANTOS" },
  },
  "BUSATO_RETROESCAVADEIRA 416D - TPM - TERCEIROS_01": {
    placa: "RE698",
    regime: "12 HORAS",
    operadores: { A_DIA: "VALENTIM", B_DIA: "FABIO K." },
  },
};

export function calcLetraByDate(dataIso: string): "A" | "B" {
  try {
    const dObj = new Date(dataIso + "T12:00:00Z");
    const ref = new Date("2026-11-15T12:00:00Z"); // 15/11 = B (0), 16/11 = B (1), 17/11 = A (2), 18/11 = A (3)
    const diffDays = Math.round((dObj.getTime() - ref.getTime()) / 86400000);
    const mod = ((diffDays % 4) + 4) % 4;
    return mod === 0 || mod === 1 ? "B" : "A";
  } catch {
    return "A";
  }
}

export function getDiaSemanaBr(dataIso: string): string {
  try {
    const dObj = new Date(dataIso + "T12:00:00Z");
    const names = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
    return names[dObj.getUTCDay()] || "DIA";
  } catch {
    return "DIA";
  }
}

const SECAO_META: Record<
  string,
  { title: string; subtitle: string; badgeClass: string; color: string }
> = {
  EVENTUAL: {
    title: "⚡ PROGRAMAÇÃO EVENTUAL (CONTRATO HABITUAL) — PORTO",
    subtitle: "Atendimentos extras, contingências TPM/MFE e demandas sob solicitação",
    badgeClass: "badge-warning",
    color: "#d97706",
  },
  HABITUAL_MFE: {
    title: "🚜 PROGRAMAÇÃO HABITUAL PORTO — MFE (TURNO DIA 07:00 X 17:30)",
    subtitle: "Frota fidelizada MFE: Caminhões Basculantes, Brook, Pipas, Minis e Retroescavadeiras",
    badgeClass: "badge-info",
    color: "#0284c7",
  },
  HABITUAL_TPM: {
    title: "⚓ PROGRAMAÇÃO HABITUAL — TPM — PORTO (TURNO DIA 07:00 X 17:30)",
    subtitle: "Frota dedicada ao Terminal de Produtos Manganês / Carvão & Píer",
    badgeClass: "badge-success",
    color: "#16a34a",
  },
  HABITUAL_NOITE: {
    title: "🌙 PROGRAMAÇÃO HABITUAL PORTO — TURNO NOITE (19:00 X 05:30)",
    subtitle: "Escala noturna 24h de Aspersão, Limpeza e Minis MFE/TPM",
    badgeClass: "badge-danger",
    color: "#7c3aed",
  },
};

export function ProgramacaoPortoView() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    apontamentoData,
    setApontamentoData,
    setCdData,
    setFilters,
    refreshAll,
    loadCadastros,
    showToast,
  } = useBusato();

  const [progMeta, setProgMeta] = useState<{
    totalRegistros: number;
    totalDias: number;
    dataMin: string;
    dataMax: string;
    dias: { data: string; diaSemana: string; letra: string; sheetName: string; count: number }[];
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(apontamentoData || "2026-11-23");
  const [itemsDia, setItemsDia] = useState<ProgramacaoItem[]>([]);
  const [loadingProg, setLoadingProg] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);

  const [filtroSecao, setFiltroSecao] = useState<string>("TODAS");
  const [filtroSetor, setFiltroSetor] = useState<string>("TODOS");
  const [buscaProg, setBuscaProg] = useState<string>("");

  // Modal de criar/editar item de programação
  const [editModal, setEditModal] = useState<Partial<ProgramacaoItem> | null>(null);

  const loadProgramacao = async (targetDate?: string) => {
    setLoadingProg(true);
    try {
      const meta = await fetchProgramacaoMeta();
      setProgMeta(meta);
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const preferred =
        targetDate ||
        (meta.dias.some((d) => d.data === apontamentoData)
          ? apontamentoData
          : meta.dias.some((d) => d.data === todayIso)
          ? todayIso
          : meta.dias.some((d) => d.data === selectedDate)
          ? selectedDate
          : meta.dataMin || todayIso);
      setSelectedDate(preferred);
      setApontamentoData(preferred);
      setCdData(preferred);
      const rows = await fetchProgramacaoDia(preferred);
      setItemsDia(rows);
    } finally {
      setLoadingProg(false);
    }
  };

  useEffect(() => {
    loadProgramacao();
  }, []);

  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    setApontamentoData(newDate);
    setCdData(newDate);
    setLoadingProg(true);
    try {
      const rows = await fetchProgramacaoDia(newDate);
      setItemsDia(rows);
    } finally {
      setLoadingProg(false);
    }
  };

  const diaInfo = useMemo(() => {
    if (!progMeta) return null;
    return progMeta.dias.find((d) => d.data === selectedDate) || null;
  }, [progMeta, selectedDate]);

  const letraDia = diaInfo?.letra || itemsDia[0]?.letra || calcLetraByDate(selectedDate);
  const nomeAbaPlanilha =
    diaInfo?.sheetName ||
    itemsDia[0]?.sheetName ||
    `${getDiaSemanaBr(selectedDate)} ${formatBrDate(selectedDate)} — LETRA ${letraDia}`;

  const filteredItems = useMemo(() => {
    return itemsDia.filter((it) => {
      if (filtroSecao !== "TODAS" && it.secao !== filtroSecao) return false;
      if (filtroSetor !== "TODOS" && it.setor !== filtroSetor) return false;
      if (buscaProg.trim()) {
        const q = buscaProg.trim().toUpperCase();
        const hay = `${it.tipoEquipamentoBruto} ${it.placa} ${it.placaReserva || ""} ${
          it.operador
        } ${it.local} ${it.sublocal || ""} ${it.tagProgramacao} ${
          it.descricaoAtividade || ""
        } ${it.responsavelVale || ""} ${it.os} ${it.centroCusto}`.toUpperCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itemsDia, filtroSecao, filtroSetor, buscaProg]);

  const counts = useMemo(() => {
    const eventual = itemsDia.filter((i) => i.secao === "EVENTUAL").length;
    const mfe = itemsDia.filter((i) => i.secao === "HABITUAL_MFE").length;
    const tpm = itemsDia.filter((i) => i.secao === "HABITUAL_TPM").length;
    const noite = itemsDia.filter((i) => i.secao === "HABITUAL_NOITE").length;
    return { total: itemsDia.length, eventual, mfe, tpm, noite };
  }, [itemsDia]);

  // Sincronizar Programação com a Operação do CCO
  const handleSincronizarOperacao = async (
    modo: "NO_HORARIO" | "AGUARDANDO",
    irParaMesa: boolean
  ) => {
    setSyncing(true);
    try {
      const res = await apiSincronizarProgramacaoParaOperacao(selectedDate, modo);
      setApontamentoData(selectedDate);
      setCdData(selectedDate);
      setFilters((prev) => ({
        ...prev,
        dataInicio: selectedDate < prev.dataInicio ? selectedDate : prev.dataInicio,
        dataFim: selectedDate > prev.dataFim ? selectedDate : prev.dataFim,
      }));
      await refreshAll();
      showToast(
        `✅ Programação de ${formatBrDate(selectedDate)} enviada para a Operação CCO! (${res.criados} novos, ${res.atualizados} atualizados)`
      );
      if (irParaMesa) {
        navigate("/cco/operacao");
      }
    } catch (err: any) {
      showToast(err.message || "Erro ao sincronizar programação", "#e11d48");
    } finally {
      setSyncing(false);
    }
  };

  // ─── Parser Unificado: suporta PADRÃO "Demandas Programadas" (ProgramacaoSemanal_*.xls) e PADRÃO "PORTO11.xlsx" ───
  const processWorkbookBuffer = async (buf: ArrayBuffer, fileName: string) => {
    const wb = XLSX.read(buf, { type: "array", raw: false });

    const mapTipoEquip = (raw: string) => {
      const u = raw.toUpperCase();
      if (u.includes("PIPA")) return "Caminhão Pipa";
      if (u.includes("BASCULANTE") || u.includes("CAÇAMBA") || u.includes("CACAMBA"))
        return "Caminhão Caçamba";
      if (u.includes("BROOK")) return "Caminhão Brook";
      if (u.includes("MINI CARR") || u.includes("BOBCAT") || u.includes("226B") || u.includes("S70"))
        return "Mini Carregadeira";
      if (u.includes("MINI ESCAV") || u.includes("303.5")) return "Mini Escavadeira";
      if (u.includes("RETROESCAV") || u.includes("416D")) return "Retroescavadeira";
      if (u.includes("PÁ CARREGADEIRA") || u.includes("PA CARREGADEIRA") || u.includes("962"))
        return "Pá Carregadeira";
      if (u.includes("ESCAVADEIRA")) return "Escavadeira Hidráulica";
      return "Outro";
    };

    const parseFlexDate = (val: any): string | null => {
      if (typeof val === "number" && val > 30000) {
        // Excel serial date
        const utcDays = Math.floor(val - 25569);
        const d = new Date(utcDays * 86400 * 1000);
        return d.toISOString().slice(0, 10);
      }
      const s = String(val || "").trim();
      if (!s) return null;
      // YYYY-MM-DD
      const mIso = s.match(/(20\d{2})-(\d{2})-(\d{2})/);
      if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
      // MM/DD/YY or DD/MM/YYYY
      const mSlash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
      if (mSlash) {
        const p1 = Number(mSlash[1]);
        const p2 = Number(mSlash[2]);
        const y = mSlash[3].length === 2 ? `20${mSlash[3]}` : mSlash[3];
        // SheetJS raw:false formats US M/D/YY when p1 <= 12 and p2 > 12
        const mm = p1 <= 12 && p2 > 12 ? p1 : p1 > 12 ? p2 : p1;
        const dd = p1 <= 12 && p2 > 12 ? p2 : p1 > 12 ? p1 : p2;
        return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }
      return null;
    };

    const extracted: Partial<ProgramacaoItem>[] = [];

    // 1. Verificar se o arquivo possui o padrão "Demandas Programadas" (ProgramacaoSemanal_DD-MM-YYYY_DD-MM-YYYY.xls)
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      if (!rows || rows.length === 0) continue;

      // Procurar cabeçalho de "Demandas Programadas" (OS | Dono | Tipo Equipamento | Descrição Atividade | Local | Sublocal | Responsável | Telefone | Data Programação | Hora Início | Hora Fim | TAG | Centro de Custo)
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(15, rows.length); i++) {
        const rowUpper = (rows[i] || []).map((c) => String(c || "").trim().toUpperCase());
        if (
          rowUpper.includes("OS") &&
          (rowUpper.includes("TIPO EQUIPAMENTO") || rowUpper.includes("DESCRIÇÃO ATIVIDADE") || rowUpper.includes("DATA PROGRAMAÇÃO"))
        ) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx !== -1) {
        const headers = rows[headerRowIdx].map((c) => String(c || "").trim().toUpperCase());
        const idxOS = headers.findIndex((h) => h === "OS" || h.startsWith("OS"));
        const idxDono = headers.findIndex((h) => h.includes("DONO"));
        const idxTipo = headers.findIndex((h) => h.includes("TIPO EQUIPAMENTO") || h.includes("EQUIPAMENTO"));
        const idxDesc = headers.findIndex((h) => h.includes("DESCRIÇÃO") || h.includes("ATIVIDADE"));
        const idxLocal = headers.findIndex((h) => h === "LOCAL");
        const idxSublocal = headers.findIndex((h) => h.includes("SUBLOCAL"));
        const idxResp = headers.findIndex((h) => h.includes("RESPONSÁVEL") || h.includes("RESPONSAVEL"));
        const idxTel = headers.findIndex((h) => h.includes("TELEFONE"));
        const idxData = headers.findIndex((h) => h.includes("DATA"));
        const idxHoraIni = headers.findIndex((h) => h.includes("HORA INÍCIO") || h.includes("HORA INICIO"));
        const idxHoraFim = headers.findIndex((h) => h.includes("HORA FIM"));
        const idxTag = headers.findIndex((h) => h === "TAG" || h.includes("TAG"));
        const idxCC = headers.findIndex((h) => h.includes("CENTRO DE CUSTO") || h.includes("CUSTO"));

        // Agrupar também linhas de 00:00-05:30 com 19:00-23:59 do mesmo dia e TAG para consolidar as duas O.S. do turno noturno (igual ao padrão da planilha de operação)
        const nightHalfNightMap = new Map<string, string>(); // key: `${dataIso}__${tag}` -> os_00_0530
        const rawDemandas: {
          os: string;
          dono: string;
          tipoBruto: string;
          descricao: string;
          local: string;
          sublocal: string;
          responsavelVale: string;
          telefoneVale: string;
          dataIso: string;
          horaIni: string;
          horaFim: string;
          tag: string;
          cc: string;
        }[] = [];

        for (let rIdx = headerRowIdx + 1; rIdx < rows.length; rIdx++) {
          const r = rows[rIdx];
          const os = String(r[idxOS !== -1 ? idxOS : 0] || "").trim();
          const tipoBruto = String(r[idxTipo !== -1 ? idxTipo : 2] || "").trim();
          if (!os && !tipoBruto) continue;

          const dataIso = parseFlexDate(r[idxData !== -1 ? idxData : 8]);
          if (!dataIso) continue;

          const horaIniRaw = String(r[idxHoraIni !== -1 ? idxHoraIni : 9] || "07:00").trim();
          const horaFimRaw = String(r[idxHoraFim !== -1 ? idxHoraFim : 10] || "17:30").trim();
          const tag = String(r[idxTag !== -1 ? idxTag : 11] || "").trim().toUpperCase();

          // Se for a perna da madrugada (0:00 -> 5:30), guardamos a OS para juntar com a linha de 19:00 -> 23:59 do mesmo dia e TAG
          if (horaIniRaw === "0:00" || horaIniRaw === "00:00") {
            nightHalfNightMap.set(`${dataIso}__${tag}`, os);
            continue;
          }

          rawDemandas.push({
            os,
            dono: String(r[idxDono !== -1 ? idxDono : 1] || "BUSATO").trim(),
            tipoBruto,
            descricao: String(r[idxDesc !== -1 ? idxDesc : 3] || "").trim(),
            local: String(r[idxLocal !== -1 ? idxLocal : 4] || "PORTO").trim(),
            sublocal: String(r[idxSublocal !== -1 ? idxSublocal : 5] || "").trim(),
            responsavelVale: String(r[idxResp !== -1 ? idxResp : 6] || "").trim(),
            telefoneVale: String(r[idxTel !== -1 ? idxTel : 7] || "").trim(),
            dataIso,
            horaIni: horaIniRaw.padStart(5, "0"),
            horaFim: horaFimRaw.padStart(5, "0"),
            tag,
            cc: String(r[idxCC !== -1 ? idxCC : 12] || "").trim(),
          });
        }

        for (const d of rawDemandas) {
          const letra = calcLetraByDate(d.dataIso);
          const diaSemana = getDiaSemanaBr(d.dataIso);
          const isNoite = d.horaIni.startsWith("19");
          const periodoTurno = isNoite ? "NOITE" : "DIA";
          const isEventual = d.os.toUpperCase().includes("X");
          const isTpm =
            d.tipoBruto.toUpperCase().includes("TPM") ||
            d.tag.includes("TPM") ||
            d.local.toUpperCase().includes("TPM") ||
            d.cc.includes("1540092");

          const secao = isEventual
            ? "EVENTUAL"
            : isNoite
            ? "HABITUAL_NOITE"
            : isTpm
            ? "HABITUAL_TPM"
            : "HABITUAL_MFE";

          const setor = isEventual ? "EXTRA" : isTpm ? "TPM" : "MFE";
          const tipoEquip = mapTipoEquip(d.tipoBruto);

          // Busca Placa, Regime e Operador da Letra/Turno no catálogo fidelizado da TAG
          const fleetInfo = TAG_VALE_FLEET_MAP[d.tag];
          const opKey = `${letra}_${periodoTurno}` as "A_DIA" | "B_DIA" | "A_NOITE" | "B_NOITE";
          const operador = fleetInfo?.operadores?.[opKey] || fleetInfo?.operadores?.[`${letra}_DIA` as "A_DIA" | "B_DIA"] || "A DEFINIR";
          const placa = isNoite && fleetInfo?.placaReserva ? fleetInfo.placaReserva : fleetInfo?.placa || "A DEFINIR";
          const placaReserva = !isNoite && fleetInfo?.placaReserva ? fleetInfo.placaReserva : null;
          const regime = fleetInfo?.regime || (isNoite ? "24 HORAS" : "12 HORAS");
          const regimeHoras = regime.includes("24") ? 24 : 12;

          // Junta com a OS da madrugada (00:00-05:30) se for turno noite
          const madrugadaOs = isNoite ? nightHalfNightMap.get(`${d.dataIso}__${d.tag}`) : undefined;
          const osConsolidada = madrugadaOs && madrugadaOs !== d.os ? `${d.os} / ${madrugadaOs}` : d.os;
          const horarioVale = isNoite ? "19 X 05:30" : `${d.horaIni.slice(0, 2)} X ${d.horaFim}`;

          const [, mStr, dStr] = d.dataIso.split("-");
          const sheetDisplay = `${diaSemana} ${dStr}/${mStr} LETRA ${letra}`;

          extracted.push({
            sheetName: sheetDisplay,
            data: d.dataIso,
            diaSemana,
            letra,
            secao,
            periodoTurno,
            setor,
            tipoEquipamentoBruto: d.tipoBruto,
            tipoEquipamento: tipoEquip,
            placa,
            placaReserva,
            placaBruta: placa,
            regime,
            regimeHoras,
            horarioVale,
            horarioInicio: isNoite ? "19:00" : d.horaIni,
            horarioFim: isNoite ? "05:30" : d.horaFim,
            centroCusto: d.cc,
            local: d.local,
            sublocal: d.sublocal,
            local1: d.local,
            local2: d.sublocal,
            tagProgramacao: d.tag,
            descricaoAtividade: d.descricao,
            responsavelVale: d.responsavelVale,
            telefoneVale: d.telefoneVale,
            dono: d.dono,
            operador,
            os: osConsolidada,
            os1: d.os,
            os2: madrugadaOs || "",
          });
        }
        continue;
      }

      // 2. Fallback: Padrão de abas diárias PORTO11 (ex: "SEGUNDA 16 11 LETRA B")
      const mDate = sheetName.match(/(\d{2})[\s/_.-]+(\d{2})/);
      if (!mDate) continue;
      const dataIso = `2026-${mDate[2]}-${mDate[1]}`;
      const mLetra = sheetName.match(/LETRA\s+([A-D])/i);
      const letra = mLetra ? mLetra[1].toUpperCase() : calcLetraByDate(dataIso);
      const diaSemana = sheetName.trim().split(/\s+/)[0] || getDiaSemanaBr(dataIso);

      let currentSection = "EVENTUAL";
      let isTwoPeriod = false;

      for (const r of rows) {
        const c0 = String(r[0] || "").trim();
        const u0 = c0.toUpperCase();
        if (!u0) continue;

        if (u0.includes("PROGRAMAÇÃO") || u0.includes("PROGRAMACAO")) {
          if (u0.includes("EVENTUAL")) currentSection = "EVENTUAL";
          else if (u0.includes("NOITE")) currentSection = "HABITUAL_NOITE";
          else if (u0.includes("TPM")) currentSection = "HABITUAL_TPM";
          else currentSection = "HABITUAL_MFE";
          continue;
        }
        if (u0.includes("TIPO DE EQUIPAMENTO")) {
          const h5 = String(r[5] || "").toUpperCase();
          const h6 = String(r[6] || "").toUpperCase();
          isTwoPeriod = h5.includes("LOCAL") && h6.includes("LOCAL");
          continue;
        }
        if (u0.length < 4) continue;

        const tipoEquip = mapTipoEquip(u0);
        const rawPlaca = String(r[1] || "").trim().toUpperCase();
        const placa = rawPlaca || "A DEFINIR";
        const turnoRegimeStr = String(r[2] || "12 HORAS").trim().toUpperCase();
        const regimeHoras = turnoRegimeStr.includes("24") ? 24 : 12;
        const horarioVale = String(r[3] || "07 X 17:30").trim().toUpperCase();
        const periodoTurno =
          currentSection === "HABITUAL_NOITE" || horarioVale.startsWith("19") ? "NOITE" : "DIA";
        const horarioInicio = periodoTurno === "NOITE" ? "19:00" : "07:00";
        const centroCusto = String(r[4] || "").trim();

        let localManha = "";
        let localTarde = "";
        let tagProgramacao = "";
        let operador = "";
        let osManha = "";
        let osTarde = "";

        if (isTwoPeriod) {
          localManha = String(r[5] || "").trim();
          localTarde = String(r[6] || "").trim();
          tagProgramacao = String(r[7] || "").trim();
          operador = String(r[8] || "").trim();
          osManha = String(r[9] || "").trim();
          osTarde = String(r[10] || "").trim();
        } else {
          localManha = String(r[5] || "").trim();
          tagProgramacao = String(r[6] || "").trim();
          operador = String(r[7] || "").trim();
          osManha = String(r[8] || "").trim();
        }

        const localConsolidado =
          localTarde && localTarde !== localManha
            ? `${localManha} / ${localTarde}`
            : localManha || "PORTO";
        const osConsolidada =
          osTarde && osTarde !== osManha ? `${osManha} / ${osTarde}` : osManha;
        const setor =
          u0.includes("TPM") ||
          currentSection === "HABITUAL_TPM" ||
          localConsolidado.toUpperCase().includes("TPM") ||
          centroCusto.includes("1540092")
            ? "TPM"
            : currentSection === "EVENTUAL"
            ? "EXTRA"
            : "MFE";

        extracted.push({
          sheetName: sheetName.trim(),
          data: dataIso,
          diaSemana,
          letra,
          secao: currentSection,
          periodoTurno,
          setor,
          tipoEquipamentoBruto: c0,
          tipoEquipamento: tipoEquip,
          placa,
          placaReserva: null,
          placaBruta: rawPlaca,
          regime: turnoRegimeStr,
          regimeHoras,
          horarioVale,
          horarioInicio,
          centroCusto,
          local: localConsolidado,
          local1: localManha,
          local2: localTarde,
          tagProgramacao,
          operador: (operador || "A DEFINIR").replace(/^EXTRA\s*-\s*$/i, "EXTRA / A DEFINIR").trim(),
          os: osConsolidada,
          os1: osManha,
          os2: osTarde,
        });
      }
    }

    if (extracted.length === 0) {
      showToast(
        `Nenhuma demanda programada encontrada em "${fileName}". Verifique se o arquivo segue o padrão ProgramacaoSemanal (.xls/.xlsx).`,
        "#e11d48"
      );
      return;
    }

    // Ordenar por Data -> Seção -> TAG
    extracted.sort(
      (a, b) =>
        (a.data || "").localeCompare(b.data || "") ||
        (a.secao || "").localeCompare(b.secao || "") ||
        (a.tagProgramacao || "").localeCompare(b.tagProgramacao || "")
    );

    const count = await apiBulkImportProgramacaoItems(extracted);
    const newMeta = await fetchProgramacaoMeta();
    setProgMeta(newMeta);
    // Prioriza a data de hoje se estiver na semana importada; caso contrário, o primeiro dia da semana (ex: 23/11/2026)
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const hasToday = (newMeta.dias || []).some((d) => d.data === todayIso);
    const targetDt = hasToday ? todayIso : newMeta.dataMin || todayIso;
    setSelectedDate(targetDt);
    const rows = await fetchProgramacaoDia(targetDt);
    setItemsDia(rows);

    setApontamentoData(targetDt);
    setCdData(targetDt);
    setFilters({
      dataInicio: newMeta.dataMin,
      dataFim: newMeta.dataMax,
      setor: "TODOS",
      tipoEquipamento: "TODOS",
      placa: "TODOS",
      frenteServico: "TODOS",
      busca: "",
    });
    await loadCadastros();
    await refreshAll();
    showToast(
      `✅ Programação Semanal "${fileName}" importada! (${count} alocações em ${newMeta.totalDias} dias carregadas em todas as abas do CCO)`
    );
  };

  // Upload de arquivo Excel pelo computador (.xls / .xlsx)
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingProg(true);
    try {
      const buf = await file.arrayBuffer();
      await processWorkbookBuffer(buf, file.name);
    } catch (err: any) {
      showToast("Erro ao importar planilha: " + (err.message || ""), "#e11d48");
    } finally {
      setLoadingProg(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    await apiSaveProgramacaoItem(
      {
        ...editModal,
        data: editModal.data || selectedDate,
        letra: editModal.letra || letraDia,
        sheetName: nomeAbaPlanilha,
      },
      editModal.id || null
    );
    setEditModal(null);
    await loadProgramacao(selectedDate);
    showToast("✅ Item da programação salvo! Clique em 'Enviar p/ Operação CCO' para atualizar o turno.");
  };

  const handleDeleteItem = async (id: number) => {
    if (!window.confirm("Deseja remover esta linha da programação?")) return;
    await apiDeleteProgramacaoItem(id);
    await loadProgramacao(selectedDate);
    showToast("Linha removida da programação.", "#e11d48");
  };

  const handleLimparTudo = async () => {
    if (
      !window.confirm(
        "Deseja limpar todos os dados atuais de Programação, Operação Diária, Corretivas, Medição e Cadastros do CCO para importar novamente?"
      )
    )
      return;
    setLoadingProg(true);
    try {
      await apiLimparTodosDadosCCO();
      await loadProgramacao("");
      await loadCadastros();
      await refreshAll();
      showToast("🗑️ Todos os dados do CCO foram limpos! Pronto para nova importação.", "#e11d48");
    } finally {
      setLoadingProg(false);
    }
  };

  const secoesOrdem = ["EVENTUAL", "HABITUAL_MFE", "HABITUAL_TPM", "HABITUAL_NOITE"];

  return (
    <div className="space-y-4">
      {/* Banner Principal da Programação Semanal Busato */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              📅 Programação Semanal CCO — Demandas Programadas ({nomeAbaPlanilha})
            </div>
            <div className="panel-subtitle">
              Importação no padrão oficial <strong>ProgramacaoSemanal_DD-MM-YYYY_DD-MM-YYYY.xls</strong> (aba{" "}
              <em>Demandas Programadas</em>: OS, Dono, Tipo Equipamento, Descrição Atividade, Local, Sublocal,
              Responsável, Data, Hora Início/Fim, TAG e Centro de Custo) com vinculação automática de Placa e
              Operador da Letra A/B.
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              className="hidden"
              onChange={handleExcelUpload}
            />
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              title="Selecionar arquivo ProgramacaoSemanal (.xls / .xlsx) do computador"
            >
              📤 Importar Planilha Semanal (.xls)
            </button>
            <button
              className="btn btn-rose"
              onClick={handleLimparTudo}
              title="Limpar todos os dados do CCO para reimportar"
            >
              🗑️ Limpar Dados
            </button>
            <button
              className="btn btn-outline"
              onClick={() =>
                setEditModal({
                  data: selectedDate,
                  letra: letraDia,
                  secao: "HABITUAL_MFE",
                  periodoTurno: "DIA",
                  setor: "MFE",
                  tipoEquipamentoBruto: "CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS",
                  tipoEquipamento: "Caminhão Pipa",
                  placa: "",
                  placaReserva: "",
                  regime: "12 HORAS",
                  regimeHoras: 12,
                  horarioVale: "07 X 17:30",
                  centroCusto: "0001540098",
                  local: "ASPERSÃO",
                  sublocal: "UMECTAÇÃO DE VIAS",
                  tagProgramacao: "BUSATO_CAMINHÃO PIPA ASPERSÃO - MFE - TERCEIROS_01",
                  descricaoAtividade: "",
                  responsavelVale: "",
                  operador: "",
                  os: "",
                })
              }
            >
              + Nova Linha
            </button>
            <button
              className="btn btn-amber"
              disabled={syncing}
              onClick={() => handleSincronizarOperacao("AGUARDANDO", true)}
              title="Envia a programação deste dia para a Mesa de Operação Diária como 'Aguardando Apresentação' para o operador confirmar a chegada"
            >
              ⏳ Gerar Turno (Aguardando Chegada)
            </button>
            <button
              className="btn btn-primary"
              disabled={syncing}
              onClick={() => handleSincronizarOperacao("NO_HORARIO", true)}
              title="Sincroniza todos os equipamentos deste dia direto para a Operação CCO e abre a Mesa de Controle"
            >
              🚀 Enviar p/ Operação CCO & Abrir Mesa
            </button>
          </div>
        </div>

        {/* Barra de Seleção de Data da Semana e Filtros */}
        <div className="filter-bar" style={{ marginBottom: 14 }}>
          <div className="filter-group" style={{ minWidth: 260 }}>
            <label>Dia da Semana Programada & Letra</label>
            <select
              className="form-control"
              style={{ fontWeight: 800 }}
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
            >
              {(progMeta?.dias || []).map((d) => (
                <option key={d.data} value={d.data}>
                  📅 {formatBrDate(d.data)} — {d.sheetName} ({d.count} demandas)
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group" style={{ maxWidth: 155 }}>
            <label>Data Programação</label>
            <input
              type="date"
              className="form-control"
              value={selectedDate}
              min={progMeta?.dataMin}
              max={progMeta?.dataMax}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>

          <div className="filter-group" style={{ maxWidth: 210 }}>
            <label>Bloco / Turno</label>
            <select
              className="form-control"
              value={filtroSecao}
              onChange={(e) => setFiltroSecao(e.target.value)}
            >
              <option value="TODAS">Todos os Blocos ({counts.total})</option>
              <option value="HABITUAL_MFE">🚜 Habitual MFE - Dia ({counts.mfe})</option>
              <option value="HABITUAL_TPM">⚓ Habitual TPM - Dia ({counts.tpm})</option>
              <option value="HABITUAL_NOITE">🌙 Habitual Porto - Noite ({counts.noite})</option>
              <option value="EVENTUAL">⚡ Eventual / Extra ({counts.eventual})</option>
            </select>
          </div>

          <div className="filter-group" style={{ maxWidth: 150 }}>
            <label>Setor</label>
            <select
              className="form-control"
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
            >
              <option value="TODOS">Todos (MFE + TPM + Extra)</option>
              <option value="MFE">MFE</option>
              <option value="TPM">TPM</option>
              <option value="EXTRA">Eventual / Extra</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Buscar (OS, Placa, Operador, Local, Sublocal, Atividade, Responsável)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex: 2026S33949, TOR0C66, ENOS, ANDERSON, REMOÇÃO..."
              value={buscaProg}
              onChange={(e) => setBuscaProg(e.target.value)}
            />
          </div>
        </div>

        {/* KPI Cards da Programação do Dia */}
        <div className="kpi-grid">
          <div
            className="kpi-card cyan"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroSecao("TODAS")}
          >
            <div className="kpi-label">Demandas do Dia ({formatBrDate(selectedDate)})</div>
            <div className="kpi-value">
              {counts.total}{" "}
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-blue)" }}>
                Letra {letraDia}
              </span>
            </div>
            <div className="kpi-sub">
              <span>{(progMeta?.totalRegistros || 0).toLocaleString("pt-BR")} na semana</span>
              <span>{progMeta?.totalDias || 0} dias</span>
            </div>
          </div>

          <div
            className="kpi-card emerald"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroSecao("HABITUAL_MFE")}
          >
            <div className="kpi-label">🚜 Habitual MFE (07 X 17:30)</div>
            <div className="kpi-value">{counts.mfe} máq.</div>
            <div className="kpi-sub">
              <span>Minério / Pátios / Aspersão / Vias</span>
            </div>
          </div>

          <div
            className="kpi-card amber"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroSecao("HABITUAL_TPM")}
          >
            <div className="kpi-label">⚓ Habitual TPM (07 X 17:30)</div>
            <div className="kpi-value">{counts.tpm} máq.</div>
            <div className="kpi-sub">
              <span>TPM / Píer / Remoção</span>
            </div>
          </div>

          <div
            className="kpi-card purple"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroSecao("HABITUAL_NOITE")}
          >
            <div className="kpi-label">🌙 Turno Noite (19 X 05:30)</div>
            <div className="kpi-value">
              {counts.noite} Noite / {counts.eventual} Ev.
            </div>
            <div className="kpi-sub">
              <span>OS 19:00-23:59 + 00:00-05:30 unificadas</span>
            </div>
          </div>
        </div>

        {/* Tabelas divididas pelos Blocos da Programação */}
        {loadingProg ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
            Carregando programação semanal...
          </div>
        ) : (progMeta?.totalRegistros || 0) === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              border: "2px dashed var(--border-color)",
              borderRadius: 12,
              background: "var(--bg-card-hover)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>
              Base do CCO limpa e pronta para importação da Programação Semanal
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", maxWidth: 580, margin: "0 auto 16px" }}>
              Selecione a planilha semanal oficial (<code>.xls</code> / <code>.xlsx</code>) no padrão{" "}
              <strong>ProgramacaoSemanal_DD-MM-YYYY_DD-MM-YYYY.xls</strong>. Todas as demandas programadas
              alimentarão automaticamente o Painel Analítico, Operação Diária, Corretivas, Medição e Cadastros.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                style={{ padding: "10px 20px", fontSize: 13 }}
                onClick={() => fileInputRef.current?.click()}
              >
                📤 Importar Planilha Semanal (.xls)
              </button>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
            Nenhuma demanda encontrada para os filtros selecionados em{" "}
            <strong>{formatBrDate(selectedDate)}</strong>.
          </div>
        ) : (
          <div className="space-y-5">
            {secoesOrdem.map((secKey) => {
              const secRows = filteredItems.filter((r) => r.secao === secKey);
              if (secRows.length === 0) return null;
              const meta = SECAO_META[secKey] || {
                title: secKey,
                subtitle: "",
                badgeClass: "badge-info",
                color: "#0284c7",
              };

              return (
                <div
                  key={secKey}
                  className="panel-card"
                  style={{ borderLeft: `4px solid ${meta.color}` }}
                >
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">
                        <span>{meta.title}</span>
                        <span className={`badge ${meta.badgeClass}`}>{secRows.length} demandas</span>
                      </div>
                      <div className="panel-subtitle">{meta.subtitle}</div>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Nº O.S</th>
                          <th>TIPO DE EQUIPAMENTO</th>
                          <th>PLACA / TAG</th>
                          <th>OPERADOR (LETRA {letraDia})</th>
                          <th>HORÁRIO</th>
                          <th>LOCAL & SUBLOCAL</th>
                          <th>DESCRIÇÃO DA ATIVIDADE / TAG VALE</th>
                          <th>RESPONSÁVEL VALE</th>
                          <th>C. CUSTO</th>
                          <th style={{ textAlign: "center" }}>AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {secRows.map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontFamily: "'Consolas', monospace", fontWeight: 800, color: "var(--accent-blue)" }}>
                              {item.os || "—"}
                            </td>
                            <td style={{ fontWeight: 700 }}>{item.tipoEquipamentoBruto}</td>
                            <td>
                              <span className="badge-plate">{item.placa}</span>
                              {item.placaReserva && (
                                <span
                                  className="badge badge-warning"
                                  style={{ marginLeft: 4 }}
                                  title="Equipamento Reserva / Turno"
                                >
                                  🔄 {item.placaReserva}
                                </span>
                              )}
                            </td>
                            <td style={{ fontWeight: 700 }}>{item.operador}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <span className="badge badge-info" style={{ marginRight: 4 }}>
                                {item.regime}
                              </span>
                              <span style={{ fontFamily: "'Consolas', monospace", fontWeight: 700 }}>
                                {item.horarioVale}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 800, color: "var(--accent-blue)" }}>
                                📍 {item.local}
                              </div>
                              {item.sublocal && (
                                <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                                  {item.sublocal}
                                </div>
                              )}
                            </td>
                            <td style={{ maxWidth: 320 }}>
                              {item.descricaoAtividade ? (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-primary)",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                  title={item.descricaoAtividade}
                                >
                                  {item.descricaoAtividade}
                                </div>
                              ) : null}
                              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'Consolas', monospace" }}>
                                {item.tagProgramacao}
                              </div>
                            </td>
                            <td style={{ fontSize: 11 }}>
                              <div style={{ fontWeight: 600 }}>{item.responsavelVale || "—"}</div>
                              {item.telefoneVale && (
                                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                  📞 {item.telefoneVale}
                                </div>
                              )}
                            </td>
                            <td style={{ fontFamily: "'Consolas', monospace", color: "var(--text-secondary)" }}>
                              {item.centroCusto}
                            </td>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                              <div style={{ display: "inline-flex", gap: 4 }}>
                                <button
                                  className="btn btn-outline btn-xs"
                                  onClick={() => setEditModal(item)}
                                  title="Editar linha da programação"
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  className="btn btn-rose btn-xs"
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="Excluir linha"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Criar / Editar Item da Programação */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editModal.id
                  ? `✏️ Editar Demanda Programada (${formatBrDate(selectedDate)})`
                  : `+ Nova Demanda Programada (${formatBrDate(selectedDate)})`}
              </h3>
              <button className="btn btn-outline btn-xs" onClick={() => setEditModal(null)}>
                ✕ Fechar
              </button>
            </div>
            <form onSubmit={handleSaveItem}>
              <div className="form-grid">
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>BLOCO DA PROGRAMAÇÃO *</label>
                  <select
                    className="form-control"
                    value={editModal.secao || "HABITUAL_MFE"}
                    onChange={(e) => {
                      const sec = e.target.value;
                      setEditModal((prev) => ({
                        ...prev,
                        secao: sec,
                        periodoTurno: sec === "HABITUAL_NOITE" ? "NOITE" : "DIA",
                        horarioVale: sec === "HABITUAL_NOITE" ? "19 X 05:30" : "07 X 17:30",
                        setor:
                          sec === "HABITUAL_TPM"
                            ? "TPM"
                            : sec === "EVENTUAL"
                            ? "EXTRA"
                            : "MFE",
                      }));
                    }}
                  >
                    <option value="HABITUAL_MFE">🚜 Programação Habitual MFE (Dia)</option>
                    <option value="HABITUAL_TPM">⚓ Programação Habitual TPM (Dia)</option>
                    <option value="HABITUAL_NOITE">🌙 Programação Habitual (Noite)</option>
                    <option value="EVENTUAL">⚡ Programação Eventual</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>FAMÍLIA DE EQUIPAMENTO *</label>
                  <select
                    className="form-control"
                    value={editModal.tipoEquipamento || "Caminhão Pipa"}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, tipoEquipamento: e.target.value }))
                    }
                  >
                    <option value="Caminhão Pipa">Caminhão Pipa</option>
                    <option value="Caminhão Caçamba">Caminhão Caçamba / Basculante</option>
                    <option value="Caminhão Brook">Caminhão Brook</option>
                    <option value="Mini Carregadeira">Mini Carregadeira</option>
                    <option value="Mini Escavadeira">Mini Escavadeira</option>
                    <option value="Retroescavadeira">Retroescavadeira</option>
                    <option value="Pá Carregadeira">Pá Carregadeira</option>
                    <option value="Escavadeira Hidráulica">Escavadeira Hidráulica</option>
                  </select>
                </div>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    TIPO DE EQUIPAMENTO (PADRÃO VALE) *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.tipoEquipamentoBruto || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, tipoEquipamentoBruto: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>PLACA / TAG PRINCIPAL *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: TOR0C66 ou MC750"
                    value={editModal.placa || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, placa: e.target.value.toUpperCase() }))
                    }
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>PLACA / TAG RESERVA</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Opcional"
                    value={editModal.placaReserva || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({
                        ...prev,
                        placaReserva: e.target.value ? e.target.value.toUpperCase() : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>OPERADOR / MOTORISTA *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.operador || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, operador: e.target.value.toUpperCase() }))
                    }
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>Nº ORDEM DE SERVIÇO (OS)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: 2026S33949"
                    value={editModal.os || ""}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, os: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>LOCAL *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: REMOÇÃO, ASPERSÃO, PI01..."
                    value={editModal.local || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, local: e.target.value.toUpperCase() }))
                    }
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>SUBLOCAL</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: PONTOS DE REMOÇÃO TPM"
                    value={editModal.sublocal || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, sublocal: e.target.value.toUpperCase() }))
                    }
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>TURNO / REGIME</label>
                  <select
                    className="form-control"
                    value={editModal.regime || "12 HORAS"}
                    onChange={(e) =>
                      setEditModal((prev) => ({
                        ...prev,
                        regime: e.target.value,
                        regimeHoras: e.target.value.includes("24") ? 24 : 12,
                      }))
                    }
                  >
                    <option value="12 HORAS">12 HORAS</option>
                    <option value="24 HORAS">24 HORAS</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>HORÁRIO VALE</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.horarioVale || "07 X 17:30"}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, horarioVale: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>RESPONSÁVEL VALE</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.responsavelVale || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, responsavelVale: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>CENTRO DE CUSTO</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.centroCusto || "0001540098"}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, centroCusto: e.target.value }))
                    }
                  />
                </div>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>TAG PROGRAMAÇÃO VALE</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editModal.tagProgramacao || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, tagProgramacao: e.target.value }))
                    }
                  />
                </div>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>DESCRIÇÃO DA ATIVIDADE</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={editModal.descricaoAtividade || ""}
                    onChange={(e) =>
                      setEditModal((prev) => ({ ...prev, descricaoAtividade: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditModal(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-emerald">
                  💾 Salvar na Programação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
