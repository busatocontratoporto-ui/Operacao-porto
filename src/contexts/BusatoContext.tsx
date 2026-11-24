import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  fetchMeta,
  fetchAnalytics,
  fetchRegistros,
  fetchRegistroById,
  fetchCorretivasDia,
  fetchCadastros,
  apiCreateRegistro,
  apiUpdateRegistro,
  apiDeleteRegistro,
  apiConfirmarApresentacao,
  apiConfirmarApresentacaoLote,
  apiIniciarParada,
  apiEncerrarParada,
  apiLancarCorretivaDia,
  apiLiberarCorretivaDia,
  apiClonarDia,
  apiSaveCadastroItem,
  apiDeleteCadastroItem,
  downloadRelatorioCsv,
  downloadCorretivasDiaCsv,
  downloadExcelExecutivo,
  downloadBoletimAderenciaExcel,
  downloadPdfExecutivo,
  buildResumoExecutivoTexto,
  type TipoRelatorioCsv,
  type MetaOptions,
  type RegistroOperacional,
  type CadastrosData,
} from "@/lib/busato-service";

export function formatBrDate(iso?: string | null) {
  if (!iso || !iso.includes("-")) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatNumber(n: number | undefined | null, dec = 1) {
  return Number(n || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function getNowTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function getTodayIsoStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const LS_ACTIVE_DATE_KEY = "busato_active_date_v2";

export function pickPreferredOperationalDate(datas: string[], dataMin?: string, dataMax?: string): string {
  const today = getTodayIsoStr();
  try {
    const saved = localStorage.getItem(LS_ACTIVE_DATE_KEY);
    if (saved && datas.includes(saved)) return saved;
  } catch {}
  if (datas.includes(today)) return today;
  if (dataMin && dataMax && today >= dataMin && today <= dataMax) return today;
  return dataMin || today;
}

interface FilterState {
  dataInicio: string;
  dataFim: string;
  setor: string;
  tipoEquipamento: string;
  placa: string;
  frenteServico: string;
  busca: string;
}

interface ToastMsg {
  id: number;
  msg: string;
  color: string;
}

interface BusatoContextType {
  metaOptions: MetaOptions | null;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  analytics: any | null;
  apontamentoData: string;
  setApontamentoData: (d: string) => void;
  apontamentoRegistros: RegistroOperacional[];
  cdData: string;
  setCdData: (d: string) => void;
  corretivasDia: any | null;
  cadastros: CadastrosData;
  loading: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  showToast: (msg: string, color?: string) => void;
  refreshAll: () => Promise<void>;
  loadApontamentoDia: (dateOverride?: string) => Promise<void>;
  loadCorretivasDia: (dateOverride?: string) => Promise<void>;
  loadCadastros: () => Promise<void>;
  filtrarUltimoDia: () => void;
  resetFilters: () => void;
  filterByPlate: (placa: string) => void;
  exportCsv: (tipo: TipoRelatorioCsv) => Promise<void>;
  exportCorretivasDiaCsv: () => Promise<void>;
  exportExcelExecutivo: () => Promise<void>;
  exportBoletimAderenciaXlsx: () => Promise<void>;
  exportPdfExecutivo: () => Promise<void>;
  copyResumoWhatsApp: () => Promise<string>;
  confirmarApresentacaoRapida: (idRegistro: number, status?: string) => Promise<void>;
  confirmarApresentacaoLote: () => Promise<void>;
  openFichaAtendimento: (idRegistro: number) => Promise<void>;
  openApresentacaoModal: (idRegistro: number) => Promise<void>;
  openGlobalStartStopModal: () => Promise<void>;
  openStartStopModal: (idRegistro: number) => Promise<void>;
  openCloseStopModal: (idRegistro: number, paradaId?: number, isEditMode?: boolean) => Promise<void>;
  openQuickAlmoco: (idRegistro: number) => Promise<void>;
  openQuickDesvio: (idRegistro: number) => Promise<void>;
  openNewEntryModal: () => void;
  openCloneDayModal: () => void;
  openNovaCorretivaDiaModal: () => Promise<void>;
  openLiberarCorretivaDiaModal: (
    idRegistro: number,
    paradaId: number,
    placa: string,
    equip: string,
    inicio: string,
    servico: string
  ) => void;
  openCadastroModal: (entidade: keyof CadastrosData, id?: number | null) => void;
  toggleStatusCadastro: (entidade: keyof CadastrosData, id: number) => Promise<void>;
  deleteCadastroItem: (entidade: keyof CadastrosData, id: number, identificador: string) => Promise<void>;
}

const BusatoContext = createContext<BusatoContextType | null>(null);

export function BusatoProvider({ children }: { children: React.ReactNode }) {
  const [metaOptions, setMetaOptions] = useState<MetaOptions | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    dataInicio: "2026-07-14",
    dataFim: "2026-11-16",
    setor: "TODOS",
    tipoEquipamento: "TODOS",
    placa: "TODOS",
    frenteServico: "TODOS",
    busca: "",
  });
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [apontamentoData, setApontamentoDataState] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_ACTIVE_DATE_KEY) || getTodayIsoStr();
    } catch {
      return getTodayIsoStr();
    }
  });
  const [apontamentoRegistros, setApontamentoRegistros] = useState<RegistroOperacional[]>([]);
  const [cdData, setCdDataState] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_ACTIVE_DATE_KEY) || getTodayIsoStr();
    } catch {
      return getTodayIsoStr();
    }
  });

  const setApontamentoData = useCallback((d: string) => {
    setApontamentoDataState(d);
    setCdDataState(d);
    try {
      if (d) localStorage.setItem(LS_ACTIVE_DATE_KEY, d);
    } catch {}
  }, []);

  const setCdData = useCallback((d: string) => {
    setCdDataState(d);
    setApontamentoDataState(d);
    try {
      if (d) localStorage.setItem(LS_ACTIVE_DATE_KEY, d);
    } catch {}
  }, []);
  const [corretivasDia, setCorretivasDia] = useState<any | null>(null);
  const [cadastros, setCadastros] = useState<CadastrosData>({
    operadores: [],
    equipamentos: [],
    locais: [],
    servicos: [],
    justificativas: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  // Active modal state
  const [activeModal, setActiveModal] = useState<{
    type:
      | null
      | "ficha"
      | "apresentacao"
      | "startStop"
      | "closeStop"
      | "almoco"
      | "desvio"
      | "newEntry"
      | "cloneDay"
      | "novaCorretivaDia"
      | "liberarCorretivaDia"
      | "cadastro";
    record?: RegistroOperacional | null;
    paradaId?: number;
    isEditMode?: boolean;
    globalStop?: boolean;
    liberarInfo?: {
      idRegistro: number;
      paradaId: number;
      placa: string;
      equip: string;
      inicio: string;
      servico: string;
    };
    cadastroInfo?: {
      entidade: keyof CadastrosData;
      id: number | null;
      item: any;
    };
  }>({ type: null });

  const showToast = useCallback((msg: string, color = "#10b981") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, color }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Theme initialization
  useEffect(() => {
    const saved = (localStorage.getItem("busato_theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("busato_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      showToast(`Tema alterado para: ${next === "dark" ? "Escuro" : "Claro (Branco)"}`);
      return next;
    });
  }, [showToast]);

  const buildFilterQuery = useCallback((f: FilterState) => {
    const q: Record<string, string> = {};
    if (f.dataInicio) q.dataInicio = f.dataInicio;
    if (f.dataFim) q.dataFim = f.dataFim;
    if (f.setor && f.setor !== "TODOS") q.setor = f.setor;
    if (f.tipoEquipamento && f.tipoEquipamento !== "TODOS") q.tipoEquipamento = f.tipoEquipamento;
    if (f.placa && f.placa !== "TODOS") q.placa = f.placa;
    if (f.frenteServico && f.frenteServico !== "TODOS") q.frenteServico = f.frenteServico;
    if (f.busca.trim()) q.busca = f.busca.trim();
    return q;
  }, []);

  const loadApontamentoDia = useCallback(
    async (dateOverride?: string) => {
      const d = dateOverride || apontamentoData;
      if (!d) return;
      const res = await fetchRegistros({ dataExata: d, limit: "250" });
      setApontamentoRegistros(res.registros || []);
    },
    [apontamentoData]
  );

  const loadCorretivasDia = useCallback(
    async (dateOverride?: string) => {
      const d = dateOverride || cdData;
      if (!d) return;
      const res = await fetchCorretivasDia(d);
      setCorretivasDia(res);
    },
    [cdData]
  );

  const loadCadastros = useCallback(async () => {
    const res = await fetchCadastros();
    setCadastros(res);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const q = buildFilterQuery(filters);
      const [ana] = await Promise.all([
        fetchAnalytics(q),
        loadApontamentoDia(),
        loadCorretivasDia(),
      ]);
      setAnalytics(ana);
    } finally {
      setLoading(false);
    }
  }, [filters, buildFilterQuery, loadApontamentoDia, loadCorretivasDia]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const meta = await fetchMeta();
        if (!mounted) return;
        setMetaOptions(meta);
        const preferredDay = pickPreferredOperationalDate(meta.datas || [], meta.dataMin, meta.dataMax);
        const initialFilters: FilterState = {
          dataInicio: meta.dataMin,
          dataFim: meta.dataMax,
          setor: "TODOS",
          tipoEquipamento: "TODOS",
          placa: "TODOS",
          frenteServico: "TODOS",
          busca: "",
        };
        setFilters(initialFilters);
        setApontamentoData(preferredDay);
        setCdData(preferredDay);

        const [ana, apReg, cdRes, cadRes] = await Promise.all([
          fetchAnalytics({ dataInicio: meta.dataMin, dataFim: meta.dataMax }),
          fetchRegistros({ dataExata: preferredDay, limit: "250" }),
          fetchCorretivasDia(preferredDay),
          fetchCadastros(),
        ]);
        if (!mounted) return;
        setAnalytics(ana);
        setApontamentoRegistros(apReg.registros || []);
        setCorretivasDia(cdRes);
        setCadastros(cadRes);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Refresh analytics when filters change
  useEffect(() => {
    if (!metaOptions) return;
    const t = setTimeout(() => {
      fetchAnalytics(buildFilterQuery(filters)).then(setAnalytics);
    }, 180);
    return () => clearTimeout(t);
  }, [filters, metaOptions, buildFilterQuery]);

  // Reload apontamento when apontamentoData changes
  useEffect(() => {
    if (!metaOptions) return;
    loadApontamentoDia(apontamentoData);
  }, [apontamentoData, metaOptions, loadApontamentoDia]);

  // Reload corretivasDia when cdData changes
  useEffect(() => {
    if (!metaOptions) return;
    loadCorretivasDia(cdData);
  }, [cdData, metaOptions, loadCorretivasDia]);

  // Atualização em tempo real a cada 30s quando houver paradas EM ABERTO
  useEffect(() => {
    const temAbertas =
      (analytics?.kpis?.paradasEmAbertoCount || 0) > 0 ||
      (corretivasDia?.resumo?.paradasAbertas || 0) > 0;
    if (!temAbertas) return;
    const timer = setInterval(() => {
      fetchAnalytics(buildFilterQuery(filters)).then(setAnalytics);
      loadApontamentoDia(apontamentoData);
      loadCorretivasDia(cdData);
    }, 30000);
    return () => clearInterval(timer);
  }, [
    analytics?.kpis?.paradasEmAbertoCount,
    corretivasDia?.resumo?.paradasAbertas,
    filters,
    apontamentoData,
    cdData,
    buildFilterQuery,
    loadApontamentoDia,
    loadCorretivasDia,
  ]);

  const filtrarUltimoDia = useCallback(() => {
    if (!metaOptions) return;
    const today = getTodayIsoStr();
    const targetDay = (metaOptions.datas || []).includes(today)
      ? today
      : metaOptions.dataMin || today;
    setFilters((prev) => ({
      ...prev,
      dataInicio: targetDay,
      dataFim: targetDay,
    }));
    setApontamentoData(targetDay);
    setCdData(targetDay);
    showToast(`Exibindo operação do dia ${formatBrDate(targetDay)}`, "#3b82f6");
  }, [metaOptions, setApontamentoData, setCdData, showToast]);

  const resetFilters = useCallback(() => {
    if (!metaOptions) return;
    setFilters({
      dataInicio: metaOptions.dataMin,
      dataFim: metaOptions.dataMax,
      setor: "TODOS",
      tipoEquipamento: "TODOS",
      placa: "TODOS",
      frenteServico: "TODOS",
      busca: "",
    });
    showToast("Filtros limpos — exibindo toda a base histórica.", "#10b981");
  }, [metaOptions, showToast]);

  const filterByPlate = useCallback(
    (placa: string) => {
      setFilters((prev) => ({ ...prev, placa }));
      showToast(`Filtro aplicado para Placa/TAG: ${placa}`, "#3b82f6");
    },
    [showToast]
  );

  const exportCsv = useCallback(
    async (tipo: TipoRelatorioCsv) => {
      await downloadRelatorioCsv(tipo, buildFilterQuery(filters));
      showToast(`Exportação CSV (${tipo}) concluída!`);
    },
    [filters, buildFilterQuery, showToast]
  );

  const exportCorretivasDiaCsv = useCallback(async () => {
    await downloadCorretivasDiaCsv(cdData);
    showToast(`Relatório de Corretivas (${formatBrDate(cdData)}) baixado!`);
  }, [cdData, showToast]);

  const exportExcelExecutivo = useCallback(async () => {
    await downloadExcelExecutivo(buildFilterQuery(filters), {
      inicio: filters.dataInicio,
      fim: filters.dataFim,
    });
    showToast("📗 Pasta Excel Executiva Completa (.xlsx com 6 abas) baixada!");
  }, [filters, buildFilterQuery, showToast]);

  const exportBoletimAderenciaXlsx = useCallback(async () => {
    await downloadBoletimAderenciaExcel(buildFilterQuery(filters));
    showToast("📘 Boletim de Corretivas & Aderência (.xlsx) baixado!");
  }, [filters, buildFilterQuery, showToast]);

  const exportPdfExecutivo = useCallback(async () => {
    await downloadPdfExecutivo(buildFilterQuery(filters), {
      inicio: filters.dataInicio,
      fim: filters.dataFim,
    });
    showToast("📄 Relatório Executivo em PDF gerado e baixado!");
  }, [filters, buildFilterQuery, showToast]);

  const copyResumoWhatsApp = useCallback(async () => {
    const txt = buildResumoExecutivoTexto(analytics, filters.dataInicio, filters.dataFim);
    if (txt && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(txt);
        showToast("💬 Resumo Executivo copiado para colar no WhatsApp / E-mail!");
      } catch {
        showToast("Resumo gerado na tela!", "#3b82f6");
      }
    }
    return txt;
  }, [analytics, filters.dataInicio, filters.dataFim, showToast]);

  const confirmarApresentacaoRapida = useCallback(
    async (idRegistro: number, status = "NO_HORARIO") => {
      const rec = apontamentoRegistros.find((r) => r.id === idRegistro);
      const horaProg = rec?.horarioProgramadoApresentacao || "07:00";
      await apiConfirmarApresentacao({
        idRegistro,
        statusApresentacao: status,
        horarioProgramadoApresentacao: horaProg,
        horarioApresentacao: horaProg,
        motivoAtrasoApresentacao: "",
        justificativaApresentacao: "",
      });
      showToast(
        `✅ Apresentação na frente confirmada (${rec ? rec.placaPrincipal : ""}) às ${horaProg}!`
      );
      await refreshAll();
    },
    [apontamentoRegistros, refreshAll, showToast]
  );

  const confirmarApresentacaoLote = useCallback(async () => {
    const res = await apiConfirmarApresentacaoLote(apontamentoData, "07:00");
    showToast(
      `✅ ${res.confirmados} equipamento(s) confirmados na Frente de Serviço às 07:00!`
    );
    await refreshAll();
  }, [apontamentoData, refreshAll, showToast]);

  // Modal Openers
  const openFichaAtendimento = useCallback(
    async (idRegistro: number) => {
      const rec = await fetchRegistroById(idRegistro);
      if (!rec) {
        showToast("Atendimento não encontrado", "#f43f5e");
        return;
      }
      setActiveModal({ type: "ficha", record: rec });
    },
    [showToast]
  );

  const openApresentacaoModal = useCallback(async (idRegistro: number) => {
    const rec = await fetchRegistroById(idRegistro);
    if (!rec) return;
    setActiveModal({ type: "apresentacao", record: rec });
  }, []);

  const openGlobalStartStopModal = useCallback(async () => {
    if (apontamentoRegistros.length === 0) {
      await loadApontamentoDia();
    }
    setActiveModal({ type: "startStop", globalStop: true, record: apontamentoRegistros[0] || null });
  }, [apontamentoRegistros, loadApontamentoDia]);

  const openStartStopModal = useCallback(
    async (idRegistro: number) => {
      const rec = await fetchRegistroById(idRegistro);
      if (!rec) return openGlobalStartStopModal();
      setActiveModal({ type: "startStop", globalStop: false, record: rec });
    },
    [openGlobalStartStopModal]
  );

  const openCloseStopModal = useCallback(
    async (idRegistro: number, paradaId = 0, isEditMode = false) => {
      const rec = await fetchRegistroById(idRegistro);
      if (!rec) {
        showToast("Registro não encontrado", "#f43f5e");
        return;
      }
      setActiveModal({ type: "closeStop", record: rec, paradaId, isEditMode });
    },
    [showToast]
  );

  const openQuickAlmoco = useCallback(async (idRegistro: number) => {
    const rec = await fetchRegistroById(idRegistro);
    if (!rec) return;
    setActiveModal({ type: "almoco", record: rec });
  }, []);

  const openQuickDesvio = useCallback(async (idRegistro: number) => {
    const rec = await fetchRegistroById(idRegistro);
    if (!rec) return;
    setActiveModal({ type: "desvio", record: rec });
  }, []);

  const openNewEntryModal = useCallback(() => {
    setActiveModal({ type: "newEntry" });
  }, []);

  const openCloneDayModal = useCallback(() => {
    setActiveModal({ type: "cloneDay" });
  }, []);

  const openNovaCorretivaDiaModal = useCallback(async () => {
    if (apontamentoData !== cdData) {
      await loadApontamentoDia(cdData);
    } else if (apontamentoRegistros.length === 0) {
      await loadApontamentoDia(cdData);
    }
    setActiveModal({ type: "novaCorretivaDia" });
  }, [apontamentoData, cdData, apontamentoRegistros.length, loadApontamentoDia]);

  const openLiberarCorretivaDiaModal = useCallback(
    (
      idRegistro: number,
      paradaId: number,
      placa: string,
      equip: string,
      inicio: string,
      servico: string
    ) => {
      setActiveModal({
        type: "liberarCorretivaDia",
        liberarInfo: { idRegistro, paradaId, placa, equip, inicio, servico },
      });
    },
    []
  );

  const openCadastroModal = useCallback(
    (entidade: keyof CadastrosData, id: number | null = null) => {
      const item = id !== null ? (cadastros[entidade] || []).find((x: any) => x.id === id) || {} : {};
      setActiveModal({
        type: "cadastro",
        cadastroInfo: { entidade, id, item },
      });
    },
    [cadastros]
  );

  const toggleStatusCadastro = useCallback(
    async (entidade: keyof CadastrosData, id: number) => {
      const item = (cadastros[entidade] || []).find((x: any) => x.id === id);
      if (!item) return;
      const novoStatus = item.status === "INATIVO" ? "ATIVO" : "INATIVO";
      await apiSaveCadastroItem(entidade, { status: novoStatus }, id);
      showToast(`Status alterado para ${novoStatus === "ATIVO" ? "🟢 Ativo" : "🔴 Inativo"}`);
      await loadCadastros();
      const meta = await fetchMeta();
      setMetaOptions(meta);
    },
    [cadastros, loadCadastros, showToast]
  );

  const deleteCadastroItem = useCallback(
    async (entidade: keyof CadastrosData, id: number, identificador: string) => {
      if (
        !window.confirm(
          `Deseja realmente excluir o cadastro "${identificador}"? Esta ação removerá o item da lista de opções do sistema.`
        )
      ) {
        return;
      }
      await apiDeleteCadastroItem(entidade, id);
      showToast(`🗑️ Item "${identificador}" excluído com sucesso!`, "#e11d48");
      await loadCadastros();
      const meta = await fetchMeta();
      setMetaOptions(meta);
    },
    [loadCadastros, showToast]
  );

  return (
    <BusatoContext.Provider
      value={{
        metaOptions,
        filters,
        setFilters,
        analytics,
        apontamentoData,
        setApontamentoData,
        apontamentoRegistros,
        cdData,
        setCdData,
        corretivasDia,
        cadastros,
        loading,
        theme,
        toggleTheme,
        showToast,
        refreshAll,
        loadApontamentoDia,
        loadCorretivasDia,
        loadCadastros,
        filtrarUltimoDia,
        resetFilters,
        filterByPlate,
        exportCsv,
        exportCorretivasDiaCsv,
        exportExcelExecutivo,
        exportBoletimAderenciaXlsx,
        exportPdfExecutivo,
        copyResumoWhatsApp,
        confirmarApresentacaoRapida,
        confirmarApresentacaoLote,
        openFichaAtendimento,
        openApresentacaoModal,
        openGlobalStartStopModal,
        openStartStopModal,
        openCloseStopModal,
        openQuickAlmoco,
        openQuickDesvio,
        openNewEntryModal,
        openCloneDayModal,
        openNovaCorretivaDiaModal,
        openLiberarCorretivaDiaModal,
        openCadastroModal,
        toggleStatusCadastro,
        deleteCadastroItem,
      }}
    >
      {children}

      {/* GLOBAL MODALS */}
      {activeModal.type && (
        <GlobalModals
          activeModal={activeModal}
          closeModal={() => setActiveModal({ type: null })}
          apontamentoData={apontamentoData}
          setApontamentoData={setApontamentoData}
          apontamentoRegistros={apontamentoRegistros}
          cdData={cdData}
          filters={filters}
          setFilters={setFilters}
          refreshAll={refreshAll}
          loadCorretivasDia={loadCorretivasDia}
          loadCadastros={loadCadastros}
          setMetaOptions={setMetaOptions}
          showToast={showToast}
          openStartStopModal={openStartStopModal}
          openCloseStopModal={openCloseStopModal}
        />
      )}

      {/* TOAST CONTAINER */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast-item" style={{ borderLeftColor: t.color }}>
            {t.msg}
          </div>
        ))}
      </div>
    </BusatoContext.Provider>
  );
}

export function useBusato() {
  const ctx = useContext(BusatoContext);
  if (!ctx) throw new Error("useBusato must be used within BusatoProvider");
  return ctx;
}

// ============================================================================
// GLOBAL MODALS COMPONENT (EXACT REPLICA OF LOCALHOST:3080 POP-UPS)
// ============================================================================
function GlobalModals({
  activeModal,
  closeModal,
  apontamentoData,
  setApontamentoData,
  apontamentoRegistros,
  cdData,
  filters,
  setFilters,
  refreshAll,
  loadCorretivasDia,
  loadCadastros,
  setMetaOptions,
  showToast,
  openStartStopModal,
  openCloseStopModal,
}: any) {
  const rec: RegistroOperacional | null = activeModal.record || null;

  // 1. FICHA COMPLETA DO ATENDIMENTO
  if (activeModal.type === "ficha" && rec) {
    return (
      <FichaAtendimentoModal
        rec={rec}
        closeModal={closeModal}
        refreshAll={refreshAll}
        showToast={showToast}
        openStartStopModal={openStartStopModal}
        openCloseStopModal={openCloseStopModal}
      />
    );
  }

  // 2. APRESENTAÇÃO NA FRENTE DE SERVIÇO
  if (activeModal.type === "apresentacao" && rec) {
    return (
      <ApresentacaoModal
        rec={rec}
        closeModal={closeModal}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 3. INICIAR PARADA / CORRETIVA
  if (activeModal.type === "startStop") {
    return (
      <StartStopModal
        rec={rec}
        globalStop={activeModal.globalStop}
        apontamentoData={apontamentoData}
        apontamentoRegistros={apontamentoRegistros}
        closeModal={closeModal}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 4. ENCERRAR / EDITAR PARADA
  if (activeModal.type === "closeStop" && rec) {
    return (
      <CloseStopModal
        rec={rec}
        paradaId={activeModal.paradaId}
        isEditMode={activeModal.isEditMode}
        closeModal={closeModal}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 5. ALMOÇO RÁPIDO
  if (activeModal.type === "almoco" && rec) {
    return (
      <QuickAlmocoModal
        rec={rec}
        closeModal={closeModal}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 6. DESVIO RÁPIDO
  if (activeModal.type === "desvio" && rec) {
    return (
      <QuickDesvioModal
        rec={rec}
        closeModal={closeModal}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 7. ESCALAR NOVO EQUIPAMENTO
  if (activeModal.type === "newEntry") {
    return (
      <NewEntryModal
        defaultDate={apontamentoData}
        closeModal={closeModal}
        setApontamentoData={setApontamentoData}
        filters={filters}
        setFilters={setFilters}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 8. CLONAR ESCALA DO DIA
  if (activeModal.type === "cloneDay") {
    return (
      <CloneDayModal
        defaultDate={apontamentoData}
        closeModal={closeModal}
        setApontamentoData={setApontamentoData}
        filters={filters}
        setFilters={setFilters}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 9. NOVA CORRETIVA DO DIA (SIMPLIFICADO BASE VS ÁREA)
  if (activeModal.type === "novaCorretivaDia") {
    return (
      <NovaCorretivaDiaModal
        cdData={cdData}
        apontamentoRegistros={apontamentoRegistros}
        closeModal={closeModal}
        loadCorretivasDia={loadCorretivasDia}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 10. LIBERAR MÁQUINA EM 1 CLIQUE
  if (activeModal.type === "liberarCorretivaDia" && activeModal.liberarInfo) {
    return (
      <LiberarCorretivaDiaModal
        info={activeModal.liberarInfo}
        closeModal={closeModal}
        loadCorretivasDia={loadCorretivasDia}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    );
  }

  // 11. CADASTRO MODAL (OPERADORES, EQUIPAMENTOS, LOCAIS, SERVIÇOS, JUSTIFICATIVAS)
  if (activeModal.type === "cadastro" && activeModal.cadastroInfo) {
    return (
      <CadastroModal
        info={activeModal.cadastroInfo}
        closeModal={closeModal}
        loadCadastros={loadCadastros}
        setMetaOptions={setMetaOptions}
        showToast={showToast}
      />
    );
  }

  return null;
}

// ── Individual Modal Subcomponents ───────────────────────────────────────────

function FichaAtendimentoModal({
  rec,
  closeModal,
  refreshAll,
  showToast,
  openStartStopModal,
  openCloseStopModal,
}: any) {
  const [statusApresentacao, setStatusApresentacao] = useState(rec.statusApresentacao || "NO_HORARIO");
  const [horaProg, setHoraProg] = useState(rec.horarioProgramadoApresentacao || "07:00");
  const [horaReal, setHoraReal] = useState(rec.horarioApresentacao || "07:00");
  const [motivoApres, setMotivoApres] = useState(rec.motivoAtrasoApresentacao || "");
  const [justApres, setJustApres] = useState(rec.justificativaApresentacao || "");
  const [equipNome, setEquipNome] = useState(rec.equipamentoNome || "");
  const [placa, setPlaca] = useState(rec.placaPrincipal || "");
  const [placaReserva, setPlacaReserva] = useState(rec.placaReserva || "");
  const [operador, setOperador] = useState(rec.operador || "");
  const [frente, setFrente] = useState(rec.frenteServico || "");
  const [setor, setSetor] = useState(rec.setor || "MFE");
  const [regime, setRegime] = useState(String(rec.regimeHoras || 12));
  const [os, setOs] = useState(rec.ordemServico || "");
  const [responsavel, setResponsavel] = useState(rec.responsavel || "");
  const [atividade, setAtividade] = useState(rec.atividade || "");
  const [almIni, setAlmIni] = useState(rec.almoco?.inicio || "");
  const [almFim, setAlmFim] = useState(rec.almoco?.fim || "");

  // Pré-visualização de perda de horas e impacto na DF / Aderência quando inicia com atraso ou não apresenta
  const previewAtraso = (() => {
    const toMin = (hhmm: string) => {
      if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };
    const mP = toMin(horaProg) ?? 420;
    const mR = toMin(horaReal);
    const minProgTotal = Math.round(10.5 * 60); // 10:30h base contratual Vale por turno
    const minParadasOutras = (rec.corretivas || []).reduce(
      (acc: number, c: any) => acc + (Number(c.duracaoMin) || 0),
      0
    );

    if (statusApresentacao === "NAO_APRESENTOU") {
      return {
        minPerdidosInicio: minProgTotal,
        horasPerdidasStr: "10:30h (10,50h)",
        dfEstimada: "0,0%",
      };
    }
    if (statusApresentacao === "ATRASADO" && mR !== null && mR > mP) {
      const diff = mR - mP;
      const hh = String(Math.floor(diff / 60)).padStart(2, "0");
      const mm = String(diff % 60).padStart(2, "0");
      const totalPerdido = Math.min(minProgTotal, diff + minParadasOutras);
      const df = (((minProgTotal - totalPerdido) / minProgTotal) * 100).toFixed(1).replace(".", ",");
      return {
        minPerdidosInicio: diff,
        horasPerdidasStr: `${hh}:${mm}h (${(diff / 60).toFixed(2).replace(".", ",")}h)`,
        dfEstimada: `${df}%`,
      };
    }
    return null;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const almoco = almIni
      ? { inicio: almIni, fim: almFim || "", duracaoMin: 60, retornoRegistrado: Boolean(almFim) }
      : null;

    await apiUpdateRegistro(rec.id, {
      statusApresentacao,
      horarioProgramadoApresentacao: horaProg || "07:00",
      horarioApresentacao: horaReal || "07:00",
      motivoAtrasoApresentacao: motivoApres,
      justificativaApresentacao: justApres.trim(),
      equipamentoNome: equipNome.trim(),
      placaPrincipal: placa.trim().toUpperCase(),
      placaReserva: placaReserva.trim().toUpperCase() || null,
      operador: operador.trim().toUpperCase(),
      frenteServico: frente.trim(),
      setor,
      regimeHoras: Number(regime),
      ordemServico: os.trim(),
      responsavel: responsavel.trim().toUpperCase(),
      atividade: atividade.trim(),
      almoco,
    });

    closeModal();
    showToast(`✅ Ficha da placa ${placa.toUpperCase()} atualizada com sucesso!`);
    await refreshAll();
  };

  const handleDelete = async () => {
    if (!window.confirm("Tem certeza que deseja excluir este atendimento do turno?")) return;
    await apiDeleteRegistro(rec.id);
    closeModal();
    showToast("Atendimento removido do turno.", "#f43f5e");
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 740 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            📝 Ficha Completa do Atendimento — Placa {rec.placaPrincipal} ({formatBrDate(rec.data)})
          </h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* BLOCO 1: APRESENTAÇÃO */}
          <div
            style={{
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.35)",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#0891b2",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              📍 1. Início do Atendimento — Apresentação na Frente de Serviço
            </div>
            <div className="form-grid">
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  STATUS DE APRESENTAÇÃO *
                </label>
                <select
                  className="form-control"
                  style={{ fontWeight: 700 }}
                  value={statusApresentacao}
                  onChange={(e) => setStatusApresentacao(e.target.value)}
                >
                  <option value="NO_HORARIO">✅ Apresentou no Horário (Pontual)</option>
                  <option value="AGUARDANDO">⏳ Aguardando Apresentação na Frente</option>
                  <option value="ATRASADO">⏰ Apresentou com Atraso</option>
                  <option value="NAO_APRESENTOU">🚫 Não se Apresentou (Falta / Indisponível)</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>HORA PROGRAMADA</label>
                  <input
                    type="time"
                    className="form-control"
                    value={horaProg}
                    onChange={(e) => setHoraProg(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                    HORA REAL NA FRENTE
                  </label>
                  <input
                    type="time"
                    className="form-control"
                    value={horaReal}
                    onChange={(e) => setHoraReal(e.target.value)}
                  />
                </div>
              </div>
              {(statusApresentacao === "ATRASADO" || statusApresentacao === "NAO_APRESENTOU") && (
                <div
                  className="full-width"
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}
                >
                  <div>
                    <label style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>
                      MOTIVO DO ATRASO / NÃO APRESENTAÇÃO *
                    </label>
                    <select
                      className="form-control"
                      value={motivoApres}
                      onChange={(e) => setMotivoApres(e.target.value)}
                    >
                      <option value="">Selecione o motivo...</option>
                      <option value="Retenção / Bloqueio na Portaria">Retenção / Bloqueio na Portaria</option>
                      <option value="Atraso de Operador / Transporte">Atraso de Operador / Transporte</option>
                      <option value="Falta / Ausência de Operador">Falta / Ausência de Operador</option>
                      <option value="Manutenção Corretiva no Início do Turno">
                        Manutenção Corretiva no Início do Turno
                      </option>
                      <option value="Equipamento Sem Reserva Disponível">
                        Equipamento Sem Reserva Disponível
                      </option>
                      <option value="Aguardando Liberação / ART / Fiscalização">
                        Aguardando Liberação / ART / Fiscalização
                      </option>
                      <option value="Abastecimento / Checklist Inicial">
                        Abastecimento / Checklist Inicial
                      </option>
                      <option value="Treinamento / ROF / Exame">Treinamento / ROF / Exame</option>
                      <option value="Programação Cancelada pelo Cliente">
                        Programação Cancelada pelo Cliente
                      </option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      JUSTIFICATIVA DETALHADA / OBSERVAÇÃO
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={justApres}
                      onChange={(e) => setJustApres(e.target.value)}
                      placeholder="Ex: Crachá bloqueado na portaria até 07:50..."
                    />
                  </div>
                  {previewAtraso && (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        background: "rgba(225, 29, 72, 0.1)",
                        border: "1px solid rgba(225, 29, 72, 0.35)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: "#e11d48", fontWeight: 700 }}>
                        ⏱️ Perda computada no início do turno:{" "}
                        <strong>{previewAtraso.horasPerdidasStr}</strong> ({previewAtraso.minPerdidosInicio} min)
                      </span>
                      <span style={{ fontWeight: 800, color: "#be123c" }}>
                        🎯 DF / Aderência da Placa no Turno: {previewAtraso.dfEstimada}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BLOCO 2: EQUIPAMENTO, OPERADOR E ATIVIDADE */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "var(--accent-blue)",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            🚜 2. Dados do Equipamento, Operador e Frente de Serviço
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                EQUIPAMENTO / IDENTIFICAÇÃO *
              </label>
              <input
                type="text"
                className="form-control"
                value={equipNome}
                onChange={(e) => setEquipNome(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>PLACA PRINCIPAL *</label>
                <input
                  type="text"
                  className="form-control"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>PLACA RESERVA</label>
                <input
                  type="text"
                  className="form-control"
                  value={placaReserva}
                  onChange={(e) => setPlacaReserva(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                MOTORISTA / OPERADOR *
              </label>
              <input
                type="text"
                className="form-control"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                FRENTE DE SERVIÇO / LOCAL ATUAL *
              </label>
              <input
                type="text"
                className="form-control"
                value={frente}
                onChange={(e) => setFrente(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>SETOR</label>
                <select className="form-control" value={setor} onChange={(e) => setSetor(e.target.value)}>
                  <option value="MFE">MFE</option>
                  <option value="TPM">TPM</option>
                  <option value="EXTRA">EXTRA</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>REGIME (H)</label>
                <select className="form-control" value={regime} onChange={(e) => setRegime(e.target.value)}>
                  <option value="12">12h</option>
                  <option value="24">24h</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Nº OS</label>
                <input
                  type="text"
                  className="form-control"
                  value={os}
                  onChange={(e) => setOs(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                ENCARREGADO / RESPONSÁVEL
              </label>
              <input
                type="text"
                className="form-control"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              />
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                ATIVIDADE PROGRAMADA
              </label>
              <input
                type="text"
                className="form-control"
                value={atividade}
                onChange={(e) => setAtividade(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>🍽️ SAÍDA ALMOÇO</label>
              <input
                type="time"
                className="form-control"
                value={almIni}
                onChange={(e) => setAlmIni(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>🍽️ RETORNO ALMOÇO</label>
              <input
                type="time"
                className="form-control"
                value={almFim}
                onChange={(e) => setAlmFim(e.target.value)}
              />
            </div>
          </div>

          {/* BLOCO 3: RESUMO DE PARADAS */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#e11d48",
                  textTransform: "uppercase",
                }}
              >
                🔧 3. Paradas / Manutenções Registradas Neste Turno ({(rec.corretivas || []).length})
              </span>
              <button
                type="button"
                className="btn btn-rose btn-xs"
                onClick={() => openStartStopModal(rec.id)}
              >
                🛑 + Iniciar Nova Parada
              </button>
            </div>
            {(rec.corretivas || []).length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Nenhuma parada registrada neste atendimento (DF: 100%).
              </div>
            ) : (
              (rec.corretivas || []).map((c: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--bg-card-hover)",
                    border: "1px solid var(--border-color)",
                    padding: "8px 10px",
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong style={{ color: c.emAberto ? "#e11d48" : "#16a34a" }}>
                      {c.emAberto ? `🔴 EM ABERTO (Desde ${c.inicio})` : `✅ ${c.inicio} às ${c.fim}`}
                    </strong>{" "}
                    • 🔧 {c.motivo} • 📍 Local:{" "}
                    <strong>{c.localParada || rec.frenteServico}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => openCloseStopModal(rec.id, c.paradaId || 0, true)}
                  >
                    ✏️ Editar / Encerrar
                  </button>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--border-color)",
              paddingTop: 14,
            }}
          >
            <button type="button" className="btn btn-rose btn-xs" onClick={handleDelete}>
              🗑️ Excluir Atendimento
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-emerald">
                💾 Salvar Todas as Alterações
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApresentacaoModal({ rec, closeModal, refreshAll, showToast }: any) {
  const [status, setStatus] = useState(rec.statusApresentacao || "NO_HORARIO");
  const [horaProg, setHoraProg] = useState(rec.horarioProgramadoApresentacao || "07:00");
  const [horaReal, setHoraReal] = useState(rec.horarioApresentacao || "07:30");
  const [motivo, setMotivo] = useState(rec.motivoAtrasoApresentacao || "");
  const [justificativa, setJustificativa] = useState(rec.justificativaApresentacao || "");

  const previewAtraso = (() => {
    const toMin = (hhmm: string) => {
      if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };
    const mP = toMin(horaProg) ?? 420;
    const mR = toMin(horaReal);
    const minProgTotal = Math.round(10.5 * 60); // 10:30h base contratual Vale por turno
    const minParadasOutras = (rec.corretivas || []).reduce(
      (acc: number, c: any) => acc + (Number(c.duracaoMin) || 0),
      0
    );

    if (status === "NAO_APRESENTOU") {
      return {
        minPerdidosInicio: minProgTotal,
        horasPerdidasStr: "10:30h (10,50h)",
        dfEstimada: "0,0%",
      };
    }
    if (status === "ATRASADO" && mR !== null && mR > mP) {
      const diff = mR - mP;
      const hh = String(Math.floor(diff / 60)).padStart(2, "0");
      const mm = String(diff % 60).padStart(2, "0");
      const totalPerdido = Math.min(minProgTotal, diff + minParadasOutras);
      const df = (((minProgTotal - totalPerdido) / minProgTotal) * 100).toFixed(1).replace(".", ",");
      return {
        minPerdidosInicio: diff,
        horasPerdidasStr: `${hh}:${mm}h (${(diff / 60).toFixed(2).replace(".", ",")}h)`,
        dfEstimada: `${df}%`,
      };
    }
    return null;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await apiConfirmarApresentacao({
      idRegistro: rec.id,
      statusApresentacao: status,
      horarioProgramadoApresentacao: horaProg,
      horarioApresentacao: horaReal,
      motivoAtrasoApresentacao: motivo,
      justificativaApresentacao: justificativa.trim(),
    });
    closeModal();
    showToast(`📍 Apresentação atualizada para a placa ${updated.placaPrincipal}!`);
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📍 Apresentação na Frente de Serviço — Placa {rec.placaPrincipal}</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 12.5, marginBottom: 14 }}>
          Equipamento: <strong>{rec.equipamentoNome}</strong> | Operador:{" "}
          <strong>{rec.operador}</strong> | Frente: <strong>{rec.frenteServico}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SITUAÇÃO DE APRESENTAÇÃO NA FRENTE *
              </label>
              <select
                className="form-control"
                style={{ fontWeight: 700 }}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="NO_HORARIO">✅ Apresentou no Horário (Pontual)</option>
                <option value="ATRASADO">⏰ Apresentou com Atraso (Justificar Atraso)</option>
                <option value="NAO_APRESENTOU">
                  🚫 Não se Apresentou na Frente (Justificar Falta/Ausência)
                </option>
                <option value="AGUARDANDO">⏳ Aguardando Apresentação</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                HORÁRIO PROGRAMADO *
              </label>
              <input
                type="time"
                className="form-control"
                value={horaProg}
                onChange={(e) => setHoraProg(e.target.value)}
                required
              />
            </div>
            {status !== "NAO_APRESENTOU" && (
              <div>
                <label style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                  HORÁRIO REAL DE CHEGADA NA FRENTE *
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="time"
                    className="form-control"
                    value={horaReal}
                    onChange={(e) => setHoraReal(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => setHoraReal(getNowTimeStr())}
                  >
                    Agora
                  </button>
                </div>
              </div>
            )}
            <div className="full-width">
              <label style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>
                MOTIVO PADRONIZADO (ATRASO OU NÃO APRESENTAÇÃO)
              </label>
              <select
                className="form-control"
                style={{ marginBottom: 10 }}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                <option value="">Selecione o motivo...</option>
                <option value="Retenção / Bloqueio na Portaria">Retenção / Bloqueio na Portaria</option>
                <option value="Atraso de Operador / Transporte">Atraso de Operador / Transporte</option>
                <option value="Falta / Ausência de Operador">Falta / Ausência de Operador</option>
                <option value="Manutenção Corretiva no Início do Turno">
                  Manutenção Corretiva no Início do Turno
                </option>
                <option value="Equipamento Sem Reserva Disponível">
                  Equipamento Sem Reserva Disponível
                </option>
                <option value="Aguardando Liberação / ART / Fiscalização">
                  Aguardando Liberação / ART / Fiscalização
                </option>
                <option value="Abastecimento / Checklist Inicial">
                  Abastecimento / Checklist Inicial
                </option>
                <option value="Treinamento / ROF / Exame">Treinamento / ROF / Exame</option>
                <option value="Programação Cancelada pelo Cliente">
                  Programação Cancelada pelo Cliente
                </option>
              </select>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                JUSTIFICATIVA / DETALHAMENTO
              </label>
              <input
                type="text"
                className="form-control"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Descreva o motivo do atraso ou não apresentação..."
              />
              {previewAtraso && (
                <div
                  style={{
                    marginTop: 10,
                    background: "rgba(225, 29, 72, 0.1)",
                    border: "1px solid rgba(225, 29, 72, 0.35)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#e11d48", fontWeight: 700 }}>
                    ⏱️ Perda computada no início do turno:{" "}
                    <strong>{previewAtraso.horasPerdidasStr}</strong> ({previewAtraso.minPerdidosInicio} min)
                  </span>
                  <span style={{ fontWeight: 800, color: "#be123c" }}>
                    🎯 DF / Aderência da Placa: {previewAtraso.dfEstimada}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald">
              💾 Confirmar Status de Apresentação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StartStopModal({
  rec,
  globalStop,
  apontamentoData,
  apontamentoRegistros,
  closeModal,
  refreshAll,
  showToast,
}: any) {
  const [selectedId, setSelectedId] = useState<number>(
    rec?.id || apontamentoRegistros[0]?.id || 0
  );
  const [modoAberta, setModoAberta] = useState<"ABERTA" | "FECHADA">("ABERTA");
  const [tipoParada, setTipoParada] = useState("CORRETIVA");
  const [motivo, setMotivo] = useState("Sistema Hidráulico / Mangueira");
  const [localParada, setLocalParada] = useState(
    rec?.frenteServico || apontamentoRegistros[0]?.frenteServico || "Frente Operacional"
  );
  const [inicio, setInicio] = useState(getNowTimeStr());
  const [fim, setFim] = useState(getNowTimeStr());

  const handleEquipChange = (id: number) => {
    setSelectedId(id);
    const found = apontamentoRegistros.find((r: any) => r.id === id);
    if (found) setLocalParada(found.frenteServico || "Frente Operacional");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const idAlvo = globalStop ? selectedId : rec.id;
    const emAberto = modoAberta === "ABERTA";
    const updated = await apiIniciarParada({
      idRegistro: idAlvo,
      tipoParada,
      motivo,
      localParada: localParada.trim(),
      inicio,
      fim,
      emAberto,
    });
    closeModal();
    showToast(
      emAberto
        ? `🔴 Parada iniciada para ${updated.placaPrincipal} em [${localParada}]! Acompanhe no topo e encerre quando liberar.`
        : `✅ Parada registrada e concluída para ${updated.placaPrincipal}!`,
      emAberto ? "#f43f5e" : "#10b981"
    );
    await refreshAll();
  };

  const locaisRapidos = [
    ["OFICINA BUSATO", "Oficina Busato"],
    ["BORRACHARIA", "Borracharia"],
    ["ÁREA NOVA - D01 / H21", "Área Nova (D01/H21)"],
    ["ÁREA VELHA - B01", "Área Velha (B01)"],
    ["ROTA AMT / BACIA EMA", "Rota AMT"],
    ["PÍER 01 / 02", "Píer 01/02"],
    ["PÁTIO TPM", "Pátio TPM"],
  ];

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {globalStop
              ? "🛑 Iniciar Parada / Manutenção Corretiva em Tempo Real"
              : `🛑 Iniciar Parada — Placa ${rec?.placaPrincipal} (${rec?.equipamentoNome})`}
          </h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        {!globalStop && rec && (
          <p style={{ color: "var(--text-secondary)", fontSize: 12.5, marginBottom: 12 }}>
            Data: <strong>{formatBrDate(rec.data)}</strong> | Operador:{" "}
            <strong>{rec.operador}</strong> | Frente: <strong>{rec.frenteServico}</strong>
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {globalStop && (
              <div className="full-width">
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  SELECIONE O EQUIPAMENTO / PLACA NO TURNO ({formatBrDate(apontamentoData)}) *
                </label>
                <select
                  className="form-control"
                  value={selectedId}
                  onChange={(e) => handleEquipChange(Number(e.target.value))}
                  required
                >
                  {apontamentoRegistros.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.placaPrincipal} — {r.equipamentoNome} ({r.operador}) [📍 {r.frenteServico}]
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SITUAÇÃO DA PARADA *
              </label>
              <select
                className="form-control"
                style={{ fontWeight: 700, borderColor: "#f43f5e" }}
                value={modoAberta}
                onChange={(e) => setModoAberta(e.target.value as any)}
              >
                <option value="ABERTA">
                  🔴 Parar Equipamento AGORA (Deixar EM ABERTO até o término do reparo)
                </option>
                <option value="FECHADA">
                  🔴🟢 Parada Já Concluída (Informar Hora Início e Hora Fim agora)
                </option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>TIPO DE PARADA *</label>
              <select
                className="form-control"
                value={tipoParada}
                onChange={(e) => setTipoParada(e.target.value)}
                required
              >
                <option value="CORRETIVA">🔧 Manutenção Corretiva</option>
                <option value="BORRACHARIA">🛞 Borracharia / Pneu</option>
                <option value="PORTARIA">🚧 Bloqueio / Retenção de Portaria</option>
                <option value="ABASTECIMENTO">⛽ Abastecimento / Comboio</option>
                <option value="INSPECAO">📋 Inspeção / Segurança / ROF</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SUBSISTEMA / MOTIVO DA PARADA *
              </label>
              <select
                className="form-control"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
              >
                <option value="Sistema Hidráulico / Mangueira">Sistema Hidráulico / Mangueira</option>
                <option value="Borracharia / Pneu Furado">Borracharia / Pneu Furado</option>
                <option value="Sistema Elétrico">Sistema Elétrico / Bateria / Alternador</option>
                <option value="Motor / Mecânica Pesada">Motor / Mecânica Pesada</option>
                <option value="Implemento / Bomba d'Água">Implemento / Bomba d'Água / Aspersor</option>
                <option value="Ar-Condicionado / Cabine">Ar-Condicionado / Climatizador / Cabine</option>
                <option value="Sistema de Freios">Sistema de Freios</option>
                <option value="Manutenção Corretiva Geral">Manutenção Corretiva Geral</option>
              </select>
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>
                📍 LOCAL DA PARADA (ONDE O EQUIPAMENTO PAROU) *
              </label>
              <input
                type="text"
                className="form-control"
                value={localParada}
                onChange={(e) => setLocalParada(e.target.value)}
                placeholder="Ex: Oficina Busato, Área Nova D01, Píer 01, Rota AMT H35, Borracharia..."
                required
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Locais rápidos:</span>
                {locaisRapidos.map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => setLocalParada(val)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                HORA DE INÍCIO DA PARADA *
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="time"
                  className="form-control"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setInicio(getNowTimeStr())}
                >
                  Agora
                </button>
              </div>
            </div>
            {modoAberta === "FECHADA" && (
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  HORA DE ENCERRAMENTO / RETORNO
                </label>
                <input
                  type="time"
                  className="form-control"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-rose" style={{ fontWeight: 700 }}>
              🛑 Confirmar Início da Parada
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloseStopModal({ rec, paradaId, isEditMode, closeModal, refreshAll, showToast }: any) {
  const corretivas = rec.corretivas || [];
  const targetStop =
    (paradaId ? corretivas.find((c: any) => Number(c.paradaId) === Number(paradaId)) : null) ||
    corretivas.find((c: any) => c.emAberto) ||
    corretivas[corretivas.length - 1] || {
      inicio: "07:00",
      fim: getNowTimeStr(),
      localParada: rec.frenteServico,
      motivo: "Manutenção Corretiva Geral",
      emAberto: true,
    };

  const fimDefault =
    !targetStop.emAberto && /^\d{2}:\d{2}$/.test(targetStop.fim)
      ? targetStop.fim
      : getNowTimeStr();

  const [localParada, setLocalParada] = useState(targetStop.localParada || rec.frenteServico);
  const [fim, setFim] = useState(fimDefault);
  const [motivo, setMotivo] = useState(targetStop.motivo || "Manutenção Corretiva Geral");
  const [localRetorno, setLocalRetorno] = useState(targetStop.localRetorno || rec.frenteServico);
  const [solucao, setSolucao] = useState(targetStop.solucao || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await apiEncerrarParada({
      idRegistro: rec.id,
      paradaId: targetStop.paradaId || 0,
      fim,
      localParada: localParada.trim(),
      localRetorno: localRetorno.trim(),
      motivo: motivo.trim(),
      solucao: solucao.trim(),
    });
    closeModal();
    showToast(
      `✅ Parada encerrada às ${fim}! Placa ${updated.placaPrincipal} liberada para [${localRetorno}] (DF: ${updated.disponibilidadeFisica}%).`
    );
    await refreshAll();
  };

  const handleClearCorretivas = async () => {
    await apiUpdateRegistro(rec.id, { corretivas: [], statusCodigo: "OPERANDO" });
    closeModal();
    showToast("Paradas removidas e status restaurado para Operando Normal (DF 100%).");
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {isEditMode
              ? `✏️ Editar Local / Horário da Parada — Placa ${rec.placaPrincipal}`
              : `✅ Encerrar Parada e Liberar Equipamento — Placa ${rec.placaPrincipal}`}
          </h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <div
          style={{
            background: "rgba(244,63,94,0.12)",
            border: "1px solid rgba(244,63,94,0.35)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 700, color: "#e11d48" }}>
            Equipamento: {rec.equipamentoNome} ({rec.placaPrincipal}) • Data:{" "}
            {formatBrDate(rec.data)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Início da Parada: <strong>{targetStop.inicio}</strong> • Status Atual:{" "}
            <strong>
              {targetStop.emAberto
                ? "🔴 EM ABERTO (Aguardando Encerramento)"
                : `✅ Encerrada às ${targetStop.fim}`}
            </strong>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="full-width">
              <label style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>
                📍 LOCAL ONDE ESTAVA PARADO (LOCAL DA PARADA) *
              </label>
              <input
                type="text"
                className="form-control"
                value={localParada}
                onChange={(e) => setLocalParada(e.target.value)}
                required
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {[
                  ["OFICINA BUSATO", "Oficina Busato"],
                  ["BORRACHARIA", "Borracharia"],
                  ["ÁREA NOVA - D01 / H21", "Área Nova (D01/H21)"],
                  ["ÁREA VELHA - B01", "Área Velha (B01)"],
                  ["ROTA AMT / BACIA EMA", "Rota AMT"],
                  ["PÍER 01 / 02", "Píer 01/02"],
                ].map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => setLocalParada(val)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                ⏱️ HORA DE ENCERRAMENTO / LIBERAÇÃO *
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="time"
                  className="form-control"
                  style={{ borderColor: "#10b981", fontWeight: 700 }}
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setFim(getNowTimeStr())}
                >
                  Agora
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SUBSISTEMA / MOTIVO CONFIRMADO *
              </label>
              <input
                type="text"
                className="form-control"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
              />
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "#0284c7", fontWeight: 700 }}>
                📍 LOCAL / FRENTE DE RETORNO (PARA ONDE VOLTOU A OPERAR) *
              </label>
              <input
                type="text"
                className="form-control"
                value={localRetorno}
                onChange={(e) => setLocalRetorno(e.target.value)}
                required
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Retornar para:</span>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLocalRetorno(rec.frenteServico)}
                >
                  Mesma Frente ({rec.frenteServico})
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLocalRetorno("ÁREA NOVA")}
                >
                  Área Nova
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLocalRetorno("ÁREA VELHA")}
                >
                  Área Velha
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLocalRetorno("ROTA AMT / BACIA EMA")}
                >
                  Rota AMT
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLocalRetorno("PÍER / OFFSHORE")}
                >
                  Píer / Offshore
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLocalRetorno("ASPERSÃO E UMECTAÇÃO DE VIAS")}
                >
                  Aspersão de Vias
                </button>
              </div>
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SERVIÇO EXECUTADO / OBSERVAÇÃO DE LIBERAÇÃO (OPCIONAL)
              </label>
              <input
                type="text"
                className="form-control"
                value={solucao}
                onChange={(e) => setSolucao(e.target.value)}
                placeholder="Ex: Substituída mangueira hidráulica / Pneu trocado na borracharia"
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 14,
            }}
          >
            <button type="button" className="btn btn-rose btn-xs" onClick={handleClearCorretivas}>
              🗑️ Excluir Parada (Restaurar 100% DF)
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-emerald">
                ✅ Confirmar Encerramento & Liberar Máquina
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuickAlmocoModal({ rec, closeModal, refreshAll, showToast }: any) {
  const [inicio, setInicio] = useState(rec.almoco?.inicio || "11:00");
  const [fim, setFim] = useState(rec.almoco?.fim || "12:00");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiUpdateRegistro(rec.id, {
      almoco: { inicio, fim, duracaoMin: 60, retornoRegistrado: true },
    });
    closeModal();
    showToast("Horário de almoço padronizado registrado com sucesso!");
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🍽️ Apontar Refeição / Almoço — {rec.placaPrincipal}</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 12.5, marginBottom: 14 }}>
          Operador: <strong>{rec.operador}</strong> (Preenchimento automático de 1h de intervalo)
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            ["10:40", "11:40"],
            ["11:00", "12:00"],
            ["11:30", "12:30"],
            ["12:00", "13:00"],
          ].map(([i, f]) => (
            <button
              key={i}
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => {
                setInicio(i);
                setFim(f);
              }}
            >
              {i} às {f}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SAÍDA PARA ALMOÇO *
              </label>
              <input
                type="time"
                className="form-control"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                RETORNO DO ALMOÇO *
              </label>
              <input
                type="time"
                className="form-control"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald">
              💾 Registrar Almoço
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuickDesvioModal({ rec, closeModal, refreshAll, showToast }: any) {
  const [destino, setDestino] = useState("");
  const [solicitante, setSolicitante] = useState("MARIA");
  const [horario, setHorario] = useState(getNowTimeStr());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dest = destino.trim().toUpperCase();
    const desvios = [
      ...(rec.desvios || []),
      {
        destino: dest,
        solicitante,
        horario,
        descricao: `DESVIO PARA ${dest}, SOLICITADO POR ${solicitante} ÀS ${horario}`,
      },
    ];
    await apiUpdateRegistro(rec.id, { desvios });
    closeModal();
    showToast(`Desvio para ${dest} registrado!`);
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚠️ Registrar Desvio de Frente / Local — {rec.placaPrincipal}</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                NOVO LOCAL / FRENTE DE DESTINO *
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: F04, PÍER 02, TRH15, D01..."
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>SOLICITADO POR *</label>
              <select
                className="form-control"
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value)}
                required
              >
                <option value="MARIA">MARIA</option>
                <option value="LAELCIO">LAELCIO</option>
                <option value="REGINALDO">REGINALDO</option>
                <option value="TAVORA">TAVORA</option>
                <option value="RENATA">RENATA</option>
                <option value="WARLEY">WARLEY</option>
                <option value="VANDERLEI">VANDERLEI</option>
                <option value="KOLHER / DARLAN">KOLHER / DARLAN</option>
                <option value="CCO / FISCALIZAÇÃO VALE">CCO / FISCALIZAÇÃO VALE</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                HORÁRIO DA MUDANÇA *
              </label>
              <input
                type="time"
                className="form-control"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald">
              💾 Salvar Desvio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewEntryModal({
  defaultDate,
  closeModal,
  setApontamentoData,
  filters,
  setFilters,
  refreshAll,
  showToast,
}: any) {
  const [data, setData] = useState(defaultDate || "2026-11-16");
  const [setor, setSetor] = useState("MFE");
  const [tipoEquipamento, setTipoEquipamento] = useState("Caminhão Pipa");
  const [equipamentoNome, setEquipamentoNome] = useState("");
  const [placaPrincipal, setPlacaPrincipal] = useState("");
  const [placaReserva, setPlacaReserva] = useState("");
  const [operador, setOperador] = useState("");
  const [frenteServico, setFrenteServico] = useState("Aspersão e Umectação de Vias");
  const [regimeHoras, setRegimeHoras] = useState("12");
  const [horario, setHorario] = useState("07:00");
  const [responsavel, setResponsavel] = useState("TAVORA / REGINALDO");
  const [ordemServico, setOrdemServico] = useState("");
  const [atividade, setAtividade] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await apiCreateRegistro({
      data,
      setor,
      tipoEquipamento,
      equipamentoNome: equipamentoNome.trim(),
      placaPrincipal: placaPrincipal.trim().toUpperCase(),
      placaReserva: placaReserva.trim().toUpperCase() || null,
      operador: operador.trim().toUpperCase(),
      frenteServico,
      regimeHoras: Number(regimeHoras),
      statusApresentacao: "AGUARDANDO",
      horarioProgramadoApresentacao: horario || "07:00",
      horarioApresentacao: horario || "07:00",
      responsavel: responsavel.trim().toUpperCase(),
      ordemServico: ordemServico.trim(),
      atividade: atividade.trim(),
    });
    closeModal();
    setApontamentoData(data);
    if (data > filters.dataFim) {
      setFilters((prev: any) => ({ ...prev, dataFim: data }));
    }
    showToast(
      `Equipamento ${created.placaPrincipal} escalado como Aguardando Apresentação em ${formatBrDate(data)}!`
    );
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>+ Escalar Novo Equipamento no Turno</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>DATA DO TURNO *</label>
              <input
                type="date"
                className="form-control"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>SETOR *</label>
              <select
                className="form-control"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                required
              >
                <option value="MFE">MFE / Porto</option>
                <option value="TPM">TPM / Carvão & Píer</option>
                <option value="EXTRA">Contingência / Extra</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                FAMÍLIA DE EQUIPAMENTO *
              </label>
              <select
                className="form-control"
                value={tipoEquipamento}
                onChange={(e) => setTipoEquipamento(e.target.value)}
                required
              >
                <option value="Caminhão Pipa">Caminhão Pipa</option>
                <option value="Mini Carregadeira">Mini Carregadeira</option>
                <option value="Retroescavadeira">Retroescavadeira</option>
                <option value="Caminhão Caçamba">Caminhão Caçamba</option>
                <option value="Mini Escavadeira">Mini Escavadeira</option>
                <option value="Caminhão Brook">Caminhão Brook</option>
                <option value="Escavadeira Hidráulica">Escavadeira Hidráulica</option>
                <option value="Pá Carregadeira">Pá Carregadeira</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                NOME / IDENTIFICAÇÃO DO EQUIPAMENTO *
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: Caminhão Pipa Busato 01 (Aspersão)"
                value={equipamentoNome}
                onChange={(e) => setEquipamentoNome(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                PLACA / TAG PRINCIPAL *
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: TOO0B01 ou MC436"
                value={placaPrincipal}
                onChange={(e) => setPlacaPrincipal(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                PLACA RESERVA (SE HOUVE TROCA)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Opcional (ex: MC501)"
                value={placaReserva}
                onChange={(e) => setPlacaReserva(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                MOTORISTA / OPERADOR *
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Nome completo do operador"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                FRENTE / LOCAL INICIAL *
              </label>
              <select
                className="form-control"
                value={frenteServico}
                onChange={(e) => setFrenteServico(e.target.value)}
              >
                <option value="Aspersão e Umectação de Vias">Aspersão e Umectação de Vias</option>
                <option value="Área Nova">Área Nova</option>
                <option value="Área Velha">Área Velha</option>
                <option value="Rota AMT / Bacia EMA">Rota AMT / Bacia EMA</option>
                <option value="Píer / Offshore">Píer / Offshore</option>
                <option value="Viradores de Vagões">Viradores de Vagões</option>
                <option value="Gestão de Pátios">Gestão de Pátios</option>
                <option value="Embarque">Embarque</option>
                <option value="TPM / Pátio de Carvão & Píer">TPM / Pátio de Carvão & Píer</option>
                <option value="Lavagem de Vias e Cabeceiras">Lavagem de Vias e Cabeceiras</option>
                <option value="Apoio à Manutenção">Apoio à Manutenção</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>REGIME CONTRATUAL</label>
              <select
                className="form-control"
                value={regimeHoras}
                onChange={(e) => setRegimeHoras(e.target.value)}
              >
                <option value="12">12 Horas</option>
                <option value="24">24 Horas</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                HORÁRIO PROGRAMADO DE APRESENTAÇÃO
              </label>
              <input
                type="time"
                className="form-control"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                RESPONSÁVEL / ENCARREGADO
              </label>
              <input
                type="text"
                className="form-control"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Nº ORDEM / OS</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: 5946"
                value={ordemServico}
                onChange={(e) => setOrdemServico(e.target.value)}
              />
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                DESCRIÇÃO DA ATIVIDADE PROGRAMADA *
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: Limpeza nos caminhos de rolamento e acionamento D01"
                value={atividade}
                onChange={(e) => setAtividade(e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald">
              💾 Salvar Equipamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloneDayModal({
  defaultDate,
  closeModal,
  setApontamentoData,
  filters,
  setFilters,
  refreshAll,
  showToast,
}: any) {
  const [dataOrigem, setDataOrigem] = useState(defaultDate || "2026-11-16");
  const nextDay = (() => {
    const d = new Date((defaultDate || "2026-11-16") + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [dataDestino, setDataDestino] = useState(nextDay);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClonarDia(dataOrigem, dataDestino);
      closeModal();
      setApontamentoData(dataDestino);
      if (dataDestino > filters.dataFim) {
        setFilters((prev: any) => ({ ...prev, dataFim: dataDestino }));
      }
      showToast(
        `Escala clonada! ${res.clonados} equipamentos aguardando confirmação de Apresentação na Frente em ${formatBrDate(dataDestino)}.`
      );
      await refreshAll();
    } catch (err: any) {
      showToast(err.message || "Erro ao clonar escala", "#f43f5e");
    }
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 Clonar Escala Completa para Novo Dia</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 14 }}>
            Copia automaticamente todos os equipamentos, placas, operadores e atividades de um dia
            base para uma nova data, colocando todos como{" "}
            <strong>"⏳ Aguardando Apresentação na Frente"</strong> para você confirmar o início de
            cada um no turno.
          </p>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                DATA DE ORIGEM (BASE)
              </label>
              <input
                type="date"
                className="form-control"
                value={dataOrigem}
                onChange={(e) => setDataOrigem(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                NOVA DATA DE DESTINO
              </label>
              <input
                type="date"
                className="form-control"
                value={dataDestino}
                onChange={(e) => setDataDestino(e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald">
              🚀 Clonar Escala Agora
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NovaCorretivaDiaModal({
  cdData,
  apontamentoRegistros,
  closeModal,
  loadCorretivasDia,
  refreshAll,
  showToast,
}: any) {
  const [equips, setEquips] = useState<RegistroOperacional[]>(apontamentoRegistros);
  const [idRegistro, setIdRegistro] = useState<number>(apontamentoRegistros[0]?.id || 0);
  const [localTipo, setLocalTipo] = useState<"BASE" | "AREA">("BASE");
  const [servico, setServico] = useState("");
  const [tipoManutencao, setTipoManutencao] = useState("");
  const [letra, setLetra] = useState("B");
  const [area, setArea] = useState("MINÉRIO");
  const [inicio, setInicio] = useState(getNowTimeStr());
  const [emAberto, setEmAberto] = useState(true);
  const [fim, setFim] = useState(getNowTimeStr());

  useEffect(() => {
    fetchRegistros({ dataExata: cdData, limit: "150" }).then((res) => {
      const list = res.registros || [];
      setEquips(list);
      if (list.length > 0) setIdRegistro(list[0].id);
    });
  }, [cdData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiLancarCorretivaDia({
        data: cdData,
        idRegistro: Number(idRegistro),
        localTipo,
        servico: servico.trim(),
        tipoManutencao: tipoManutencao.trim(),
        letra,
        area,
        inicio,
        fim,
        emAberto,
      });
      closeModal();
      showToast("Corretiva registrada com sucesso! Aderência do dia recalculada.");
      await loadCorretivasDia(cdData);
      await refreshAll();
    } catch {
      showToast("Erro ao registrar corretiva", "#f43f5e");
    }
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ color: "#e11d48" }}>🛑 Registrar Nova Corretiva no Dia</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SELECIONE O EQUIPAMENTO / PLACA *
              </label>
              <select
                className="form-control"
                style={{ fontWeight: 700 }}
                value={idRegistro}
                onChange={(e) => setIdRegistro(Number(e.target.value))}
                required
              >
                {equips.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.placaPrincipal} — {e.tipoEquipamento} ({e.operador})
                  </option>
                ))}
              </select>
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "#d97706", fontWeight: 800 }}>
                📍 ONDE É A CORRETIVA? (LOCAL DA MANUTENÇÃO) *
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                <button
                  type="button"
                  className={localTipo === "BASE" ? "btn btn-amber" : "btn btn-outline"}
                  style={{
                    fontWeight: 800,
                    padding: 12,
                    borderWidth: 2,
                    borderColor: localTipo === "BASE" ? "#f97316" : "var(--border-color)",
                  }}
                  onClick={() => setLocalTipo("BASE")}
                >
                  🏢 NA BASE (OFICINA / GARAGEM)
                </button>
                <button
                  type="button"
                  className={localTipo === "AREA" ? "btn btn-primary" : "btn btn-outline"}
                  style={{
                    fontWeight: 800,
                    padding: 12,
                    borderWidth: 2,
                    borderColor: localTipo === "AREA" ? "#38bdf8" : "var(--border-color)",
                  }}
                  onClick={() => setLocalTipo("AREA")}
                >
                  🚜 NA ÁREA (CAMPO / FRENTE)
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SERVIÇO / DEFEITO *
              </label>
              <input
                type="text"
                className="form-control"
                style={{ textTransform: "uppercase" }}
                placeholder="Ex: AR CONDICIONADO, PNEU, MOLA..."
                value={servico}
                onChange={(e) => setServico(e.target.value)}
                required
              />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                {[
                  ["AR CONDICIONADO", "AR CONDICIONADO", "Ar Condicionado"],
                  ["PNEU", "PNEU", "Pneu"],
                  ["MOLA", "MOLA", "Mola"],
                  ["RETENTOR DE RODA", "ESTRUTURA", "Retentor"],
                  ["DESLOCAMENTO", "DESLOCAMENTO", "Deslocamento"],
                ].map(([srv, tp, lbl]) => (
                  <button
                    key={lbl}
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => {
                      setServico(srv);
                      setTipoManutencao(tp);
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                TIPO DE MANUTENÇÃO *
              </label>
              <input
                type="text"
                className="form-control"
                style={{ textTransform: "uppercase" }}
                placeholder="Ex: AR CONDICIONADO, ESTRUTURA..."
                value={tipoManutencao}
                onChange={(e) => setTipoManutencao(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>LETRA / TURNO</label>
                <select
                  className="form-control"
                  value={letra}
                  onChange={(e) => setLetra(e.target.value)}
                >
                  <option value="B">Letra B</option>
                  <option value="A">Letra A</option>
                  <option value="C">Letra C</option>
                  <option value="D">Letra D</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  ÁREA OPERACIONAL
                </label>
                <select className="form-control" value={area} onChange={(e) => setArea(e.target.value)}>
                  <option value="MINÉRIO">MINÉRIO</option>
                  <option value="TPM">TPM</option>
                  <option value="PELOTIZAÇÃO">PELOTIZAÇÃO</option>
                  <option value="PORTO">PORTO</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#e11d48", fontWeight: 700 }}>
                HORA DE INÍCIO *
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="time"
                  className="form-control"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setInicio(getNowTimeStr())}
                >
                  Agora
                </button>
              </div>
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SITUAÇÃO DA MÁQUINA *
              </label>
              <select
                className="form-control"
                style={{ fontWeight: 700 }}
                value={String(emAberto)}
                onChange={(e) => setEmAberto(e.target.value === "true")}
              >
                <option value="true">🔴 Em Manutenção Agora (Deixar EM ABERTO até liberar)</option>
                <option value="false">
                  ✅ Já Concluída e Liberada (Informar hora de liberação agora)
                </option>
              </select>
            </div>
            {!emAberto && (
              <div className="full-width">
                <label style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                  HORA DE LIBERAÇÃO
                </label>
                <input
                  type="time"
                  className="form-control"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-rose" style={{ fontWeight: 700 }}>
              💾 Registrar Corretiva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LiberarCorretivaDiaModal({
  info,
  closeModal,
  loadCorretivasDia,
  refreshAll,
  showToast,
}: any) {
  const [liberacaoHora, setLiberacaoHora] = useState(getNowTimeStr());
  const [solucao, setSolucao] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiLiberarCorretivaDia({
      idRegistro: info.idRegistro,
      paradaId: info.paradaId,
      liberacaoHora,
      solucao: solucao.trim(),
    });
    closeModal();
    showToast(
      `✅ Máquina liberada com sucesso às ${liberacaoHora}! Horas perdidas e aderência atualizadas.`
    );
    await loadCorretivasDia();
    await refreshAll();
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ color: "#16a34a" }}>✅ Liberar Máquina e Encerrar Corretiva</h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div
            style={{
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: "#16a34a" }}>
              Placa: {info.placa} — {info.equip}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
              Defeito: <strong>{info.servico}</strong> • Parado desde: <strong>{info.inicio}</strong>
            </div>
          </div>
          <div className="form-grid">
            <div className="full-width">
              <label style={{ fontSize: 11, color: "#16a34a", fontWeight: 800 }}>
                HORA DA LIBERAÇÃO *
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="time"
                  className="form-control"
                  style={{ fontWeight: 800, fontSize: 14, borderColor: "#10b981" }}
                  value={liberacaoHora}
                  onChange={(e) => setLiberacaoHora(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setLiberacaoHora(getNowTimeStr())}
                >
                  Agora
                </button>
              </div>
            </div>
            <div className="full-width">
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                SOLUÇÃO / SERVIÇO REALIZADO
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: Substituída mangueira / Pneu trocado / Liberado p/ operação"
                value={solucao}
                onChange={(e) => setSolucao(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald" style={{ fontWeight: 800 }}>
              ✅ Confirmar Liberação & Calcular Horas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CadastroModal({
  info,
  closeModal,
  loadCadastros,
  setMetaOptions,
  showToast,
}: any) {
  const { entidade, id, item } = info;
  const isEdit = Boolean(id);

  const [nome, setNome] = useState(item.nome || "");
  const [funcao, setFuncao] = useState(item.funcao || "Operador / Motorista");
  const [turnoHabitual, setTurnoHabitual] = useState(item.turnoHabitual || "B");
  const [matricula, setMatricula] = useState(item.matricula || "");
  const [status, setStatus] = useState(item.status || "ATIVO");

  const [placa, setPlaca] = useState(item.placa || "");
  const [tipoEquipamento, setTipoEquipamento] = useState(item.tipoEquipamento || "Caminhão Pipa");
  const [equipamentoNome, setEquipamentoNome] = useState(item.equipamentoNome || "");
  const [setor, setSetor] = useState(item.setor || "MFE");
  const [regimeHoras, setRegimeHoras] = useState(String(item.regimeHoras || 10.5));

  const [tipoLocal, setTipoLocal] = useState(item.tipo || "AREA");
  const [descricao, setDescricao] = useState(item.descricao || "");

  const [categoria, setCategoria] = useState(item.categoria || "Mecânica Geral");
  const [criticidade, setCriticidade] = useState(item.criticidade || "MÉDIA");

  const [motivo, setMotivo] = useState(item.motivo || "");
  const [requerAprovacao, setRequerAprovacao] = useState(Boolean(item.requerAprovacao));

  const labels: Record<string, string> = {
    operadores: "Operador / Motorista",
    equipamentos: "Equipamento / Máquina",
    locais: "Frente de Serviço / Local",
    servicos: "Tipo de Manutenção / Serviço",
    justificativas: "Motivo de Atraso / Justificativa",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: any = {};
    if (entidade === "operadores") {
      payload = {
        nome: nome.trim().toUpperCase(),
        funcao: funcao.trim(),
        turnoHabitual,
        matricula: matricula.trim(),
        status,
      };
    } else if (entidade === "equipamentos") {
      payload = {
        placa: placa.trim().toUpperCase(),
        tipoEquipamento,
        equipamentoNome: equipamentoNome.trim(),
        setor,
        regimeHoras: Number(regimeHoras) || 10.5,
        status: status || "ATIVO",
      };
    } else if (entidade === "locais") {
      payload = {
        nome: nome.trim().toUpperCase(),
        tipo: tipoLocal,
        setor: setor.trim().toUpperCase(),
        descricao: descricao.trim(),
        status: status || "ATIVO",
      };
    } else if (entidade === "servicos") {
      payload = {
        nome: nome.trim().toUpperCase(),
        categoria: categoria.trim(),
        criticidade,
        status: status || "ATIVO",
      };
    } else if (entidade === "justificativas") {
      payload = {
        motivo: motivo.trim(),
        categoria: categoria.trim(),
        requerAprovacao,
        status: status || "ATIVO",
      };
    }

    await apiSaveCadastroItem(entidade, payload, id);
    closeModal();
    showToast(`✅ ${isEdit ? "Atualizado" : "Cadastrado"} com sucesso!`);
    await loadCadastros();
    const meta = await fetchMeta();
    setMetaOptions(meta);
  };

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {isEdit
              ? `✏️ Editar ${labels[entidade] || "Cadastro"}`
              : `+ Novo ${labels[entidade] || "Cadastro"}`}
          </h3>
          <button className="btn btn-outline btn-xs" onClick={closeModal}>
            ✕ Fechar
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {entidade === "operadores" && (
              <>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    NOME COMPLETO DO OPERADOR / MOTORISTA *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: CARLOS ALBERTO SILVA"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>FUNÇÃO / ESPECIALIDADE</label>
                  <input
                    type="text"
                    className="form-control"
                    value={funcao}
                    onChange={(e) => setFuncao(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>TURNO HABITUAL (LETRA)</label>
                  <select
                    className="form-control"
                    value={turnoHabitual}
                    onChange={(e) => setTurnoHabitual(e.target.value)}
                  >
                    <option value="A">Turno A</option>
                    <option value="B">Turno B</option>
                    <option value="C">Turno C</option>
                    <option value="D">Turno D</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>MATRÍCULA / REGISTRO</label>
                  <input
                    type="text"
                    className="form-control"
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    placeholder="Ex: MAT-1240"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>STATUS</label>
                  <select
                    className="form-control"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="ATIVO">🟢 Ativo</option>
                    <option value="INATIVO">🔴 Inativo</option>
                  </select>
                </div>
              </>
            )}

            {entidade === "equipamentos" && (
              <>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>PLACA / TAG *</label>
                  <input
                    type="text"
                    className="form-control"
                    style={{ textTransform: "uppercase" }}
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value)}
                    placeholder="Ex: TOM6D10 ou MC436"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>FAMÍLIA DE EQUIPAMENTO *</label>
                  <select
                    className="form-control"
                    value={tipoEquipamento}
                    onChange={(e) => setTipoEquipamento(e.target.value)}
                    required
                  >
                    <option value="Caminhão Pipa">Caminhão Pipa</option>
                    <option value="Mini Carregadeira">Mini Carregadeira</option>
                    <option value="Retroescavadeira">Retroescavadeira</option>
                    <option value="Caminhão Caçamba">Caminhão Caçamba</option>
                    <option value="Pá Carregadeira">Pá Carregadeira</option>
                    <option value="Mini Escavadeira">Mini Escavadeira</option>
                    <option value="Caminhão Brook">Caminhão Brook</option>
                    <option value="Trator de Pneu">Trator de Pneu</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    NOME / MODELO DO EQUIPAMENTO *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={equipamentoNome}
                    onChange={(e) => setEquipamentoNome(e.target.value)}
                    placeholder="Ex: Caminhão Pipa Busato 03 (Aspersão)"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>SETOR / CONTRATO</label>
                  <select
                    className="form-control"
                    value={setor}
                    onChange={(e) => setSetor(e.target.value)}
                  >
                    <option value="MFE">MFE / Porto</option>
                    <option value="TPM">TPM / Carvão</option>
                    <option value="TI">TI / Píer</option>
                    <option value="EXTRA">Extra / Contingência</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    REGIME DE HORAS (PADRÃO 10.5h)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    className="form-control"
                    value={regimeHoras}
                    onChange={(e) => setRegimeHoras(e.target.value)}
                  />
                </div>
              </>
            )}

            {entidade === "locais" && (
              <>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    NOME DA FRENTE / LOCAL OPERACIONAL *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    style={{ textTransform: "uppercase" }}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: MINÉRIO, TPM, SILO, OFICINA BUSATO..."
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>TIPO DE LOCAL *</label>
                  <select
                    className="form-control"
                    value={tipoLocal}
                    onChange={(e) => setTipoLocal(e.target.value)}
                    required
                  >
                    <option value="AREA">🚜 Frente Operacional / Área (Campo)</option>
                    <option value="BASE">🏢 Base / Oficina Mecânica</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>SETOR</label>
                  <input
                    type="text"
                    className="form-control"
                    value={setor}
                    onChange={(e) => setSetor(e.target.value)}
                  />
                </div>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>DESCRIÇÃO / DETALHES</label>
                  <input
                    type="text"
                    className="form-control"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex: Frente de carregamento contínuo de minério"
                  />
                </div>
              </>
            )}

            {entidade === "servicos" && (
              <>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    NOME DO SERVIÇO / DEFEITO *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    style={{ textTransform: "uppercase" }}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: AR CONDICIONADO, MOLA, PNEU, FREIO..."
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>CATEGORIA / SUBSISTEMA</label>
                  <input
                    type="text"
                    className="form-control"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>CRITICIDADE</label>
                  <select
                    className="form-control"
                    value={criticidade}
                    onChange={(e) => setCriticidade(e.target.value)}
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MÉDIA">Média</option>
                    <option value="ALTA">Alta (Parada Imediata)</option>
                  </select>
                </div>
              </>
            )}

            {entidade === "justificativas" && (
              <>
                <div className="full-width">
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    MOTIVO DE ATRASO / JUSTIFICATIVA *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex: DDS Prolongado, Falha Transporte..."
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>CATEGORIA OPERACIONAL</label>
                  <input
                    type="text"
                    className="form-control"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>REQUER APROVAÇÃO</label>
                  <select
                    className="form-control"
                    value={String(requerAprovacao)}
                    onChange={(e) => setRequerAprovacao(e.target.value === "true")}
                  >
                    <option value="false">Não (Lançamento Direto)</option>
                    <option value="true">Sim (Aprovação Obrigatória)</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-emerald" style={{ fontWeight: 800 }}>
              💾 Salvar Cadastro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
