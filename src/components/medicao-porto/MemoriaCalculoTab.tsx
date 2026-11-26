import React, { useState } from 'react';
import {
  Calculator,
  Pencil,
  Plus,
  Trash2,
  Layers,
  DollarSign,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
  type MemoriaCalculoConsolidado,
  type MemoriaEquipmentRow,
  type MemoriaItemComplementar,
  type QqpCycleOverride,
  formatCurrencyBRL,
  formatMinutesToHHMMSS,
  formatPct,
} from '@/lib/medicao-porto-service';

interface MemoriaCalculoTabProps {
  cycle: MedicaoCycle;
  memoria: MemoriaCalculoConsolidado;
  dfParams: DfCycleParams;
  canEdit: boolean;
  onChangeFonteAderencia: (fonte: 'BUSATO' | 'VALE') => void;
  onSaveEquipmentOverride: (tipoQqp: string, override: QqpCycleOverride) => void;
  onUpsertComplementar: (item: MemoriaItemComplementar) => void;
  onDeleteComplementar: (id: string) => void;
}

export function MemoriaCalculoTab({
  cycle,
  memoria,
  dfParams,
  canEdit,
  onChangeFonteAderencia,
  onSaveEquipmentOverride,
  onUpsertComplementar,
  onDeleteComplementar,
}: MemoriaCalculoTabProps) {
  const [editingRow, setEditingRow] = useState<MemoriaEquipmentRow | null>(null);
  const [editEq, setEditEq] = useState('');
  const [editHr, setEditHr] = useState('');
  const [editMo, setEditMo] = useState('');
  const [editHrCheia, setEditHrCheia] = useState('');
  const [editValePct, setEditValePct] = useState('');
  const [editTurno, setEditTurno] = useState<'12h' | '24h'>('12h');

  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compId, setCompId] = useState('');
  const [compCat, setCompCat] =
    useState<MemoriaItemComplementar['categoria']>('EVENTUAL');
  const [compDesc, setCompDesc] = useState('');
  const [compValor, setCompValor] = useState('');
  const [compHoras, setCompHoras] = useState('');

  const openEditRow = (r: MemoriaEquipmentRow) => {
    setEditingRow(r);
    setEditTurno(r.turno);
    setEditEq(String(r.valorUnitEq));
    setEditHr(String(r.valorUnitHr));
    setEditMo(String(r.valorUnitMo));
    setEditHrCheia(String(r.valorMedicaoHrCheia));
    setEditValePct(
      r.aderenciaValeRatio !== null ? (r.aderenciaValeRatio * 100).toFixed(2) : ''
    );
  };

  const handleConfirmEditRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    const valeNum = editValePct.trim() === '' ? null : Number(editValePct.replace(',', '.')) / 100;
    onSaveEquipmentOverride(editingRow.tipoQqp, {
      turno: editTurno,
      valorEq: Number(editEq.replace(',', '.')) || 0,
      valorHr: Number(editHr.replace(',', '.')) || 0,
      valorMo: Number(editMo.replace(',', '.')) || 0,
      valorHrCheia: Number(editHrCheia.replace(',', '.')) || 0,
      aderenciaValeManualRatio: valeNum !== null && !isNaN(valeNum) ? valeNum : null,
    });
    setEditingRow(null);
  };

  const openNewComp = (existing?: MemoriaItemComplementar) => {
    if (existing) {
      setCompId(existing.id);
      setCompCat(existing.categoria);
      setCompDesc(existing.descricao);
      setCompValor(String(existing.valor));
      setCompHoras(existing.horas !== undefined ? String(existing.horas) : '');
    } else {
      setCompId('');
      setCompCat('EVENTUAL');
      setCompDesc('');
      setCompValor('');
      setCompHoras('');
    }
    setCompModalOpen(true);
  };

  const handleSaveComp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compDesc.trim()) return;
    onUpsertComplementar({
      id: compId || `comp-${Date.now()}`,
      categoria: compCat,
      descricao: compDesc.trim(),
      valor: Number(compValor.replace(',', '.')) || 0,
      horas: compHoras.trim() ? Number(compHoras.replace(',', '.')) : undefined,
    });
    setCompModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* KPIs Executivos de Fechamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              Valor Total Fechamento
            </p>
            <p className="text-xl font-extrabold mt-1 text-primary">
              {formatCurrencyBRL(memoria.valorTotalFechamentoGeral)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Frota + Eventuais / Indiretos ({cycle.label})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fechamento Frota Habitual
            </p>
            <p className="text-lg font-bold mt-1 text-foreground">
              {formatCurrencyBRL(memoria.totalFechamentoFrota)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Locação (EQ+HR) + Mão de Obra
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Valor Esperado (Teto)
            </p>
            <p className="text-lg font-bold mt-1 text-slate-600">
              {formatCurrencyBRL(memoria.totalEsperadoFrota)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              EQ Fixo + MO + Medição HR Cheia
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
              Descontos / Variação HR
            </p>
            <p className="text-lg font-bold mt-1 text-amber-600">
              {formatCurrencyBRL(memoria.totalDescontosFrota)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Esperado (−) Fechamento Frota
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Aderência Fechamento
            </p>
            <div className="flex items-center justify-between mt-1">
              <span
                className={`text-xl font-bold ${
                  memoria.aderenciaMediaConsideradaRatio >= 0.95
                    ? 'text-emerald-600'
                    : 'text-destructive'
                }`}
              >
                {formatPct(memoria.aderenciaMediaConsideradaRatio)}
              </span>
              <Badge variant="outline" className="text-[10px]">
                Base: {dfParams.fonteAderenciaMemoria}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Horímetro total: {memoria.totalHorimetroFrota.toFixed(1).replace('.', ',')} h
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controles da Memória */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold">Base da Coluna I (Aderência Aplicada):</span>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onChangeFonteAderencia('BUSATO')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  dfParams.fonteAderenciaMemoria === 'BUSATO'
                    ? 'bg-background shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Aderência Busato (DF) — {formatPct(memoria.aderenciaMediaBusatoRatio)}
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onChangeFonteAderencia('VALE')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  dfParams.fonteAderenciaMemoria === 'VALE'
                    ? 'bg-background shadow-sm text-emerald-700'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Aderência VALE —{' '}
                {memoria.aderenciaMediaValeRatio !== null
                  ? formatPct(memoria.aderenciaMediaValeRatio)
                  : 'Não informada'}
              </button>
            </div>
          </div>

          {canEdit && (
            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => openNewComp()}>
              <Plus className="w-3.5 h-3.5" />
              Adicionar Eventual / Custo Indireto / Ajuste
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tabela Principal: Memorial de Cálculo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center justify-between flex-wrap gap-2">
            <span>
              Cálculo Aderência &amp; Medição de Equipamentos — PERÍODO: {cycle.shortRangeLabel}
            </span>
            <Badge variant="outline" className="text-[11px] font-mono">
              Regra J: SE(Aderência &gt;= 95%; 1,000; Aderência)
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Espelho integral da aba Memorial de Cálculo: Locação (EQ Fixo × Qnt Aderência + Horímetro × R$/h) + Mão de Obra (MO × Qnt Aderência)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                <th colSpan={10} className="px-3 py-1.5 text-left border-r border-slate-700">
                  Frota &amp; Índices de Aderência (A–J)
                </th>
                <th colSpan={4} className="px-2 py-1.5 text-center bg-blue-950 border-r border-slate-700">
                  Locação (K–N)
                </th>
                <th colSpan={3} className="px-2 py-1.5 text-center bg-emerald-950 border-r border-slate-700">
                  Mão de Obra (O–Q)
                </th>
                <th colSpan={5} className="px-2 py-1.5 text-center bg-slate-800">
                  Fechamento Mensal (R–W)
                </th>
              </tr>
              <tr className="bg-muted/70 border-b border-border font-bold text-muted-foreground">
                <th className="text-left px-2.5 py-2 min-w-[260px]">FROTA (QQP)</th>
                <th className="text-center px-1.5 py-2">Turno</th>
                <th className="text-right px-2 py-2">Manut.</th>
                <th className="text-right px-2 py-2">Soma Horí.</th>
                <th className="text-right px-2 py-2">Meta Mês</th>
                <th className="text-right px-2 py-2">Trab. Mês</th>
                <th className="text-right px-2 py-2">Ader. %</th>
                <th className="text-right px-2 py-2">VALE %</th>
                <th className="text-right px-2 py-2">Aplicada</th>
                <th className="text-center px-2 py-2 border-r border-border">Qnt Ader.</th>
                <th className="text-right px-2 py-2">Unit. EQ</th>
                <th className="text-right px-2 py-2">Unit. HR</th>
                <th className="text-right px-2 py-2">EQ Real</th>
                <th className="text-right px-2 py-2 border-r border-border">HR Real</th>
                <th className="text-right px-2 py-2">Unit. MO</th>
                <th className="text-right px-2 py-2">HR Cheia</th>
                <th className="text-right px-2 py-2 border-r border-border">MO Real</th>
                <th className="text-right px-2 py-2">Esperado</th>
                <th className="text-right px-2.5 py-2 bg-primary/5 text-primary">Fechamento</th>
                <th className="text-right px-2 py-2">Descontos</th>
                <th className="text-left px-2 py-2">Grupo</th>
                {canEdit && <th className="px-2 py-2 text-center">Editar</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {memoria.rows.map((r) => {
                const penalized = r.qntAderencia < 1;
                return (
                  <tr
                    key={r.tipoQqp}
                    className={`hover:bg-muted/35 ${penalized ? 'bg-destructive/5' : ''}`}
                  >
                    <td className="px-2.5 py-1.5 font-semibold text-foreground">{r.tipoQqp}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono">{r.turno}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-600">
                      {formatMinutesToHHMMSS(r.somaManutMin)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-600">
                      {r.somaHorimetro.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {formatMinutesToHHMMSS(r.metaHorasMin)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {formatMinutesToHHMMSS(r.horasTrabalhadasMin)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {formatPct(r.aderenciaBusatoRatio)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-emerald-700">
                      {r.aderenciaValeRatio !== null ? formatPct(r.aderenciaValeRatio) : '—'}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono font-bold ${
                        penalized ? 'text-destructive' : 'text-emerald-600'
                      }`}
                    >
                      {formatPct(r.aderenciaConsideradaRatio)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-center font-mono font-bold border-r border-border ${
                        penalized ? 'text-destructive' : 'text-foreground'
                      }`}
                    >
                      {r.qntAderencia.toFixed(3).replace('.', ',')}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {formatCurrencyBRL(r.valorUnitEq)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {formatCurrencyBRL(r.valorUnitHr)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {formatCurrencyBRL(r.valorEqReal)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono border-r border-border">
                      {formatCurrencyBRL(r.valorMedicaoHrReal)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {formatCurrencyBRL(r.valorUnitMo)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {formatCurrencyBRL(r.valorMedicaoHrCheia)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono border-r border-border">
                      {formatCurrencyBRL(r.valorMedicaoMoReal)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {formatCurrencyBRL(r.valorEsperado)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono font-bold bg-primary/5 text-primary">
                      {formatCurrencyBRL(r.valorFechamento)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono ${
                        r.descontosVariacao > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrencyBRL(r.descontosVariacao)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                      {r.grupo}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => openEditRow(r)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                          title="Editar tarifas unitárias / aderência Vale"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/80 border-t-2 border-border font-bold">
                <td colSpan={3} className="px-2.5 py-2.5 text-right uppercase">
                  Subtotal Frota Habitual (34 itens):
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-blue-600">
                  {memoria.totalHorimetroFrota.toFixed(2).replace('.', ',')}
                </td>
                <td colSpan={2} />
                <td className="px-2 py-2.5 text-right font-mono">
                  {formatPct(memoria.aderenciaMediaBusatoRatio)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-emerald-700">
                  {memoria.aderenciaMediaValeRatio !== null
                    ? formatPct(memoria.aderenciaMediaValeRatio)
                    : '—'}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-primary">
                  {formatPct(memoria.aderenciaMediaConsideradaRatio)}
                </td>
                <td className="border-r border-border" />
                <td colSpan={2} />
                <td className="px-2 py-2.5 text-right font-mono">
                  {formatCurrencyBRL(memoria.totalLocacaoEqReal)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono border-r border-border">
                  {formatCurrencyBRL(memoria.totalLocacaoHrReal)}
                </td>
                <td colSpan={2} />
                <td className="px-2 py-2.5 text-right font-mono border-r border-border">
                  {formatCurrencyBRL(memoria.totalMaoDeObraReal)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono">
                  {formatCurrencyBRL(memoria.totalEsperadoFrota)}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono bg-primary/10 text-primary">
                  {formatCurrencyBRL(memoria.totalFechamentoFrota)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-amber-600">
                  {formatCurrencyBRL(memoria.totalDescontosFrota)}
                </td>
                <td colSpan={canEdit ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Grid Inferior: Resumo por Grupo (Colunas U, V, W) + Itens Complementares / Eventuais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Consolidação por Grupo de Equipamentos (Colunas U, V, W)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-y border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2">Grupo</th>
                  <th className="text-center px-2 py-2">Qtd</th>
                  <th className="text-right px-2 py-2">Horas Somadas (U)</th>
                  <th className="text-right px-2 py-2">Qnt Ader. (V)</th>
                  <th className="text-right px-2 py-2">DF Média</th>
                  <th className="text-right px-3 py-2">Fechamento Grupo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {memoria.grupos.map((g) => (
                  <tr key={g.grupo} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-semibold">{g.grupo}</td>
                    <td className="px-2 py-2 text-center font-mono">{g.qtdEquipamentos}</td>
                    <td className="px-2 py-2 text-right font-mono text-blue-600">
                      {g.horasSomadas.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {g.qntAderenciaSomada.toFixed(3).replace('.', ',')}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">
                      {formatPct(g.aderenciaMediaRatio)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                      {formatCurrencyBRL(g.valorFechamentoGrupo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Custo Indireto, Mobilização, Eventuais &amp; Ajustes
              </CardTitle>
              <CardDescription className="text-xs">
                Linhas adicionais que compõem o valor final da medição (Linhas 37–46 do modelo)
              </CardDescription>
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openNewComp()}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Incluir
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-y border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2">Descrição</th>
                  <th className="text-center px-2 py-2">Categoria</th>
                  <th className="text-right px-3 py-2">Valor (R$)</th>
                  {canEdit && <th className="text-center px-2 py-2">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {memoria.itensComplementares.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{c.descricao}</td>
                    <td className="px-2 py-2 text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {c.categoria}
                      </Badge>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-bold ${
                        c.valor < 0 ? 'text-destructive' : 'text-foreground'
                      }`}
                    >
                      {formatCurrencyBRL(c.valor)}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openNewComp(c)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteComplementar(c.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 border-t border-border font-bold">
                  <td colSpan={2} className="px-3 py-2 text-right">
                    Subtotal Complementares / Eventuais:
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatCurrencyBRL(memoria.totalComplementares)}
                  </td>
                  {canEdit && <td />}
                </tr>
                <tr className="bg-primary/10 border-t-2 border-primary/30 font-extrabold text-primary text-sm">
                  <td colSpan={2} className="px-3 py-3 text-right uppercase">
                    Total Geral Medição Porto ({cycle.label}):
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {formatCurrencyBRL(memoria.valorTotalFechamentoGeral)}
                  </td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Modal Edição de Linha QQP */}
      <Dialog open={Boolean(editingRow)} onOpenChange={(o) => !o && setEditingRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Ajustar Parâmetros Contratuais da Linha</DialogTitle>
            <DialogDescription className="text-xs font-mono">
              {editingRow?.tipoQqp}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmEditRow} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Turno Contratual (Coluna B)</Label>
                <Select value={editTurno} onValueChange={(v) => setEditTurno(v as '12h' | '24h')}>
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">12h</SelectItem>
                    <SelectItem value="24h">24h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Aderência VALE % (Coluna H)</Label>
                <Input
                  value={editValePct}
                  onChange={(e) => setEditValePct(e.target.value)}
                  placeholder="Ex: 99.28 (vazio = auto BD Vale)"
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Valor Unitário EQ (R$ - Col. K)</Label>
                <Input
                  value={editEq}
                  onChange={(e) => setEditEq(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Valor Unitário HR (R$ - Col. L)</Label>
                <Input
                  value={editHr}
                  onChange={(e) => setEditHr(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Valor Unitário MO (R$ - Col. O)</Label>
                <Input
                  value={editMo}
                  onChange={(e) => setEditMo(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Medição HR Cheia (R$ - Col. P)</Label>
                <Input
                  value={editHrCheia}
                  onChange={(e) => setEditHrCheia(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingRow(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Salvar Linha
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Item Complementar / Eventual */}
      <Dialog open={compModalOpen} onOpenChange={setCompModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {compId ? 'Editar Item de Fechamento' : 'Novo Item Complementar / Eventual'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Adicione medições eventuais, rateio de custo indireto, mobilização ou descontos (use sinal negativo para glosas)
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveComp} className="space-y-3">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select
                value={compCat}
                onValueChange={(v) => setCompCat(v as MemoriaItemComplementar['categoria'])}
              >
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVENTUAL">Serviço Eventual / Spot</SelectItem>
                  <SelectItem value="CUSTO_INDIRETO">Custo Fixo Indireto</SelectItem>
                  <SelectItem value="MOBILIZACAO">Mobilização / Desmobilização</SelectItem>
                  <SelectItem value="AJUSTE_DESCONTO">Ajuste / Glosa / Desconto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Descrição *</Label>
              <Input
                value={compDesc}
                onChange={(e) => setCompDesc(e.target.value)}
                placeholder="Ex: Medição Eventuais Vale Out/Nov"
                className="h-9 text-xs mt-1"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor (R$) *</Label>
                <Input
                  value={compValor}
                  onChange={(e) => setCompValor(e.target.value)}
                  placeholder="Ex: 130424.28 ou -5000"
                  className="h-9 text-xs mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Horas Referência (Opcional)</Label>
                <Input
                  value={compHoras}
                  onChange={(e) => setCompHoras(e.target.value)}
                  placeholder="Ex: 315.5"
                  className="h-9 text-xs mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
