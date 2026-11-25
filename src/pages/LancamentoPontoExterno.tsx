import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Loader2,
  Send,
  Search,
  Calendar,
  ShieldCheck,
  UserCheck,
  Plus,
  Users,
} from 'lucide-react';
import busatoGlobo from '@/assets/busato-globo.png';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ColaboradorSearchSelect, ColaboradorNameSelect, type ColaboradorOption } from '@/components/colaboradores/ColaboradorSearchSelect';

interface ExternalLinkMeta {
  id: string;
  titulo: string;
  responsavel_nome: string;
  individual: boolean;
}

interface ExternalLaunchRow {
  id: string;
  employee_id: string;
  employee_name: string;
  cargo: string;
  letra: string;
  date: string;
  status: string;
  observation: string;
  launched_by_name: string;
  created_at: string;
}

interface ExternalContextResponse {
  valid: boolean;
  reason?: string;
  link?: ExternalLinkMeta;
  colaboradores?: ColaboradorOption[];
  lancamentos?: ExternalLaunchRow[];
}

interface DraftEntry {
  rowId: string;
  employee_id: string;
  date: string;
  status: string;
  observation: string;
  error?: string;
}

const PONTO_STATUS_OPTIONS = [
  { value: 'falta_injustificada', label: 'Falta Injustificada' },
  { value: 'falta_justificada', label: 'Falta Justificada' },
  { value: 'extra', label: 'Hora Extra' },
  { value: 'banco_horas', label: 'Banco de Horas' },
  { value: 'abono', label: 'Abono' },
  { value: 'presente', label: 'Presença Confirmada' },
];

const STATUS_LABELS: Record<string, string> = {
  presente: 'Presença Confirmada',
  falta_injustificada: 'Falta Injustificada',
  falta: 'Falta Injustificada',
  falta_justificada: 'Falta Justificada',
  extra: 'Hora Extra',
  banco_horas: 'Banco de Horas',
  abono: 'Abono',
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'falta_injustificada':
    case 'falta':
      return 'bg-destructive/15 text-destructive border-destructive/25';
    case 'falta_justificada':
      return 'bg-amber-500/15 text-amber-700 border-amber-500/25';
    case 'extra':
      return 'bg-purple-500/15 text-purple-700 border-purple-500/25';
    case 'banco_horas':
      return 'bg-blue-500/15 text-blue-700 border-blue-500/25';
    case 'abono':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/25';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function getOrCreateDeviceId(): string {
  try {
    const key = 'busato_ext_ponto_device_id';
    let existing = localStorage.getItem(key);
    if (!existing) {
      existing = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, existing);
    }
    return existing;
  } catch {
    return 'anonymous_device';
  }
}

function createDraftRow(defaultDate: string, employeeId = ''): DraftEntry {
  return {
    rowId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    employee_id: employeeId,
    date: defaultDate,
    status: 'falta_injustificada',
    observation: '',
  };
}

function formatDateBr(iso: string): string {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function LancamentoPontoExterno() {
  const { token } = useParams<{ token: string }>();
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [valid, setValid] = useState(false);
  const [invalidReason, setInvalidReason] = useState('');
  const [linkMeta, setLinkMeta] = useState<ExternalLinkMeta | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorOption[]>([]);
  const [lancamentos, setLancamentos] = useState<ExternalLaunchRow[]>([]);

  const [launcherName, setLauncherName] = useState<string>(() => {
    try {
      return localStorage.getItem('busato_ext_ponto_launcher_name') || '';
    } catch {
      return '';
    }
  });
  const [defaultDate, setDefaultDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<DraftEntry[]>(() => [
    createDraftRow(new Date().toISOString().slice(0, 10)),
  ]);

  // Modal de seleção múltipla rápida
  const [multiModalOpen, setMultiModalOpen] = useState(false);
  const [multiSearch, setMultiSearch] = useState('');
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());

  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExternalLaunchRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // IMPORTANTE: depende apenas de [token, deviceId] para NUNCA recarregar a página ao digitar nos campos!
  const loadContext = useCallback(
    async (silent = false) => {
      if (!token) {
        setValid(false);
        setInvalidReason('Token de acesso não informado.');
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);

      const { data, error } = await supabase.rpc('get_external_ponto_context' as never, {
        p_token: token,
        p_device_id: deviceId,
      } as never);

      if (error || !data) {
        if (!silent) {
          setValid(false);
          setInvalidReason('Não foi possível validar este link no momento. Verifique sua conexão.');
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const res = data as unknown as ExternalContextResponse;
      if (!res.valid) {
        setValid(false);
        setInvalidReason(res.reason || 'Link inválido ou desativado.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setValid(true);
      setLinkMeta(res.link || null);
      setColaboradores(res.colaboradores || []);
      setLancamentos(res.lancamentos || []);

      if (res.link?.responsavel_nome) {
        setLauncherName((prev) => prev || res.link!.responsavel_nome);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [token, deviceId]
  );

  useEffect(() => {
    loadContext(false);
  }, [loadContext]);

  function updateEntry(rowId: string, patch: Partial<DraftEntry>) {
    setEntries((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch, error: undefined } : row))
    );
  }

  function addEmptyRow() {
    setEntries((prev) => [...prev, createDraftRow(defaultDate)]);
  }

  function removeRow(rowId: string) {
    setEntries((prev) => {
      if (prev.length <= 1) return [createDraftRow(defaultDate)];
      return prev.filter((r) => r.rowId !== rowId);
    });
  }

  function handleDefaultDateChange(nextDate: string) {
    setDefaultDate(nextDate);
    setEntries((prev) =>
      prev.map((row) => ({
        ...row,
        date: row.date === defaultDate || !row.date ? nextDate : row.date,
      }))
    );
  }

  function openMultiSelectModal() {
    setMultiSearch('');
    setMultiSelectedIds(new Set());
    setMultiModalOpen(true);
  }

  function toggleMultiSelectId(id: string) {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmAddMultiSelected() {
    if (multiSelectedIds.size === 0) {
      setMultiModalOpen(false);
      return;
    }
    const existingChosen = new Set(entries.map((e) => e.employee_id).filter(Boolean));
    const newRows = Array.from(multiSelectedIds)
      .filter((id) => !existingChosen.has(id))
      .map((id) => createDraftRow(defaultDate, id));

    setEntries((prev) => {
      // Remove linhas completamente vazias antes de anexar os colaboradores selecionados
      const nonEmpty = prev.filter((r) => r.employee_id);
      const merged = [...nonEmpty, ...newRows];
      return merged.length > 0 ? merged : [createDraftRow(defaultDate)];
    });
    setMultiModalOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    const finalLauncher = (launcherName || linkMeta?.responsavel_nome || '').trim();
    if (!finalLauncher) {
      toast.error('Informe seu nome no campo Responsável pelo Lançamento.');
      return;
    }

    const validRows = entries.filter((r) => r.employee_id);
    if (validRows.length === 0) {
      toast.error('Selecione pelo menos um colaborador para lançar.');
      return;
    }

    // Verifica duplicidade de mesmo colaborador + mesma data dentro do próprio lote
    const seenKeys = new Set<string>();
    for (const r of validRows) {
      if (!r.date) {
        toast.error('Informe a data para todos os colaboradores selecionados.');
        return;
      }
      const key = `${r.employee_id}_${r.date}`;
      if (seenKeys.has(key)) {
        const colabName = colaboradores.find((c) => c.id === r.employee_id)?.nome || 'Colaborador';
        toast.error(`${colabName} está repetido na mesma data (${formatDateBr(r.date)}).`);
        return;
      }
      seenKeys.add(key);
    }

    setSubmitting(true);
    try {
      localStorage.setItem('busato_ext_ponto_launcher_name', finalLauncher);
    } catch {
      // ignore
    }

    let successCount = 0;
    const failedRows: DraftEntry[] = [];

    for (const row of validRows) {
      const { data, error } = await supabase.rpc('submit_external_ponto' as never, {
        p_token: token,
        p_employee_id: row.employee_id,
        p_date: row.date,
        p_status: row.status,
        p_observation: row.observation.trim(),
        p_launched_by_name: finalLauncher,
        p_device_id: deviceId,
      } as never);

      if (error) {
        failedRows.push({ ...row, error: error.message });
        continue;
      }

      const res = data as unknown as { ok: boolean; error?: string };
      if (!res?.ok) {
        failedRows.push({ ...row, error: res?.error || 'Não foi possível salvar este lançamento.' });
      } else {
        successCount++;
      }
    }

    setSubmitting(false);

    if (successCount > 0) {
      toast.success(
        successCount === 1
          ? '1 apontamento registrado com sucesso!'
          : `${successCount} apontamentos registrados com sucesso!`
      );
      await loadContext(true);
    }

    if (failedRows.length > 0) {
      setEntries(failedRows);
      toast.error(`${failedRows.length} lançamento(s) precisa(m) de atenção. Veja o aviso na linha abaixo.`);
    } else {
      setEntries([createDraftRow(defaultDate)]);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || !token) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc('delete_external_ponto' as never, {
      p_token: token,
      p_attendance_id: deleteTarget.id,
      p_device_id: deviceId,
    } as never);
    setDeleting(false);
    setDeleteTarget(null);

    if (error) {
      toast.error('Erro ao remover: ' + error.message);
      return;
    }
    const res = data as unknown as { ok: boolean; error?: string };
    if (!res?.ok) {
      toast.error(res?.error || 'Não foi possível remover este registro.');
      return;
    }
    toast.success('Lançamento removido.');
    await loadContext(true);
  }

  const filteredMultiList = useMemo(() => {
    const q = multiSearch.trim().toLowerCase();
    if (!q) return colaboradores;
    return colaboradores.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.cargo || '').toLowerCase().includes(q) ||
        (c.letra || '').toLowerCase().includes(q)
    );
  }, [colaboradores, multiSearch]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return lancamentos.filter((item) => {
      if (historyDateFilter && item.date !== historyDateFilter) return false;
      if (q) {
        const hay = `${item.employee_name} ${item.cargo} ${STATUS_LABELS[item.status] || item.status} ${item.observation}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lancamentos, historySearch, historyDateFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando formulário de lançamento...</p>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full glass-card rounded-2xl p-8 text-center space-y-4 border border-border">
          <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Link Indisponível</h1>
          <p className="text-sm text-muted-foreground">{invalidReason}</p>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Solicite um novo link atualizado ao setor de Gestão de Pessoas / Administração.
          </p>
        </div>
      </div>
    );
  }

  const filledCount = entries.filter((e) => Boolean(e.employee_id)).length;

  return (
    <div className="min-h-screen bg-muted/20 text-foreground pb-14">
      {/* Standalone Top Header — Sem acesso ao sistema interno */}
      <header className="bg-card border-b border-border sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={busatoGlobo} alt="Busato" className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-base sm:text-lg leading-tight truncate">
                  Lançamento Externo de Ponto
                </h1>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/25">
                  <ShieldCheck className="w-3 h-3 mr-1" /> {linkMeta?.titulo || 'Operação Porto'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Lance um ou vários colaboradores definindo o tipo e o motivo de cada um separadamente
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadContext(true)}
            disabled={refreshing}
            className="shrink-0 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Card 1: Formulário Multi-Colaborador */}
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-5 sm:p-6 border border-border shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <h2 className="font-bold text-base">Apontamento de Ponto (Individual ou em Lote)</h2>
                <p className="text-xs text-muted-foreground">
                  Adicione quantos colaboradores precisar e escolha o tipo e o motivo individual de cada um
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={openMultiSelectModal} className="text-xs">
                <Users className="w-3.5 h-3.5 mr-1.5 text-primary" /> Selecionar Vários
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addEmptyRow} className="text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Linha
              </Button>
            </div>
          </div>

          {/* Cabeçalho comum: Responsável e Data Padrão */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-xl bg-muted/30 border border-border/60">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-primary" /> Encarregado / Responsável pelo Lançamento *
              </Label>
              {linkMeta?.responsavel_nome ? (
                <Input value={launcherName} disabled />
              ) : (
                <ColaboradorNameSelect
                  colaboradores={colaboradores}
                  roleFilter="encarregado"
                  value={launcherName}
                  onValueChange={(v) => setLauncherName(v)}
                  placeholder="Selecione seu nome (Encarregado / Líder)..."
                  allowCustom
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Data Padrão das Linhas *</Label>
              <Input
                type="date"
                value={defaultDate}
                onChange={(e) => handleDefaultDateChange(e.target.value)}
              />
            </div>
          </div>

          {/* Linhas Individuais de Colaboradores */}
          <div className="space-y-3">
            {entries.map((row, idx) => (
              <div
                key={row.rowId}
                className={`p-4 rounded-xl border transition-colors space-y-3 ${
                  row.error ? 'bg-destructive/5 border-destructive/40' : 'bg-background border-border/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Colaborador #{idx + 1}
                  </span>
                  {entries.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeRow(row.rowId)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover linha
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="space-y-1 md:col-span-5">
                    <Label className="text-xs">Colaborador *</Label>
                    <ColaboradorSearchSelect
                      colaboradores={colaboradores}
                      value={row.employee_id}
                      onValueChange={(val) => updateEntry(row.rowId, { employee_id: val })}
                      placeholder="Pesquisar nome, função ou letra..."
                    />
                  </div>

                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Data *</Label>
                    <Input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateEntry(row.rowId, { date: e.target.value })}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-4">
                    <Label className="text-xs">Tipo de Apontamento *</Label>
                    <Select
                      value={row.status}
                      onValueChange={(val) => updateEntry(row.rowId, { status: val })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PONTO_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 md:col-span-12">
                    <Label className="text-xs">Motivo / Justificativa Individual deste Colaborador</Label>
                    <Input
                      value={row.observation}
                      onChange={(e) => updateEntry(row.rowId, { observation: e.target.value })}
                      placeholder="Ex: Dobrou turno na Pipa / Falta sem aviso / Compensação autorizada / Atraso transporte..."
                    />
                  </div>
                </div>

                {row.error && (
                  <div className="text-xs font-semibold text-destructive flex items-center gap-1.5 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{row.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <Button type="button" variant="outline" onClick={addEmptyRow} className="text-xs">
              <Plus className="w-4 h-4 mr-1.5" /> + Adicionar Mais um Colaborador
            </Button>

            <Button type="submit" className="h-11 px-8 font-bold text-sm" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando Lançamentos...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Enviar {filledCount > 1 ? `${filledCount} Lançamentos` : 'Lançamento'}
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Card 2: Histórico exclusivo do que esta pessoa/link lançou */}
        <section className="bg-card rounded-2xl p-5 sm:p-6 border border-border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Meus Lançamentos Realizados ({filteredHistory.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Conferência dos registros enviados através deste link
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-52">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Filtrar colaborador..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="pl-8 h-8 text-xs w-[148px]"
                />
              </div>
              {historyDateFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => setHistoryDateFilter('')}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhum lançamento encontrado ainda neste link. Assim que você registrar acima, ele aparecerá aqui imediatamente.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-muted/25 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {formatDateBr(item.date)}
                      </span>
                      <span className="font-bold text-sm text-foreground">{item.employee_name}</span>
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadgeClass(item.status)}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.cargo}
                      {item.letra ? ` • Letra ${item.letra}` : ''}
                      {item.launched_by_name ? ` • Lançado por: ${item.launched_by_name}` : ''}
                    </p>
                    {item.observation && (
                      <p className="text-xs text-foreground/80 bg-background/80 rounded px-2.5 py-1 border border-border/50 mt-1">
                        Motivo: {item.observation}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Dialog: Selecionar Vários Colaboradores de Uma Vez */}
      <Dialog open={multiModalOpen} onOpenChange={setMultiModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Selecionar Vários Colaboradores</DialogTitle>
            <DialogDescription>
              Marque os colaboradores desejados. Uma linha individual será criada para cada um escolher o tipo e o motivo separadamente.
            </DialogDescription>
          </DialogHeader>

          <div className="relative my-2">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={multiSearch}
              onChange={(e) => setMultiSearch(e.target.value)}
              placeholder="Filtrar por nome, função ou letra..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-border rounded-xl divide-y divide-border/50 max-h-80">
            {filteredMultiList.map((c) => {
              const checked = multiSelectedIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors ${
                    checked ? 'bg-primary/5' : ''
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleMultiSelectId(c.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{c.nome}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.cargo}
                      {c.letra ? ` • Letra ${c.letra}` : ''}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {multiSelectedIds.size} colaborador(es) marcado(s)
            </span>
            <Button type="button" onClick={confirmAddMultiSelected} disabled={multiSelectedIds.size === 0}>
              Adicionar {multiSelectedIds.size > 0 ? `(${multiSelectedIds.size})` : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir o lançamento de <strong>{deleteTarget?.employee_name}</strong> na data{' '}
              <strong>{formatDateBr(deleteTarget?.date || '')}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting ? 'Removendo...' : 'Excluir Lançamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
