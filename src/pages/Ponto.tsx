import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Plus, Trash2, AlertTriangle, Users, TrendingUp, Shield,
  Upload, Download, ShieldAlert, Search, X, MinusCircle, Eye, CalendarDays,
  Link2, Copy, ExternalLink, Power, Loader2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PeriodFilter, { getPortoPeriod, type PeriodRange } from '@/components/filters/PeriodFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FastInput } from '@/components/ui/fast-input';
import { FastTextarea } from '@/components/ui/fast-textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ExpandableChart } from '@/components/ui/ExpandableChart';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { readExcelRows, parseExcelDate, writeExcelFile } from '@/lib/excel';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { ColaboradorSearchSelect } from '@/components/colaboradores/ColaboradorSearchSelect';

interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  status: string;
  observation: string;
  created_at: string;
  external_link_id?: string | null;
  launched_by_name?: string | null;
  employee_name?: string;
  turno?: string;
  letra?: string;
  cargo?: string;
}

interface ExternalPontoLink {
  id: string;
  token: string;
  titulo: string;
  responsavel_nome: string;
  ativo: boolean;
  created_at: string;
}

interface OvertimeRecord {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  extras_count: number;
  max_extras: number;
  employee_name?: string;
}

interface Warning {
  id: string;
  employee_id: string;
  date: string;
  reason: string;
  applied: boolean;
  observation: string;
  created_at: string;
  employee_name?: string;
}

interface Func {
  id: string;
  nome: string;
  turno: string;
  letra: string;
  cargo: string;
  departamento: string;
  status_colaborador?: string | null;
  foto_url?: string;
}

const PONTO_STATUS_OPTIONS = [
  { value: 'falta_injustificada', label: 'Falta Injustificada' },
  { value: 'falta_justificada', label: 'Falta Justificada' },
  { value: 'extra', label: 'Hora Extra' },
  { value: 'banco_horas', label: 'Banco de Horas' },
  { value: 'abono', label: 'Abono' },
  { value: 'presente', label: 'Presente' },
];

const statusLabels: Record<string, string> = {
  presente: 'Presente',
  falta_injustificada: 'Falta Injustificada',
  falta: 'Falta Injustificada',
  falta_justificada: 'Falta Justificada',
  extra: 'Hora Extra',
  abono: 'Abono',
  banco_horas: 'Banco de Horas',
};

function statusBadge(status: string) {
  switch (status) {
    case 'falta_injustificada':
    case 'falta':
      return 'bg-destructive/15 text-destructive';
    case 'falta_justificada':
      return 'bg-amber-500/15 text-amber-700';
    case 'extra':
      return 'bg-purple-500/15 text-purple-700';
    case 'banco_horas':
      return 'bg-blue-500/15 text-blue-700';
    case 'abono':
      return 'bg-emerald-500/15 text-emerald-700';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

const PIE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981', '#64748b'];

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function Ponto() {
  const navigate = useNavigate();
  const { canCreate, canDelete } = usePermissions();
  const { user } = useAuth();
  const [period, setPeriod] = useState<PeriodRange>(getPortoPeriod(0));

  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRecord[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [funcionarios, setFuncionarios] = useState<Func[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalPontoLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [linksDialogOpen, setLinksDialogOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [newLinkForm, setNewLinkForm] = useState({ titulo: '', responsavel_nome: '' });

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Func | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const pontoFileRef = useRef<HTMLInputElement>(null);
  const extrasFileRef = useRef<HTMLInputElement>(null);

  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchRows, setBatchRows] = useState<
    { rowId: string; employee_id: string; date: string; status: string; observation: string }[]
  >(() => [
    {
      rowId: 'row_init',
      employee_id: '',
      date: new Date().toISOString().slice(0, 10),
      status: 'falta_injustificada',
      observation: '',
    },
  ]);

  const [warningForm, setWarningForm] = useState({
    employee_id: '',
    date: new Date().toISOString().slice(0, 10),
    reason: '',
    applied: 'true',
    observation: '',
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [period]);

  async function fetchExternalLinks() {
    const { data } = await supabase
      .from('ponto_external_links' as never)
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setExternalLinks(data as unknown as ExternalPontoLink[]);
  }

  async function handleCreateExternalLink() {
    const titulo = newLinkForm.titulo.trim() || (newLinkForm.responsavel_nome.trim() ? `Link - ${newLinkForm.responsavel_nome.trim()}` : 'Lançamento Externo de Ponto');
    setCreatingLink(true);
    const token = `porto-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    const { data, error } = await supabase
      .from('ponto_external_links' as never)
      .insert({
        token,
        titulo,
        responsavel_nome: newLinkForm.responsavel_nome.trim(),
        ativo: true,
        created_by: user?.id || null,
      } as never)
      .select()
      .single();
    setCreatingLink(false);
    if (error) {
      toast.error('Erro ao gerar link externo: ' + error.message);
      return;
    }
    const created = data as unknown as ExternalPontoLink;
    const url = `${window.location.origin}/lancamento-ponto/${created.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link criado e copiado para a área de transferência!');
    } catch {
      toast.success('Link externo criado com sucesso!');
    }
    setNewLinkForm({ titulo: '', responsavel_nome: '' });
    fetchExternalLinks();
  }

  async function handleToggleExternalLink(link: ExternalPontoLink) {
    const { error } = await supabase
      .from('ponto_external_links' as never)
      .update({ ativo: !link.ativo } as never)
      .eq('id', link.id);
    if (error) {
      toast.error('Erro ao alterar status do link.');
      return;
    }
    toast.success(link.ativo ? 'Link desativado.' : 'Link reativado!');
    fetchExternalLinks();
  }

  async function handleDeleteExternalLink(id: string) {
    const { error } = await supabase
      .from('ponto_external_links' as never)
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Erro ao remover link.');
      return;
    }
    toast.success('Link externo removido.');
    fetchExternalLinks();
  }

  async function copyExternalLink(token: string) {
    const url = `${window.location.origin}/lancamento-ponto/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado! Envie para o responsável lançar o ponto.');
    } catch {
      toast.error('Não foi possível copiar automaticamente: ' + url);
    }
  }

  async function fetchAll() {
    setLoading(true);
    const [attRes, ovtRes, fRes, warnRes] = await Promise.all([
      supabase
        .from('daily_attendance')
        .select('*')
        .gte('date', period.start)
        .lte('date', period.end)
        .not('status', 'in', '("atestado","afastamento","ferias")')
        .order('date', { ascending: false }),
      supabase.from('overtime_control').select('*').gte('period_start', period.start).lte('period_end', period.end),
      supabase.from('funcionarios').select('id, nome, turno, letra, cargo, departamento, status_colaborador, foto_url').order('nome'),
      supabase.from('employee_warnings').select('*').order('date', { ascending: false }),
    ]);

    const funcs = ((fRes.data || []) as Func[]).filter(
      (f) => (f.status_colaborador || 'ATIVO').toUpperCase() !== 'DESLIGADO'
    );
    setFuncionarios(funcs);
    fetchExternalLinks();

    const empIds = new Set(funcs.map((f) => f.id));
    const nameMap = Object.fromEntries(funcs.map((f) => [f.id, f]));

    setAttendance(
      (attRes.data || [])
        .filter((a) => empIds.has(a.employee_id))
        .map((a) => ({
          ...a,
          status: a.status === 'falta' ? 'falta_injustificada' : a.status,
          employee_name: nameMap[a.employee_id]?.nome || 'Desconhecido',
          turno: nameMap[a.employee_id]?.turno,
          letra: nameMap[a.employee_id]?.letra,
          cargo: nameMap[a.employee_id]?.cargo,
        }))
    );

    setOvertimes(
      (ovtRes.data || [])
        .filter((o) => empIds.has(o.employee_id))
        .map((o) => ({
          ...o,
          employee_name: nameMap[o.employee_id]?.nome || 'Desconhecido',
        }))
    );

    setWarnings(
      (warnRes.data || [])
        .filter((w) => empIds.has(w.employee_id))
        .map((w) => ({
          ...w,
          employee_name: nameMap[w.employee_id]?.nome || 'Desconhecido',
        }))
    );
    setLoading(false);
  }

  const filteredAttendance = useMemo(() => {
    return attendance.filter((a) => {
      if (selectedEmployee && a.employee_id !== selectedEmployee.id) return false;
      if (statusFilter !== 'todos' && a.status !== statusFilter) return false;
      if (employeeSearch.trim()) {
        const q = employeeSearch.toLowerCase();
        if (!(a.employee_name || '').toLowerCase().includes(q) && !(a.cargo || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [attendance, selectedEmployee, statusFilter, employeeSearch]);

  const filteredWarnings = useMemo(() => {
    if (!selectedEmployee) return warnings;
    return warnings.filter((w) => w.employee_id === selectedEmployee.id);
  }, [warnings, selectedEmployee]);

  // Metrics
  const faltasInjCount = filteredAttendance.filter((a) => a.status === 'falta_injustificada').length;
  const faltasJustCount = filteredAttendance.filter((a) => a.status === 'falta_justificada' || a.status === 'abono').length;
  const extrasCount = filteredAttendance.filter((a) => a.status === 'extra').length;
  const bancoHorasCount = filteredAttendance.filter((a) => a.status === 'banco_horas').length;

  const extrasPerEmployee = useMemo(() => {
    const map: Record<string, { id: string; name: string; count: number; limit: number }> = {};
    filteredAttendance
      .filter((a) => a.status === 'extra')
      .forEach((a) => {
        if (!map[a.employee_id]) {
          map[a.employee_id] = { id: a.employee_id, name: a.employee_name || 'Colaborador', count: 0, limit: 3 };
        }
        map[a.employee_id].count += 1;
      });
    overtimes.forEach((o) => {
      if (!map[o.employee_id] && o.extras_count > 0) {
        map[o.employee_id] = { id: o.employee_id, name: o.employee_name || 'Colaborador', count: o.extras_count, limit: o.max_extras || 3 };
      } else if (map[o.employee_id]) {
        map[o.employee_id].count = Math.max(map[o.employee_id].count, o.extras_count);
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filteredAttendance, overtimes]);

  const blockedExtrasCount = extrasPerEmployee.filter((e) => e.count >= e.limit).length;

  const negativeHoursPerEmployee = useMemo(() => {
    const map: Record<string, { name: string; faltasInj: number; faltasJust: number; banco: number; total: number }> = {};
    filteredAttendance.forEach((a) => {
      if (!['falta_injustificada', 'falta_justificada', 'banco_horas'].includes(a.status)) return;
      if (!map[a.employee_id]) {
        map[a.employee_id] = { name: a.employee_name || 'Colaborador', faltasInj: 0, faltasJust: 0, banco: 0, total: 0 };
      }
      if (a.status === 'falta_injustificada') map[a.employee_id].faltasInj += 1;
      if (a.status === 'falta_justificada') map[a.employee_id].faltasJust += 1;
      if (a.status === 'banco_horas') map[a.employee_id].banco += 1;
      map[a.employee_id].total += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredAttendance]);

  const dailyChartData = useMemo(() => {
    const byDate: Record<string, { date: string; 'Faltas Inj.': number; 'Faltas Just./Abono': number; Extras: number; 'Banco de Horas': number }> = {};
    filteredAttendance.forEach((a) => {
      const key = a.date.slice(5).split('-').reverse().join('/');
      if (!byDate[key]) {
        byDate[key] = { date: key, 'Faltas Inj.': 0, 'Faltas Just./Abono': 0, Extras: 0, 'Banco de Horas': 0 };
      }
      if (a.status === 'falta_injustificada') byDate[key]['Faltas Inj.'] += 1;
      else if (a.status === 'falta_justificada' || a.status === 'abono') byDate[key]['Faltas Just./Abono'] += 1;
      else if (a.status === 'extra') byDate[key].Extras += 1;
      else if (a.status === 'banco_horas') byDate[key]['Banco de Horas'] += 1;
    });
    return Object.values(byDate).slice(0, 15).reverse();
  }, [filteredAttendance]);

  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAttendance.forEach((a) => {
      const label = statusLabels[a.status] || a.status;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], idx) => ({
      name,
      value,
      fill: PIE_COLORS[idx % PIE_COLORS.length],
    }));
  }, [filteredAttendance]);

  async function handleCreateAttendance() {
    const validRows = batchRows.filter((r) => r.employee_id && r.date);
    if (validRows.length === 0) {
      toast.error('Selecione pelo menos um colaborador e a data.');
      return;
    }

    let savedCount = 0;
    const remainingRows: typeof batchRows = [];

    for (const item of validRows) {
      const statusToSave = item.status === 'falta_injustificada' ? 'falta' : item.status;

      if (item.status === 'extra') {
        const { count } = await supabase
          .from('daily_attendance')
          .select('*', { count: 'exact', head: true })
          .eq('employee_id', item.employee_id)
          .eq('status', 'extra')
          .gte('date', period.start)
          .lte('date', period.end);

        if ((count || 0) >= 3) {
          const empName = funcionarios.find((f) => f.id === item.employee_id)?.nome || 'Colaborador';
          toast.error(`⚠️ LIMITE ATINGIDO: ${empName} já realizou 3 horas extras neste período.`);
          remainingRows.push(item);
          continue;
        }
      }

      const { error } = await supabase.from('daily_attendance').insert({
        employee_id: item.employee_id,
        date: item.date,
        status: statusToSave,
        observation: item.observation.trim(),
      });

      if (error) {
        const empName = funcionarios.find((f) => f.id === item.employee_id)?.nome || 'Colaborador';
        if (error.code === '23505') toast.error(`Já existe registro para ${empName} em ${formatDate(item.date)}.`);
        else toast.error(`Erro ao registrar ${empName}: ${error.message}`);
        remainingRows.push(item);
        continue;
      }

      if (item.status === 'extra') {
        const { data: existing } = await supabase
          .from('overtime_control')
          .select('*')
          .eq('employee_id', item.employee_id)
          .eq('period_start', period.start)
          .eq('period_end', period.end)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('overtime_control')
            .update({
              extras_count: (existing as { extras_count: number; id: string }).extras_count + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (existing as { extras_count: number; id: string }).id);
        } else {
          await supabase.from('overtime_control').insert({
            employee_id: item.employee_id,
            period_start: period.start,
            period_end: period.end,
            extras_count: 1,
            max_extras: 3,
          });
        }
      }

      savedCount++;
    }

    if (savedCount > 0) {
      toast.success(
        savedCount === 1 ? 'Apontamento registrado com sucesso!' : `${savedCount} apontamentos registrados com sucesso!`
      );
      fetchAll();
    }

    if (remainingRows.length > 0) {
      setBatchRows(remainingRows);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setBatchDate(today);
      setBatchRows([
        { rowId: `row_${Date.now()}`, employee_id: '', date: today, status: 'falta_injustificada', observation: '' },
      ]);
      setDialogOpen(false);
    }
  }

  async function handleCreateWarning() {
    if (!warningForm.employee_id || !warningForm.reason.trim()) {
      toast.error('Selecione o colaborador e informe o motivo.');
      return;
    }
    const { error } = await supabase.from('employee_warnings').insert({
      employee_id: warningForm.employee_id,
      date: warningForm.date,
      reason: warningForm.reason,
      applied: warningForm.applied === 'true',
      observation: warningForm.observation,
    });
    if (error) {
      toast.error('Erro ao registrar advertência: ' + error.message);
      return;
    }
    setWarningDialogOpen(false);
    setWarningForm({ employee_id: '', date: new Date().toISOString().slice(0, 10), reason: '', applied: 'true', observation: '' });
    toast.success('Advertência registrada!');
    fetchAll();
  }

  async function deleteAttendance(id: string) {
    if (!canDelete('ponto')) {
      toast.error('Sem permissão para excluir apontamentos.');
      return;
    }
    const { error } = await supabase.from('daily_attendance').delete().eq('id', id);
    if (error) toast.error('Erro ao remover: ' + error.message);
    else {
      toast.success('Apontamento removido.');
      fetchAll();
    }
  }

  async function deleteWarning(id: string) {
    if (!canDelete('ponto')) {
      toast.error('Sem permissão para excluir advertências.');
      return;
    }
    const { error } = await supabase.from('employee_warnings').delete().eq('id', id);
    if (error) toast.error('Erro ao remover advertência: ' + error.message);
    else {
      toast.success('Advertência removida.');
      fetchAll();
    }
  }

  async function handleImportPonto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const rows = await readExcelRows(data);
      const nameToId = Object.fromEntries(funcionarios.map((f) => [f.nome.toLowerCase().trim(), f.id]));
      let imported = 0;
      for (const row of rows) {
        const nome = String(row['Nome'] || row['nome'] || row['Colaborador'] || '').toLowerCase().trim();
        const empId = nameToId[nome];
        if (!empId) continue;
        const dateStr = parseExcelDate(row['Data'] || row['data']);
        if (!dateStr) continue;
        const status = String(row['Status'] || row['status'] || 'falta').toLowerCase().trim();
        const obs = String(row['Observação'] || row['observacao'] || row['Obs'] || '');
        await supabase.from('daily_attendance').insert({
          employee_id: empId,
          date: dateStr,
          status,
          observation: obs,
        });
        imported++;
      }
      toast.success(`${imported} registro(s) de ponto importado(s)!`);
      fetchAll();
    } catch {
      toast.error('Erro ao importar planilha de ponto.');
    }
    if (pontoFileRef.current) pontoFileRef.current.value = '';
  }

  async function handleImportExtras(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const rows = await readExcelRows(data);
      const nameToId = Object.fromEntries(funcionarios.map((f) => [f.nome.toLowerCase().trim(), f.id]));
      let imported = 0;
      for (const row of rows) {
        const nome = String(row['Nome'] || row['nome'] || row['Colaborador'] || '').toLowerCase().trim();
        const empId = nameToId[nome];
        if (!empId) continue;
        const periodStart = parseExcelDate(row['Início Período'] || row['inicio_periodo']);
        const periodEnd = parseExcelDate(row['Fim Período'] || row['fim_periodo']);
        if (!periodStart || !periodEnd) continue;
        await supabase.from('overtime_control').insert({
          employee_id: empId,
          period_start: periodStart,
          period_end: periodEnd,
          extras_count: parseInt(String(row['Extras Realizadas'] || row['extras_count'] || '0')) || 0,
          max_extras: parseInt(String(row['Máximo Extras'] || row['max_extras'] || '3')) || 3,
        });
        imported++;
      }
      toast.success(`${imported} registro(s) de horas extras importado(s)!`);
      fetchAll();
    } catch {
      toast.error('Erro ao importar planilha de extras.');
    }
    if (extrasFileRef.current) extrasFileRef.current.value = '';
  }

  async function handleExportExcel() {
    const rows = filteredAttendance.map((a) => ({
      Data: formatDate(a.date),
      Colaborador: a.employee_name || '',
      Cargo: a.cargo || '',
      Turno: `${a.letra || ''} ${a.turno || ''}`.trim(),
      Tipo: statusLabels[a.status] || a.status,
      Observacao: a.observation || '',
    }));
    await writeExcelFile(rows, 'Ponto', `Relatorio_Ponto_${period.start}_a_${period.end}.xlsx`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" /> Ponto & Banco de Horas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle operacional de faltas, horas extras (limite de 3 por ciclo), banco de horas, abonos e advertências
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreate('ponto') && (
            <>
              <input ref={pontoFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportPonto} />
              <input ref={extrasFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportExtras} />
              <Button variant="outline" size="sm" onClick={() => pontoFileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Importar Ponto
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWarningDialogOpen(true)}>
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-destructive" /> Advertência
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => {
                  fetchExternalLinks();
                  setLinksDialogOpen(true);
                }}
              >
                <Link2 className="w-3.5 h-3.5 mr-1.5" /> Link Externo
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Lançar Ponto
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex-1 w-full">
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar colaborador..."
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              {PONTO_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedEmployee && (
        <div className="glass-card rounded-xl p-3 border-l-4 border-l-primary flex items-center justify-between">
          <span className="text-sm font-semibold">Filtrando colaborador: <strong className="text-primary">{selectedEmployee.nome}</strong></span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(null)}>
            <X className="w-4 h-4 mr-1" /> Limpar filtro
          </Button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="kpi-card danger">
          <p className="text-2xl font-bold">{faltasInjCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Faltas Injustificadas</p>
        </div>
        <div className="kpi-card warning">
          <p className="text-2xl font-bold">{faltasJustCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Faltas Justif. / Abonos</p>
        </div>
        <div className="kpi-card purple">
          <p className="text-2xl font-bold">{extrasCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Horas Extras ({blockedExtrasCount} bloq.)</p>
        </div>
        <div className="kpi-card">
          <p className="text-2xl font-bold text-blue-600">{bancoHorasCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Banco de Horas</p>
        </div>
        <div className="kpi-card danger">
          <p className="text-2xl font-bold">{filteredWarnings.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Advertências</p>
        </div>
      </div>

      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="bg-card border border-border p-1 h-auto flex-wrap mb-4">
          <TabsTrigger value="visao-geral" className="text-xs sm:text-sm px-4 py-2">Painel & Controle de Extras</TabsTrigger>
          <TabsTrigger value="quadro" className="text-xs sm:text-sm px-4 py-2">Quadro & Registros de Ponto ({filteredAttendance.length})</TabsTrigger>
          <TabsTrigger value="advertencias" className="text-xs sm:text-sm px-4 py-2">Advertências ({filteredWarnings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="corporate-section p-5 lg:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Movimentação Diária de Ponto — {period.label}
              </h3>
              {dailyChartData.length > 0 ? (
                <ExpandableChart title="Movimentação Diária de Ponto">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Faltas Inj." stackId="a" fill="#ef4444" />
                      <Bar dataKey="Faltas Just./Abono" stackId="a" fill="#f59e0b" />
                      <Bar dataKey="Extras" stackId="a" fill="#8b5cf6" />
                      <Bar dataKey="Banco de Horas" stackId="a" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ExpandableChart>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">Nenhum apontamento de ponto registrado no período.</p>
                </div>
              )}
            </div>

            <div className="corporate-section p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Distribuição por Tipo
              </h3>
              {statusDistribution.length > 0 ? (
                <ExpandableChart title="Distribuição de Ponto">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="48%">
                        {statusDistribution.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ExpandableChart>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                  <Clock className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">Sem dados no período.</p>
                </div>
              )}
            </div>
          </div>

          {/* Controle de Horas Extras */}
          <div className="corporate-section p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Controle de Horas Extras — Limite: 3 por Período
              </h3>
              <span className="text-xs text-muted-foreground">{period.label}</span>
            </div>
            {extrasPerEmployee.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {extrasPerEmployee.map((emp) => {
                  const pct = (emp.count / emp.limit) * 100;
                  const isBlocked = emp.count >= emp.limit;
                  return (
                    <div key={emp.id} className={`rounded-lg p-4 border transition-colors ${isBlocked ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => navigate(`/funcionario/${emp.id}`)} className="font-medium text-sm truncate mr-2 hover:text-primary text-left">
                          {emp.name}
                        </button>
                        <span className={`text-xs font-bold whitespace-nowrap ${isBlocked ? 'text-destructive' : 'text-foreground'}`}>
                          {emp.count}/{emp.limit} {isBlocked && '⛔'}
                        </span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className={`h-2 ${isBlocked ? '[&>div]:bg-destructive' : pct >= 66 ? '[&>div]:bg-warning' : '[&>div]:bg-success'}`} />
                      {isBlocked && <p className="text-[10px] text-destructive font-semibold mt-1.5 uppercase tracking-wider">Novas extras bloqueadas</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Nenhuma hora extra registrada no período atual.</p>
              </div>
            )}
          </div>

          {/* Horas Negativas & Banco */}
          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              <MinusCircle className="w-3.5 h-3.5 inline mr-1.5" /> Faltas & Banco de Horas por Colaborador
            </h3>
            {negativeHoursPerEmployee.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Colaborador</th>
                      <th className="text-center px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Faltas Injustif.</th>
                      <th className="text-center px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Faltas Justif.</th>
                      <th className="text-center px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Banco de Horas</th>
                      <th className="text-center px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Total Ocorrências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {negativeHoursPerEmployee.map((emp) => (
                      <tr key={emp.name} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium text-xs">{emp.name}</td>
                        <td className="px-4 py-2.5 text-center text-xs font-bold text-destructive">{emp.faltasInj}</td>
                        <td className="px-4 py-2.5 text-center text-xs">{emp.faltasJust}</td>
                        <td className="px-4 py-2.5 text-center text-xs font-semibold text-blue-600">{emp.banco}</td>
                        <td className="px-4 py-2.5 text-center text-xs font-bold">{emp.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-6 text-sm text-muted-foreground">Nenhuma falta ou banco de horas registrado no período.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="quadro" className="space-y-6">
          {/* Lançamentos Detalhados */}
          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Registros de Ponto Detalhados ({filteredAttendance.length})
            </h3>
            {filteredAttendance.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Nenhum apontamento encontrado para os filtros selecionados.</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/95">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Data</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Colaborador</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Cargo / Turno</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Tipo</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Observação</th>
                      <th className="text-right px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">{formatDate(a.date)}</td>
                        <td className="px-4 py-2.5 font-semibold text-xs">
                          <button onClick={() => navigate(`/funcionario/${a.employee_id}`)} className="hover:text-primary hover:underline text-left">
                            {a.employee_name}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.cargo} {a.letra ? `• ${a.letra}` : ''}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${statusBadge(a.status)}`}>
                            {statusLabels[a.status] || a.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[280px]">
                          <div className="truncate">{a.observation || '—'}</div>
                          {a.launched_by_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary mt-0.5">
                              <Link2 className="w-3 h-3" /> Externo: {a.launched_by_name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canDelete('ponto') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAttendance(a.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quadro Geral de Colaboradores */}
          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Quadro de Frequência da Equipe ({funcionarios.length} ativos)
            </h3>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/95">
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Colaborador</th>
                    <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Função / Turno</th>
                    <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Faltas Inj.</th>
                    <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Faltas Just./Abono</th>
                    <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Extras</th>
                    <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Banco Horas</th>
                    <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Advert.</th>
                    <th className="text-right px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Perfil</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionarios
                    .filter((f) => !employeeSearch.trim() || f.nome.toLowerCase().includes(employeeSearch.toLowerCase()))
                    .map((f) => {
                      const empAtt = attendance.filter((a) => a.employee_id === f.id);
                      const fInj = empAtt.filter((a) => a.status === 'falta_injustificada').length;
                      const fJust = empAtt.filter((a) => a.status === 'falta_justificada' || a.status === 'abono').length;
                      const ext = empAtt.filter((a) => a.status === 'extra').length;
                      const bh = empAtt.filter((a) => a.status === 'banco_horas').length;
                      const wCount = warnings.filter((w) => w.employee_id === f.id).length;
                      const blocked = ext >= 3;
                      return (
                        <tr key={f.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium text-xs">{f.nome}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{f.cargo} {f.letra ? `• Letra ${f.letra}` : ''}</td>
                          <td className="px-4 py-2.5 text-center text-xs font-bold text-destructive">{fInj}</td>
                          <td className="px-4 py-2.5 text-center text-xs">{fJust}</td>
                          <td className={`px-4 py-2.5 text-center text-xs font-bold ${blocked ? 'text-destructive' : ''}`}>
                            {ext}/3 {blocked && '⛔'}
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs text-blue-600 font-semibold">{bh}</td>
                          <td className="px-4 py-2.5 text-center text-xs font-bold text-destructive">{wCount}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate(`/funcionario/${f.id}`)}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Perfil
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="advertencias">
          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Advertências Disciplinares ({filteredWarnings.length})
            </h3>
            {filteredWarnings.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma advertência registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Data</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Colaborador</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Motivo</th>
                      <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Observação</th>
                      <th className="text-right px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWarnings.map((w) => (
                      <tr key={w.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-xs">{formatDate(w.date)}</td>
                        <td className="px-4 py-2.5 font-medium text-xs">{w.employee_name}</td>
                        <td className="px-4 py-2.5 text-xs">{w.reason}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${w.applied ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
                            {w.applied ? 'APLICADA' : 'PENDENTE'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{w.observation || '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          {canDelete('ponto') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteWarning(w.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Lançar Ponto (Individual ou Múltiplos Colaboradores) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar Ponto / Frequência</DialogTitle>
            <DialogDescription>
              Registre um ou vários colaboradores de uma só vez, escolhendo o tipo e o motivo de cada um separadamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/60">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold whitespace-nowrap">Data Padrão:</Label>
                <Input
                  type="date"
                  value={batchDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBatchDate(next);
                    setBatchRows((prev) =>
                      prev.map((r) => ({ ...r, date: r.date === batchDate || !r.date ? next : r.date }))
                    );
                  }}
                  className="h-8 text-xs w-40"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setBatchRows((prev) => [
                    ...prev,
                    {
                      rowId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                      employee_id: '',
                      date: batchDate,
                      status: 'falta_injustificada',
                      observation: '',
                    },
                  ])
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Colaborador
              </Button>
            </div>

            <div className="space-y-3">
              {batchRows.map((row, idx) => (
                <div key={row.rowId} className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase">Colaborador #{idx + 1}</span>
                    {batchRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-destructive"
                        onClick={() => setBatchRows((prev) => prev.filter((r) => r.rowId !== row.rowId))}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-5 space-y-1">
                      <Label className="text-xs">Colaborador *</Label>
                      <ColaboradorSearchSelect
                        colaboradores={funcionarios}
                        value={row.employee_id}
                        onValueChange={(v) =>
                          setBatchRows((prev) => prev.map((r) => (r.rowId === row.rowId ? { ...r, employee_id: v } : r)))
                        }
                        placeholder="Pesquisar nome, função ou letra..."
                      />
                    </div>
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="text-xs">Data *</Label>
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(e) =>
                          setBatchRows((prev) =>
                            prev.map((r) => (r.rowId === row.rowId ? { ...r, date: e.target.value } : r))
                          )
                        }
                        className="h-10"
                      />
                    </div>
                    <div className="sm:col-span-4 space-y-1">
                      <Label className="text-xs">Tipo de Apontamento *</Label>
                      <Select
                        value={row.status}
                        onValueChange={(v) =>
                          setBatchRows((prev) => prev.map((r) => (r.rowId === row.rowId ? { ...r, status: v } : r)))
                        }
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
                    <div className="sm:col-span-12 space-y-1">
                      <Label className="text-xs">Motivo / Justificativa Individual</Label>
                      <Input
                        value={row.observation}
                        onChange={(e) =>
                          setBatchRows((prev) =>
                            prev.map((r) => (r.rowId === row.rowId ? { ...r, observation: e.target.value } : r))
                          )
                        }
                        placeholder="Motivo específico deste colaborador..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={handleCreateAttendance}>
              Salvar {batchRows.filter((r) => r.employee_id).length > 1 ? `${batchRows.filter((r) => r.employee_id).length} Apontamentos` : 'Apontamento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Registrar Advertência */}
      <Dialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Advertência</DialogTitle>
            <DialogDescription>Registre advertência disciplinar para o colaborador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Colaborador *</Label>
              <ColaboradorSearchSelect
                colaboradores={funcionarios}
                value={warningForm.employee_id}
                onValueChange={(v) => setWarningForm({ ...warningForm, employee_id: v })}
                placeholder="Pesquisar colaborador por nome, função ou letra..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={warningForm.date} onChange={(e) => setWarningForm({ ...warningForm, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={warningForm.applied} onValueChange={(v) => setWarningForm({ ...warningForm, applied: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Aplicada</SelectItem>
                    <SelectItem value="false">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <FastTextarea value={warningForm.reason} onValueChange={(v) => setWarningForm((p) => ({ ...p, reason: v }))} rows={2} placeholder="Descreva o motivo da advertência" />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <FastTextarea value={warningForm.observation} onValueChange={(v) => setWarningForm((p) => ({ ...p, observation: v }))} rows={2} />
            </div>
            <Button className="w-full" onClick={handleCreateWarning}>Salvar Advertência</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerenciar Links de Lançamento Externo */}
      <Dialog open={linksDialogOpen} onOpenChange={setLinksDialogOpen}>
        <DialogContent className="sm:max-w-xl w-[calc(100%-2rem)] max-h-[88vh] overflow-y-auto overflow-x-hidden p-4 sm:p-5">
          <DialogHeader className="pr-6">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Link2 className="w-4 h-4 text-primary shrink-0" /> Links de Lançamento Externo
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Quem receber o link poderá lançar faltas, extras e banco de horas e consultar apenas os próprios lançamentos, sem acesso ao sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1 min-w-0">
            {/* Criar Novo Link */}
            <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-2.5 min-w-0">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-primary">Gerar Novo Link Externo</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Identificação do Link</Label>
                  <Input
                    value={newLinkForm.titulo}
                    onChange={(e) => setNewLinkForm({ ...newLinkForm, titulo: e.target.value })}
                    placeholder="Ex: Turno Dia A / Campo"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Responsável (Opcional)</Label>
                  <Input
                    value={newLinkForm.responsavel_nome}
                    onChange={(e) => setNewLinkForm({ ...newLinkForm, responsavel_nome: e.target.value })}
                    placeholder="Ex: Agrimaldo (ou vazio p/ geral)"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Com <strong>Responsável</strong> preenchido, o link fica dedicado a essa pessoa. Em branco, cada pessoa vê apenas o que lançou do próprio aparelho.
              </p>
              <Button size="sm" onClick={handleCreateExternalLink} disabled={creatingLink} className="w-full sm:w-auto h-8 text-xs">
                {creatingLink ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Gerar e Copiar Link
              </Button>
            </div>

            {/* Lista de Links Criados */}
            <div className="space-y-2 min-w-0">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Links Cadastrados ({externalLinks.length})
              </h4>
              {externalLinks.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-xl px-3">
                  Nenhum link externo criado ainda. Clique em <strong>"Gerar e Copiar Link"</strong> acima.
                </div>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {externalLinks.map((lnk) => {
                    const fullUrl = `${window.location.origin}/lancamento-ponto/${lnk.token}`;
                    return (
                      <div
                        key={lnk.id}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0 ${
                          lnk.ativo ? 'bg-card border-border' : 'bg-muted/30 border-border/50 opacity-70'
                        }`}
                      >
                        <div className="min-w-0 flex-1 overflow-hidden space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-foreground truncate">{lnk.titulo}</span>
                            <Badge variant={lnk.ativo ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {lnk.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                            {lnk.responsavel_nome && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 max-w-[160px] truncate">
                                {lnk.responsavel_nome}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground truncate" title={fullUrl}>
                            {fullUrl}
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-1 shrink-0">
                          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => copyExternalLink(lnk.token)}>
                            <Copy className="w-3 h-3 mr-1" /> Copiar
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" asChild title="Abrir formulário externo">
                            <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleToggleExternalLink(lnk)}
                            title={lnk.ativo ? 'Desativar link' : 'Reativar link'}
                          >
                            <Power className={`w-3.5 h-3.5 ${lnk.ativo ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteExternalLink(lnk.id)}
                            title="Excluir link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
