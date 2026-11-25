import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Palmtree, Plus, Trash2, Pencil, Upload, Download, Search,
  Sun, AlertTriangle, CheckCircle2, Calendar, Eye, Building2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FastInput } from '@/components/ui/fast-input';
import { FastTextarea } from '@/components/ui/fast-textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { readExcelRows, parseExcelDate, writeExcelFile } from '@/lib/excel';
import { calcularSituacaoFerias } from '@/lib/colaboradores-import';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { DEPARTAMENTOS } from '@/lib/departments';

interface VacationRecord {
  id: string;
  employee_id: string;
  days_count: number;
  scheduled_month: string;
  start_date: string | null;
  end_date: string | null;
  remaining_days: number | null;
  observation: string;
  employee_name?: string;
  turno?: string;
  letra?: string;
  cargo?: string;
  departamento?: string;
}

interface Func {
  id: string;
  nome: string;
  turno: string;
  letra: string;
  cargo: string;
  departamento: string;
  status_colaborador?: string | null;
  data_admissao?: string | null;
  ultima_ferias?: string | null;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function Ferias() {
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { userDepartment, effectiveDepartment, isDepartmentLocked } = useAuth();
  const [deptFilter, setDeptFilter] = useState<string>('todos');

  useEffect(() => {
    if (isDepartmentLocked && userDepartment) {
      setDeptFilter(userDepartment);
    } else if (effectiveDepartment) {
      setDeptFilter(effectiveDepartment);
    }
  }, [isDepartmentLocked, userDepartment, effectiveDepartment]);

  const [funcionarios, setFuncionarios] = useState<Func[]>([]);
  const [vacations, setVacations] = useState<VacationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [feriasFilter, setFeriasFilter] = useState<'TODOS' | 'VENCIDA' | 'VENCENDO' | 'EM_DIA' | 'SEM_DATA'>('TODOS');
  const [monthFilter, setMonthFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [savingDatesId, setSavingDatesId] = useState<string | null>(null);

  const [vacDialogOpen, setVacDialogOpen] = useState(false);
  const [editVacDialogOpen, setEditVacDialogOpen] = useState(false);
  const feriasFileRef = useRef<HTMLInputElement>(null);

  const [vacForm, setVacForm] = useState({
    employee_id: '',
    days_count: '30',
    scheduled_month: '',
    start_date: '',
    end_date: '',
    observation: '',
  });

  const [editVacForm, setEditVacForm] = useState({
    id: '',
    employee_id: '',
    days_count: '30',
    scheduled_month: '',
    start_date: '',
    end_date: '',
    observation: '',
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [deptFilter, userDepartment, isDepartmentLocked]);

  async function fetchData() {
    setLoading(true);
    const [fRes, vacRes] = await Promise.all([
      supabase
        .from('funcionarios')
        .select('id, nome, turno, letra, cargo, departamento, status_colaborador, data_admissao, ultima_ferias')
        .order('nome'),
      supabase.from('vacation_control').select('*').order('start_date', { ascending: true }),
    ]);

    const rawFuncs = ((fRes.data || []) as Func[]).filter(
      (f) => (f.status_colaborador || 'ATIVO').toUpperCase() !== 'DESLIGADO'
    );
    const activeDept = (isDepartmentLocked && userDepartment) ? userDepartment : deptFilter;
    const funcs = activeDept === 'todos' ? rawFuncs : rawFuncs.filter((f) => f.departamento === activeDept);
    setFuncionarios(funcs);

    const deptIds = new Set(funcs.map((f) => f.id));
    const mapById = Object.fromEntries(funcs.map((f) => [f.id, f]));

    setVacations(
      (vacRes.data || [])
        .filter((v) => deptIds.has(v.employee_id))
        .map((v) => ({
          ...v,
          employee_name: mapById[v.employee_id]?.nome || 'Colaborador',
          turno: mapById[v.employee_id]?.turno,
          letra: mapById[v.employee_id]?.letra,
          cargo: mapById[v.employee_id]?.cargo,
          departamento: mapById[v.employee_id]?.departamento,
        }))
    );
    setLoading(false);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const vencimentoRows = useMemo(() => {
    return funcionarios.map((f) => {
      const vac = vacations.find((v) => v.employee_id === f.id);
      const effectiveUltima =
        f.ultima_ferias ||
        (vac?.end_date && vac.end_date <= todayIso ? vac.end_date : null);
      const sit = calcularSituacaoFerias(f.data_admissao, effectiveUltima);
      return { func: f, vac, effectiveUltima, sit };
    });
  }, [funcionarios, vacations, todayIso]);

  const vencidasCount = vencimentoRows.filter((r) => r.sit.situacao === 'VENCIDA').length;
  const vencendoCount = vencimentoRows.filter((r) => r.sit.situacao === 'VENCENDO').length;
  const emDiaCount = vencimentoRows.filter((r) => r.sit.situacao === 'EM_DIA').length;
  const semDataCount = vencimentoRows.filter((r) => r.sit.situacao === 'SEM_DATA').length;

  const emFeriasHoje = useMemo(() => {
    return vacations.filter((v) => v.start_date && v.end_date && todayIso >= v.start_date && todayIso <= v.end_date);
  }, [vacations, todayIso]);

  const proximasSaidas = useMemo(() => {
    return vacations
      .filter((v) => (v.start_date && v.start_date > todayIso) || (!v.start_date && v.scheduled_month))
      .sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999'));
  }, [vacations, todayIso]);

  const filteredVencimentos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vencimentoRows
      .filter((r) => {
        if (feriasFilter !== 'TODOS' && r.sit.situacao !== feriasFilter) return false;
        if (q) {
          return (
            r.func.nome.toLowerCase().includes(q) ||
            r.func.cargo.toLowerCase().includes(q) ||
            (r.func.departamento || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const prio = { VENCIDA: 0, VENCENDO: 1, EM_DIA: 2, SEM_DATA: 3 };
        if (prio[a.sit.situacao] !== prio[b.sit.situacao]) {
          return prio[a.sit.situacao] - prio[b.sit.situacao];
        }
        return a.func.nome.localeCompare(b.func.nome);
      });
  }, [vencimentoRows, feriasFilter, search]);

  const filteredVacations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vacations.filter((v) => {
      if (monthFilter !== 'todos' && (v.scheduled_month || '').toLowerCase() !== monthFilter.toLowerCase()) return false;
      if (q) {
        return (
          (v.employee_name || '').toLowerCase().includes(q) ||
          (v.cargo || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vacations, monthFilter, search]);

  async function handleUpdateEmpDates(empId: string, field: 'data_admissao' | 'ultima_ferias', value: string) {
    if (!canEdit('ferias') && !canEdit('colaboradores')) {
      toast.error('Sem permissão para alterar datas cadastrais.');
      return;
    }
    setSavingDatesId(empId);
    const { error } = await supabase.from('funcionarios').update({ [field]: value || null }).eq('id', empId);
    setSavingDatesId(null);
    if (error) {
      toast.error('Erro ao salvar data: ' + error.message);
      return;
    }
    setFuncionarios((prev) => prev.map((f) => (f.id === empId ? { ...f, [field]: value || null } : f)));
    toast.success(field === 'data_admissao' ? 'Data de admissão salva!' : 'Última data de férias salva!');
  }

  function handleStartDateAutoEnd(startStr: string, daysStr: string) {
    if (!startStr) return '';
    const days = Math.max(1, parseInt(daysStr) || 30);
    const dt = new Date(startStr + 'T00:00:00');
    dt.setDate(dt.getDate() + days - 1);
    return dt.toISOString().slice(0, 10);
  }

  async function handleCreateVacation() {
    if (!vacForm.employee_id) {
      toast.error('Selecione o colaborador.');
      return;
    }
    const { error } = await supabase.from('vacation_control').upsert(
      {
        employee_id: vacForm.employee_id,
        days_count: parseInt(vacForm.days_count) || 30,
        scheduled_month: vacForm.scheduled_month,
        start_date: vacForm.start_date || null,
        end_date: vacForm.end_date || null,
        observation: vacForm.observation,
        remaining_days:
          vacForm.start_date && vacForm.end_date
            ? Math.ceil((new Date(vacForm.end_date).getTime() - new Date().getTime()) / 86400000)
            : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id' }
    );
    if (error) {
      toast.error('Erro ao programar férias: ' + error.message);
      return;
    }
    if (vacForm.end_date && vacForm.end_date <= todayIso) {
      await supabase.from('funcionarios').update({ ultima_ferias: vacForm.end_date }).eq('id', vacForm.employee_id);
    }
    setVacDialogOpen(false);
    setVacForm({ employee_id: '', days_count: '30', scheduled_month: '', start_date: '', end_date: '', observation: '' });
    toast.success('Programação de férias registrada!');
    fetchData();
  }

  function openEditVacation(v: VacationRecord) {
    setEditVacForm({
      id: v.id,
      employee_id: v.employee_id,
      days_count: String(v.days_count || 30),
      scheduled_month: v.scheduled_month || '',
      start_date: v.start_date || '',
      end_date: v.end_date || '',
      observation: v.observation || '',
    });
    setEditVacDialogOpen(true);
  }

  async function handleEditVacation() {
    if (!editVacForm.id) return;
    const { error } = await supabase
      .from('vacation_control')
      .update({
        days_count: parseInt(editVacForm.days_count) || 30,
        scheduled_month: editVacForm.scheduled_month,
        start_date: editVacForm.start_date || null,
        end_date: editVacForm.end_date || null,
        observation: editVacForm.observation,
        remaining_days:
          editVacForm.start_date && editVacForm.end_date
            ? Math.ceil((new Date(editVacForm.end_date).getTime() - new Date().getTime()) / 86400000)
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editVacForm.id);
    if (error) {
      toast.error('Erro ao atualizar férias: ' + error.message);
      return;
    }
    if (editVacForm.end_date && editVacForm.end_date <= todayIso && editVacForm.employee_id) {
      await supabase.from('funcionarios').update({ ultima_ferias: editVacForm.end_date }).eq('id', editVacForm.employee_id);
    }
    setEditVacDialogOpen(false);
    toast.success('Férias atualizadas!');
    fetchData();
  }

  async function deleteVacation(id: string) {
    if (!canDelete('ferias')) {
      toast.error('Sem permissão para excluir programação de férias.');
      return;
    }
    const { error } = await supabase.from('vacation_control').delete().eq('id', id);
    if (error) toast.error('Erro ao remover: ' + error.message);
    else {
      toast.success('Programação removida.');
      fetchData();
    }
  }

  async function handleImportFerias(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const rows = await readExcelRows(data);
      const nameToId = Object.fromEntries(funcionarios.map((f) => [f.nome.toLowerCase().trim(), f.id]));
      let imported = 0;

      for (const row of rows) {
        const nome = String(row['Nome'] || row['nome'] || row['Colaborador'] || row['colaborador'] || '').toLowerCase().trim();
        const empId = nameToId[nome];
        if (!empId) continue;
        const startDate = parseExcelDate(row['Início'] || row['inicio'] || row['Start']) || '';
        const endDate = parseExcelDate(row['Fim'] || row['fim'] || row['End']) || '';
        const admDate = parseExcelDate(row['Admissão'] || row['Data Admissão'] || row['data_admissao']);
        const ultDate = parseExcelDate(row['Última Férias'] || row['Ultima Ferias'] || row['ultima_ferias']);

        if (admDate || ultDate) {
          const patch: Record<string, unknown> = {};
          if (admDate) patch.data_admissao = admDate;
          if (ultDate) patch.ultima_ferias = ultDate;
          await supabase.from('funcionarios').update(patch).eq('id', empId);
        }

        await supabase.from('vacation_control').upsert(
          {
            employee_id: empId,
            days_count: parseInt(String(row['Dias'] || row['dias'] || '30')) || 30,
            scheduled_month: String(row['Mês'] || row['mes'] || ''),
            start_date: startDate || null,
            end_date: endDate || null,
            observation: String(row['Observação'] || row['observacao'] || ''),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id' }
        );
        imported++;
      }
      toast.success(`${imported} registro(s) de férias importado(s)!`);
      fetchData();
    } catch {
      toast.error('Erro ao importar arquivo de férias.');
    }
    if (feriasFileRef.current) feriasFileRef.current.value = '';
  }

  async function handleExportExcel() {
    const rows = filteredVencimentos.map(({ func: f, vac, sit }) => ({
      Colaborador: f.nome,
      Cargo: f.cargo,
      Contrato: f.departamento,
      Turno: `${f.letra || ''} ${f.turno || ''}`.trim(),
      'Data Admissão': formatDate(f.data_admissao),
      'Última Férias': formatDate(f.ultima_ferias),
      'Próximo Vencimento': formatDate(sit.proximoVencimento),
      Situação: sit.situacao,
      'Mês Programado': vac?.scheduled_month || '',
      'Início Férias': formatDate(vac?.start_date),
      'Fim Férias': formatDate(vac?.end_date),
      Dias: vac?.days_count || '',
    }));
    await writeExcelFile(rows, 'Gestao_Ferias', `Controle_Ferias_${todayIso}.xlsx`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Palmtree className="w-6 h-6 text-teal-600" /> Gestão de Férias & Vencimentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle de períodos aquisitivos baseado na admissão e última férias, férias em andamento e programação anual
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDepartmentLocked && userDepartment ? (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border border-primary/20 text-primary font-semibold text-xs rounded-lg">
              <Building2 className="w-4 h-4" />
              <span>{userDepartment}</span>
            </div>
          ) : (
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Contrato / Setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Contratos</SelectItem>
                {DEPARTAMENTOS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar Excel
          </Button>

          {canCreate('ferias') && (
            <>
              <input ref={feriasFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFerias} />
              <Button variant="outline" size="sm" onClick={() => feriasFileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Importar Férias
              </Button>
              <Button size="sm" onClick={() => setVacDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Programar Férias
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <button type="button" onClick={() => setFeriasFilter(feriasFilter === 'VENCIDA' ? 'TODOS' : 'VENCIDA')} className="kpi-card danger text-left hover:ring-2 hover:ring-destructive/40 transition-all">
          <p className="text-2xl font-bold text-destructive">{vencidasCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Férias Vencidas</p>
        </button>
        <button type="button" onClick={() => setFeriasFilter(feriasFilter === 'VENCENDO' ? 'TODOS' : 'VENCENDO')} className="kpi-card warning text-left hover:ring-2 hover:ring-warning/40 transition-all">
          <p className="text-2xl font-bold text-amber-600">{vencendoCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Vencem em ≤ 60 dias</p>
        </button>
        <div className="kpi-card success">
          <p className="text-2xl font-bold text-teal-600">{emFeriasHoje.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Em Férias Hoje</p>
        </div>
        <div className="kpi-card">
          <p className="text-2xl font-bold text-primary">{proximasSaidas.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Programadas</p>
        </div>
        <button type="button" onClick={() => setFeriasFilter(feriasFilter === 'EM_DIA' ? 'TODOS' : 'EM_DIA')} className="kpi-card success text-left hover:ring-2 hover:ring-emerald-500/40 transition-all">
          <p className="text-2xl font-bold text-emerald-600">{emDiaCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Período em Dia ({semDataCount} s/ data)</p>
        </button>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Buscar colaborador ou cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {([
            { id: 'TODOS', label: 'Todos' },
            { id: 'VENCIDA', label: `🔴 Vencidas (${vencidasCount})` },
            { id: 'VENCENDO', label: `🟡 ≤ 60 dias (${vencendoCount})` },
            { id: 'EM_DIA', label: `🟢 Em dia (${emDiaCount})` },
            { id: 'SEM_DATA', label: `⚪ Sem data (${semDataCount})` },
          ] as const).map((b) => (
            <Button
              key={b.id}
              size="sm"
              variant={feriasFilter === b.id ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setFeriasFilter(b.id)}
            >
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="vencimentos" className="w-full">
        <TabsList className="bg-card border border-border p-1 h-auto flex-wrap mb-4">
          <TabsTrigger value="vencimentos" className="text-xs sm:text-sm px-4 py-2">
            Gestão de Vencimentos ({filteredVencimentos.length})
          </TabsTrigger>
          <TabsTrigger value="ativas" className="text-xs sm:text-sm px-4 py-2">
            Em Férias Hoje & Próximas ({emFeriasHoje.length + proximasSaidas.length})
          </TabsTrigger>
          <TabsTrigger value="programacao" className="text-xs sm:text-sm px-4 py-2">
            Programação Completa ({filteredVacations.length})
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: GESTÃO DE VENCIMENTOS */}
        <TabsContent value="vencimentos">
          <div className="corporate-section p-5 space-y-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Controle Aquisitivo por Colaborador (Admissão & Última Férias)
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Altere diretamente na linha a <strong>Data de Admissão</strong> ou a <strong>Última Data de Férias</strong> para atualizar automaticamente o próximo vencimento.
              </p>
            </div>

            {loading ? (
              <p className="text-center py-10 text-sm text-muted-foreground">Carregando colaboradores...</p>
            ) : (
              <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-border/60 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-bold uppercase text-muted-foreground">Colaborador</th>
                      <th className="text-left px-3 py-2.5 font-bold uppercase text-muted-foreground">Contrato / Turno</th>
                      <th className="text-left px-3 py-2.5 font-bold uppercase text-muted-foreground">Data Admissão</th>
                      <th className="text-left px-3 py-2.5 font-bold uppercase text-muted-foreground">Última Férias</th>
                      <th className="text-left px-3 py-2.5 font-bold uppercase text-muted-foreground">Próx. Vencimento</th>
                      <th className="text-left px-3 py-2.5 font-bold uppercase text-muted-foreground">Programação</th>
                      <th className="text-right px-3 py-2.5 font-bold uppercase text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredVencimentos.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-muted-foreground">
                          Nenhum colaborador encontrado para este filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredVencimentos.map(({ func: f, vac, sit }) => {
                        const isBusy = savingDatesId === f.id;
                        return (
                          <tr key={f.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <button onClick={() => navigate(`/funcionario/${f.id}`)} className="font-semibold text-foreground hover:text-primary hover:underline text-left">
                                {f.nome}
                              </button>
                              <div className="text-[11px] text-muted-foreground">{f.cargo}</div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                              <div>{f.departamento}</div>
                              <div className="text-[10px]">{f.turno || '—'} {f.letra ? `• Letra ${f.letra}` : ''}</div>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="date"
                                value={f.data_admissao || ''}
                                disabled={isBusy}
                                onChange={(e) => handleUpdateEmpDates(f.id, 'data_admissao', e.target.value)}
                                className="h-8 text-xs w-[136px]"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="date"
                                value={f.ultima_ferias || ''}
                                disabled={isBusy}
                                onChange={(e) => handleUpdateEmpDates(f.id, 'ultima_ferias', e.target.value)}
                                className="h-8 text-xs w-[136px]"
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {sit.situacao === 'VENCIDA' ? (
                                <div>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-destructive/15 text-destructive">
                                    🔴 VENCIDA ({Math.abs(sit.diasParaVencer || 0)}d)
                                  </span>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(sit.proximoVencimento)}</div>
                                </div>
                              ) : sit.situacao === 'VENCENDO' ? (
                                <div>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-700">
                                    🟡 Vence em {sit.diasParaVencer}d
                                  </span>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(sit.proximoVencimento)}</div>
                                </div>
                              ) : sit.situacao === 'EM_DIA' ? (
                                <div>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-700">
                                    🟢 Em dia ({sit.diasParaVencer}d)
                                  </span>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(sit.proximoVencimento)}</div>
                                </div>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  ⚪ Informar datas
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {vac ? (
                                <div>
                                  <div className="font-semibold text-foreground">
                                    {vac.start_date ? `${formatDate(vac.start_date)} → ${formatDate(vac.end_date)}` : vac.scheduled_month || 'Programada'}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">{vac.days_count} dias</div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Não programada</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap space-x-1">
                              {vac ? (
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openEditVacation(vac)}>
                                  <Pencil className="w-3 h-3 mr-1" /> Editar
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() => {
                                    setVacForm({
                                      employee_id: f.id,
                                      days_count: '30',
                                      scheduled_month: '',
                                      start_date: '',
                                      end_date: '',
                                      observation: '',
                                    });
                                    setVacDialogOpen(true);
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-1" /> Programar
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => navigate(`/funcionario/${f.id}?tab=ferias`)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ABA 2: EM FÉRIAS HOJE & PRÓXIMAS SAÍDAS */}
        <TabsContent value="ativas" className="space-y-6">
          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Sun className="w-4 h-4 text-teal-600" /> Colaboradores em Férias Neste Momento ({emFeriasHoje.length})
            </h3>
            {emFeriasHoje.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Nenhum colaborador em gozo de férias na data de hoje.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {emFeriasHoje.map((v) => {
                  const diasRestantes = v.end_date
                    ? Math.max(0, Math.ceil((new Date(v.end_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86400000))
                    : 0;
                  return (
                    <div key={v.id} className="rounded-xl p-4 border border-teal-500/40 bg-teal-500/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <button onClick={() => navigate(`/funcionario/${v.employee_id}?tab=ferias`)} className="font-bold text-sm hover:text-primary text-left truncate">
                          {v.employee_name}
                        </button>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-500/15 text-teal-700">
                          EM FÉRIAS ({diasRestantes}d restantes)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{v.cargo} {v.letra ? `• Letra ${v.letra}` : ''}</p>
                      <div className="text-xs flex justify-between pt-1 border-t border-border/50">
                        <span>Saída: <strong>{formatDate(v.start_date)}</strong></span>
                        <span>Fim: <strong>{formatDate(v.end_date)}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" /> Próximas Férias Programadas ({proximasSaidas.length})
            </h3>
            {proximasSaidas.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma saída futura agendada.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {proximasSaidas.map((v) => (
                  <div key={v.id} className="rounded-xl p-4 border border-border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <button onClick={() => navigate(`/funcionario/${v.employee_id}?tab=ferias`)} className="font-bold text-sm hover:text-primary text-left truncate">
                        {v.employee_name}
                      </button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditVacation(v)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{v.cargo} • {v.days_count} dias</p>
                    <div className="text-xs text-muted-foreground pt-1 border-t border-border/50 flex justify-between">
                      <span>{v.start_date ? `${formatDate(v.start_date)} → ${formatDate(v.end_date)}` : `Mês: ${v.scheduled_month}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ABA 3: PROGRAMAÇÃO COMPLETA */}
        <TabsContent value="programacao">
          <div className="corporate-section p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quadro de Férias Programadas & Realizadas ({filteredVacations.length})
              </h3>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Filtrar mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Meses</SelectItem>
                  {MESES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {filteredVacations.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Nenhum registro de férias programado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Colaborador</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Cargo / Turno</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Mês Prog.</th>
                      <th className="text-center px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Dias</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Início</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Fim</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVacations.map((v) => {
                      const isOnVac = v.start_date && v.end_date && todayIso >= v.start_date && todayIso <= v.end_date;
                      const isConcluida = v.end_date && v.end_date < todayIso;
                      return (
                        <tr key={v.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-semibold text-xs">
                            <button onClick={() => navigate(`/funcionario/${v.employee_id}?tab=ferias`)} className="hover:text-primary hover:underline text-left">
                              {v.employee_name}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{v.cargo} {v.letra ? `• ${v.letra}` : ''}</td>
                          <td className="px-4 py-2.5 text-xs">{v.scheduled_month || '—'}</td>
                          <td className="px-4 py-2.5 text-center text-xs font-semibold">{v.days_count}</td>
                          <td className="px-4 py-2.5 text-xs">{formatDate(v.start_date)}</td>
                          <td className="px-4 py-2.5 text-xs">{formatDate(v.end_date)}</td>
                          <td className="px-4 py-2.5">
                            {isOnVac ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-500/15 text-teal-700">EM FÉRIAS</span>
                            ) : isConcluida ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-700">CONCLUÍDA</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-700">PROGRAMADA</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right space-x-1">
                            {canEdit('ferias') && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditVacation(v)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete('ferias') && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteVacation(v.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Programar Férias */}
      <Dialog open={vacDialogOpen} onOpenChange={setVacDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Programar / Registrar Férias</DialogTitle>
            <DialogDescription>Defina o período ou mês previsto para férias do colaborador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Colaborador *</Label>
              <Select value={vacForm.employee_id} onValueChange={(v) => setVacForm({ ...vacForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {funcionarios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome} ({f.cargo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qtd. Dias</Label>
                <Input
                  type="number"
                  value={vacForm.days_count}
                  onChange={(e) => {
                    const days = e.target.value;
                    setVacForm((prev) => ({
                      ...prev,
                      days_count: days,
                      end_date: prev.start_date ? handleStartDateAutoEnd(prev.start_date, days) : prev.end_date,
                    }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mês Programado</Label>
                <Select value={vacForm.scheduled_month || 'none'} onValueChange={(v) => setVacForm({ ...vacForm, scheduled_month: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Definir depois</SelectItem>
                    {MESES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={vacForm.start_date}
                  onChange={(e) => {
                    const st = e.target.value;
                    setVacForm((prev) => ({
                      ...prev,
                      start_date: st,
                      end_date: st ? handleStartDateAutoEnd(st, prev.days_count) : prev.end_date,
                    }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Término</Label>
                <Input type="date" value={vacForm.end_date} onChange={(e) => setVacForm({ ...vacForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <FastTextarea value={vacForm.observation} onValueChange={(v) => setVacForm((p) => ({ ...p, observation: v }))} rows={2} placeholder="Ex: 20 dias gozo + 10 abono pecuniário, cobertura definida..." />
            </div>
            <Button className="w-full" onClick={handleCreateVacation}>Salvar Programação de Férias</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Férias */}
      <Dialog open={editVacDialogOpen} onOpenChange={setEditVacDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Férias</DialogTitle>
            <DialogDescription>Atualize os dias, datas ou observações das férias.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qtd. Dias</Label>
                <Input type="number" value={editVacForm.days_count} onChange={(e) => setEditVacForm({ ...editVacForm, days_count: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Mês Programado</Label>
                <FastInput value={editVacForm.scheduled_month} onValueChange={(v) => setEditVacForm((p) => ({ ...p, scheduled_month: v }))} placeholder="Ex: Novembro" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data de Início</Label>
                <Input type="date" value={editVacForm.start_date} onChange={(e) => setEditVacForm({ ...editVacForm, start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Término</Label>
                <Input type="date" value={editVacForm.end_date} onChange={(e) => setEditVacForm({ ...editVacForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <FastTextarea value={editVacForm.observation} onValueChange={(v) => setEditVacForm((p) => ({ ...p, observation: v }))} rows={2} />
            </div>
            <Button className="w-full" onClick={handleEditVacation}>Salvar Alterações</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
