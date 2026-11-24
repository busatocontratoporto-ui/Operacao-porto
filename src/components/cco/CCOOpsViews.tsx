import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBusato, formatBrDate, formatNumber } from "@/contexts/BusatoContext";
import type { RegistroOperacional, CadastrosData } from "@/lib/busato-service";

export function DfBadge({ df }: { df: number }) {
  const val = Number(df || 0);
  if (val >= 95) return <span className="badge badge-success">{formatNumber(val, 1)}%</span>;
  if (val >= 88) return <span className="badge badge-warning">{formatNumber(val, 1)}%</span>;
  return <span className="badge badge-danger">{formatNumber(val, 1)}%</span>;
}

// ─── Global Filter Bar & Live Open Stops Banner ───────────────────────────────

export function CCOOperationalHeader({
  hideGlobalFilters = false,
  hideOpenStopsBanner = false,
}: {
  hideGlobalFilters?: boolean;
  hideOpenStopsBanner?: boolean;
}) {
  const navigate = useNavigate();
  const {
    metaOptions,
    filters,
    setFilters,
    analytics,
    filtrarUltimoDia,
    resetFilters,
    exportCsv,
    openGlobalStartStopModal,
    openNewEntryModal,
    openCloseStopModal,
    openFichaAtendimento,
  } = useBusato();

  const kpis = analytics?.kpis;
  const paradasAbertas = analytics?.paradasEmAberto || [];

  const headerRangeText = kpis
    ? `Período: ${formatBrDate(filters.dataInicio)} a ${formatBrDate(
        filters.dataFim
      )} • ${kpis.totalTurnos.toLocaleString("pt-BR")} Turnos • DF Global: ${formatNumber(
        kpis.disponibilidadeFisica,
        2
      )}% • ${kpis.paradasEmAbertoCount} Parada(s) em Aberto`
    : "Carregando base operacional em tempo real...";

  return (
    <div className="space-y-3 mb-4">
      {/* Operational Action Bar */}
      <div className="bg-card border border-border rounded-xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground truncate">
            {headerRangeText}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="btn btn-rose"
            style={{ fontWeight: 700 }}
            onClick={openGlobalStartStopModal}
          >
            🛑 Iniciar Parada / Corretiva
          </button>
          <button className="btn btn-emerald" onClick={openNewEntryModal}>
            + Escalar Equipamento
          </button>
          <button className="btn btn-outline" onClick={() => exportCsv("medicao_frota")}>
            📥 Exportar CSV
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      {!hideGlobalFilters && (
        <section className="filter-bar">
          <div className="filter-group" style={{ maxWidth: 145 }}>
            <label>Data Início</label>
            <input
              type="date"
              className="form-control"
              value={filters.dataInicio}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dataInicio: e.target.value }))
              }
            />
          </div>
          <div className="filter-group" style={{ maxWidth: 145 }}>
            <label>Data Fim</label>
            <input
              type="date"
              className="form-control"
              value={filters.dataFim}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dataFim: e.target.value }))
              }
            />
          </div>
          <div className="filter-group" style={{ maxWidth: 150 }}>
            <label>Setor / Contrato</label>
            <select
              className="form-control"
              value={filters.setor}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, setor: e.target.value }))
              }
            >
              <option value="TODOS">Todos (MFE + TPM + Extra)</option>
              <option value="MFE">MFE / Porto</option>
              <option value="TPM">TPM / Carvão & Píer</option>
              <option value="EXTRA">Contingência / Extra</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Família de Equipamento</label>
            <select
              className="form-control"
              value={filters.tipoEquipamento}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, tipoEquipamento: e.target.value }))
              }
            >
              <option value="TODOS">Todos os Equipamentos</option>
              {(metaOptions?.tipos || []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group" style={{ maxWidth: 145 }}>
            <label>Placa / TAG</label>
            <select
              className="form-control"
              value={filters.placa}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, placa: e.target.value }))
              }
            >
              <option value="TODOS">Todas as Placas</option>
              {(metaOptions?.placas || []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Frente / Local</label>
            <select
              className="form-control"
              value={filters.frenteServico}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, frenteServico: e.target.value }))
              }
            >
              <option value="TODOS">Todas as Frentes</option>
              {(metaOptions?.frentes || []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Busca Rápida (Placa, Operador, Local)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex: MC436, Pneu, Oficina..."
              value={filters.busca}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, busca: e.target.value }))
              }
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn-outline"
              onClick={filtrarUltimoDia}
              title="Focar apenas no último dia operacional"
            >
              📅 Dia Atual
            </button>
            <button
              className="btn btn-outline"
              onClick={resetFilters}
              title="Mostrar todos os registros e limpar filtro de placa"
            >
              🔄 Mostrar Tudo
            </button>
          </div>
        </section>
      )}

      {/* Live Open Stops Banner */}
      {!hideOpenStopsBanner && (
        <div>
          {paradasAbertas.length === 0 ? (
            <div
              className="panel-card"
              style={{
                padding: "11px 16px",
                borderColor: "rgba(16,185,129,0.4)",
                background: "rgba(16,185,129,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 17 }}>🟢</span>
                <div>
                  <strong style={{ color: "#16a34a" }}>
                    Nenhum equipamento com parada em aberto no filtro atual!
                  </strong>
                  <span
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: 12,
                      marginLeft: 8,
                    }}
                  >
                    Quando um equipamento parar no turno, clique em{" "}
                    <strong>"🛑 Iniciar Parada / Corretiva"</strong> para acompanhar aqui em
                    tempo real.
                  </span>
                </div>
              </div>
              <button
                className="btn btn-rose btn-xs"
                onClick={openGlobalStartStopModal}
              >
                🛑 Iniciar Parada Agora
              </button>
            </div>
          ) : (
            <div className="open-stops-panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pulse-dot" />
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#e11d48" }}>
                    ACOMPANHAMENTO EM TEMPO REAL — {paradasAbertas.length} EQUIPAMENTO(S) EM
                    PARADA / CORRETIVA EM ABERTO
                  </h3>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-rose btn-xs"
                    onClick={openGlobalStartStopModal}
                  >
                    🛑 + Iniciar Nova Parada
                  </button>
                  <button
                    className="btn btn-outline btn-xs"
                    onClick={() => navigate("/cco/operacao")}
                  >
                    ⏱️ Ir para Mesa de Operação Diária
                  </button>
                </div>
              </div>
              <div className="open-stops-grid">
                {paradasAbertas.slice(0, 12).map((p: any, idx: number) => (
                  <div key={`${p.idRegistro}-${idx}`} className="live-stop-card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="pulse-dot" />
                        <span
                          className="badge-plate"
                          style={{ cursor: "pointer" }}
                          onClick={() => openFichaAtendimento(p.idRegistro)}
                        >
                          {p.placa}
                        </span>
                        <strong style={{ fontSize: 12.5 }}>{p.tipoEquipamento}</strong>
                      </div>
                      <span className="badge badge-danger">
                        DESDE {p.inicio} ({formatBrDate(p.data)})
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                      <div>
                        📍 <strong>Local da Parada:</strong>{" "}
                        <span style={{ color: "#d97706", fontWeight: 700 }}>
                          {p.localParada}
                        </span>
                      </div>
                      <div>
                        🔧 <strong>Motivo:</strong> <span>{p.motivo}</span>
                      </div>
                      <div>
                        👷 <strong>Operador:</strong> {p.operador}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        className="btn btn-emerald btn-xs"
                        style={{ flex: 1 }}
                        onClick={() => openCloseStopModal(p.idRegistro, p.paradaId || 0)}
                      >
                        ✅ Encerrar Parada / Liberar
                      </button>
                      <button
                        className="btn btn-outline btn-xs"
                        onClick={() => openFichaAtendimento(p.idRegistro)}
                      >
                        📝 Ficha Completa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 1. Painel Analítico & Paradas (/cco) ─────────────────────────────────────

export function CCODashboardView() {
  const navigate = useNavigate();
  const {
    analytics,
    setApontamentoData,
    filterByPlate,
    openStartStopModal,
    openCloseStopModal,
    openFichaAtendimento,
  } = useBusato();

  const k = analytics?.kpis || {
    totalTurnos: 0,
    horasProgramadas: 0,
    horasDisponiveis: 0,
    horasCorretiva: 0,
    disponibilidadeFisica: 100,
    totalFalhas: 0,
    paradasEmAbertoCount: 0,
    mttrHoras: 0,
    mtbfHoras: 0,
    taxaPontualidade: 100,
    turnosAtrasados: 0,
    turnosNaoApresentou: 0,
    totalDesvios: 0,
    totalTrocasReserva: 0,
    totalAlmocos: 0,
  };

  const dfColor =
    k.disponibilidadeFisica >= 95
      ? "#10b981"
      : k.disponibilidadeFisica >= 90
        ? "#f59e0b"
        : "#f43f5e";

  const evolucaoDiaria = analytics?.evolucaoDiaria || [];
  const porPlaca = analytics?.porPlaca || [];
  const porTipoEquipamento = analytics?.porTipoEquipamento || [];
  const porMotivoCorretiva = analytics?.porMotivoCorretiva || [];
  const porSolicitanteDesvio = analytics?.porSolicitanteDesvio || [];
  const porFrente = analytics?.porFrente || [];

  const topPlacas = porPlaca.filter((p: any) => p.horasCorretiva > 0).slice(0, 8);
  const maxPlacaH = Math.max(1, topPlacas[0]?.horasCorretiva || 1);
  const maxMotivoH = Math.max(1, porMotivoCorretiva[0]?.horas || 1);
  const maxDesvioQ = Math.max(1, porSolicitanteDesvio[0]?.qtd || 1);

  return (
    <div>
      <CCOOperationalHeader />

      {/* 6 KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card emerald">
          <div className="kpi-label">Disponibilidade Física (DF%)</div>
          <div className="kpi-value" style={{ color: dfColor }}>
            {formatNumber(k.disponibilidadeFisica, 2)}%
          </div>
          <div className="kpi-sub">
            <span>Meta Contratual: 95,0%</span>
            <span>{formatNumber(k.horasDisponiveis, 0)}h disponíveis</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, k.disponibilidadeFisica)}%`,
                background: dfColor,
              }}
            />
          </div>
        </div>

        <div className="kpi-card rose">
          <div className="kpi-label">Horas de Manutenção Corretiva</div>
          <div className="kpi-value" style={{ color: "#e11d48" }}>
            {formatNumber(k.horasCorretiva, 1)}h
          </div>
          <div className="kpi-sub">
            <span>
              {k.totalFalhas} paradas ({k.paradasEmAbertoCount} em aberto)
            </span>
            <span>de {formatNumber(k.horasProgramadas, 0)}h prog.</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-label">MTTR (Tempo Médio de Reparo)</div>
          <div className="kpi-value">{formatNumber(k.mttrHoras, 2)}h</div>
          <div className="kpi-sub">
            <span>Média de {Math.round(k.mttrHoras * 60)} min / corretiva</span>
            <span>Meta: &lt; 2,0h</span>
          </div>
        </div>

        <div className="kpi-card cyan">
          <div className="kpi-label">MTBF (Tempo Médio Entre Falhas)</div>
          <div className="kpi-value">{formatNumber(k.mtbfHoras, 1)}h</div>
          <div className="kpi-sub">
            <span>Confiabilidade operacional</span>
            <span>{k.totalTurnos} turnos medidos</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-label">Desvios de Programação</div>
          <div className="kpi-value">{k.totalDesvios}</div>
          <div className="kpi-sub">
            <span>Mudanças de rota/frente</span>
            <span>{k.totalTrocasReserva} trocas p/ reserva</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Apresentação na Frente & Almoço</div>
          <div className="kpi-value">{formatNumber(k.taxaPontualidade, 1)}%</div>
          <div className="kpi-sub">
            <span>
              ⏰ {k.turnosAtrasados || 0} atrasos | 🚫 {k.turnosNaoApresentou || 0} faltas
            </span>
            <span>🍽️ {k.totalAlmocos} almoços</span>
          </div>
        </div>
      </div>

      {/* Evolução Diária & Top 10 Pareto */}
      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                📈 Evolução Diária: Disponibilidade Física (DF%) & Horas de Corretiva
              </div>
              <div className="panel-subtitle">
                Linha Verde: DF% Diária (Meta Contratual 95%) | Barras Vermelhas: Horas Perdidas em
                Manutenção Corretiva
              </div>
            </div>
          </div>
          <div style={{ width: "100%", height: 295 }}>
            <EvolucaoDiariaChart
              series={evolucaoDiaria}
              onSelectDate={(dataIso) => {
                setApontamentoData(dataIso);
                navigate("/cco/operacao");
              }}
            />
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                🚨 Top 10 Equipamentos Críticos (Pareto de Horas em Corretiva)
              </div>
              <div className="panel-subtitle">
                Gerencie, inicie ou encerre a parada e o local diretamente nos botões de cada placa
                abaixo
              </div>
            </div>
          </div>
          <div className="bar-list">
            {topPlacas.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", padding: 20 }}>
                Nenhuma corretiva registrada para os filtros atuais.
              </p>
            ) : (
              topPlacas.map((p: any) => {
                const pct = Math.min(100, (p.horasCorretiva / maxPlacaH) * 100);
                const idAlvo = p.ultimoIdComParada || p.ultimoIdRegistro;
                return (
                  <div key={p.placa} className="bar-item">
                    <div className="bar-item-top">
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          className="badge-plate"
                          style={{ cursor: "pointer" }}
                          onClick={() => openFichaAtendimento(idAlvo)}
                        >
                          {p.placa}
                        </span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                          {p.tipoEquipamento}
                        </span>
                        {p.paradasAbertas > 0 ? (
                          <span className="badge badge-danger" style={{ fontSize: 10.5 }}>
                            <span className="pulse-dot" style={{ marginRight: 4 }} /> PARADA EM
                            ABERTO
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: 10.5 }}>
                            ✅ Parada Encerrada
                          </span>
                        )}
                      </div>
                      <span style={{ color: "#e11d48", fontWeight: 700 }}>
                        {formatNumber(p.horasCorretiva, 1)}h corretiva ({p.falhas}x) • DF:{" "}
                        {formatNumber(p.dfPct, 1)}%
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: "linear-gradient(90deg, #f43f5e, #fb923c)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 3,
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        📍 <strong>Local:</strong>{" "}
                        <span style={{ color: "#d97706", fontWeight: 700 }}>
                          {p.ultimoLocalParada || "Frente Operacional"}
                        </span>
                        {p.ultimoMotivoParada ? ` • 🔧 ${p.ultimoMotivoParada}` : ""}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {p.paradasAbertas > 0 ? (
                          <>
                            <button
                              className="btn btn-emerald btn-xs"
                              onClick={() => openCloseStopModal(idAlvo)}
                            >
                              ✅ Encerrar Parada / Local
                            </button>
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => openFichaAtendimento(idAlvo)}
                            >
                              📝 Ficha Completa
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-rose btn-xs"
                              onClick={() => openStartStopModal(p.ultimoIdRegistro)}
                            >
                              🛑 Iniciar Parada
                            </button>
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => openFichaAtendimento(idAlvo)}
                            >
                              📝 Ficha / Editar
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => filterByPlate(p.placa)}
                        >
                          🔍 Filtrar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Equipment Family & Maintenance Causes */}
      <div className="grid-equal">
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                🚜 Medição e Disponibilidade Física por Família de Equipamento
              </div>
              <div className="panel-subtitle">
                Comparativo de Horas Contratadas vs. Horas de Corretiva, DF%, MTTR e MTBF
              </div>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Família de Equipamento</th>
                  <th>Turnos</th>
                  <th>H. Prog.</th>
                  <th>H. Corretiva</th>
                  <th>H. Efetivas</th>
                  <th>DF (%)</th>
                  <th>Falhas</th>
                  <th>MTTR (h)</th>
                  <th>MTBF (h)</th>
                </tr>
              </thead>
              <tbody>
                {porTipoEquipamento.map((t: any) => (
                  <tr key={t.tipo}>
                    <td style={{ fontWeight: 700 }}>{t.tipo}</td>
                    <td>{t.turnos}</td>
                    <td>{formatNumber(t.horasProgramadas, 0)}h</td>
                    <td
                      style={{
                        color: t.horasCorretiva > 0 ? "#e11d48" : "var(--text-secondary)",
                        fontWeight: 700,
                      }}
                    >
                      {formatNumber(t.horasCorretiva, 1)}h
                    </td>
                    <td>{formatNumber(t.horasDisponiveis, 1)}h</td>
                    <td>
                      <DfBadge df={t.dfPct} />
                    </td>
                    <td>{t.falhas}</td>
                    <td>{formatNumber(t.mttr, 2)}h</td>
                    <td>{formatNumber(t.mtbf, 1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                🔧 Causas de Manutenção Corretiva & Desvios de Programação
              </div>
              <div className="panel-subtitle">
                Distribuição por Subsistema de Falha e Solicitantes de Desvio Operacional
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <h4
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Horas por Subsistema / Motivo
              </h4>
              <div className="bar-list">
                {porMotivoCorretiva.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                    Sem corretivas no período.
                  </p>
                ) : (
                  porMotivoCorretiva.slice(0, 7).map((m: any) => (
                    <div key={m.motivo} className="bar-item">
                      <div className="bar-item-top">
                        <span>{m.motivo}</span>
                        <span style={{ color: "#d97706" }}>
                          {formatNumber(m.horas, 1)}h ({m.ocorrencias}x)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${(m.horas / maxMotivoH) * 100}%`,
                            background: "#f59e0b",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h4
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Desvios por Solicitante / Frente
              </h4>
              <div className="bar-list">
                {porSolicitanteDesvio.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                    Sem desvios registrados.
                  </p>
                ) : (
                  porSolicitanteDesvio.slice(0, 7).map((d: any) => (
                    <div key={d.solicitante} className="bar-item">
                      <div className="bar-item-top">
                        <span>{d.solicitante}</span>
                        <span style={{ color: "#7c3aed" }}>{d.qtd} desvios</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${(d.qtd / maxDesvioQ) * 100}%`,
                            background: "#8b5cf6",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Service Fronts Summary */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              📍 Desempenho Operacional por Frente de Serviço e Área do Porto
            </div>
            <div className="panel-subtitle">
              Análise de alocação de recursos, paradas corretivas e desvios de rota por área
              operacional
            </div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Frente de Serviço / Área</th>
                <th>Turnos Alocados</th>
                <th>Horas Programadas</th>
                <th>Horas Corretiva</th>
                <th>Horas Disponíveis</th>
                <th>Disponibilidade Física (DF%)</th>
                <th>Ocorrências Corretiva</th>
                <th>Desvios Registrados</th>
              </tr>
            </thead>
            <tbody>
              {porFrente.map((f: any) => (
                <tr key={f.frente}>
                  <td style={{ fontWeight: 700 }}>{f.frente}</td>
                  <td>{f.turnos}</td>
                  <td>{formatNumber(f.horasProgramadas, 0)}h</td>
                  <td
                    style={{
                      color: f.horasCorretiva > 0 ? "#e11d48" : "var(--text-secondary)",
                      fontWeight: 700,
                    }}
                  >
                    {formatNumber(f.horasCorretiva, 1)}h
                  </td>
                  <td>{formatNumber(f.horasDisponiveis, 1)}h</td>
                  <td>
                    <DfBadge df={f.dfPct} />
                  </td>
                  <td>{f.falhas}</td>
                  <td>
                    {f.desvios > 0 ? (
                      <span className="badge badge-warning">{f.desvios} desvios</span>
                    ) : (
                      "0"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EvolucaoDiariaChart({
  series,
  onSelectDate,
}: {
  series: any[];
  onSelectDate: (d: string) => void;
}) {
  if (!series || series.length === 0) {
    return (
      <p style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>
        Sem dados no período selecionado.
      </p>
    );
  }

  const w = 860;
  const h = 285;
  const padL = 44;
  const padR = 44;
  const padT = 22;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxCorr = Math.max(15, ...series.map((d) => d.horasCorretiva));
  const minDf = Math.min(75, ...series.map((d) => d.dfPct));

  const n = series.length;
  const stepX = plotW / Math.max(1, n - 1);
  const barW = Math.max(3, Math.min(18, (plotW / n) * 0.62));
  const stride = Math.max(1, Math.ceil(n / 10));
  const metaY = padT + plotH - ((95 - minDf) / (100 - minDf)) * plotH;

  const points = series
    .map((d, i) => {
      const x = padL + (n === 1 ? plotW / 2 : i * stepX);
      const clampedDf = Math.max(minDf, Math.min(100, d.dfPct));
      const py = padT + plotH - ((clampedDf - minDf) / (100 - minDf)) * plotH;
      return `${x.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <line x1={padL} y1={padT} x2={w - padR} y2={padT} stroke="var(--border-subtle)" />
      <line
        x1={padL}
        y1={metaY.toFixed(1)}
        x2={w - padR}
        y2={metaY.toFixed(1)}
        stroke="#f59e0b"
        strokeDasharray="4 4"
        strokeWidth="1.2"
      />
      <text x={w - padR - 4} y={(metaY - 5).toFixed(1)} fill="#d97706" fontSize="10" textAnchor="end">
        Meta DF 95%
      </text>
      <line
        x1={padL}
        y1={padT + plotH}
        x2={w - padR}
        y2={padT + plotH}
        stroke="var(--border-color)"
      />

      <text x={padL - 6} y={padT + 4} fill="#16a34a" fontSize="10" textAnchor="end">
        100%
      </text>
      <text x={padL - 6} y={metaY + 3} fill="#d97706" fontSize="10" textAnchor="end">
        95%
      </text>
      <text x={padL - 6} y={padT + plotH} fill="#64748b" fontSize="10" textAnchor="end">
        {Math.round(minDf)}%
      </text>

      <text x={w - padR + 6} y={padT + plotH * 0.35} fill="#e11d48" fontSize="10" textAnchor="start">
        {Math.round(maxCorr)}h
      </text>
      <text x={w - padR + 6} y={padT + plotH} fill="#e11d48" fontSize="10" textAnchor="start">
        0h
      </text>

      {series.map((d, i) => {
        const x = padL + (n === 1 ? plotW / 2 : i * stepX);
        const barH = (d.horasCorretiva / maxCorr) * (plotH * 0.65);
        const barY = padT + plotH - barH;
        const showLabel = i % stride === 0 || i === n - 1;
        const shortDate = d.data.slice(8, 10) + "/" + d.data.slice(5, 7);

        return (
          <g key={d.data}>
            <rect
              x={(x - barW / 2).toFixed(1)}
              y={barY.toFixed(1)}
              width={barW.toFixed(1)}
              height={Math.max(1, barH).toFixed(1)}
              rx="2"
              fill="rgba(244, 63, 94, 0.55)"
              style={{ cursor: "pointer" }}
              onClick={() => onSelectDate(d.data)}
            >
              <title>
                {formatBrDate(d.data)}: {d.horasCorretiva}h Corretiva ({d.falhas} paradas) | DF:{" "}
                {d.dfPct}% (Clique para abrir o dia)
              </title>
            </rect>
            {showLabel && (
              <text x={x.toFixed(1)} y={h - 14} fill="#64748b" fontSize="10" textAnchor="middle">
                {shortDate}
              </text>
            )}
          </g>
        );
      })}

      <polyline fill="none" stroke="#10b981" strokeWidth="2.4" points={points} />
    </svg>
  );
}

// ─── 2. Corretivas do Dia (Ao Vivo) (/cco/corretivas) ─────────────────────────

export function CorretivasDiaView() {
  const {
    cdData,
    setCdData,
    corretivasDia,
    openNovaCorretivaDiaModal,
    openLiberarCorretivaDiaModal,
    openFichaAtendimento,
    exportCorretivasDiaCsv,
  } = useBusato();

  const [modoVisao, setModoVisao] = useState<"tabela" | "cards">("tabela");
  const [filtroLegenda, setFiltroLegenda] = useState<"TODAS" | "BASE" | "AREA" | "ABERTAS">("TODAS");

  const resumo = corretivasDia?.resumo || {
    periodo: cdData,
    totalEquipamentos: 41,
    horaPorEquipamento: "10:30:00",
    totalHorasContratadas: "430:30:00",
    totalHorasPerdidas: "00:00:00",
    totalHorasAtendimento: "430:30:00",
    aderenciaPct: 100,
    metaAderenciaPct: 95.0,
    dentroDaMeta: true,
    totalCorretivas: 0,
    paradasBase: 0,
    paradasArea: 0,
    paradasAbertas: 0,
    equipamentosOperandoNormal: 41,
  };

  const todasCorretivas = corretivasDia?.corretivas || [];
  const listaFiltrada = todasCorretivas.filter((c: any) => {
    if (filtroLegenda === "BASE") return c.localTipo === "BASE";
    if (filtroLegenda === "AREA") return c.localTipo === "AREA";
    if (filtroLegenda === "ABERTAS") return c.emAberto;
    return true;
  });

  const metaOk = resumo.dentroDaMeta;
  const corAderencia = metaOk ? "#16a34a" : "#e11d48";

  return (
    <div>
      <CCOOperationalHeader />

      <div className="panel-card" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">
              🚨 Central de Corretivas do Dia & Controle de Aderência (Tempo Real)
            </div>
            <div className="panel-subtitle">
              Acompanhamento ao vivo das intervenções na <strong>Base (Oficina)</strong> e na{" "}
              <strong>Área (Campo)</strong>, cálculo de horas perdidas e apuração instantânea da
              taxa de aderência contratual.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              DATA DE ANÁLISE:
            </label>
            <input
              type="date"
              className="form-control"
              style={{ width: 155, fontWeight: 700 }}
              value={cdData}
              onChange={(e) => setCdData(e.target.value)}
            />
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-input)",
                padding: 3,
                borderRadius: 6,
                border: "1px solid var(--border-color)",
              }}
            >
              <button
                className="btn btn-outline btn-xs"
                style={
                  modoVisao === "tabela"
                    ? { background: "var(--accent-blue)", color: "#fff" }
                    : undefined
                }
                onClick={() => setModoVisao("tabela")}
              >
                📋 Modo Tabela Executiva
              </button>
              <button
                className="btn btn-outline btn-xs"
                style={
                  modoVisao === "cards"
                    ? { background: "var(--accent-blue)", color: "#fff" }
                    : undefined
                }
                onClick={() => setModoVisao("cards")}
              >
                🗂️ Modo Cards Sala CCO
              </button>
            </div>
            <button
              className="btn btn-rose"
              style={{ fontWeight: 700 }}
              onClick={openNovaCorretivaDiaModal}
            >
              + Nova Corretiva Hoje
            </button>
            <button className="btn btn-emerald" onClick={exportCorretivasDiaCsv}>
              📥 Baixar Relatório (Excel/CSV)
            </button>
            <button className="btn btn-outline" onClick={() => window.print()}>
              🖨️ Imprimir Boletim
            </button>
          </div>
        </div>

        {/* Placar Superior de Indicadores Rápidos */}
        <div className="kpi-grid" style={{ marginBottom: 14 }}>
          <div className="kpi-card emerald" style={{ borderLeft: `5px solid ${corAderencia}` }}>
            <div className="kpi-label">🎯 Aderência / Disponibilidade do Dia</div>
            <div className="kpi-value" style={{ color: corAderencia, fontSize: 32 }}>
              {formatNumber(resumo.aderenciaPct, 2)}%
            </div>
            <div className="kpi-sub">
              <span>Meta Contratual: 95,00%</span>
              {metaOk ? (
                <span className="badge badge-success" style={{ fontSize: 11 }}>
                  🟢 DENTRO DA META (&gt; 95%)
                </span>
              ) : (
                <span className="badge badge-danger" style={{ fontSize: 11 }}>
                  🔴 ABAIXO DA META (&lt; 95%)
                </span>
              )}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, resumo.aderenciaPct)}%`,
                  background: corAderencia,
                }}
              />
            </div>
          </div>

          <div className="kpi-card rose">
            <div className="kpi-label">⏱️ Não Atendimento (Horas Perdidas)</div>
            <div
              className="kpi-value"
              style={{ color: "#e11d48", fontFamily: "'Consolas', monospace", fontSize: 30 }}
            >
              {resumo.totalHorasPerdidas}
            </div>
            <div className="kpi-sub">
              <span>{resumo.totalCorretivas} ocorrência(s) de parada</span>
              <span style={{ color: "#ea580c", fontWeight: 700 }}>
                🏢 {resumo.paradasBase} Base | 🚜 {resumo.paradasArea} Área
              </span>
            </div>
          </div>

          <div className="kpi-card cyan">
            <div className="kpi-label">🚜 Atendimento (Horas Efetivas Operando)</div>
            <div
              className="kpi-value"
              style={{ color: "#0284c7", fontFamily: "'Consolas', monospace", fontSize: 30 }}
            >
              {resumo.totalHorasAtendimento}
            </div>
            <div className="kpi-sub">
              <span>de {resumo.totalHorasContratadas} contratadas</span>
              <span>({resumo.horaPorEquipamento} / equip.)</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">🚛 Frota Total Escalada no Dia</div>
            <div className="kpi-value" style={{ fontSize: 30 }}>
              {resumo.totalEquipamentos}{" "}
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                Equipamentos
              </span>
            </div>
            <div className="kpi-sub">
              <span style={{ color: "#16a34a", fontWeight: 700 }}>
                🟢 {resumo.equipamentosOperandoNormal} Operando Normal
              </span>
              <span
                style={{
                  color: resumo.paradasAbertas > 0 ? "#e11d48" : "var(--text-secondary)",
                  fontWeight: 700,
                }}
              >
                {resumo.paradasAbertas > 0
                  ? `🔴 ${resumo.paradasAbertas} em Parada Agora`
                  : "✅ Zero paradas abertas"}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de Legenda Interativa & Filtro de 1 Toque */}
        <div className="legenda-bar">
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: "var(--text-secondary)",
              fontWeight: 800,
            }}
          >
            LEGENDA & FILTRO RÁPIDO:
          </span>
          <div
            className={`legenda-item base ${filtroLegenda === "BASE" ? "ativa" : ""}`}
            onClick={() => setFiltroLegenda("BASE")}
            title="Clique para filtrar apenas corretivas na Base (Oficina)"
          >
            <span>🟧 CORRETIVA NA BASE (OFICINA)</span>
            <span
              className="badge"
              style={{ background: "rgba(249, 115, 22, 0.85)", color: "#fff", fontSize: 11 }}
            >
              {resumo.paradasBase}
            </span>
          </div>
          <div
            className={`legenda-item area ${filtroLegenda === "AREA" ? "ativa" : ""}`}
            onClick={() => setFiltroLegenda("AREA")}
            title="Clique para filtrar apenas corretivas na Área (Campo)"
          >
            <span>⬜ CORRETIVA NA ÁREA (CAMPO)</span>
            <span
              className="badge"
              style={{ background: "#0284c7", color: "#fff", fontSize: 11 }}
            >
              {resumo.paradasArea}
            </span>
          </div>
          <div
            className={`legenda-item ${filtroLegenda === "ABERTAS" ? "ativa" : ""}`}
            style={{
              background: "rgba(244, 63, 94, 0.14)",
              border: "1px solid #f43f5e",
              color: "#e11d48",
            }}
            onClick={() => setFiltroLegenda("ABERTAS")}
            title="Máquinas que estão paradas neste instante"
          >
            <span className="pulse-dot" />
            <span>🔴 EM ANDAMENTO AGORA</span>
            <span
              className="badge"
              style={{ background: "#f43f5e", color: "#fff", fontSize: 11 }}
            >
              {resumo.paradasAbertas}
            </span>
          </div>
          <div
            className={`legenda-item ${filtroLegenda === "TODAS" ? "ativa" : ""}`}
            style={{
              background: "rgba(2, 132, 199, 0.12)",
              border: "1px solid var(--accent-blue)",
              color: "var(--accent-blue)",
            }}
            onClick={() => setFiltroLegenda("TODAS")}
          >
            <span>📋 TODAS AS CORRETIVAS DO DIA</span>
          </div>
        </div>

        {/* VISÃO 1: TABELA EXECUTIVA COLORIDA */}
        {modoVisao === "tabela" ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATA</th>
                  <th>PLACA</th>
                  <th>TIPO DE EQUIPAMENTO</th>
                  <th>MOTORISTA / OPERADOR</th>
                  <th>LETRA</th>
                  <th>ÁREA</th>
                  <th>SERVIÇO / DEFEITO</th>
                  <th>TIPO DE MANUTENÇÃO</th>
                  <th style={{ textAlign: "center" }}>INÍCIO</th>
                  <th style={{ textAlign: "center" }}>LIBERAÇÃO</th>
                  <th style={{ textAlign: "center" }}>HORAS PERDIDAS</th>
                  <th style={{ textAlign: "center" }}>LOCAL</th>
                  <th style={{ textAlign: "center" }}>AÇÕES RÁPIDAS</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      style={{ textAlign: "center", padding: 36, color: "var(--text-secondary)" }}
                    >
                      Nenhuma corretiva encontrada para o filtro selecionado no dia{" "}
                      <strong>{formatBrDate(cdData)}</strong>.
                      {filtroLegenda !== "TODAS" && (
                        <button
                          className="btn btn-outline btn-xs"
                          style={{ marginLeft: 10 }}
                          onClick={() => setFiltroLegenda("TODAS")}
                        >
                          Mostrar Todas
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  listaFiltrada.map((c: any, idx: number) => {
                    const isBase = c.localTipo === "BASE";
                    const rowClass = isBase ? "row-corretiva-base" : "row-corretiva-area";
                    return (
                      <tr key={`${c.idRegistro}-${c.paradaId || idx}`} className={rowClass}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 600 }}>
                          {formatBrDate(c.data)}
                        </td>
                        <td>
                          <span
                            className="badge-plate"
                            style={{ cursor: "pointer" }}
                            onClick={() => openFichaAtendimento(c.idRegistro)}
                          >
                            {c.placa}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>
                          {c.tipoEquipamento}
                        </td>
                        <td style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {c.motorista}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 800,
                            fontFamily: "'Consolas',monospace",
                          }}
                        >
                          {c.letra || "B"}
                        </td>
                        <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                          {c.area || "MINÉRIO"}
                        </td>
                        <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{c.servico}</td>
                        <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>{c.tipoManutencao}</td>
                        <td style={{ textAlign: "center" }}>
                          <span className="badge-h-inicio">{c.inicio}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {c.emAberto ? (
                            <span
                              className="badge badge-danger"
                              style={{
                                fontFamily: "'Consolas',monospace",
                                fontWeight: 800,
                                fontSize: 11,
                              }}
                            >
                              EM ABERTO
                            </span>
                          ) : (
                            <span className="badge-h-liberacao">{c.liberacao}</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="badge-h-perdidas">{c.horasPerdidas}</span>
                          {c.emAberto && (
                            <div style={{ fontSize: 9.5, color: "#e11d48", fontWeight: 700, marginTop: 2 }}>
                              ⏱️ contando ao vivo
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isBase ? (
                            <span
                              className="badge"
                              style={{
                                background: "#ffedd5",
                                color: "#9a3412",
                                border: "1px solid #fed7aa",
                                fontWeight: 800,
                              }}
                            >
                              🏢 BASE
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                background: "#e0f2fe",
                                color: "#0369a1",
                                border: "1px solid #bae6fd",
                                fontWeight: 800,
                              }}
                            >
                              🚜 ÁREA
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          {c.emAberto ? (
                            <button
                              className="btn btn-emerald btn-xs"
                              style={{ fontWeight: 800 }}
                              onClick={() =>
                                openLiberarCorretivaDiaModal(
                                  c.idRegistro,
                                  c.paradaId,
                                  c.placa,
                                  c.equipamentoNome,
                                  c.inicio,
                                  c.servico
                                )
                              }
                            >
                              ✅ Liberar
                            </button>
                          ) : (
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => openFichaAtendimento(c.idRegistro)}
                              title="Ver Ficha / Editar Horários"
                            >
                              ✏️ Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* VISÃO 2: CARDS VISUAIS DE SALA DE CONTROLE (CCO) */
          <div className="corretivas-live-grid">
            {listaFiltrada.length === 0 ? (
              <div
                style={{
                  gridColumn: "1/-1",
                  textAlign: "center",
                  padding: 30,
                  color: "var(--text-secondary)",
                }}
              >
                Nenhuma corretiva para exibir neste modo.
              </div>
            ) : (
              listaFiltrada.map((c: any, idx: number) => {
                const isBase = c.localTipo === "BASE";
                return (
                  <div
                    key={`${c.idRegistro}-${c.paradaId || idx}`}
                    className={`corretiva-card ${isBase ? "base" : "area"}`}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="badge-plate" style={{ fontSize: 13 }}>
                          {c.placa}
                        </span>
                        {isBase ? (
                          <span
                            className="badge"
                            style={{ background: "#f97316", color: "#fff", fontWeight: 800 }}
                          >
                            🏢 NA BASE (OFICINA)
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{ background: "#0284c7", color: "#fff", fontWeight: 800 }}
                          >
                            🚜 NA ÁREA (CAMPO)
                          </span>
                        )}
                      </div>
                      {c.emAberto ? (
                        <span className="badge badge-danger">
                          <span className="pulse-dot" /> PARADO AGORA
                        </span>
                      ) : (
                        <span className="badge badge-success">✅ LIBERADA</span>
                      )}
                    </div>

                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                        {c.tipoEquipamento}
                      </h4>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-secondary)",
                          marginTop: 2,
                        }}
                      >
                        👷 Operador: <strong>{c.motorista}</strong> • Turno: Letra{" "}
                        {c.letra || "B"} • Área: {c.area}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "rgba(15, 23, 42, 0.06)",
                        borderRadius: 6,
                        padding: 10,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          Defeito / Serviço
                        </div>
                        <div style={{ fontWeight: 800, color: "#d97706" }}>{c.servico}</div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          Horas Perdidas
                        </div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: "#e11d48",
                            fontFamily: "'Consolas',monospace",
                            fontSize: 13,
                          }}
                        >
                          {c.horasPerdidas}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          Início da Parada
                        </div>
                        <div style={{ fontWeight: 700, color: "#dc2626" }}>{c.inicio}</div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            textTransform: "uppercase",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          Liberação
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: c.emAberto ? "#e11d48" : "#16a34a",
                          }}
                        >
                          {c.liberacao}
                        </div>
                      </div>
                    </div>

                    <div>
                      {c.emAberto ? (
                        <button
                          className="btn btn-emerald btn-xs"
                          style={{ width: "100%", fontWeight: 800, padding: 8 }}
                          onClick={() =>
                            openLiberarCorretivaDiaModal(
                              c.idRegistro,
                              c.paradaId,
                              c.placa,
                              c.equipamentoNome,
                              c.inicio,
                              c.servico
                            )
                          }
                        >
                          ✅ Liberar Máquina Agora
                        </button>
                      ) : (
                        <button
                          className="btn btn-outline btn-xs"
                          style={{ width: "100%" }}
                          onClick={() => openFichaAtendimento(c.idRegistro)}
                        >
                          ✏️ Ver Ficha / Editar Horário
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* RODAPÉ COCKPIT DE ADERÊNCIA */}
        <div className="aderencia-footer-cockpit">
          <div className="cockpit-stat-box">
            <div className="cockpit-stat-label">📅 Período de Medição</div>
            <div className="cockpit-stat-value" style={{ fontSize: 16 }}>
              {formatBrDate(resumo.periodo)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              Turno Integral
            </div>
          </div>

          <div className="cockpit-stat-box">
            <div className="cockpit-stat-label">🚫 Não Atendimento (Horas Perdidas)</div>
            <div className="cockpit-stat-value" style={{ color: "#e11d48" }}>
              {resumo.totalHorasPerdidas}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {resumo.totalCorretivas} parada(s) computadas
            </div>
          </div>

          <div className="cockpit-stat-box">
            <div className="cockpit-stat-label">🟢 Atendimento (Horas Efetivas)</div>
            <div className="cockpit-stat-value" style={{ color: "#0284c7" }}>
              {resumo.totalHorasAtendimento}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              Operação portuária direta
            </div>
          </div>

          <div className="cockpit-stat-box">
            <div className="cockpit-stat-label">⏰ Horas Contratadas Totais</div>
            <div className="cockpit-stat-value">{resumo.totalHorasContratadas}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {resumo.totalEquipamentos} ativos × {resumo.horaPorEquipamento}
            </div>
          </div>

          <div className={`cockpit-aderencia-destaque ${metaOk ? "" : "atencao"}`}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                fontWeight: 800,
                color: "#0f172a",
                marginBottom: 2,
              }}
            >
              ÍNDICE DE ADERÊNCIA / DF DO DIA
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                color: corAderencia,
                fontFamily: "'Consolas',monospace",
                lineHeight: 1,
              }}
            >
              {formatNumber(resumo.aderenciaPct, 2)}%
            </div>
            <div style={{ fontSize: 11.5, color: corAderencia, fontWeight: 700, marginTop: 5 }}>
              {metaOk
                ? "🟢 DENTRO DA META CONTRATUAL (> 95%)"
                : "🔴 ABAIXO DA META CONTRATUAL (< 95%)"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Operação Diária ao Vivo (/cco/operacao) ───────────────────────────────

function StatusBadge({ rec }: { rec: RegistroOperacional }) {
  if (rec.statusApresentacao === "NAO_APRESENTOU") {
    return <span className="badge badge-danger">🚫 Não Apresentou</span>;
  }
  if (rec.temParadaAberta || rec.statusCodigo === "INDISPONIVEL") {
    return (
      <span className="badge badge-danger">
        <span className="pulse-dot" style={{ marginRight: 4 }} /> EM PARADA AGORA
      </span>
    );
  }
  if (rec.statusApresentacao === "AGUARDANDO") {
    return <span className="badge badge-info">⏳ Aguardando Início</span>;
  }
  if (rec.statusCodigo === "CORRETIVA_PARCIAL") {
    return <span className="badge badge-warning">🔴🟢 Operando (Teve Parada)</span>;
  }
  if (rec.statusApresentacao === "ATRASADO") {
    return (
      <span className="badge badge-warning">
        ⏰ Operando (Atraso +{rec.atrasoMinutos || 0}m)
      </span>
    );
  }
  if (rec.statusCodigo === "TREINAMENTO") {
    return <span className="badge badge-info">🟡 Treinamento/ROF</span>;
  }
  return <span className="badge badge-success">🟢 Operando Normal</span>;
}

export function OperacaoDiariaView() {
  const {
    apontamentoData,
    setApontamentoData,
    apontamentoRegistros,
    confirmarApresentacaoRapida,
    confirmarApresentacaoLote,
    openCloneDayModal,
    openNewEntryModal,
    openFichaAtendimento,
    openApresentacaoModal,
    openStartStopModal,
    openCloseStopModal,
    openQuickAlmoco,
    openQuickDesvio,
  } = useBusato();

  const [filtroMesa, setFiltroMesa] = useState<string>("TODOS");
  const [buscaMesa, setBuscaMesa] = useState<string>("");

  const total = apontamentoRegistros.length;
  const minProg = apontamentoRegistros.reduce(
    (s, r) => s + Math.round((r.horasProgramadas || 10.5) * 60),
    0
  );
  const minCorr = apontamentoRegistros.reduce((s, r) => s + (r.minutosCorretiva || 0), 0);
  const minDisp = Math.max(0, minProg - minCorr);
  const hProg = Number((minProg / 60).toFixed(1));
  const hCorr = Number((minCorr / 60).toFixed(2));
  const hDisp = Number((minDisp / 60).toFixed(1));
  const dfDia = minProg > 0 ? Number(((minDisp / minProg) * 100).toFixed(2)) : 100;

  const noHorario = apontamentoRegistros.filter(
    (r) => r.statusApresentacao === "NO_HORARIO"
  ).length;
  const aguardando = apontamentoRegistros.filter(
    (r) => r.statusApresentacao === "AGUARDANDO"
  ).length;
  const atrasados = apontamentoRegistros.filter(
    (r) => r.statusApresentacao === "ATRASADO"
  ).length;
  const naoApresentou = apontamentoRegistros.filter(
    (r) => r.statusApresentacao === "NAO_APRESENTOU"
  ).length;

  const emParadaAgora = apontamentoRegistros.filter((r) => r.temParadaAberta).length;
  const comCorretiva = apontamentoRegistros.filter((r) => r.qtdFalhas > 0).length;
  const comAlmoco = apontamentoRegistros.filter((r) => r.almoco).length;

  let lista = apontamentoRegistros.slice();
  if (filtroMesa === "AGUARDANDO_APRES")
    lista = lista.filter((r) => r.statusApresentacao === "AGUARDANDO");
  else if (filtroMesa === "ATRASADOS_APRES")
    lista = lista.filter((r) => r.statusApresentacao === "ATRASADO");
  else if (filtroMesa === "NAO_APRESENTOU")
    lista = lista.filter((r) => r.statusApresentacao === "NAO_APRESENTOU");
  else if (filtroMesa === "PARADA_ABERTA") lista = lista.filter((r) => r.temParadaAberta);
  else if (filtroMesa === "COM_CORRETIVA") lista = lista.filter((r) => r.qtdFalhas > 0);
  else if (filtroMesa === "SEM_ALMOCO") lista = lista.filter((r) => !r.almoco);

  const termo = buscaMesa.trim().toUpperCase();
  if (termo) {
    lista = lista.filter((r) =>
      `${r.placaPrincipal} ${r.placaReserva || ""} ${r.equipamentoNome} ${r.operador} ${
        r.frenteServico
      } ${r.motivoAtrasoApresentacao || ""}`
        .toUpperCase()
        .includes(termo)
    );
  }

  return (
    <div>
      <CCOOperationalHeader />

      <div className="panel-card" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">
              ⏱️ Mesa de Controle da Operação Diária (Apresentação na Frente & Acompanhamento ao
              Vivo)
            </div>
            <div className="panel-subtitle">
              💡 <strong>Clique em qualquer atendimento da tabela</strong> para abrir a ficha pop-up
              e atualizar todas as informações. Confirme o início na{" "}
              <strong>Frente de Serviço</strong>, acompanhe atrasos/faltas e gerencie paradas!
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              DATA DA OPERAÇÃO:
            </label>
            <input
              type="date"
              className="form-control"
              style={{ width: 155, fontWeight: 700 }}
              value={apontamentoData}
              onChange={(e) => setApontamentoData(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={confirmarApresentacaoLote}
              title="Confirmar apresentação às 07:00 para todos os equipamentos que estão aguardando"
            >
              ✅ Confirmar Todos Pendentes (07:00)
            </button>
            <button className="btn btn-amber" onClick={openCloneDayModal}>
              📋 Clonar Escala p/ Novo Dia
            </button>
            <button className="btn btn-emerald" onClick={openNewEntryModal}>
              + Escalar Equipamento
            </button>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="kpi-grid" style={{ marginBottom: 14 }}>
          <div
            className="kpi-card cyan"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroMesa("TODOS")}
          >
            <div className="kpi-label">
              📍 Apresentação na Frente ({formatBrDate(apontamentoData)})
            </div>
            <div className="kpi-value">
              {noHorario} / {total}{" "}
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>Pontuais</span>
            </div>
            <div className="kpi-sub">
              <span style={{ color: "#d97706", fontWeight: 700 }}>⏰ {atrasados} Atrasos</span>
              <span style={{ color: "#e11d48", fontWeight: 700 }}>🚫 {naoApresentou} Faltas</span>
              <span style={{ color: "#0284c7" }}>⏳ {aguardando} Aguard.</span>
            </div>
          </div>

          <div
            className="kpi-card rose"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroMesa("PARADA_ABERTA")}
          >
            <div className="kpi-label">🔴 Em Parada Aberta Neste Momento</div>
            <div
              className="kpi-value"
              style={{ color: emParadaAgora > 0 ? "#e11d48" : "#16a34a" }}
            >
              {emParadaAgora} máq.
            </div>
            <div className="kpi-sub">
              <span>
                {comCorretiva} tiveram corretiva no dia ({formatNumber(hCorr, 1)}h)
              </span>
            </div>
          </div>

          <div className="kpi-card emerald">
            <div className="kpi-label">Disponibilidade Física do Dia</div>
            <div className="kpi-value">{formatNumber(dfDia, 2)}%</div>
            <div className="kpi-sub">
              <span>
                {formatNumber(hDisp, 1)}h operacionais de {formatNumber(hProg, 1)}h (10h30/eq.)
              </span>
            </div>
          </div>

          <div
            className="kpi-card amber"
            style={{ cursor: "pointer" }}
            onClick={() => setFiltroMesa("SEM_ALMOCO")}
          >
            <div className="kpi-label">Controle de Almoço Registrado</div>
            <div className="kpi-value">
              {comAlmoco} / {total}
            </div>
            <div className="kpi-sub">
              <span>Clique p/ ver pendentes de refeição</span>
            </div>
          </div>
        </div>

        {/* Filtros Rápidos da Operação */}
        <div
          style={{
            display: "flex",
            gap: 7,
            marginBottom: 14,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>
            FILTROS DA OPERAÇÃO:
          </span>
          <button
            className={`btn btn-xs ${filtroMesa === "TODOS" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFiltroMesa("TODOS")}
          >
            📋 Todos do Dia
          </button>
          <button
            className={`btn btn-xs ${
              filtroMesa === "AGUARDANDO_APRES" ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => setFiltroMesa("AGUARDANDO_APRES")}
          >
            ⏳ Aguardando Apresentação
          </button>
          <button
            className="btn btn-amber btn-xs"
            onClick={() => setFiltroMesa("ATRASADOS_APRES")}
          >
            ⏰ Apresentaram c/ Atraso
          </button>
          <button
            className="btn btn-rose btn-xs"
            onClick={() => setFiltroMesa("NAO_APRESENTOU")}
          >
            🚫 Não se Apresentaram
          </button>
          <button
            className="btn btn-rose btn-xs"
            onClick={() => setFiltroMesa("PARADA_ABERTA")}
          >
            🔴 Em Parada Aberta Agora
          </button>
          <button
            className={`btn btn-xs ${
              filtroMesa === "COM_CORRETIVA" ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => setFiltroMesa("COM_CORRETIVA")}
          >
            🔧 Teve Corretiva
          </button>
          <button
            className={`btn btn-xs ${filtroMesa === "SEM_ALMOCO" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFiltroMesa("SEM_ALMOCO")}
          >
            🍽️ Pendentes de Almoço
          </button>
          <input
            type="text"
            className="form-control"
            style={{ maxWidth: 250, padding: "5px 10px", fontSize: 12, marginLeft: "auto" }}
            placeholder="🔍 Buscar placa, operador ou frente..."
            value={buscaMesa}
            onChange={(e) => setBuscaMesa(e.target.value)}
          />
        </div>

        {/* Tabela da Operação Diária */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Setor</th>
                <th>Equipamento / OS (Clique p/ Editar)</th>
                <th>Placa / Reserva</th>
                <th>Motorista / Operador</th>
                <th>Frente de Serviço</th>
                <th>📍 Apresentação na Frente (Início)</th>
                <th>Status em Tempo Real</th>
                <th>DF%</th>
                <th>Histórico do Turno (Paradas / Almoço / Desvio)</th>
                <th>Comandos Rápidos</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}
                  >
                    Nenhum equipamento encontrado para o filtro selecionado em{" "}
                    <strong>{formatBrDate(apontamentoData)}</strong>.
                    {filtroMesa !== "TODOS" && (
                      <button
                        className="btn btn-outline btn-xs"
                        style={{ marginLeft: 10 }}
                        onClick={() => setFiltroMesa("TODOS")}
                      >
                        Mostrar Todos do Dia
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                lista.map((r) => {
                  const prog = r.horarioProgramadoApresentacao || "07:00";
                  const real = r.horarioApresentacao || "07:00";
                  const st = r.statusApresentacao || "NO_HORARIO";

                  const rowStyle: React.CSSProperties = {
                    cursor: "pointer",
                    ...(r.temParadaAberta
                      ? { background: "rgba(244,63,94,0.09)" }
                      : r.statusApresentacao === "NAO_APRESENTOU"
                      ? { background: "rgba(244,63,94,0.05)", opacity: 0.85 }
                      : {}),
                  };

                  return (
                    <tr
                      key={r.id}
                      style={rowStyle}
                      onClick={() => openFichaAtendimento(r.id)}
                      title="Clique para abrir o Pop-up Completo deste Atendimento e atualizar informações"
                    >
                      <td>
                        <span className="badge badge-info">{r.setor}</span>
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "var(--accent-blue)",
                            textDecoration: "underline dotted",
                          }}
                        >
                          {r.equipamentoNome}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          {r.regimeHoras}h • OS: {r.ordemServico || "-"} • Resp: {r.responsavel}
                        </div>
                      </td>
                      <td>
                        <span className="badge-plate">{r.placaPrincipal}</span>
                        {r.placaReserva && (
                          <div style={{ marginTop: 3 }}>
                            <span className="badge badge-warning">
                              🔄 Reserva: {r.placaReserva}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{r.operador}</td>
                      <td style={{ maxWidth: 210 }}>
                        <div style={{ fontWeight: 700, color: "var(--accent-blue)", fontSize: 12 }}>
                          📍 {r.frenteServico}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={r.atividade}
                        >
                          {r.atividade}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {st === "AGUARDANDO" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            <span
                              className="badge badge-info"
                              style={{ cursor: "pointer" }}
                              onClick={() => openApresentacaoModal(r.id)}
                            >
                              ⏳ Aguardando (Prog: {prog})
                            </span>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                className="btn btn-emerald btn-xs"
                                onClick={() => confirmarApresentacaoRapida(r.id, "NO_HORARIO")}
                                title="Confirmar apresentação pontual na frente de serviço"
                              >
                                ✅ Confirmar
                              </button>
                              <button
                                className="btn btn-amber btn-xs"
                                onClick={() => openApresentacaoModal(r.id)}
                                title="Registrar atraso ou não apresentação com justificativa"
                              >
                                ⏰ Atraso / Falta
                              </button>
                            </div>
                          </div>
                        ) : st === "ATRASADO" ? (
                          <div
                            style={{ cursor: "pointer" }}
                            onClick={() => openApresentacaoModal(r.id)}
                          >
                            <span className="badge badge-warning">
                              ⏰ {real} (+{r.atrasoMinutos || 0} min)
                            </span>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#d97706",
                                marginTop: 3,
                                fontWeight: 600,
                              }}
                            >
                              ⚠️ {r.motivoAtrasoApresentacao || "Atraso na Apresentação"}
                            </div>
                            {r.justificativaApresentacao && (
                              <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                                {r.justificativaApresentacao}
                              </div>
                            )}
                          </div>
                        ) : st === "NAO_APRESENTOU" ? (
                          <div
                            style={{ cursor: "pointer" }}
                            onClick={() => openApresentacaoModal(r.id)}
                          >
                            <span className="badge badge-danger">🚫 Não se Apresentou</span>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#e11d48",
                                marginTop: 3,
                                fontWeight: 600,
                              }}
                            >
                              Motivo: {r.motivoAtrasoApresentacao || "Não Informado"}
                            </div>
                            {r.justificativaApresentacao && (
                              <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                                {r.justificativaApresentacao}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{ cursor: "pointer" }}
                            onClick={() => openApresentacaoModal(r.id)}
                          >
                            <span className="badge badge-success">✅ {real} • Na Frente</span>
                            <div
                              style={{
                                fontSize: 10.5,
                                color: "var(--text-secondary)",
                                marginTop: 2,
                              }}
                            >
                              Clique p/ alterar
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <StatusBadge rec={r} />
                      </td>
                      <td>
                        <DfBadge df={r.disponibilidadeFisica} />
                      </td>
                      <td style={{ minWidth: 230, maxWidth: 310 }}>
                        {(r.corretivas || []).map((c, idx) =>
                          c.emAberto ? (
                            <div
                              key={idx}
                              style={{
                                background: "rgba(244,63,94,0.14)",
                                border: "1px solid rgba(244,63,94,0.45)",
                                borderRadius: 6,
                                padding: "6px 8px",
                                marginBottom: 4,
                              }}
                            >
                              <div style={{ color: "#e11d48", fontWeight: 700, fontSize: 11.5 }}>
                                🔴 PARADA EM ABERTO DESDE {c.inicio} ({c.motivo})
                              </div>
                              <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>
                                📍 Local da Parada:{" "}
                                <strong>{c.localParada || r.frenteServico}</strong>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={idx}
                              style={{
                                background: "rgba(245,158,11,0.12)",
                                border: "1px solid rgba(245,158,11,0.35)",
                                borderRadius: 6,
                                padding: "4px 8px",
                                marginBottom: 4,
                                fontSize: 11,
                              }}
                            >
                              ✅{" "}
                              <strong>
                                {c.inicio} às {c.fim}
                              </strong>{" "}
                              ({c.motivo})
                              {c.localParada ? ` • 📍 Local: ${c.localParada}` : ""}
                              {c.localRetorno ? ` ➔ Retorno: ${c.localRetorno}` : ""}
                            </div>
                          )
                        )}
                        <div>
                          {r.almoco && (
                            <span className="badge badge-info" style={{ margin: 2 }}>
                              🍽️ Almoço {r.almoco.inicio}-{r.almoco.fim}
                            </span>
                          )}
                          {(r.desvios || []).map((d, idx) => (
                            <span key={idx} className="badge badge-warning" style={{ margin: 2 }}>
                              ⚠️ Desvio p/ {d.destino} ({d.solicitante} {d.horario})
                            </span>
                          ))}
                        </div>
                        {(r.corretivas || []).length === 0 &&
                          r.statusApresentacao === "ATRASADO" &&
                          (r.atrasoMinutos || 0) > 0 && (
                            <div
                              style={{
                                background: "rgba(225,29,72,0.10)",
                                border: "1px solid rgba(225,29,72,0.35)",
                                borderRadius: 6,
                                padding: "4px 8px",
                                marginBottom: 4,
                                fontSize: 11,
                              }}
                            >
                              ⏰{" "}
                              <strong>
                                {r.horarioProgramadoApresentacao || "07:00"} às{" "}
                                {r.horarioApresentacao}
                              </strong>{" "}
                              (-{formatNumber(r.horasCorretiva, 2)}h •{" "}
                              {r.motivoAtrasoApresentacao || "Atraso no Início"}
                              {r.justificativaApresentacao ? `: ${r.justificativaApresentacao}` : ""})
                            </div>
                          )}
                        {(r.corretivas || []).length === 0 &&
                          r.statusApresentacao !== "ATRASADO" &&
                          !r.almoco &&
                          (r.desvios || []).length === 0 && (
                            <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>
                              Sem paradas / desvios
                            </span>
                          )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => openFichaAtendimento(r.id)}
                          >
                            📝 Editar
                          </button>
                          {r.temParadaAberta ? (
                            <button
                              className="btn btn-emerald btn-xs"
                              style={{ fontWeight: 800 }}
                              onClick={() => openCloseStopModal(r.id)}
                            >
                              ✅ Encerrar Parada
                            </button>
                          ) : (
                            <button
                              className="btn btn-rose btn-xs"
                              onClick={() => openStartStopModal(r.id)}
                            >
                              🛑 Iniciar Parada
                            </button>
                          )}
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => openQuickAlmoco(r.id)}
                          >
                            🍽️ Almoço
                          </button>
                          <button
                            className="btn btn-amber btn-xs"
                            onClick={() => openQuickDesvio(r.id)}
                          >
                            ⚠️ Desvio
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 4. Boletim de Medição por Placa (/cco/medicao) ───────────────────────────

export function MedicaoPorPlacaView() {
  const {
    analytics,
    exportCsv,
    openCloseStopModal,
    openStartStopModal,
    openFichaAtendimento,
  } = useBusato();

  const porPlaca = analytics?.porPlaca || [];

  return (
    <div>
      <CCOOperationalHeader />

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <div className="panel-title">🚜 Boletim de Medição Consolidado por Placa / TAG</div>
            <div className="panel-subtitle">
              Cálculo rigoroso de Horas Contratadas, Horas de Indisponibilidade (Corretiva), Horas
              Efetivas, DF%, MTTR e MTBF por ativo
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-emerald" onClick={() => exportCsv("medicao_frota")}>
              📥 Baixar Boletim de Medição (Excel/CSV)
            </button>
            <button className="btn btn-outline" onClick={() => window.print()}>
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Placa / TAG</th>
                <th>Tipo de Equipamento</th>
                <th>Identificação</th>
                <th>Setor</th>
                <th>Turnos</th>
                <th>Horas Prog.</th>
                <th>Horas Corretiva</th>
                <th>Horas Efetivas</th>
                <th>Disponibilidade (DF%)</th>
                <th>Nº Falhas</th>
                <th>MTTR (h)</th>
                <th>MTBF (h)</th>
                <th>Desvios</th>
                <th>Trocas</th>
                <th>Último Operador</th>
                <th>Controle de Parada</th>
              </tr>
            </thead>
            <tbody>
              {porPlaca.map((p: any) => {
                const idAlvo = p.ultimoIdComParada || p.ultimoIdRegistro;
                return (
                  <tr key={p.placa}>
                    <td>
                      <span
                        className="badge-plate"
                        style={{ cursor: "pointer" }}
                        onClick={() => openFichaAtendimento(p.ultimoIdRegistro)}
                      >
                        {p.placa}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.tipoEquipamento}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{p.equipamentoNome}</td>
                    <td>
                      <span className="badge badge-info">{p.setorPredominante}</span>
                    </td>
                    <td>{p.turnos}</td>
                    <td>{formatNumber(p.horasProgramadas, 0)}h</td>
                    <td
                      style={{
                        color: p.horasCorretiva > 0 ? "#e11d48" : "var(--text-secondary)",
                        fontWeight: 700,
                      }}
                    >
                      {formatNumber(p.horasCorretiva, 1)}h
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatNumber(p.horasDisponiveis, 1)}h</td>
                    <td>
                      <DfBadge df={p.dfPct} />
                    </td>
                    <td>{p.falhas}</td>
                    <td>{formatNumber(p.mttr, 2)}h</td>
                    <td>{formatNumber(p.mtbf, 1)}h</td>
                    <td>{p.desvios}</td>
                    <td>
                      {p.trocas > 0 ? (
                        <span className="badge badge-warning">{p.trocas}x</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={{ fontSize: 11.5 }}>{p.ultimoOperador}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {p.paradasAbertas > 0 ? (
                          <button
                            className="btn btn-emerald btn-xs"
                            onClick={() => openCloseStopModal(idAlvo)}
                          >
                            ✅ Encerrar Parada
                          </button>
                        ) : (
                          <button
                            className="btn btn-rose btn-xs"
                            onClick={() => openStartStopModal(p.ultimoIdRegistro)}
                          >
                            🛑 Iniciar Parada
                          </button>
                        )}
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => openFichaAtendimento(p.ultimoIdRegistro)}
                        >
                          📝 Ficha
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 5. Histórico & Exportação (/cco/relatorios) ──────────────────────────────

export function AuditoriaExportacaoView() {
  const {
    analytics,
    filters,
    exportCsv,
    exportExcelExecutivo,
    exportBoletimAderenciaXlsx,
    exportPdfExecutivo,
    copyResumoWhatsApp,
    openCloseStopModal,
    openFichaAtendimento,
  } = useBusato();

  const [abaAuditoria, setAbaAuditoria] = useState<"perdas" | "atrasos" | "desvios">("perdas");
  const [filtroTipoPerda, setFiltroTipoPerda] = useState<"TODOS" | "CORRETIVA" | "ATRASO" | "BASE" | "AREA">("TODOS");
  const [buscaAuditoria, setBuscaAuditoria] = useState<string>("");
  const [resumoTexto, setResumoTexto] = useState<string | null>(null);

  const k = analytics?.kpis || {
    totalTurnos: 0,
    horasProgramadas: 0,
    horasDisponiveis: 0,
    horasCorretiva: 0,
    disponibilidadeFisica: 100,
    totalFalhas: 0,
    paradasEmAbertoCount: 0,
    taxaPontualidade: 100,
    turnosPontuais: 0,
    turnosAtrasados: 0,
    turnosNaoApresentou: 0,
    totalDesvios: 0,
    totalTrocasReserva: 0,
  };

  const ultimasCorretivas = analytics?.ultimasCorretivas || [];
  const listaAtrasos = analytics?.listaAtrasos || [];
  const listaDesvios = analytics?.listaDesvios || [];
  const listaTrocasReserva = analytics?.listaTrocasReserva || [];

  const q = buscaAuditoria.trim().toUpperCase();

  const perdasFiltradas = ultimasCorretivas.filter((c: any) => {
    if (filtroTipoPerda === "CORRETIVA" && c.tipoEvento !== "CORRETIVA") return false;
    if (filtroTipoPerda === "ATRASO" && c.tipoEvento === "CORRETIVA") return false;
    if (filtroTipoPerda === "BASE" && c.localTipo !== "BASE") return false;
    if (filtroTipoPerda === "AREA" && c.localTipo !== "AREA") return false;
    if (q) {
      const hay = `${c.placa} ${c.equipamento} ${c.operador} ${c.motivo} ${c.localParada} ${c.frente}`.toUpperCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const atrasosFiltrados = listaAtrasos.filter((a: any) => {
    if (!q) return true;
    return `${a.placa} ${a.equipamento} ${a.operador} ${a.frente} ${a.motivo} ${a.justificativa}`
      .toUpperCase()
      .includes(q);
  });

  const desviosFiltrados = listaDesvios.filter((d: any) => {
    if (!q) return true;
    return `${d.placa} ${d.equipamento} ${d.destino} ${d.solicitante} ${d.frenteOriginal}`
      .toUpperCase()
      .includes(q);
  });

  const formatHm = (hDec: number) => {
    const totalMin = Math.round((hDec || 0) * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const mm = String(totalMin % 60).padStart(2, "0");
    return `${hh}:${mm}h`;
  };

  const dfOk = k.disponibilidadeFisica >= 95;

  const handleCopyResumo = async () => {
    const txt = await copyResumoWhatsApp();
    setResumoTexto((prev) => (prev ? null : txt));
  };

  return (
    <div>
      <CCOOperationalHeader />

      {/* Placar Gerencial do Período para Relatório */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div
          className="kpi-card emerald"
          style={{ borderLeft: `4px solid ${dfOk ? "#10b981" : "#e11d48"}` }}
        >
          <div className="kpi-label">🎯 Aderência / DF% do Período</div>
          <div className="kpi-value" style={{ color: dfOk ? "#16a34a" : "#e11d48" }}>
            {formatNumber(k.disponibilidadeFisica, 2)}%
          </div>
          <div className="kpi-sub">
            <span>{formatHm(k.horasDisponiveis)} efetivas de {formatHm(k.horasProgramadas)}</span>
            <span className={`badge ${dfOk ? "badge-success" : "badge-danger"}`}>
              {dfOk ? "Meta >= 95%" : "Abaixo 95%"}
            </span>
          </div>
        </div>

        <div className="kpi-card rose">
          <div className="kpi-label">⏱️ Horas Perdidas (Corretivas + Atrasos)</div>
          <div className="kpi-value" style={{ color: "#e11d48" }}>
            {formatHm(k.horasCorretiva)}
          </div>
          <div className="kpi-sub">
            <span>{ultimasCorretivas.length} evento(s) computados</span>
            <span>{k.paradasEmAbertoCount} em aberto</span>
          </div>
        </div>

        <div className="kpi-card cyan">
          <div className="kpi-label">📍 Pontualidade na Frente (Início)</div>
          <div className="kpi-value" style={{ color: "#0284c7" }}>
            {formatNumber(k.taxaPontualidade, 1)}%
          </div>
          <div className="kpi-sub">
            <span>{k.turnosPontuais} pontuais / {k.totalTurnos} turnos</span>
            <span style={{ color: "#d97706", fontWeight: 700 }}>
              {k.turnosAtrasados} atrasos • {k.turnosNaoApresentou} faltas
            </span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-label">⚠️ Desvios & Trocas Reserva</div>
          <div className="kpi-value">{k.totalDesvios + k.totalTrocasReserva}</div>
          <div className="kpi-sub">
            <span>{k.totalDesvios} desvios de frente</span>
            <span>{k.totalTrocasReserva} trocas reserva</span>
          </div>
        </div>
      </div>

      {/* Central de Padrões de Exportação */}
      <div className="panel-card" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">📥 Central de Padrões de Relatórios & Exportação</div>
            <div className="panel-subtitle">
              Exporte na base contratual padronizada de <strong>10:30h/turno</strong> (incluindo corretivas + perdas por atraso no início) nos formatos <strong>Excel Multi-Abas (.xlsx)</strong>, <strong>PDF</strong>, <strong>WhatsApp</strong> e <strong>CSV Power BI</strong> — período de{" "}
              <strong>{formatBrDate(filters.dataInicio)}</strong> a{" "}
              <strong>{formatBrDate(filters.dataFim)}</strong>.
            </div>
          </div>
        </div>

        {/* Grid de Padrões Prontos de Exportação */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(16, 185, 129, 0.35)",
              background: "rgba(16, 185, 129, 0.06)",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#15803d" }}>
                📗 Relatório Executivo Completo (.XLSX)
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Pasta Excel com <strong>6 abas formatadas</strong>: Resumo Executivo, Medição por Placa, Corretivas & Perdas, Atrasos, Desvios e Base Completa.
              </div>
            </div>
            <button className="btn btn-emerald btn-sm" onClick={exportExcelExecutivo}>
              📥 Baixar Excel Completo (6 Abas)
            </button>
          </div>

          <div
            style={{
              border: "1px solid rgba(59, 130, 246, 0.35)",
              background: "rgba(59, 130, 246, 0.06)",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#1d4ed8" }}>
                📘 Boletim Aderência Vale / Busato (.XLSX)
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Layout contratual com quadro de <strong>Horas Contratadas (10:30h)</strong>, <strong>Não Atendimento</strong>, <strong>Aderência %</strong> e Base vs Área.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={exportBoletimAderenciaXlsx}>
              📘 Baixar Boletim Aderência (.xlsx)
            </button>
          </div>

          <div
            style={{
              border: "1px solid rgba(245, 158, 11, 0.35)",
              background: "rgba(245, 158, 11, 0.06)",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#b45309" }}>
                💬 Resumo Gerencial CCO & PDF
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Copie o boletim pronto para <strong>WhatsApp / E-mail</strong> com DF%, top motivos e paradas em aberto, ou imprima em PDF.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn btn-amber btn-sm"
                style={{ flex: 1 }}
                onClick={handleCopyResumo}
              >
                💬 WhatsApp
              </button>
              <button
                className="btn btn-rose btn-sm"
                style={{ flex: 1 }}
                onClick={exportPdfExecutivo}
              >
                📄 Baixar PDF
              </button>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--border-color)",
              background: "var(--bg-card-hover)",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                📊 Exportações .CSV (Power BI / Integração)
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Arquivos separados por ponto-e-vírgula (UTF-8) prontos para ingestão direta no Power BI ou planilhas.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button className="btn btn-outline btn-xs" onClick={() => exportCsv("medicao_frota")}>
                📊 Medição Placas
              </button>
              <button className="btn btn-outline btn-xs" onClick={() => exportCsv("turnos_detalhados")}>
                📋 Base Turnos
              </button>
              <button className="btn btn-outline btn-xs" onClick={() => exportCsv("corretivas_atrasos")}>
                🔧 Perdas & Corr.
              </button>
              <button className="btn btn-outline btn-xs" onClick={() => exportCsv("atrasos_pontualidade")}>
                ⏰ Atrasos Início
              </button>
            </div>
          </div>
        </div>

        {/* Prévia do Resumo WhatsApp quando clicado */}
        {resumoTexto && (
          <div
            style={{
              background: "rgba(15, 23, 42, 0.04)",
              border: "1px dashed var(--accent-blue)",
              borderRadius: 8,
              padding: 12,
              marginTop: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontSize: 12, color: "var(--accent-blue)" }}>
                💬 Prévia do Boletim Gerencial (já copiado para a área de transferência)
              </strong>
              <button className="btn btn-outline btn-xs" onClick={() => setResumoTexto(null)}>
                ✕ Ocultar
              </button>
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: 12,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {resumoTexto}
            </pre>
          </div>
        )}
      </div>

      {/* Painel de Auditoria Unificado com Abas e Busca */}
      <div className="panel-card">
        <div className="panel-header" style={{ flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className={`btn btn-sm ${abaAuditoria === "perdas" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setAbaAuditoria("perdas")}
            >
              🔧 Paradas & Perdas de Início ({perdasFiltradas.length})
            </button>
            <button
              className={`btn btn-sm ${abaAuditoria === "atrasos" ? "btn-amber" : "btn-outline"}`}
              onClick={() => setAbaAuditoria("atrasos")}
            >
              ⏰ Pontualidade & Atrasos ({atrasosFiltrados.length})
            </button>
            <button
              className={`btn btn-sm ${abaAuditoria === "desvios" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setAbaAuditoria("desvios")}
            >
              ⚠️ Desvios & Trocas ({desviosFiltrados.length + listaTrocasReserva.length})
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {abaAuditoria === "perdas" && (
              <select
                className="form-control"
                style={{ width: 175, padding: "5px 8px", fontSize: 12 }}
                value={filtroTipoPerda}
                onChange={(e) => setFiltroTipoPerda(e.target.value as any)}
              >
                <option value="TODOS">Todos os Eventos</option>
                <option value="CORRETIVA">Somente Corretivas</option>
                <option value="ATRASO">Somente Atrasos/Faltas</option>
                <option value="BASE">Local: Base (Oficina)</option>
                <option value="AREA">Local: Área (Campo)</option>
              </select>
            )}
            <input
              type="text"
              className="form-control"
              style={{ width: 250, padding: "5px 10px", fontSize: 12 }}
              placeholder="🔍 Filtrar placa, motorista, motivo..."
              value={buscaAuditoria}
              onChange={(e) => setBuscaAuditoria(e.target.value)}
            />
          </div>
        </div>

        {/* ABA 1: PARADAS CORRETIVAS & PERDAS NO INÍCIO DO TURNO */}
        {abaAuditoria === "perdas" && (
          <div className="table-responsive" style={{ maxHeight: 560 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Placa</th>
                  <th>Tipo Evento</th>
                  <th>Início - Fim</th>
                  <th>Duração / Status</th>
                  <th>📍 Local (Base/Área)</th>
                  <th>Subsistema / Motivo</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {perdasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--text-secondary)" }}>
                      Nenhuma parada corretiva ou atraso encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  perdasFiltradas.map((c: any, idx: number) => {
                    const isAtraso = c.tipoEvento === "ATRASO_INICIO" || c.tipoEvento === "NAO_APRESENTOU";
                    return (
                      <tr key={`${c.idRegistro}-${c.paradaId || idx}-${idx}`}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatBrDate(c.data)}</td>
                        <td>
                          <span
                            className="badge-plate"
                            style={{ cursor: "pointer" }}
                            onClick={() => openFichaAtendimento(c.idRegistro)}
                          >
                            {c.placa}
                          </span>
                        </td>
                        <td>
                          {c.tipoEvento === "ATRASO_INICIO" ? (
                            <span className="badge badge-warning">⏰ Atraso Início</span>
                          ) : c.tipoEvento === "NAO_APRESENTOU" ? (
                            <span className="badge badge-danger">🚫 Não Apresentou</span>
                          ) : (
                            <span className="badge badge-info">🔧 Corretiva</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 700, color: "#e11d48" }}>
                          {c.inicio} às{" "}
                          {c.emAberto ? (
                            <span className="badge badge-danger">EM ABERTO</span>
                          ) : (
                            c.fim
                          )}
                        </td>
                        <td>
                          {c.emAberto ? (
                            <span className="badge badge-danger">
                              🔴 Ativa ({formatHm(c.duracaoHoras)})
                            </span>
                          ) : (
                            <span className="badge badge-success">
                              ✅ {formatHm(c.duracaoHoras)} ({formatNumber(c.duracaoHoras, 2)}h)
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <span
                            className="badge"
                            style={{
                              background: c.localTipo === "BASE" ? "#f97316" : "#0284c7",
                              color: "#fff",
                              marginRight: 5,
                            }}
                          >
                            {c.localTipo === "BASE" ? "BASE" : "ÁREA"}
                          </span>
                          <span style={{ color: "#d97706", fontSize: 11.5 }}>{c.localParada || c.frente}</span>
                        </td>
                        <td>{c.motivo}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {isAtraso ? (
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => openFichaAtendimento(c.idRegistro)}
                            >
                              📝 Ver Ficha
                            </button>
                          ) : c.emAberto ? (
                            <button
                              className="btn btn-emerald btn-xs"
                              onClick={() => openCloseStopModal(c.idRegistro, c.paradaId || 0)}
                            >
                              ✅ Encerrar Agora
                            </button>
                          ) : (
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => openCloseStopModal(c.idRegistro, c.paradaId || 0, true)}
                            >
                              ✏️ Editar Local/Hora
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ABA 2: AUDITORIA DE PONTUALIDADE & ATRASOS NA FRENTE */}
        {abaAuditoria === "atrasos" && (
          <div className="table-responsive" style={{ maxHeight: 560 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Placa</th>
                  <th>Equipamento / Operador</th>
                  <th>Prog. x Real</th>
                  <th>Perda Computada</th>
                  <th>DF% Turno</th>
                  <th>Motivo / Justificativa</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {atrasosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--text-secondary)" }}>
                      🟢 100% de pontualidade! Nenhum atraso ou falta registrado no filtro atual.
                    </td>
                  </tr>
                ) : (
                  atrasosFiltrados.map((a: any) => (
                    <tr key={a.idRegistro}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatBrDate(a.data)}</td>
                      <td>
                        <span
                          className="badge-plate"
                          style={{ cursor: "pointer" }}
                          onClick={() => openFichaAtendimento(a.idRegistro)}
                        >
                          {a.placa}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{a.tipoEquipamento}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.operador}</div>
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                        {a.horaProg} ➔{" "}
                        <span style={{ color: "#e11d48" }}>{a.horaReal}</span>
                      </td>
                      <td>
                        <span className="badge badge-danger">
                          -{a.atrasoMinutos} min ({formatNumber(a.horasPerdidas, 2)}h)
                        </span>
                      </td>
                      <td>
                        <DfBadge df={a.dfPct} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#d97706" }}>{a.motivo}</div>
                        {a.justificativa && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.justificativa}</div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => openFichaAtendimento(a.idRegistro)}
                        >
                          ✏️ Editar Ficha
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ABA 3: DESVIOS & TROCAS RESERVA */}
        {abaAuditoria === "desvios" && (
          <div className="grid-equal" style={{ gap: 14 }}>
            <div>
              <h4 style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>
                ⚠️ Desvios de Programação ({desviosFiltrados.length})
              </h4>
              <div className="table-responsive" style={{ maxHeight: 480 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Placa</th>
                      <th>Destino do Desvio</th>
                      <th>Solicitante</th>
                      <th>Horário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desviosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--text-secondary)" }}>
                          Nenhum desvio de programação registrado.
                        </td>
                      </tr>
                    ) : (
                      desviosFiltrados.map((d: any, idx: number) => (
                        <tr key={`${d.idRegistro}-${idx}`}>
                          <td style={{ whiteSpace: "nowrap" }}>{formatBrDate(d.data)}</td>
                          <td>
                            <span
                              className="badge-plate"
                              style={{ cursor: "pointer" }}
                              onClick={() => openFichaAtendimento(d.idRegistro)}
                            >
                              {d.placa}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-warning">{d.destino}</span>
                          </td>
                          <td style={{ fontWeight: 700 }}>{d.solicitante}</td>
                          <td>{d.horario}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>
                🔄 Trocas por Equipamento Reserva ({listaTrocasReserva.length})
              </h4>
              <div className="table-responsive" style={{ maxHeight: 480 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Titular ➔ Reserva</th>
                      <th>Equipamento</th>
                      <th>Operador</th>
                      <th>DF%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaTrocasReserva.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--text-secondary)" }}>
                          Nenhuma substituição por placa reserva no período.
                        </td>
                      </tr>
                    ) : (
                      listaTrocasReserva.map((t: any) => (
                        <tr key={t.idRegistro}>
                          <td style={{ whiteSpace: "nowrap" }}>{formatBrDate(t.data)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span
                              className="badge-plate"
                              style={{ cursor: "pointer" }}
                              onClick={() => openFichaAtendimento(t.idRegistro)}
                            >
                              {t.placaPrincipal}
                            </span>{" "}
                            ➔ <span className="badge badge-warning">{t.placaReserva}</span>
                          </td>
                          <td style={{ fontSize: 11.5 }}>{t.equipamento}</td>
                          <td style={{ fontSize: 11.5 }}>{t.operador}</td>
                          <td>
                            <DfBadge df={t.dfPct} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 6. Gestão de Cadastros (/cco/cadastros) ──────────────────────────────────

export function CadastrosCCOView() {
  const {
    cadastros,
    loadCadastros,
    openCadastroModal,
    toggleStatusCadastro,
    deleteCadastroItem,
  } = useBusato();

  const [subTab, setSubTab] = useState<keyof CadastrosData>("operadores");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ATIVO");

  useEffect(() => {
    loadCadastros();
  }, [loadCadastros]);

  const listaBruta = cadastros[subTab] || [];
  const termo = busca.trim().toUpperCase();
  const listaFiltrada = listaBruta.filter((item: any) => {
    if (filtroStatus !== "TODOS") {
      const st = String(item.status || "ATIVO").toUpperCase();
      if (st !== filtroStatus) return false;
    }
    if (!termo) return true;
    return Object.values(item).join(" ").toUpperCase().includes(termo);
  });

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <div className="panel-title">⚙️ Gestão Central de Cadastros & Parâmetros do Sistema</div>
          <div className="panel-subtitle">
            Cadastre, edite, atualize ou inative <strong>Operadores</strong>,{" "}
            <strong>Equipamentos/Placas</strong>, <strong>Frentes/Locais</strong>,{" "}
            <strong>Serviços</strong> e <strong>Motivos de Atraso</strong>. Todos os dados são
            sincronizados automaticamente em todo o sistema.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-emerald" onClick={() => openCadastroModal(subTab, null)}>
            + Novo Cadastro
          </button>
        </div>
      </div>

      {/* Sub-navegação por abas/pills de cadastros */}
      <div className="cadastros-subnav">
        <button
          className={`cadastros-pill ${subTab === "operadores" ? "active" : ""}`}
          onClick={() => {
            setSubTab("operadores");
            setBusca("");
          }}
        >
          👷 Operadores / Motoristas{" "}
          <span className="badge badge-info">{(cadastros.operadores || []).length}</span>
        </button>
        <button
          className={`cadastros-pill ${subTab === "equipamentos" ? "active" : ""}`}
          onClick={() => {
            setSubTab("equipamentos");
            setBusca("");
          }}
        >
          🚜 Equipamentos & Frotas{" "}
          <span className="badge badge-info">{(cadastros.equipamentos || []).length}</span>
        </button>
        <button
          className={`cadastros-pill ${subTab === "locais" ? "active" : ""}`}
          onClick={() => {
            setSubTab("locais");
            setBusca("");
          }}
        >
          📍 Frentes & Locais{" "}
          <span className="badge badge-info">{(cadastros.locais || []).length}</span>
        </button>
        <button
          className={`cadastros-pill ${subTab === "servicos" ? "active" : ""}`}
          onClick={() => {
            setSubTab("servicos");
            setBusca("");
          }}
        >
          🔧 Serviços & Manutenção{" "}
          <span className="badge badge-info">{(cadastros.servicos || []).length}</span>
        </button>
        <button
          className={`cadastros-pill ${subTab === "justificativas" ? "active" : ""}`}
          onClick={() => {
            setSubTab("justificativas");
            setBusca("");
          }}
        >
          ⚠️ Motivos & Justificativas{" "}
          <span className="badge badge-info">{(cadastros.justificativas || []).length}</span>
        </button>
      </div>

      {/* Barra de busca e filtros do cadastro */}
      <div className="cadastros-toolbar">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, maxWidth: 450 }}>
          <input
            type="text"
            className="form-control"
            placeholder="🔍 Digite para filtrar no cadastro..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>
            FILTRO STATUS:
          </label>
          <select
            className="form-control"
            style={{ width: 130 }}
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="ATIVO">Apenas Ativos</option>
            <option value="INATIVO">Inativos</option>
          </select>
        </div>
      </div>

      {/* Tabela do Cadastro Selecionado */}
      <div className="table-responsive">
        <table className="data-table">
          {subTab === "operadores" && (
            <>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th>NOME DO OPERADOR / MOTORISTA</th>
                  <th>FUNÇÃO / CARGO</th>
                  <th style={{ textAlign: "center" }}>TURNO HABITUAL</th>
                  <th>MATRÍCULA</th>
                  <th style={{ textAlign: "center" }}>STATUS</th>
                  <th style={{ textAlign: "center", width: 130 }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}
                    >
                      Nenhum operador encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  listaFiltrada.map((o: any) => (
                    <tr key={o.id}>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        #{o.id}
                      </td>
                      <td style={{ fontWeight: 700, color: "var(--text-primary)" }}>{o.nome}</td>
                      <td style={{ color: "var(--text-secondary)" }}>
                        {o.funcao || "Operador / Motorista"}
                      </td>
                      <td
                        style={{
                          textAlign: "center",
                          fontWeight: 800,
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        {o.turnoHabitual || "B"}
                      </td>
                      <td style={{ fontFamily: "'Consolas',monospace", fontSize: 11 }}>
                        {o.matricula || "-"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            o.status === "INATIVO" ? "badge-danger" : "badge-success"
                          }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleStatusCadastro("operadores", o.id)}
                          title="Clique para alternar ativo/inativo"
                        >
                          {o.status === "INATIVO" ? "🔴 Inativo" : "🟢 Ativo"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => openCadastroModal("operadores", o.id)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-rose btn-xs"
                            onClick={() => deleteCadastroItem("operadores", o.id, o.nome)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}

          {subTab === "equipamentos" && (
            <>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th>PLACA / TAG</th>
                  <th>NOME / MODELO DO EQUIPAMENTO</th>
                  <th>FAMÍLIA</th>
                  <th>SETOR</th>
                  <th style={{ textAlign: "center" }}>REGIME</th>
                  <th style={{ textAlign: "center" }}>STATUS</th>
                  <th style={{ textAlign: "center", width: 130 }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}
                    >
                      Nenhum equipamento encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  listaFiltrada.map((e: any) => (
                    <tr key={e.id}>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        #{e.id}
                      </td>
                      <td>
                        <span className="badge-plate">{e.placa}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{e.equipamentoNome}</td>
                      <td>
                        <span className="badge badge-info">{e.tipoEquipamento}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{e.setor || "MFE"}</td>
                      <td
                        style={{
                          textAlign: "center",
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        {e.regimeHoras || 10.5}h
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            e.status === "INATIVO" ? "badge-danger" : "badge-success"
                          }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleStatusCadastro("equipamentos", e.id)}
                        >
                          {e.status === "INATIVO" ? "🔴 Inativo" : "🟢 Ativo"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => openCadastroModal("equipamentos", e.id)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-rose btn-xs"
                            onClick={() => deleteCadastroItem("equipamentos", e.id, e.placa)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}

          {subTab === "locais" && (
            <>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th>NOME DA FRENTE / LOCAL</th>
                  <th>TIPO DE LOCAL</th>
                  <th>SETOR RESPONSÁVEL</th>
                  <th>DESCRIÇÃO OPERACIONAL</th>
                  <th style={{ textAlign: "center" }}>STATUS</th>
                  <th style={{ textAlign: "center", width: 130 }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}
                    >
                      Nenhum local encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  listaFiltrada.map((l: any) => (
                    <tr key={l.id}>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        #{l.id}
                      </td>
                      <td style={{ fontWeight: 800 }}>{l.nome}</td>
                      <td>
                        <span
                          className={`badge ${
                            l.tipo === "BASE" ? "badge-warning" : "badge-info"
                          }`}
                        >
                          {l.tipo === "BASE" ? "🏢 Base / Oficina" : "🚜 Área / Frente"}
                        </span>
                      </td>
                      <td>{l.setor || "MFE"}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{l.descricao || "-"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            l.status === "INATIVO" ? "badge-danger" : "badge-success"
                          }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleStatusCadastro("locais", l.id)}
                        >
                          {l.status === "INATIVO" ? "🔴 Inativo" : "🟢 Ativo"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => openCadastroModal("locais", l.id)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-rose btn-xs"
                            onClick={() => deleteCadastroItem("locais", l.id, l.nome)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}

          {subTab === "servicos" && (
            <>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th>SERVIÇO / DEFEITO DE MANUTENÇÃO</th>
                  <th>CATEGORIA / SUBSISTEMA</th>
                  <th style={{ textAlign: "center" }}>CRITICIDADE</th>
                  <th style={{ textAlign: "center" }}>STATUS</th>
                  <th style={{ textAlign: "center", width: 130 }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}
                    >
                      Nenhum serviço de manutenção encontrado.
                    </td>
                  </tr>
                ) : (
                  listaFiltrada.map((s: any) => (
                    <tr key={s.id}>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        #{s.id}
                      </td>
                      <td style={{ fontWeight: 800, color: "var(--text-primary)" }}>{s.nome}</td>
                      <td>{s.categoria || "Mecânica Geral"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            s.criticidade === "ALTA"
                              ? "badge-danger"
                              : s.criticidade === "MÉDIA"
                              ? "badge-warning"
                              : "badge-info"
                          }`}
                        >
                          {s.criticidade || "MÉDIA"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            s.status === "INATIVO" ? "badge-danger" : "badge-success"
                          }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleStatusCadastro("servicos", s.id)}
                        >
                          {s.status === "INATIVO" ? "🔴 Inativo" : "🟢 Ativo"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => openCadastroModal("servicos", s.id)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-rose btn-xs"
                            onClick={() => deleteCadastroItem("servicos", s.id, s.nome)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}

          {subTab === "justificativas" && (
            <>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th>MOTIVO DE ATRASO / JUSTIFICATIVA</th>
                  <th>CATEGORIA OPERACIONAL</th>
                  <th style={{ textAlign: "center" }}>REQUER APROVAÇÃO</th>
                  <th style={{ textAlign: "center" }}>STATUS</th>
                  <th style={{ textAlign: "center", width: 130 }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}
                    >
                      Nenhum motivo encontrado.
                    </td>
                  </tr>
                ) : (
                  listaFiltrada.map((j: any) => (
                    <tr key={j.id}>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "'Consolas',monospace",
                        }}
                      >
                        #{j.id}
                      </td>
                      <td style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                        {j.motivo}
                      </td>
                      <td>{j.categoria || "Geral"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            j.requerAprovacao ? "badge-danger" : "badge-info"
                          }`}
                        >
                          {j.requerAprovacao ? "⚠️ Sim (Fiscal / CCO)" : "Automática"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`badge ${
                            j.status === "INATIVO" ? "badge-danger" : "badge-success"
                          }`}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggleStatusCadastro("justificativas", j.id)}
                        >
                          {j.status === "INATIVO" ? "🔴 Inativo" : "🟢 Ativo"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => openCadastroModal("justificativas", j.id)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-rose btn-xs"
                            onClick={() => deleteCadastroItem("justificativas", j.id, j.motivo)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
