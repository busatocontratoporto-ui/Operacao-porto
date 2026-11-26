import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Upload,
  Search,
  Pencil,
  Trash2,
  CalendarPlus,
  AlertTriangle,
  Clock,
  Gauge,
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
  ColaboradorNameSelect,
  type ColaboradorOption,
} from '@/components/colaboradores/ColaboradorSearchSelect';
import {
  type MedicaoCycle,
  type QqpContractItem,
  type BdLancamentoInput,
  type BdLancamentoComputed,
  computeBdLancamento,
  formatIsoToBr,
  formatMinutesToHHMM,
  formatPct,
} from '@/lib/medicao-porto-service';

interface LancamentosTabProps {
  cycle: MedicaoCycle;
  catalog: QqpContractItem[];
  lancamentos: BdLancamentoComputed[];
  colaboradores: ColaboradorOption[];
  registeredPlates: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onUpsertLancamento: (row: BdLancamentoInput) => void;
  onGenerateDayBatch: (dateIso: string) => void;
  onDeleteLancamento: (id: string) => void;
  onClearLancamentos: () => void;
  onImportBdFile: (file: File) => void;
}

const EMPTY_FORM = (defaultDate: string, defaultQqp: string): BdLancamentoInput => ({
  id: '',
  os: '',
  pde: '',
  tipoQqp: defaultQqp,
  placaTag: '',
  matricula: '',
  operadorNome: '',
  data: defaultDate,
  horaInicial: '07:00',
  horaFinal: '17:30',
  horaExtra50: '',
  horaExtra100: '',
  intervalo: '',
  manutencao: '',
  desviosAtrasos: '',
  diferencaGarantia: '',
  horimetroInicial: null,
  horimetroFinal: null,
  horimetroRealizadoManual: null,
  ccVale: '',
  localVale: '',
  observacao: '',
  empresa: 'VALE',
});

export function LancamentosTab({
  cycle,
  catalog,
  lancamentos,
  colaboradores,
  registeredPlates,
  canCreate,
  canEdit,
  canDelete,
  onUpsertLancamento,
  onGenerateDayBatch,
  onDeleteLancamento,
  onClearLancamentos,
  onImportBdFile,
}: LancamentosTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [frenteFilter, setFrenteFilter] = useState<'ALL' | 'MFE' | 'TPM'>('ALL');
  const [qqpFilter, setQqpFilter] = useState<string>('ALL');
  const [onlyLoss, setOnlyLoss] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const [modalOpen, setModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchDate, setBatchDate] = useState(cycle.startIso);
  const [form, setForm] = useState<BdLancamentoInput>(() =>
    EMPTY_FORM(cycle.startIso, catalog[0]?.tipoQqp || '')
  );

  const livePreview = useMemo(() => computeBdLancamento(form), [form]);

  const allPlates = useMemo(() => {
    const s = new Set<string>(registeredPlates);
    lancamentos.forEach((l) => {
      if (l.placaTag) s.add(l.placaTag.trim().toUpperCase());
    });
    return Array.from(s).sort();
  }, [registeredPlates, lancamentos]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return lancamentos.filter((l) => {
      if (dateFilter !== 'ALL' && l.data !== dateFilter) return false;
      if (frenteFilter !== 'ALL') {
        const isTpm = l.tipoQqp.toUpperCase().includes('TPM');
        if (frenteFilter === 'TPM' && !isTpm) return false;
        if (frenteFilter === 'MFE' && isTpm) return false;
      }
      if (qqpFilter !== 'ALL' && l.tipoQqp !== qqpFilter) return false;
      if (onlyLoss && l.perdaTotalMin <= 0) return false;
      if (
        q &&
        !l.os.toUpperCase().includes(q) &&
        !l.pde.toUpperCase().includes(q) &&
        !l.tipoQqp.toUpperCase().includes(q) &&
        !l.placaTag.toUpperCase().includes(q) &&
        !l.matricula.toUpperCase().includes(q) &&
        !(l.localVale || '').toUpperCase().includes(q) &&
        !(l.observacao || '').toUpperCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [lancamentos, dateFilter, frenteFilter, qqpFilter, onlyLoss, search]);

  const kpis = useMemo(() => {
    const totalMin = filtered.reduce((s, l) => s + l.totalHorasMin, 0);
    const perdaMin = filtered.reduce((s, l) => s + l.perdaTotalMin, 0);
    const horim = filtered.reduce((s, l) => s + l.horimetroRealizado, 0);
    const aderMedia =
      filtered.length > 0
        ? filtered.reduce((s, l) => s + l.aderenciaLinhaRatio, 0) / filtered.length
        : 1;
    return { totalMin, perdaMin, horim, aderMedia };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleSlice = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const openNewModal = () => {
    setForm(
      EMPTY_FORM(
        dateFilter !== 'ALL' ? dateFilter : cycle.startIso,
        qqpFilter !== 'ALL' ? qqpFilter : catalog[0]?.tipoQqp || ''
      )
    );
    setModalOpen(true);
  };

  const openEditModal = (row: BdLancamentoComputed) => {
    setForm({
      id: row.id,
      os: row.os,
      pde: row.pde,
      tipoQqp: row.tipoQqp,
      placaTag: row.placaTag,
      matricula: row.matricula,
      operadorNome: row.operadorNome || '',
      data: row.data,
      horaInicial: row.horaInicial,
      horaFinal: row.horaFinal,
      horaExtra50: row.horaExtra50 || '',
      horaExtra100: row.horaExtra100 || '',
      intervalo: row.intervalo || '',
      manutencao: row.manutencao || '',
      desviosAtrasos: row.desviosAtrasos || '',
      diferencaGarantia: row.diferencaGarantia || '',
      horimetroInicial: row.horimetroInicial ?? null,
      horimetroFinal: row.horimetroFinal ?? null,
      horimetroRealizadoManual: row.horimetroRealizadoManual ?? null,
      ccVale: row.ccVale || '',
      localVale: row.localVale || '',
      observacao: row.observacao || '',
      empresa: row.empresa || 'VALE',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tipoQqp.trim() || !form.data) return;
    onUpsertLancamento({
      ...form,
      id: form.id || `bd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportBdFile(f);
          e.target.value = '';
        }}
      />

      {/* KPIs Lançamentos BD */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Linhas de Atendimento (BD)
            </p>
            <p className="text-2xl font-bold mt-1 text-foreground">{filtered.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Total ciclo: {lancamentos.length} linhas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Total Horas (AE)
            </p>
            <p className="text-xl font-bold mt-1 text-blue-600">
              {formatMinutesToHHMM(kpis.totalMin)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {(kpis.totalMin / 60).toFixed(1).replace('.', ',')} h acumuladas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-emerald-600" />
              Horímetro Realizado (AH)
            </p>
            <p className="text-xl font-bold mt-1 text-emerald-600">
              {kpis.horim.toFixed(2).replace('.', ',')} h
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Alimenta direto a Memória de Cálculo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Desvios / Atrasos (AB)
            </p>
            <p className="text-xl font-bold mt-1 text-amber-600">
              {formatMinutesToHHMM(kpis.perdaMin)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Alimenta direto a aba DF (Perdas)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              % Execução Média (BZ)
            </p>
            <p className="text-xl font-bold mt-1 text-primary">{formatPct(kpis.aderMedia)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Média das linhas filtradas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros & Ações */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="OS, PDE, placa, matrícula, local..."
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <Select
                value={dateFilter}
                onValueChange={(v) => {
                  setDateFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-40 text-xs">
                  <SelectValue placeholder="Data no Ciclo" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="ALL">Todas Datas (21–20)</SelectItem>
                  {cycle.dates.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {formatIsoToBr(dt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={frenteFilter}
                onValueChange={(v) => {
                  setFrenteFilter(v as 'ALL' | 'MFE' | 'TPM');
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder="Frente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">MFE + TPM</SelectItem>
                  <SelectItem value="MFE">Frente MFE</SelectItem>
                  <SelectItem value="TPM">Frente TPM</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={qqpFilter}
                onValueChange={(v) => {
                  setQqpFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-64 text-xs">
                  <SelectValue placeholder="Filtrar Equipamento QQP" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="ALL">Todos os 34 Equipamentos QQP</SelectItem>
                  {catalog.map((c) => (
                    <SelectItem key={c.tipoQqp} value={c.tipoQqp} className="text-xs">
                      {c.tipoQqp.replace(/^BUSATO_/, '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => {
                  setOnlyLoss((v) => !v);
                  setPage(1);
                }}
                className={`h-9 px-3 rounded-md border text-xs font-semibold transition-colors ${
                  onlyLoss
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-700'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Com Desvio / Perda
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canCreate && (
                <>
                  <Button size="sm" className="h-9 text-xs gap-1.5" onClick={openNewModal}>
                    <Plus className="w-3.5 h-3.5" />
                    Novo Atendimento
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs gap-1.5"
                    onClick={() => {
                      setBatchDate(dateFilter !== 'ALL' ? dateFilter : cycle.startIso);
                      setBatchModalOpen(true);
                    }}
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Gerar Dia Padrão
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Importar Aba BD (.xlsx)
                  </Button>
                </>
              )}
              {canDelete && lancamentos.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-xs text-destructive hover:bg-destructive/10"
                  onClick={onClearLancamentos}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Limpar Ciclo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela BD */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm font-bold">
              Aba BD — Linhas Diárias de Atendimento ({cycle.shortRangeLabel})
            </CardTitle>
            <CardDescription className="text-xs">
              Cálculo automático de Subtotal (AC), Total Horas (AE), Horímetro Realizado (AH), Disponível (AI), % Aderência (BZ) e h/exec (CA)
            </CardDescription>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="font-mono">
                Pág. {currentPage}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-muted/70 border-y border-border font-bold text-muted-foreground uppercase">
                <th className="text-left px-2.5 py-2">O.S + Compl. (O)</th>
                <th className="text-center px-2 py-2">PDE (P)</th>
                <th className="text-left px-2.5 py-2 min-w-[260px]">Tipo | QQP (Q)</th>
                <th className="text-center px-2 py-2">Placa/Tag (R)</th>
                <th className="text-center px-2 py-2">Matrícula (S)</th>
                <th className="text-center px-2 py-2">Data (T)</th>
                <th className="text-center px-2 py-2">Início/Fim</th>
                <th className="text-right px-2 py-2">Desvios (AB)</th>
                <th className="text-right px-2 py-2">Total H (AE)</th>
                <th className="text-right px-2 py-2">Hor. Ini</th>
                <th className="text-right px-2 py-2">Hor. Fim</th>
                <th className="text-right px-2 py-2">Hor. Real (AH)</th>
                <th className="text-right px-2 py-2">Disp. (AI)</th>
                <th className="text-left px-2 py-2">CC / Local Vale</th>
                <th className="text-right px-2 py-2">% (BZ)</th>
                <th className="text-right px-2 py-2">h/exec</th>
                {(canEdit || canDelete) && <th className="text-center px-2 py-2">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visibleSlice.length === 0 ? (
                <tr>
                  <td colSpan={17} className="py-10 text-center text-xs text-muted-foreground">
                    Nenhum lançamento encontrado para os filtros atuais neste ciclo ({cycle.shortRangeLabel}).
                  </td>
                </tr>
              ) : (
                visibleSlice.map((l) => (
                  <tr
                    key={l.id}
                    className={`hover:bg-muted/35 ${
                      l.perdaTotalMin > 0 ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    <td className="px-2.5 py-1.5 font-mono font-semibold text-foreground">
                      {l.os || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                      {l.pde || '—'}
                    </td>
                    <td className="px-2.5 py-1.5 font-medium truncate max-w-[290px]" title={l.tipoQqp}>
                      {l.tipoQqp}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono font-semibold">
                      {l.placaTag || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                      {l.matricula || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">
                      {formatIsoToBr(l.data)}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-muted-foreground whitespace-nowrap">
                      {l.horaInicial}–{l.horaFinal}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono font-semibold ${
                        l.perdaTotalMin > 0 ? 'text-amber-600' : 'text-muted-foreground/40'
                      }`}
                    >
                      {l.perdaTotalMin > 0 ? formatMinutesToHHMM(l.perdaTotalMin) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-medium">
                      {formatMinutesToHHMM(l.totalHorasMin)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {l.horimetroInicial !== null && l.horimetroInicial !== undefined
                        ? l.horimetroInicial.toFixed(1)
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {l.horimetroFinal !== null && l.horimetroFinal !== undefined
                        ? l.horimetroFinal.toFixed(1)
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                      {l.horimetroRealizado.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                      {l.horimetroDisponivel.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-[160px] text-muted-foreground">
                      {[l.ccVale, l.localVale].filter(Boolean).join(' • ') || '—'}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-mono font-bold ${
                        l.aderenciaLinhaRatio < 0.95 ? 'text-destructive' : 'text-emerald-600'
                      }`}
                    >
                      {formatPct(l.aderenciaLinhaRatio)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {formatMinutesToHHMM(l.horasExecutadasMin)}
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-2 py-1.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(l)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                              title="Editar linha"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDeleteLancamento(l.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              title="Excluir linha"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal Lançamento Individual BD */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {form.id ? 'Editar Linha de Atendimento (BD)' : 'Novo Lançamento Diário (BD)'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ciclo {cycle.fullLabel} — todos os cálculos de horas, horímetro e DF são atualizados instantaneamente
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Data do Atendimento (T) *</Label>
                <Input
                  type="date"
                  min={cycle.startIso}
                  max={cycle.endIso}
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="h-9 text-xs mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">O.S + Complementar (O)</Label>
                <Input
                  value={form.os}
                  onChange={(e) => setForm({ ...form, os: e.target.value })}
                  placeholder="Ex: 2026S31708"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">PDE / Boletim (P)</Label>
                <Input
                  value={form.pde}
                  onChange={(e) => setForm({ ...form, pde: e.target.value })}
                  placeholder="Ex: 005045"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Equipamento Contratual — Tipo | QQP (Q) *</Label>
                <Select
                  value={form.tipoQqp}
                  onValueChange={(v) => setForm({ ...form, tipoQqp: v })}
                >
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="Selecione o item da Frota QQP..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {catalog.map((c) => (
                      <SelectItem key={c.tipoQqp} value={c.tipoQqp} className="text-xs">
                        {c.tipoQqp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Placa / Tag (R)</Label>
                <Input
                  list="medicao-plates-list"
                  value={form.placaTag}
                  onChange={(e) => setForm({ ...form, placaTag: e.target.value.toUpperCase() })}
                  placeholder="Ex: TOR 0C66 ou MC 751"
                  className="h-9 text-xs mt-1 font-mono"
                />
                <datalist id="medicao-plates-list">
                  {allPlates.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Operador / Motorista Cadastrado</Label>
                <div className="mt-1">
                  <ColaboradorNameSelect
                    colaboradores={colaboradores}
                    value={form.operadorNome || ''}
                    roleFilter="operacional"
                    allowClear
                    allowCustom
                    placeholder="Selecionar operador cadastrado..."
                    onValueChange={(nome) => {
                      setForm((prev) => ({
                        ...prev,
                        operadorNome: nome,
                        matricula: prev.matricula || nome,
                      }));
                    }}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Matrícula / Identificação no BD (S)</Label>
                <Input
                  value={form.matricula}
                  onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                  placeholder="Ex: 22425 ou nome do operador"
                  className="h-10 text-xs mt-1 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Hora Inicial (V)</Label>
                <Input
                  type="time"
                  value={form.horaInicial}
                  onChange={(e) => setForm({ ...form, horaInicial: e.target.value })}
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Hora Final (W)</Label>
                <Input
                  type="time"
                  value={form.horaFinal}
                  onChange={(e) => setForm({ ...form, horaFinal: e.target.value })}
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Manut. HH:MM (AA)</Label>
                <Input
                  value={form.manutencao || ''}
                  onChange={(e) => setForm({ ...form, manutencao: e.target.value })}
                  placeholder="00:00"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-amber-700">Desvios/Atrasos HH:MM (AB)</Label>
                <Input
                  value={form.desviosAtrasos || ''}
                  onChange={(e) => setForm({ ...form, desviosAtrasos: e.target.value })}
                  placeholder="Ex: 01:20"
                  className="h-9 text-xs mt-1 font-mono border-amber-500/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Horímetro Inicial (AF)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.horimetroInicial ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      horimetroInicial: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Ex: 1498.00"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Horímetro Final (AG)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.horimetroFinal ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      horimetroFinal: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Ex: 1507.00"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Horímetro Direto (Opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.horimetroRealizadoManual ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      horimetroRealizadoManual:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Se sem Inicial/Final"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">CC / PA Vale (AL)</Label>
                <Input
                  value={form.ccVale || ''}
                  onChange={(e) => setForm({ ...form, ccVale: e.target.value })}
                  placeholder="Ex: 0001540098"
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Local Vale (AM)</Label>
                <Input
                  value={form.localVale || ''}
                  onChange={(e) => setForm({ ...form, localVale: e.target.value })}
                  placeholder="Ex: ASPERSÃO / PI01 / TRH07"
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Observação (AN)</Label>
                <Input
                  value={form.observacao || ''}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Ex: TROCA EQUIPAMENTO"
                  className="h-9 text-xs mt-1"
                />
              </div>
            </div>

            {/* Prévia dos Cálculos da Linha */}
            <div className="grid grid-cols-4 gap-2 p-3 rounded-lg bg-muted/50 border border-border text-center">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                  Total Horas (AE)
                </p>
                <p className="text-sm font-mono font-bold mt-0.5">
                  {formatMinutesToHHMM(livePreview.totalHorasMin)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                  Horímetro Real. (AH)
                </p>
                <p className="text-sm font-mono font-bold text-emerald-600 mt-0.5">
                  {livePreview.horimetroRealizado.toFixed(2)} h
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                  h/exec (CA)
                </p>
                <p className="text-sm font-mono font-bold text-blue-600 mt-0.5">
                  {formatMinutesToHHMM(livePreview.horasExecutadasMin)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                  % Aderência (BZ)
                </p>
                <p
                  className={`text-sm font-mono font-bold mt-0.5 ${
                    livePreview.aderenciaLinhaRatio < 0.95 ? 'text-destructive' : 'text-emerald-600'
                  }`}
                >
                  {formatPct(livePreview.aderenciaLinhaRatio)}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Salvar Lançamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Gerar Dia Padrão */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Gerar Atendimentos Padrão do Dia</DialogTitle>
            <DialogDescription className="text-xs">
              Cria automaticamente as linhas habituais diurnas (07:00–17:30) e noturnas (19:00–05:30 para equipamentos 24h) da frota QQP para a data escolhida, evitando retrabalho diário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Escolha a Data dentro do Ciclo ({cycle.shortRangeLabel})</Label>
              <Input
                type="date"
                min={cycle.startIso}
                max={cycle.endIso}
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                className="h-9 text-xs mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBatchModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onGenerateDayBatch(batchDate);
                  setBatchModalOpen(false);
                }}
              >
                Gerar Linhas do Dia
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
