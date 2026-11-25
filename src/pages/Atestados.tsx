import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope, Plus, Trash2, Pencil, Download, Search,
  Calendar, Clock, User, Building2, Eye, AlertTriangle
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PeriodFilter, { getPortoPeriod, type PeriodRange } from '@/components/filters/PeriodFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FastInput } from '@/components/ui/fast-input';
import { FastTextarea } from '@/components/ui/fast-textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ExpandableChart } from '@/components/ui/ExpandableChart';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import { writeExcelFile } from '@/lib/excel';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { DEPARTAMENTOS } from '@/lib/departments';

interface MedicalRecord {
  id: string;
  employee_id: string;
  date: string;
  status: 'atestado' | 'afastamento';
  observation: string;
  cid?: string | null;
  crm?: string | null;
  dias_afastamento?: number | null;
  employee_name?: string;
  cargo?: string;
  departamento?: string;
  turno?: string;
  letra?: string;
}

interface Func {
  id: string;
  nome: string;
  cargo: string;
  departamento: string;
  turno: string;
  letra: string;
  status_colaborador?: string | null;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function calcReturnDate(startIso: string, dias: number): string {
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(start.getTime() + Math.max(1, dias) * 86400000);
  return end.toISOString().slice(0, 10);
}

function calcLastDayOff(startIso: string, dias: number): string {
  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(start.getTime() + (Math.max(1, dias) - 1) * 86400000);
  return end.toISOString().slice(0, 10);
}

export default function Atestados() {
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { userDepartment, effectiveDepartment, isDepartmentLocked } = useAuth();
  const [deptFilter, setDeptFilter] = useState<string>('todos');
  const [period, setPeriod] = useState<PeriodRange>(getPortoPeriod(0));

  useEffect(() => {
    if (isDepartmentLocked && userDepartment) {
      setDeptFilter(userDepartment);
    } else if (effectiveDepartment) {
      setDeptFilter(effectiveDepartment);
    }
  }, [isDepartmentLocked, userDepartment, effectiveDepartment]);

  const [funcionarios, setFuncionarios] = useState<Func[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'atestado' | 'afastamento'>('todos');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);

  const emptyForm = {
    employee_id: '',
    date: new Date().toISOString().slice(0, 10),
    status: 'atestado' as 'atestado' | 'afastamento',
    dias_afastamento: '1',
    cid: '',
    crm: '',
    observation: '',
  };
  const [form, setForm] = useState(emptyForm);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [period, deptFilter, userDepartment, isDepartmentLocked]);

  async function fetchData() {
    setLoading(true);
    const [fRes, attRes] = await Promise.all([
      supabase
        .from('funcionarios')
        .select('id, nome, cargo, departamento, turno, letra, status_colaborador')
        .order('nome'),
      supabase
        .from('daily_attendance')
        .select('*')
        .in('status', ['atestado', 'afastamento'])
        .gte('date', period.start)
        .lte('date', period.end)
        .order('date', { ascending: false }),
    ]);

    const rawFuncs = ((fRes.data || []) as Func[]).filter(
      (f) => (f.status_colaborador || 'ATIVO').toUpperCase() !== 'DESLIGADO'
    );
    const activeDept = (isDepartmentLocked && userDepartment) ? userDepartment : deptFilter;
    const funcs = activeDept === 'todos' ? rawFuncs : rawFuncs.filter((f) => f.departamento === activeDept);
    setFuncionarios(funcs);

    const deptIds = new Set(funcs.map((f) => f.id));
    const mapById = Object.fromEntries(funcs.map((f) => [f.id, f]));

    setRecords(
      (attRes.data || [])
        .filter((a) => deptIds.has(a.employee_id))
        .map((a) => ({
          ...a,
          status: a.status === 'afastamento' ? 'afastamento' : 'atestado',
          employee_name: mapById[a.employee_id]?.nome || 'Colaborador',
          cargo: mapById[a.employee_id]?.cargo || '',
          departamento: mapById[a.employee_id]?.departamento || '',
          turno: mapById[a.employee_id]?.turno || '',
          letra: mapById[a.employee_id]?.letra || '',
        }))
    );
    setLoading(false);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (typeFilter !== 'todos' && r.status !== typeFilter) return false;
      if (q) {
        const hay = `${r.employee_name || ''} ${r.cargo || ''} ${r.cid || ''} ${r.crm || ''} ${r.observation || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, typeFilter]);

  const afastadosHoje = useMemo(() => {
    return records.filter((r) => {
      const dias = Math.max(1, r.dias_afastamento || 1);
      const lastDay = calcLastDayOff(r.date, dias);
      return todayIso >= r.date && todayIso <= lastDay;
    });
  }, [records, todayIso]);

  const analytics = useMemo(() => {
    let diasPerdidos = 0;
    const byEmp: Record<string, { id: string; name: string; count: number; dias: number }> = {};
    const byCid: Record<string, number> = {};
    const byCrm: Record<string, number> = {};
    const byCargo: Record<string, number> = {};

    filteredRecords.forEach((r) => {
      const d = Math.max(1, r.dias_afastamento || 1);
      diasPerdidos += d;
      if (!byEmp[r.employee_id]) {
        byEmp[r.employee_id] = { id: r.employee_id, name: r.employee_name || 'Colaborador', count: 0, dias: 0 };
      }
      byEmp[r.employee_id].count += 1;
      byEmp[r.employee_id].dias += d;

      const cid = (r.cid || 'Não informado').trim().toUpperCase();
      byCid[cid] = (byCid[cid] || 0) + 1;

      const crm = (r.crm || 'Não informado').trim().toUpperCase();
      byCrm[crm] = (byCrm[crm] || 0) + 1;

      const cargo = (r.cargo || 'Outros').trim();
      byCargo[cargo] = (byCargo[cargo] || 0) + 1;
    });

    const topEmps = Object.values(byEmp).sort((a, b) => b.count - a.count || b.dias - a.dias).slice(0, 10);
    const topCids = Object.entries(byCid).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);
    const topCrms = Object.entries(byCrm).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    const topCargos = Object.entries(byCargo).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);

    return { diasPerdidos, topEmps, topCids, topCrms, topCargos };
  }, [filteredRecords]);

  function openCreate() {
    setEditingRecord(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(r: MedicalRecord) {
    setEditingRecord(r);
    setForm({
      employee_id: r.employee_id,
      date: r.date,
      status: r.status,
      dias_afastamento: String(r.dias_afastamento || 1),
      cid: r.cid || '',
      crm: r.crm || '',
      observation: r.observation || '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.employee_id || !form.date) {
      toast.error('Selecione o colaborador e a data inicial.');
      return;
    }
    const payload = {
      employee_id: form.employee_id,
      date: form.date,
      status: form.status,
      dias_afastamento: Math.max(1, parseInt(form.dias_afastamento) || 1),
      cid: form.cid.trim().toUpperCase() || null,
      crm: form.crm.trim().toUpperCase() || null,
      observation: form.observation.trim(),
    };

    if (editingRecord) {
      const { error } = await supabase.from('daily_attendance').update(payload).eq('id', editingRecord.id);
      if (error) {
        toast.error('Erro ao atualizar atestado: ' + error.message);
        return;
      }
      toast.success('Atestado atualizado com sucesso!');
    } else {
      const { error } = await supabase.from('daily_attendance').insert(payload);
      if (error) {
        if (error.code === '23505') toast.error('Já existe registro para este colaborador nesta data.');
        else toast.error('Erro ao lançar atestado: ' + error.message);
        return;
      }
      toast.success('Atestado registrado com sucesso!');
    }

    setDialogOpen(false);
    setEditingRecord(null);
    setForm(emptyForm);
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!canDelete('atestados')) {
      toast.error('Sem permissão para excluir atestados.');
      return;
    }
    const { error } = await supabase.from('daily_attendance').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir: ' + error.message);
    else {
      toast.success('Registro excluído.');
      fetchData();
    }
  }

  async function handleExportExcel() {
    const rows = filteredRecords.map((r) => {
      const dias = Math.max(1, r.dias_afastamento || 1);
      return {
        Data_Inicio: formatDate(r.date),
        Data_Retorno: formatDate(calcReturnDate(r.date, dias)),
        Colaborador: r.employee_name || '',
        Cargo: r.cargo || '',
        Contrato: r.departamento || '',
        Tipo: r.status === 'afastamento' ? 'Afastamento' : 'Atestado Médico',
        Dias_Afastamento: dias,
        CID: r.cid || '',
        CRM: r.crm || '',
        Observacao: r.observation || '',
      };
    });
    await writeExcelFile(rows, 'Atestados', `Controle_Atestados_${period.start}_a_${period.end}.xlsx`);
  }

  const mediaDias = filteredRecords.length > 0 ? (analytics.diasPerdidos / filteredRecords.length).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-primary" /> Gestão de Atestados & Saúde da Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel executivo de absenteísmo médico (CID, CRM, dias perdidos, retorno ao trabalho) e controle de atestados
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

          {canCreate('atestados') && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Lançar Atestado
            </Button>
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
              placeholder="Colaborador, CID, CRM ou função..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'todos' | 'atestado' | 'afastamento')}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos (Atestados + Afast.)</SelectItem>
              <SelectItem value="atestado">Atestado Médico</SelectItem>
              <SelectItem value="afastamento">Afastamento / INSS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alertas Ativos Hoje */}
      {afastadosHoje.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {afastadosHoje.map((a) => {
            const dias = Math.max(1, a.dias_afastamento || 1);
            const retorno = calcReturnDate(a.date, dias);
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl p-3.5 border bg-blue-500/5 border-blue-500/25">
                <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-foreground truncate">{a.employee_name}</p>
                  <p className="text-muted-foreground">
                    {a.status === 'afastamento' ? 'Afastamento' : 'Atestado'} ({dias}d) • Retorno: <strong className="text-blue-600">{formatDate(retorno)}</strong>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card danger">
          <div className="flex items-center justify-between mb-1">
            <User className="w-4 h-4 text-destructive opacity-75" />
          </div>
          <p className="text-2xl font-bold">{filteredRecords.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Qtd. de Atestados</p>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-1">
            <Calendar className="w-4 h-4 text-primary opacity-75" />
          </div>
          <p className="text-2xl font-bold text-primary">{analytics.diasPerdidos}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Dias Perdidos no Período</p>
        </div>
        <div className="kpi-card warning">
          <div className="flex items-center justify-between mb-1">
            <Clock className="w-4 h-4 text-amber-600 opacity-75" />
          </div>
          <p className="text-2xl font-bold text-amber-600">{afastadosHoje.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Afastados Hoje</p>
        </div>
        <div className="kpi-card purple">
          <div className="flex items-center justify-between mb-1">
            <Stethoscope className="w-4 h-4 text-purple-600 opacity-75" />
          </div>
          <p className="text-2xl font-bold">{mediaDias}d</p>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mt-1">Média de Dias / Atestado</p>
        </div>
      </div>

      <Tabs defaultValue="painel" className="w-full">
        <TabsList className="bg-card border border-border p-1 h-auto flex-wrap mb-4">
          <TabsTrigger value="painel" className="text-xs sm:text-sm px-4 py-2">
            Painel Analítico da Equipe
          </TabsTrigger>
          <TabsTrigger value="controle" className="text-xs sm:text-sm px-4 py-2">
            Controle & Registros de Atestados ({filteredRecords.length})
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: PAINEL COMPLETO */}
        <TabsContent value="painel" className="space-y-6">
          {filteredRecords.length === 0 ? (
            <div className="corporate-section p-12 text-center text-muted-foreground">
              <Stethoscope className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium">Nenhum atestado registrado no período selecionado.</p>
              <p className="text-xs mt-1">Clique em "+ Lançar Atestado" para iniciar o controle e alimentar os gráficos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top 10 Colaboradores */}
              <div className="glass-card p-5 flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-4">
                  Top 10 Colaboradores — Atestados & Dias Perdidos
                </h3>
                <div className="space-y-3.5">
                  {analytics.topEmps.map((emp) => {
                    const maxCount = Math.max(...analytics.topEmps.map((e) => e.count), 1);
                    const pct = (emp.count / maxCount) * 100;
                    return (
                      <div key={emp.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <button onClick={() => navigate(`/funcionario/${emp.id}?tab=atestados`)} className="font-semibold truncate hover:text-primary text-left pr-2">
                            {emp.name}
                          </button>
                          <span className="font-bold whitespace-nowrap text-muted-foreground">
                            {emp.count}x • <strong className="text-foreground">{emp.dias}d</strong>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-muted/50 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gráficos CID, CRM e Cargos */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="glass-card p-5 h-[240px] flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">CIDs Mais Predominantes</p>
                  <div className="flex-1 w-full">
                    <ExpandableChart title="CIDs Mais Predominantes">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.topCids} margin={{ top: 18, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="value" name="Atestados" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={38}>
                            <LabelList dataKey="value" position="top" style={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 'bold' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ExpandableChart>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-card p-5 h-[230px] flex flex-col">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">CRMs Mais Predominantes</p>
                    <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.topCrms} margin={{ top: 18, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="value" name="Atestados" fill="#0284c7" radius={[4, 4, 0, 0]} barSize={30}>
                            <LabelList dataKey="value" position="top" style={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 'bold' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card p-5 h-[230px] flex flex-col">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Funções com Mais Atestados</p>
                    <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.topCargos} margin={{ top: 18, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="value" name="Atestados" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30}>
                            <LabelList dataKey="value" position="top" style={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 'bold' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ABA 2: CONTROLE & REGISTROS */}
        <TabsContent value="controle">
          <div className="corporate-section p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Histórico & Controle de Atestados ({filteredRecords.length})
            </h3>
            {loading ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Carregando registros...</p>
            ) : filteredRecords.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Nenhum atestado encontrado para os filtros atuais.</p>
            ) : (
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/95">
                    <tr className="border-b border-border">
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Início</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Retorno</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Colaborador</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Cargo</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Tipo</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Dias</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">CID</th>
                      <th className="text-center px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">CRM</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Obs.</th>
                      <th className="text-right px-3 py-2.5 text-[10px] uppercase font-semibold text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r) => {
                      const dias = Math.max(1, r.dias_afastamento || 1);
                      const retorno = calcReturnDate(r.date, dias);
                      return (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">{formatDate(r.date)}</td>
                          <td className="px-3 py-2.5 text-xs font-semibold text-blue-600 whitespace-nowrap">{formatDate(retorno)}</td>
                          <td className="px-3 py-2.5 font-semibold text-xs">
                            <button onClick={() => navigate(`/funcionario/${r.employee_id}?tab=atestados`)} className="hover:text-primary hover:underline text-left">
                              {r.employee_name}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.cargo}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${r.status === 'afastamento' ? 'bg-orange-500/15 text-orange-700' : 'bg-blue-500/15 text-blue-700'}`}>
                              {r.status === 'afastamento' ? 'Afastamento' : 'Atestado'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs font-bold">{dias}d</td>
                          <td className="px-3 py-2.5 text-center text-xs font-mono">{r.cid || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-xs font-mono">{r.crm || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{r.observation || '—'}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap space-x-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/funcionario/${r.employee_id}?tab=atestados`)} title="Ver Perfil">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {canEdit('atestados') && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete('atestados') && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)} title="Excluir">
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

      {/* Dialog: Lançar / Editar Atestado */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Editar Atestado / Afastamento' : 'Lançar Atestado / Afastamento'}</DialogTitle>
            <DialogDescription>Registre os dados clínicos e período de afastamento do colaborador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Colaborador *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
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
                <Label>Data Inicial *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as 'atestado' | 'afastamento' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atestado">Atestado Médico</SelectItem>
                    <SelectItem value="afastamento">Afastamento / INSS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Nº de Dias *</Label>
                <Input type="number" min="1" value={form.dias_afastamento} onChange={(e) => setForm({ ...form, dias_afastamento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CID</Label>
                <FastInput value={form.cid} onValueChange={(v) => setForm((p) => ({ ...p, cid: v }))} placeholder="Ex: M54.5" />
              </div>
              <div className="space-y-1.5">
                <Label>CRM</Label>
                <FastInput value={form.crm} onValueChange={(v) => setForm((p) => ({ ...p, crm: v }))} placeholder="Ex: 12345-ES" />
              </div>
            </div>

            {form.date && parseInt(form.dias_afastamento) > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-3 text-xs text-blue-700 flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wider">Previsão de Retorno ao Trabalho:</span>
                <strong className="text-sm">{formatDate(calcReturnDate(form.date, parseInt(form.dias_afastamento) || 1))}</strong>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observação / Clínica</Label>
              <FastTextarea value={form.observation} onValueChange={(v) => setForm((p) => ({ ...p, observation: v }))} rows={2} placeholder="Hospital/clínica, restrições de retorno, etc." />
            </div>

            <Button className="w-full" onClick={handleSave}>
              {editingRecord ? 'Salvar Alterações' : 'Registrar Atestado'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
