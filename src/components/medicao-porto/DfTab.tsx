import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Calendar,
  SlidersHorizontal,
  Search,
  Table2,
  LayoutGrid,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type MedicaoCycle,
  type DfCycleParams,
  type DfEquipmentRow,
  formatMinutesToHHMM,
  formatMinutesToHHMMSS,
  formatPct,
  formatShortDayMonth,
} from '@/lib/medicao-porto-service';

interface DfTabProps {
  cycle: MedicaoCycle;
  dfResult: {
    rows: DfEquipmentRow[];
    diasMedicao: number;
    mediaAderenciaRatio: number;
    totalMetaMin: number;
    totalPerdasMin: number;
    totalTrabalhadoMin: number;
  };
  dfParams: DfCycleParams;
  canEdit: boolean;
  onUpdateParams: (patch: Partial<DfCycleParams>) => void;
  onUpdateRegimeDf: (tipoQqp: string, regimeDf: '12h' | '24h') => void;
}

export function DfTab({
  cycle,
  dfResult,
  dfParams,
  canEdit,
  onUpdateParams,
  onUpdateRegimeDf,
}: DfTabProps) {
  const [search, setSearch] = useState('');
  const [frenteFilter, setFrenteFilter] = useState<'ALL' | 'MFE' | 'TPM'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ABAIXO_95' | 'ACIMA_95'>('ALL');
  const [viewMode, setViewMode] = useState<'RESUMO' | 'MATRIZ_DIARIA'>('RESUMO');
  const [dailyMetric, setDailyMetric] = useState<'PERDAS' | 'HORAS_EXEC' | 'HORIMETRO'>('PERDAS');
  const [showParams, setShowParams] = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return dfResult.rows.filter((r) => {
      if (frenteFilter !== 'ALL' && r.frente !== frenteFilter) return false;
      if (statusFilter === 'ABAIXO_95' && r.aderenciaTotalRatio >= 0.95) return false;
      if (statusFilter === 'ACIMA_95' && r.aderenciaTotalRatio < 0.95) return false;
      if (
        q &&
        !r.tipoQqp.toUpperCase().includes(q) &&
        !r.grupo.toUpperCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [dfResult.rows, search, frenteFilter, statusFilter]);

  const countAcima95 = useMemo(
    () => dfResult.rows.filter((r) => r.aderenciaTotalRatio >= 0.95).length,
    [dfResult.rows]
  );
  const countAbaixo95 = dfResult.rows.length - countAcima95;

  return (
    <div className="space-y-4">
      {/* KPIs DF */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Aderência Média (DF)
            </p>
            <p
              className={`text-2xl font-bold mt-1 ${
                dfResult.mediaAderenciaRatio >= 0.95 ? 'text-emerald-600' : 'text-destructive'
              }`}
            >
              {formatPct(dfResult.mediaAderenciaRatio)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Meta contratual: 95,00% ({dfResult.diasMedicao} dias)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Meta Total Horas (AW)
            </p>
            <p className="text-xl font-bold mt-1 text-foreground">
              {formatMinutesToHHMMSS(dfResult.totalMetaMin)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {dfResult.rows.length} linhas QQP ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Horas Trabalhadas (AP)
            </p>
            <p className="text-xl font-bold mt-1 text-blue-600">
              {formatMinutesToHHMMSS(dfResult.totalTrabalhadoMin)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Meta líquida (-) perdas do ciclo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Perdas / Desvios (AJ)
            </p>
            <p className="text-xl font-bold mt-1 text-amber-600">
              {formatMinutesToHHMMSS(dfResult.totalPerdasMin)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Somado automaticamente da aba BD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status Regra 95%
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                {countAcima95} OK
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-destructive">
                <AlertTriangle className="w-4 h-4" />
                {countAbaixo95} &lt;95%
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Equipamentos com glosa abaixo de 95%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros & Parâmetros do Ciclo */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar equipamento QQP ou grupo..."
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <Select
                value={frenteFilter}
                onValueChange={(v) => setFrenteFilter(v as 'ALL' | 'MFE' | 'TPM')}
              >
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue placeholder="Frente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas Frentes</SelectItem>
                  <SelectItem value="MFE">Frente MFE</SelectItem>
                  <SelectItem value="TPM">Frente TPM</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as 'ALL' | 'ABAIXO_95' | 'ACIMA_95')}
              >
                <SelectTrigger className="h-9 w-44 text-xs">
                  <SelectValue placeholder="Status DF" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos Equipamentos</SelectItem>
                  <SelectItem value="ABAIXO_95">Abaixo de 95% (Alerta)</SelectItem>
                  <SelectItem value="ACIMA_95">Atingiu &gt;= 95%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setViewMode('RESUMO')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'RESUMO'
                      ? 'bg-background shadow-sm text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  Cálculo DF ( Fórmulas )
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('MATRIZ_DIARIA')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'MATRIZ_DIARIA'
                      ? 'bg-background shadow-sm text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Matriz Diária (21 a 20)
                </button>
              </div>

              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5"
                  onClick={() => setShowParams((v) => !v)}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Controle Mensal
                </Button>
              )}
            </div>
          </div>

          {viewMode === 'MATRIZ_DIARIA' && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Exibir nas células diárias:</span>
              {(['PERDAS', 'HORAS_EXEC', 'HORIMETRO'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDailyMetric(m)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    dailyMetric === m
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 'PERDAS'
                    ? 'Perdas / Desvios (HH:MM)'
                    : m === 'HORAS_EXEC'
                    ? 'Horas Totais (HH:MM)'
                    : 'Horímetro Realizado'}
                </button>
              ))}
            </div>
          )}

          {showParams && canEdit && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-border/60 bg-muted/20 p-3 rounded-lg">
              <div>
                <Label className="text-[11px]">Dias de Medição (BE54)</Label>
                <Input
                  type="number"
                  min={20}
                  max={35}
                  value={dfParams.diasMedicaoOverride ?? cycle.totalDays}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    onUpdateParams({
                      diasMedicaoOverride: !isNaN(v) && v > 0 ? v : null,
                    });
                  }}
                  className="h-8 text-xs mt-1"
                />
                <span className="text-[10px] text-muted-foreground">
                  Padrão automático do ciclo: {cycle.totalDays} dias
                </span>
              </div>

              <div>
                <Label className="text-[11px]">Execução / Turno ( min — 630 = 10:30 )</Label>
                <Input
                  type="number"
                  min={60}
                  max={1440}
                  value={dfParams.horasTurnoMin}
                  onChange={(e) =>
                    onUpdateParams({ horasTurnoMin: parseInt(e.target.value, 10) || 630 })
                  }
                  className="h-8 text-xs mt-1"
                />
                <span className="text-[10px] text-muted-foreground">
                  Atual: {formatMinutesToHHMM(dfParams.horasTurnoMin)} por turno
                </span>
              </div>

              <div>
                <Label className="text-[11px]">Desconto Preventiva MFE (min — 240 = 04:00)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={dfParams.preventivaMfeMin}
                  onChange={(e) =>
                    onUpdateParams({ preventivaMfeMin: parseInt(e.target.value, 10) || 0 })
                  }
                  className="h-8 text-xs mt-1"
                />
                <span className="text-[10px] text-muted-foreground">
                  Atual: {formatMinutesToHHMM(dfParams.preventivaMfeMin)} (Sextas)
                </span>
              </div>

              <div>
                <Label className="text-[11px]">Desconto Preventiva TPM (min — 240 = 04:00)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={dfParams.preventivaTpmMin}
                  onChange={(e) =>
                    onUpdateParams({ preventivaTpmMin: parseInt(e.target.value, 10) || 0 })
                  }
                  className="h-8 text-xs mt-1"
                />
                <span className="text-[10px] text-muted-foreground">
                  Atual: {formatMinutesToHHMM(dfParams.preventivaTpmMin)} (Quartas)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela DF */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <span>
              {viewMode === 'RESUMO'
                ? 'Planilha DF - Somente (Cálculo de Aderência por Equipamento)'
                : `Matriz Diária de Aderência (${cycle.shortRangeLabel})`}
            </span>
            <Badge variant="outline" className="text-xs font-mono">
              {filteredRows.length} equipamentos
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Fórmula oficial: Meta Mês (AW) = (Dias × 10:30 × Turnos) − Preventiva | Trabalhado (AP) = AW − Perdas BD (AJ) | Aderência Total (AS) = AP / AW
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {viewMode === 'RESUMO' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-y border-border text-[11px] font-bold text-muted-foreground uppercase">
                    <th className="text-left px-3 py-2.5">#</th>
                    <th className="text-left px-3 py-2.5 min-w-[300px]">Tipo | QQP</th>
                    <th className="text-center px-2 py-2.5">Frente</th>
                    <th className="text-center px-2 py-2.5">Turno DF</th>
                    <th className="text-center px-2 py-2.5">Horas Dia</th>
                    <th className="text-right px-2.5 py-2.5">Meta Horas (AW)</th>
                    <th className="text-right px-2.5 py-2.5">Perdas Horas (AJ)</th>
                    <th className="text-right px-2.5 py-2.5">Limite 5% (AU)</th>
                    <th className="text-right px-2.5 py-2.5">Restante 95% (AM)</th>
                    <th className="text-right px-2.5 py-2.5">Restante Total (AP)</th>
                    <th className="text-center px-2 py-2.5">% Saldo 95%</th>
                    <th className="text-right px-3 py-2.5">Aderência Total (AS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredRows.map((r) => {
                    const below95 = r.aderenciaTotalRatio < 0.95;
                    return (
                      <tr
                        key={r.tipoQqp}
                        className={`hover:bg-muted/35 transition-colors ${
                          below95 ? 'bg-destructive/5' : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.ordem}</td>
                        <td className="px-3 py-2 font-semibold text-foreground">{r.tipoQqp}</td>
                        <td className="px-2 py-2 text-center">
                          <Badge
                            variant="outline"
                            className={
                              r.frente === 'TPM'
                                ? 'border-purple-500/40 text-purple-700 bg-purple-500/5 text-[10px]'
                                : 'border-blue-500/40 text-blue-700 bg-blue-500/5 text-[10px]'
                            }
                          >
                            {r.frente}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {canEdit ? (
                            <select
                              value={r.regimeDf}
                              onChange={(e) =>
                                onUpdateRegimeDf(r.tipoQqp, e.target.value as '12h' | '24h')
                              }
                              className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] font-mono"
                            >
                              <option value="12h">12h</option>
                              <option value="24h">24h</option>
                            </select>
                          ) : (
                            <span className="font-mono">{r.regimeDf}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-muted-foreground">
                          {formatMinutesToHHMM(r.horasDiaMin)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-medium">
                          {formatMinutesToHHMMSS(r.totalHorasMetaMin)}
                        </td>
                        <td
                          className={`px-2.5 py-2 text-right font-mono font-semibold ${
                            r.perdasMin > 0 ? 'text-amber-600' : 'text-muted-foreground'
                          }`}
                        >
                          {formatMinutesToHHMMSS(r.perdasMin)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono text-muted-foreground">
                          {formatMinutesToHHMMSS(r.limitePerda5PctMin)}
                        </td>
                        <td
                          className={`px-2.5 py-2 text-right font-mono font-semibold ${
                            r.restanteEm95Min < 0 ? 'text-destructive' : 'text-emerald-600'
                          }`}
                        >
                          {formatMinutesToHHMMSS(r.restanteEm95Min)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-medium">
                          {formatMinutesToHHMMSS(r.restanteTotalMin)}
                        </td>
                        <td
                          className={`px-2 py-2 text-center font-mono font-semibold ${
                            r.saldoLimite95Ratio < 0 ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {formatPct(r.saldoLimite95Ratio, true, 0)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`inline-flex items-center justify-end px-2 py-0.5 rounded font-mono font-bold ${
                              below95
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-emerald-500/15 text-emerald-700'
                            }`}
                          >
                            {formatPct(r.aderenciaTotalRatio)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/80 border-t-2 border-border font-bold text-xs">
                    <td colSpan={5} className="px-3 py-2.5 text-right uppercase">
                      Média / Consolidado Frota ({filteredRows.length} itens):
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono">
                      {formatMinutesToHHMMSS(dfResult.totalMetaMin)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-amber-600">
                      {formatMinutesToHHMMSS(dfResult.totalPerdasMin)}
                    </td>
                    <td colSpan={2} />
                    <td className="px-2.5 py-2.5 text-right font-mono">
                      {formatMinutesToHHMMSS(dfResult.totalTrabalhadoMin)}
                    </td>
                    <td />
                    <td className="px-3 py-2.5 text-right font-mono text-primary text-sm">
                      {formatPct(dfResult.mediaAderenciaRatio)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-y border-border font-bold text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left min-w-[260px] border-r border-border">
                      Tipo | QQP
                    </th>
                    <th className="px-2 py-2 text-center">Turno</th>
                    {cycle.dates.map((dt) => (
                      <th key={dt} className="px-1.5 py-2 text-center font-mono min-w-[48px]">
                        {formatShortDayMonth(dt)}
                      </th>
                    ))}
                    <th className="px-2.5 py-2 text-right bg-muted/80 border-l border-border">
                      Perdas
                    </th>
                    <th className="px-2.5 py-2 text-right bg-muted/80">DF %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredRows.map((r) => (
                    <tr key={r.tipoQqp} className="hover:bg-muted/30">
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-semibold truncate max-w-[260px] border-r border-border">
                        {r.tipoQqp.replace(/^BUSATO_/, '')}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                        {r.regimeDf}
                      </td>
                      {cycle.dates.map((dt) => {
                        if (dailyMetric === 'PERDAS') {
                          const loss = r.perdasPorDiaMin[dt] || 0;
                          return (
                            <td
                              key={dt}
                              className={`px-1 py-1.5 text-center font-mono border-l border-border/30 ${
                                loss > 0
                                  ? 'bg-destructive/12 text-destructive font-bold'
                                  : 'text-muted-foreground/40'
                              }`}
                            >
                              {loss > 0 ? formatMinutesToHHMM(loss, false) : '·'}
                            </td>
                          );
                        }
                        if (dailyMetric === 'HORAS_EXEC') {
                          const tot = r.horasTotaisPorDiaMin[dt] || 0;
                          const loss = r.perdasPorDiaMin[dt] || 0;
                          const exec = Math.max(0, tot - loss);
                          return (
                            <td
                              key={dt}
                              className={`px-1 py-1.5 text-center font-mono border-l border-border/30 ${
                                exec > 0 ? 'text-foreground' : 'text-muted-foreground/30'
                              }`}
                            >
                              {exec > 0 ? formatMinutesToHHMM(exec, false) : '·'}
                            </td>
                          );
                        }
                        const hor = r.horimetroPorDia[dt] || 0;
                        return (
                          <td
                            key={dt}
                            className={`px-1 py-1.5 text-center font-mono border-l border-border/30 ${
                              hor > 0 ? 'text-blue-600 font-medium' : 'text-muted-foreground/30'
                            }`}
                          >
                            {hor > 0 ? hor.toFixed(1) : '·'}
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-1.5 text-right font-mono font-semibold text-amber-600 border-l border-border">
                        {formatMinutesToHHMM(r.perdasMin)}
                      </td>
                      <td
                        className={`px-2.5 py-1.5 text-right font-mono font-bold ${
                          r.aderenciaTotalRatio < 0.95 ? 'text-destructive' : 'text-emerald-600'
                        }`}
                      >
                        {formatPct(r.aderenciaTotalRatio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
