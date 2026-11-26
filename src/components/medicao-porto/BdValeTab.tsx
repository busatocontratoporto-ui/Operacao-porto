import React, { useState, useMemo, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowLeftRight,
  Trash2,
  CheckCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type MedicaoCycle,
  type BdValeRow,
  type ValeEquipmentComparison,
  type OsReconciliationRow,
  formatMinutesToHHMM,
  formatPct,
  formatIsoToBr,
} from '@/lib/medicao-porto-service';

interface BdValeTabProps {
  cycle: MedicaoCycle;
  bdVale: BdValeRow[];
  valeResult: {
    byEquipment: ValeEquipmentComparison[];
    byOs: OsReconciliationRow[];
    valeAderenciaMap: Record<string, number>;
  };
  canEdit: boolean;
  onImportValeFile: (file: File) => void;
  onApplyValeAderenciaToMemoria: () => void;
  onClearVale: () => void;
}

export function BdValeTab({
  cycle,
  bdVale,
  valeResult,
  canEdit,
  onImportValeFile,
  onApplyValeAderenciaToMemoria,
  onClearVale,
}: BdValeTabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [subView, setSubView] = useState<'EQUIPAMENTO' | 'CONCILIACAO_OS' | 'BRUTO_VALE'>(
    'EQUIPAMENTO'
  );
  const [search, setSearch] = useState('');
  const [statusOsFilter, setStatusOsFilter] = useState<string>('ALL');

  const counts = useMemo(() => {
    let ok = 0;
    let div = 0;
    let soVale = 0;
    let soBusato = 0;
    for (const r of valeResult.byOs) {
      if (r.statusConciliacao === 'OK') ok++;
      else if (r.statusConciliacao === 'DIVERGENCIA_HORAS') div++;
      else if (r.statusConciliacao === 'SO_VALE') soVale++;
      else if (r.statusConciliacao === 'SO_BUSATO') soBusato++;
    }
    return { ok, div, soVale, soBusato };
  }, [valeResult.byOs]);

  const mediaVale = useMemo(() => {
    const valid = valeResult.byEquipment.filter((e) => e.aderenciaValeCalculadaRatio !== null);
    if (!valid.length) return null;
    return (
      valid.reduce((s, e) => s + (e.aderenciaValeCalculadaRatio || 0), 0) / valid.length
    );
  }, [valeResult.byEquipment]);

  const mediaBusato = useMemo(() => {
    if (!valeResult.byEquipment.length) return 1;
    return (
      valeResult.byEquipment.reduce((s, e) => s + e.aderenciaBusatoRatio, 0) /
      valeResult.byEquipment.length
    );
  }, [valeResult.byEquipment]);

  const filteredByEq = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return valeResult.byEquipment;
    return valeResult.byEquipment.filter(
      (r) => r.tipoQqp.toUpperCase().includes(q) || r.grupo.toUpperCase().includes(q)
    );
  }, [valeResult.byEquipment, search]);

  const filteredByOs = useMemo(() => {
    const q = search.trim().toUpperCase();
    return valeResult.byOs.filter((r) => {
      if (statusOsFilter !== 'ALL' && r.statusConciliacao !== statusOsFilter) return false;
      if (
        q &&
        !r.osDisplay.toUpperCase().includes(q) &&
        !r.equipamento.toUpperCase().includes(q) &&
        !r.placaBusato.toUpperCase().includes(q) &&
        !r.data.includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [valeResult.byOs, search, statusOsFilter]);

  const filteredBruto = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return bdVale;
    return bdVale.filter(
      (v) =>
        v.os.toUpperCase().includes(q) ||
        v.equipamento.toUpperCase().includes(q) ||
        v.aderenciaStatus.toUpperCase().includes(q) ||
        v.dataProg.includes(q)
    );
  }, [bdVale, search]);

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportValeFile(f);
          e.target.value = '';
        }}
      />

      {/* KPIs Comparativo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-emerald-500/25 bg-emerald-500/5">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Registros BD Vale (BD Real)
            </p>
            <p className="text-2xl font-bold mt-1 text-foreground">{bdVale.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Ciclo {cycle.shortRangeLabel}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Busato (DF) × Vale
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-bold text-primary">{formatPct(mediaBusato)}</span>
              <span className="text-xs text-muted-foreground">vs</span>
              <span className="text-lg font-bold text-emerald-600">
                {mediaVale !== null ? formatPct(mediaVale) : '—'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Aderência média comparada</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              O.S. Conciliadas (OK)
            </p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{counts.ok}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Horas batendo entre BD e BD Real
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Divergências de Horas
            </p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{counts.div}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              O.S. com diferença &gt; 2 min / glosa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              O.S. Não Pareadas
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-xs font-bold">
              <span className="text-blue-600">{counts.soBusato} só Busato</span>
              <span className="text-purple-600">{counts.soVale} só Vale</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pendências de espelhamento O.S.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Ações & Sub-visões */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setSubView('EQUIPAMENTO')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  subView === 'EQUIPAMENTO'
                    ? 'bg-background shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Comparativo por Equipamento
              </button>
              <button
                type="button"
                onClick={() => setSubView('CONCILIACAO_OS')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  subView === 'CONCILIACAO_OS'
                    ? 'bg-background shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Conciliação O.S. × O.S. ({valeResult.byOs.length})
              </button>
              <button
                type="button"
                onClick={() => setSubView('BRUTO_VALE')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  subView === 'BRUTO_VALE'
                    ? 'bg-background shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Base BD Real ({bdVale.length})
              </button>
            </div>

            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar OS, equipamento, placa..."
                className="pl-8 h-9 text-xs"
              />
            </div>

            {subView === 'CONCILIACAO_OS' && (
              <Select value={statusOsFilter} onValueChange={setStatusOsFilter}>
                <SelectTrigger className="h-9 w-48 text-xs">
                  <SelectValue placeholder="Status Conciliação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os Status</SelectItem>
                  <SelectItem value="DIVERGENCIA_HORAS">Com Divergência de Horas</SelectItem>
                  <SelectItem value="SO_VALE">Só no BD Vale</SelectItem>
                  <SelectItem value="SO_BUSATO">Só nos Lançamentos Busato</SelectItem>
                  <SelectItem value="OK">Conciliadas (OK)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9 text-xs gap-1.5"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                Importar BD Vale (BD Real)
              </Button>

              {bdVale.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
                    onClick={onApplyValeAderenciaToMemoria}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Sincronizar Aderência Vale na Memória
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs text-destructive hover:bg-destructive/10"
                    onClick={onClearVale}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Limpar BD Vale
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {bdVale.length === 0 && subView !== 'CONCILIACAO_OS' ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Nenhum relatório BD Vale (BD Real) importado neste ciclo
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                Importe a aba <strong>BD Real</strong> da planilha da Vale para comparar automaticamente
                cada O.S., horas executadas, liberações parciais e aderência Busato × Vale no período{' '}
                <strong>{cycle.shortRangeLabel}</strong>.
              </p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
                <Upload className="w-4 h-4" />
                Selecionar Arquivo BD Real (.xlsx)
              </Button>
            )}
          </CardContent>
        </Card>
      ) : subView === 'EQUIPAMENTO' ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-primary" />
              Comparativo Consolidado por Equipamento (Lançamentos BD × BD Vale)
            </CardTitle>
            <CardDescription className="text-xs">
              Confronta perdas apontadas internamente pela Busato contra as glosas/execuções registradas no BD Real da Vale
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-y border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2.5">#</th>
                  <th className="text-left px-3 py-2.5 min-w-[290px]">Equipamento (FROTA QQP)</th>
                  <th className="text-center px-2 py-2.5">Linhas BD</th>
                  <th className="text-center px-2 py-2.5">Linhas Vale</th>
                  <th className="text-right px-2.5 py-2.5">Perda Busato</th>
                  <th className="text-right px-2.5 py-2.5">Prog. Vale</th>
                  <th className="text-right px-2.5 py-2.5">Exec. Vale</th>
                  <th className="text-right px-2.5 py-2.5">Perda Vale</th>
                  <th className="text-right px-2.5 py-2.5">DF Busato %</th>
                  <th className="text-right px-2.5 py-2.5">DF Vale %</th>
                  <th className="text-right px-3 py-2.5">Dif. (p.p.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredByEq.map((r) => {
                  const absDelta = Math.abs(r.deltaAderenciaPctPoints);
                  return (
                    <tr key={r.tipoQqp} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{r.ordem}</td>
                      <td className="px-3 py-2 font-semibold">{r.tipoQqp}</td>
                      <td className="px-2 py-2 text-center font-mono">{r.osCountBusato}</td>
                      <td className="px-2 py-2 text-center font-mono">{r.osCountVale}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-amber-600">
                        {formatMinutesToHHMM(r.perdasBusatoMin)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {formatMinutesToHHMM(r.horasProgValeMin)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono text-emerald-700 font-medium">
                        {formatMinutesToHHMM(r.horasExecValeMin)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono text-destructive">
                        {formatMinutesToHHMM(r.perdasValeMin)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-bold">
                        {formatPct(r.aderenciaBusatoRatio)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-700">
                        {r.aderenciaValeCalculadaRatio !== null
                          ? formatPct(r.aderenciaValeCalculadaRatio)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.aderenciaValeCalculadaRatio === null ? (
                          '—'
                        ) : (
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              absDelta <= 0.25
                                ? 'bg-emerald-500/15 text-emerald-700'
                                : 'bg-amber-500/15 text-amber-700'
                            }`}
                          >
                            {r.deltaAderenciaPctPoints > 0 ? '+' : ''}
                            {r.deltaAderenciaPctPoints.toFixed(2).replace('.', ',')}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : subView === 'CONCILIACAO_OS' ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">
              Conciliação Linha a Linha por Ordem de Serviço (BD × BD Real)
            </CardTitle>
            <CardDescription className="text-xs">
              Une automaticamente O.S. noturnas divididas na meia-noite (19:00–23:59 + 00:00–05:30) e aponta divergências de execução
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-y border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-2.5 py-2.5">O.S.</th>
                  <th className="text-center px-2 py-2.5">Data</th>
                  <th className="text-left px-2.5 py-2.5 min-w-[250px]">Equipamento</th>
                  <th className="text-center px-2 py-2.5">Placa</th>
                  <th className="text-right px-2 py-2.5">Exec. Busato</th>
                  <th className="text-right px-2 py-2.5">Perda Busato</th>
                  <th className="text-right px-2 py-2.5">Prog. Vale</th>
                  <th className="text-right px-2 py-2.5">Exec. Vale</th>
                  <th className="text-right px-2 py-2.5">Dif. Horas</th>
                  <th className="text-center px-2 py-2.5">Ader. Vale</th>
                  <th className="text-left px-3 py-2.5">Justificativa Liberação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredByOs.slice(0, 400).map((r) => (
                  <tr key={r.key} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {r.statusConciliacao === 'OK' && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-0 text-[10px]">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Conciliado
                        </Badge>
                      )}
                      {r.statusConciliacao === 'DIVERGENCIA_HORAS' && (
                        <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 border-0 text-[10px]">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Divergência
                        </Badge>
                      )}
                      {r.statusConciliacao === 'SO_VALE' && (
                        <Badge className="bg-purple-500/15 text-purple-700 hover:bg-purple-500/20 border-0 text-[10px]">
                          Só BD Vale
                        </Badge>
                      )}
                      {r.statusConciliacao === 'SO_BUSATO' && (
                        <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/20 border-0 text-[10px]">
                          Só Busato
                        </Badge>
                      )}
                    </td>
                    <td className="px-2.5 py-2 font-mono font-semibold">{r.osDisplay}</td>
                    <td className="px-2 py-2 text-center font-mono">{formatIsoToBr(r.data)}</td>
                    <td className="px-2.5 py-2 truncate max-w-[280px]">{r.equipamento}</td>
                    <td className="px-2 py-2 text-center font-mono text-muted-foreground">
                      {r.placaBusato}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatMinutesToHHMM(r.horasBusatoExecMin)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-amber-600">
                      {r.perdaBusatoMin > 0 ? formatMinutesToHHMM(r.perdaBusatoMin) : '00:00'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatMinutesToHHMM(r.horasValeProgMin)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-medium">
                      {formatMinutesToHHMM(r.horasValeExecMin)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-mono font-bold ${
                        Math.abs(r.diffExecMin) <= 2 ? 'text-muted-foreground' : 'text-destructive'
                      }`}
                    >
                      {formatMinutesToHHMM(r.diffExecMin)}
                    </td>
                    <td className="px-2 py-2 text-center">{r.aderenciaValeStatus}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[220px]">
                      {r.justificativaVale || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredByOs.length > 400 && (
              <p className="p-3 text-center text-xs text-muted-foreground border-t">
                Exibindo 400 de {filteredByOs.length} registros. Use a busca ou filtro de status para refinar.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">
              Espelho Bruto Importado — Aba BD Real (Vale)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-y border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2.5">OS</th>
                  <th className="text-center px-2 py-2.5">Tipo</th>
                  <th className="text-center px-2 py-2.5">Data</th>
                  <th className="text-center px-2 py-2.5">Prog. Início/Fim</th>
                  <th className="text-right px-2 py-2.5">Dur. Prog.</th>
                  <th className="text-left px-2.5 py-2.5 min-w-[260px]">Equipamento</th>
                  <th className="text-center px-2 py-2.5">Exec. Início/Fim</th>
                  <th className="text-right px-2 py-2.5">Dur. Exec.</th>
                  <th className="text-center px-2 py-2.5">Aderência</th>
                  <th className="text-right px-3 py-2.5">% Vale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredBruto.slice(0, 400).map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono font-semibold">{v.os}</td>
                    <td className="px-2 py-2 text-center">{v.tipo}</td>
                    <td className="px-2 py-2 text-center font-mono">{formatIsoToBr(v.dataProg)}</td>
                    <td className="px-2 py-2 text-center font-mono text-muted-foreground">
                      {v.horaInicioProg} – {v.horaFimProg}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatMinutesToHHMM(v.duracaoProgMin)}
                    </td>
                    <td className="px-2.5 py-2 font-medium">{v.equipamento}</td>
                    <td className="px-2 py-2 text-center font-mono">
                      {v.inicioExec ? `${v.inicioExec} – ${v.fimExec}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">
                      {formatMinutesToHHMM(v.duracaoExecMin)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={
                          v.aderenciaStatus.toUpperCase() === 'NÃO'
                            ? 'border-destructive/40 text-destructive text-[10px]'
                            : v.aderenciaStatus.toUpperCase() === 'LIBERADA'
                            ? 'border-blue-500/40 text-blue-600 text-[10px]'
                            : 'border-emerald-500/40 text-emerald-700 text-[10px]'
                        }
                      >
                        {v.aderenciaStatus || 'Sim'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {formatPct(v.aderenciaRatio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredBruto.length > 400 && (
              <p className="p-3 text-center text-xs text-muted-foreground border-t">
                Exibindo 400 de {filteredBruto.length} linhas da aba BD Real.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
