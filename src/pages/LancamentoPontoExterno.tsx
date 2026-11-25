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
} from 'lucide-react';
import busatoGlobo from '@/assets/busato-globo.png';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FastInput } from '@/components/ui/fast-input';
import { FastTextarea } from '@/components/ui/fast-textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
import { ColaboradorSearchSelect, type ColaboradorOption } from '@/components/colaboradores/ColaboradorSearchSelect';

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
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('falta_injustificada');
  const [observation, setObservation] = useState('');

  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExternalLaunchRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadContext = useCallback(
    async (silent = false) => {
      if (!token) {
        setValid(false);
        setInvalidReason('Token de acesso não informado.');
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);

      const { data, error } = await supabase.rpc('get_external_ponto_context' as never, {
        p_token: token,
        p_device_id: deviceId,
      } as never);

      if (error || !data) {
        setValid(false);
        setInvalidReason('Não foi possível validar este link no momento. Verifique sua conexão.');
        setLoading(false);
        return;
      }

      const res = data as unknown as ExternalContextResponse;
      if (!res.valid) {
        setValid(false);
        setInvalidReason(res.reason || 'Link inválido ou desativado.');
        setLoading(false);
        return;
      }

      setValid(true);
      setLinkMeta(res.link || null);
      setColaboradores(res.colaboradores || []);
      setLancamentos(res.lancamentos || []);

      if (res.link?.responsavel_nome && !launcherName) {
        setLauncherName(res.link.responsavel_nome);
      }
      setLoading(false);
    },
    [token, deviceId, launcherName]
  );

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!employeeId) {
      toast.error('Selecione o colaborador.');
      return;
    }
    if (!date) {
      toast.error('Informe a data do apontamento.');
      return;
    }
    const finalLauncher = (launcherName || linkMeta?.responsavel_nome || '').trim();
    if (!finalLauncher) {
      toast.error('Informe seu nome (Responsável pelo lançamento).');
      return;
    }

    setSubmitting(true);
    try {
      localStorage.setItem('busato_ext_ponto_launcher_name', finalLauncher);
    } catch {
      // ignore
    }

    const { data, error } = await supabase.rpc('submit_external_ponto' as never, {
      p_token: token,
      p_employee_id: employeeId,
      p_date: date,
      p_status: status,
      p_observation: observation.trim(),
      p_launched_by_name: finalLauncher,
      p_device_id: deviceId,
    } as never);

    setSubmitting(false);

    if (error) {
      toast.error('Erro ao enviar lançamento: ' + error.message);
      return;
    }

    const res = data as unknown as { ok: boolean; error?: string };
    if (!res?.ok) {
      toast.error(res?.error || 'Não foi possível concluir o lançamento.');
      return;
    }

    toast.success('Apontamento registrado com sucesso!');
    setEmployeeId('');
    setObservation('');
    await loadContext(true);
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

  return (
    <div className="min-h-screen bg-muted/20 text-foreground pb-14">
      {/* Standalone Top Header — Sem acesso ao sistema interno */}
      <header className="bg-card border-b border-border sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
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
                Registre faltas, extras e banco de horas e acompanhe seus lançamentos abaixo
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => loadContext()} className="shrink-0 text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Card 1: Formulário de Lançamento */}
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-5 sm:p-6 border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-base">Novo Apontamento de Ponto</h2>
            </div>
            <span className="text-xs text-muted-foreground">{colaboradores.length} colaboradores ativos</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-primary" /> Responsável pelo Lançamento *
              </Label>
              <FastInput
                value={launcherName}
                onValueChange={setLauncherName}
                disabled={Boolean(linkMeta?.responsavel_nome)}
                placeholder="Digite seu nome (Ex: Encarregado Agrimaldo)"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Colaborador *</Label>
              <ColaboradorSearchSelect
                colaboradores={colaboradores}
                value={employeeId}
                onValueChange={setEmployeeId}
                placeholder="Pesquisar colaborador por nome, função ou letra..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Data da Ocorrência *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tipo de Lançamento *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Observação / Motivo / Equipamento</Label>
              <FastTextarea
                rows={2}
                value={observation}
                onValueChange={setObservation}
                placeholder="Informe detalhes do turno, motivo da falta, cobertura de hora extra ou compensação..."
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-11 font-bold text-sm" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registrando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Enviar Lançamento de Ponto
              </>
            )}
          </Button>
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
                <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => setHistoryDateFilter('')}>
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhum lançamento encontrado ainda neste link. Assim que você registrar um ponto acima, ele aparecerá aqui imediatamente.
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
                        {item.observation}
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
