import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Users, Eye, Plus, Edit, Trash2, Loader2, Camera, X, FileUp, FileText, Download, Upload, CheckSquare, Phone, Calendar } from 'lucide-react';
import {
  parseColaboradoresWorkbook,
  normalizeCpf,
  formatCpf,
} from '@/lib/colaboradores-import';
import { Input } from '@/components/ui/input';
import { FastInput } from '@/components/ui/fast-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { DEPARTAMENTOS } from '@/lib/departments';
import { HierarchyBadge } from '@/components/hierarchy/HierarchyBadge';
import { Building2 } from 'lucide-react';

interface Funcionario {
  id: string; nome: string; email: string; departamento: string; cargo: string;
  contrato_vinculado?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  frente_atendimento?: string | null;
  polivalencia?: string | null;
  status_colaborador?: string | null;
  data_admissao: string | null;
  ultima_ferias?: string | null;
  escolaridade: string; graduacao: string;
  pos_graduacao: boolean; pos_graduacao_tipo: string;
  feedbacks_recebidos: number; feedbacks_resolvidos: number;
  foto_url: string; turno: string; letra: string; encarregado_id: string | null;
}

const STATUS_COLABORADOR_OPTIONS = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'RESERVA/CB', label: 'Reserva / CB' },
  { value: 'AFASTADO', label: 'Afastado' },
  { value: 'DESLIGADO', label: 'Desligado' },
];

const departamentos = DEPARTAMENTOS;
const TURNOS = [
  { value: 'dia_a', label: 'Dia A' }, { value: 'dia_b', label: 'Dia B' },
  { value: 'noite_a', label: 'Noite A' }, { value: 'noite_b', label: 'Noite B' },
  { value: 'adm', label: 'ADM' },
];
const CARGOS_COM_DOCUMENTOS = ['motorista', 'operador de equipamentos', 'operador de mini'];
function cargoNeedsDocs(cargo: string) { return CARGOS_COM_DOCUMENTOS.some(c => cargo.toLowerCase().includes(c)); }
function letraFromTurno(turno: string): string {
  if (turno.endsWith('_a')) return 'A';
  if (turno.endsWith('_b')) return 'B';
  return '';
}

export default function Colaboradores() {
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { user, userDepartment, userDepartments, effectiveDepartment, isDepartmentLocked, isAdmin, canViewHierarchy } = useAuth();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('todos');
  const [turnoFilter, setTurnoFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('ATIVOS');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  // Sincroniza filtro se houver departamento travado ou efetivo
  useEffect(() => {
    if (isDepartmentLocked && userDepartment) {
      setDeptFilter(userDepartment);
    } else if (effectiveDepartment) {
      setDeptFilter(effectiveDepartment);
    }
  }, [isDepartmentLocked, userDepartment, effectiveDepartment]);

  // Reset página ao mudar filtros
  useEffect(() => { setCurrentPage(1); }, [search, deptFilter, turnoFilter, statusFilter]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Paginação
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  const initialDept = (isDepartmentLocked && userDepartment) ? userDepartment : '';
  const emptyForm = {
    nome: '', email: '', cpf: '', telefone: '', cargo: '', departamento: initialDept,
    contrato_vinculado: '', frente_atendimento: '', polivalencia: '', status_colaborador: 'ATIVO',
    data_admissao: '', ultima_ferias: '', escolaridade: '', graduacao: '',
    pos_graduacao: false, pos_graduacao_tipo: '', turno: '', letra: '', encarregado_id: 'none',
  };
  const [newData, setNewData] = useState(emptyForm);
  const [editData, setEditData] = useState({ id: '', foto_url: '', ...emptyForm });
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState('');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState('');
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [editDocFiles, setEditDocFiles] = useState<File[]>([]);
  const newFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const editDocFileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchFuncionarios(); }, []);

  async function fetchFuncionarios(silent = false) {
    if (!silent) setLoading(true);
    const { data, error } = await supabase.from('funcionarios').select('*').order('nome');
    if (!error && data) setFuncionarios(data as Funcionario[]);
    if (!silent) setLoading(false);
  }

  const filtered = funcionarios.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch =
      f.nome.toLowerCase().includes(q) ||
      f.cargo.toLowerCase().includes(q) ||
      (f.cpf || '').includes(q.replace(/\D/g, '') || '__none__') ||
      (f.frente_atendimento || '').toLowerCase().includes(q) ||
      (f.polivalencia || '').toLowerCase().includes(q);
    
    // Filtragem por departamento travado ou selecionado
    let matchDept = true;
    const isGlobalEmpDept = f.departamento?.includes('Todos') || f.departamento === 'all' || f.departamento === 'todos';
    if (isGlobalEmpDept) {
      matchDept = true;
    } else if (isDepartmentLocked && userDepartments.length > 0) {
      matchDept = userDepartments.includes(f.departamento) || (!!f.contrato_vinculado && userDepartments.includes(f.contrato_vinculado));
    } else if (deptFilter !== 'todos') {
      matchDept = f.departamento === deptFilter || f.contrato_vinculado === deptFilter;
    }

    const st = (f.status_colaborador || 'ATIVO').toUpperCase();
    let matchStatus = true;
    if (statusFilter === 'ATIVOS') matchStatus = st === 'ATIVO' || st === 'RESERVA/CB';
    else if (statusFilter === 'RESERVA/CB') matchStatus = st === 'RESERVA/CB';
    else if (statusFilter === 'AFASTADO') matchStatus = st === 'AFASTADO';
    else if (statusFilter === 'DESLIGADO') matchStatus = st === 'DESLIGADO';

    const matchTurno = turnoFilter === 'todos' || f.turno === turnoFilter;
    const isSelf = !!user?.email && f.email?.toLowerCase().trim() === user.email.toLowerCase().trim();
    const loggedFuncId = user?.email ? funcionarios.find(fn => fn.email?.toLowerCase().trim() === user.email.toLowerCase().trim())?.id : null;
    const isDirectSubordinate = !!loggedFuncId && f.encarregado_id === loggedFuncId;

    const matchHierarchy = isSelf || isDirectSubordinate || canViewHierarchy(f.cargo, isSelf, isDirectSubordinate);

    return matchSearch && matchDept && matchStatus && matchTurno && matchHierarchy;
  });

  // Paginação: recalcula sempre que filtros mudam
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const allFilteredSelected = filtered.length > 0 && filtered.every(f => selectedIds.has(f.id));

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(f => next.delete(f.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(f => next.add(f.id));
        return next;
      });
    }
  }

  async function handleBulkDelete() {
    if (!canDelete('colaboradores')) { toast.error('Você não tem permissão para excluir colaboradores.'); return; }
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const id of ids) {
      const { error } = await supabase.from('funcionarios').delete().eq('id', id);
      if (!error) deleted++;
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    if (deleted > 0) {
      toast.success(`${deleted} funcionário(s) excluído(s) com sucesso!`);
      fetchFuncionarios(true);
    } else {
      toast.error('Erro ao excluir funcionários');
    }
  }

  async function uploadPhoto(file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(fileName, file);
    if (error) throw error;
    return supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl;
  }

  async function uploadDocument(file: File) {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('documentos').upload(fileName, file);
    if (error) throw error;
    return { url: supabase.storage.from('documentos').getPublicUrl(fileName).data.publicUrl, name: file.name };
  }


  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    if (!canCreate('colaboradores')) { toast.error('Você não tem permissão para importar colaboradores.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const records = await parseColaboradoresWorkbook(data);
      if (records.length === 0) {
        toast.error('Nenhum colaborador válido encontrado na planilha.');
        setImporting(false);
        return;
      }

      const byCpf = new Map<string, Funcionario>();
      const byName = new Map<string, Funcionario>();
      funcionarios.forEach((f) => {
        if (f.cpf) byCpf.set(normalizeCpf(f.cpf), f);
        byName.set(f.nome.trim().toUpperCase(), f);
      });

      const toInsert: Record<string, unknown>[] = [];
      let updatedCount = 0;

      for (const r of records) {
        const existing = (r.cpf ? byCpf.get(r.cpf) : undefined) || byName.get(r.nome.trim().toUpperCase());
        const payload: Record<string, unknown> = {
          nome: r.nome,
          cpf: r.cpf,
          telefone: r.telefone || null,
          cargo: r.cargo,
          departamento: r.departamento,
          contrato_vinculado: r.contrato_vinculado,
          turno: r.turno,
          letra: r.letra,
          frente_atendimento: r.frente_atendimento || null,
          polivalencia: r.polivalencia || null,
          status_colaborador: r.status_colaborador,
          escolaridade: r.escolaridade,
          graduacao: r.graduacao,
          pos_graduacao: r.pos_graduacao,
          pos_graduacao_tipo: r.pos_graduacao_tipo,
        };
        if (r.email) payload.email = r.email;
        if (r.data_admissao) payload.data_admissao = r.data_admissao;
        if (r.ultima_ferias) payload.ultima_ferias = r.ultima_ferias;

        if (existing) {
          const { error } = await supabase.from('funcionarios').update(payload).eq('id', existing.id);
          if (!error) updatedCount++;
        } else {
          toInsert.push(payload);
        }
      }

      let insertedCount = 0;
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error } = await supabase.from('funcionarios').insert(chunk);
        if (error) throw error;
        insertedCount += chunk.length;
      }

      toast.success(`Importação concluída: ${insertedCount} novo(s), ${updatedCount} atualizado(s)!`);
      fetchFuncionarios(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao ler arquivo.';
      toast.error('Erro ao importar: ' + msg);
    }
    setImporting(false);
    if (importFileRef.current) importFileRef.current.value = '';
  }

  async function handleCreate() {
    if (!canCreate('colaboradores')) { toast.error('Você não tem permissão para cadastrar colaboradores.'); return; }
    if (!newData.nome || !newData.cargo) { toast.error('Preencha Nome Completo e Cargo / Função (*)'); return; }
    setUploading(true);
    let foto_url = '';
    try { if (newPhotoFile) foto_url = await uploadPhoto(newPhotoFile); } catch { toast.error('Erro ao enviar foto'); setUploading(false); return; }
    
    const cleanCpf = normalizeCpf(newData.cpf);
    const resolvedDept = newData.departamento || newData.contrato_vinculado || 'Contrato Porto';
    const insertData: Record<string, unknown> = { 
      nome: newData.nome, 
      email: newData.email || null,
      cpf: cleanCpf || null,
      telefone: newData.telefone || null,
      cargo: newData.cargo, 
      departamento: resolvedDept, 
      contrato_vinculado: newData.contrato_vinculado || resolvedDept,
      frente_atendimento: newData.frente_atendimento || null,
      polivalencia: newData.polivalencia || null,
      status_colaborador: newData.status_colaborador || 'ATIVO',
      data_admissao: newData.data_admissao || null,
      ultima_ferias: newData.ultima_ferias || null,
      escolaridade: newData.escolaridade, 
      graduacao: newData.graduacao, 
      pos_graduacao: newData.pos_graduacao, 
      pos_graduacao_tipo: newData.pos_graduacao_tipo, 
      turno: newData.turno, 
      letra: newData.letra, 
      foto_url 
    };
    if (newData.encarregado_id && newData.encarregado_id !== 'none') insertData.encarregado_id = newData.encarregado_id;

    const { data: inserted, error } = await supabase.from('funcionarios').insert(insertData).select().single();

    if (error) { 
      toast.error('Erro ao cadastrar: ' + (error.message || 'Verifique os dados.')); 
      setUploading(false); 
      return; 
    }

    if (docFiles.length > 0 && inserted) {
      for (const file of docFiles) {
        try { 
          const { url, name } = await uploadDocument(file); 
          await supabase.from('employee_documents').insert({ employee_id: inserted.id, file_url: url, file_name: name, document_type: 'habilitacao' }); 
        } catch {
          // Falha ao fazer upload de um documento individual — ignorada para não bloquear o cadastro
        }
      }
    }
    setUploading(false); setNewData(emptyForm); setNewPhotoFile(null); setNewPhotoPreview(''); setDocFiles([]); setCreateOpen(false);
    toast.success('Funcionário cadastrado com sucesso!'); fetchFuncionarios(true);
  }

  function openEdit(f: Funcionario) {
    if (!canEdit('colaboradores')) { toast.error('Você não tem permissão para editar colaboradores.'); return; }
    setEditData({
      id: f.id,
      nome: f.nome,
      email: f.email || '',
      cpf: formatCpf(f.cpf) || '',
      telefone: f.telefone || '',
      cargo: f.cargo,
      departamento: f.departamento,
      contrato_vinculado: f.contrato_vinculado || '',
      frente_atendimento: f.frente_atendimento || '',
      polivalencia: f.polivalencia || '',
      status_colaborador: f.status_colaborador || 'ATIVO',
      foto_url: f.foto_url || '',
      data_admissao: f.data_admissao || '',
      ultima_ferias: f.ultima_ferias || '',
      escolaridade: f.escolaridade || '',
      graduacao: f.graduacao || '',
      pos_graduacao: f.pos_graduacao || false,
      pos_graduacao_tipo: f.pos_graduacao_tipo || '',
      turno: f.turno || '',
      letra: f.letra || '',
      encarregado_id: f.encarregado_id || 'none',
    });
    setEditPhotoFile(null); setEditPhotoPreview(f.foto_url || ''); setEditDocFiles([]); setEditOpen(true);
  }

  async function handleEdit() {
    if (!canEdit('colaboradores')) { toast.error('Você não tem permissão para editar colaboradores.'); return; }
    if (!editData.nome || !editData.cargo) { toast.error('Preencha Nome Completo e Cargo / Função (*)'); return; }
    setUploading(true);
    let foto_url = editData.foto_url;
    try { if (editPhotoFile) foto_url = await uploadPhoto(editPhotoFile); } catch { toast.error('Erro foto'); setUploading(false); return; }

    const cleanCpf = normalizeCpf(editData.cpf);
    const resolvedDept = editData.departamento || editData.contrato_vinculado || 'Contrato Porto';
    const updateData: Record<string, unknown> = { 
      nome: editData.nome, 
      email: editData.email || null,
      cpf: cleanCpf || null,
      telefone: editData.telefone || null,
      cargo: editData.cargo, 
      departamento: resolvedDept, 
      contrato_vinculado: editData.contrato_vinculado || null,
      frente_atendimento: editData.frente_atendimento || null,
      polivalencia: editData.polivalencia || null,
      status_colaborador: editData.status_colaborador || 'ATIVO',
      data_admissao: editData.data_admissao || null,
      ultima_ferias: editData.ultima_ferias || null,
      escolaridade: editData.escolaridade, 
      graduacao: editData.graduacao, 
      pos_graduacao: editData.pos_graduacao, 
      pos_graduacao_tipo: editData.pos_graduacao_tipo, 
      turno: editData.turno, 
      letra: editData.letra, 
      encarregado_id: editData.encarregado_id && editData.encarregado_id !== 'none' ? editData.encarregado_id : null, 
      foto_url 
    };

    const { error } = await supabase.from('funcionarios').update(updateData).eq('id', editData.id);

    if (editDocFiles.length > 0) {
      for (const file of editDocFiles) {
        try { 
          const { url, name } = await uploadDocument(file); 
          await supabase.from('employee_documents').insert({ employee_id: editData.id, file_url: url, file_name: name, document_type: 'habilitacao' }); 
        } catch {
          // Falha ao fazer upload de um documento individual — ignorada para não bloquear a atualização
        }
      }
    }
    setUploading(false);
    if (error) { toast.error('Erro ao atualizar: ' + (error.message || 'Verifique os dados.')); return; }
    setEditOpen(false); toast.success('Funcionário atualizado com sucesso!'); fetchFuncionarios(true);
  }

  async function handleDelete() {
    if (!deleteId) return;
    if (!canDelete('colaboradores')) { toast.error('Você não tem permissão para excluir colaboradores.'); return; }
    const { error } = await supabase.from('funcionarios').delete().eq('id', deleteId);
    if (error) { toast.error('Erro ao excluir'); return; }
    setDeleteId(null); toast.success('Funcionário excluído!'); fetchFuncionarios(true);
  }

  function handleDocFilesChange(e: React.ChangeEvent<HTMLInputElement>, isEdit = false) {
    const files = Array.from(e.target.files || []);
    if (isEdit) setEditDocFiles(prev => [...prev, ...files]);
    else setDocFiles(prev => [...prev, ...files]);
  }

  function renderFormFields(data: typeof newData, setData: (d: typeof newData) => void, docs: File[], setDocs: React.Dispatch<React.SetStateAction<File[]>>, docRef: React.RefObject<HTMLInputElement>) {
    return (
      <div className="space-y-5">
        {/* BLOCO 1: DADOS CADASTRAIS & CONTRATUAIS */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border pb-1">
            1. Dados Pessoais & Alocação
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <FastInput value={data.nome} onValueChange={v => setData({ ...data, nome: v })} placeholder="Nome completo do colaborador" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">CPF</Label>
              <FastInput value={data.cpf} onValueChange={v => setData({ ...data, cpf: v })} placeholder="000.000.000-00" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Telefone / Contato</Label>
              <FastInput value={data.telefone} onValueChange={v => setData({ ...data, telefone: v })} placeholder="(27) 99999-9999" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Data de Admissão</Label>
              <Input type="date" value={data.data_admissao} onChange={e => setData({ ...data, data_admissao: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Última Data de Férias</Label>
              <Input type="date" value={data.ultima_ferias} onChange={e => setData({ ...data, ultima_ferias: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cargo / Função *</Label>
              <FastInput value={data.cargo} onValueChange={v => setData({ ...data, cargo: v })} placeholder="Ex: Encarregado Operacional" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status</Label>
              <Select value={data.status_colaborador || 'ATIVO'} onValueChange={v => setData({ ...data, status_colaborador: v })}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {STATUS_COLABORADOR_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* BLOCO 2: ESCALA & TURNO OPERACIONAL */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border pb-1">
            2. Escala & Turno Operacional
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Turno / Escala</Label>
              <Select value={data.turno} onValueChange={v => setData({ ...data, turno: v, letra: letraFromTurno(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione a escala" /></SelectTrigger>
                <SelectContent>{TURNOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Atendimento / Equipamento Habitual</Label>
              <FastInput value={data.frente_atendimento} onValueChange={v => setData({ ...data, frente_atendimento: v })} placeholder="Ex: PIPA ASPERSÃO TPM, RETROESCAVADEIRA" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Polivalência / Equipamentos Habilitados</Label>
              <FastInput value={data.polivalencia} onValueChange={v => setData({ ...data, polivalencia: v })} placeholder="Ex: RE/PC, PP/CA, TODOS EQUIPAMENTOS" />
            </div>
          </div>
        </div>

        {/* BLOCO 3: DOCUMENTOS COMPLEMENTARES */}
        {cargoNeedsDocs(data.cargo) && (
          <div className="space-y-2 p-3.5 rounded-xl bg-muted/40 border border-border">
            <Label className="flex items-center gap-2 text-xs font-bold uppercase text-foreground">
              <FileUp className="w-4 h-4 text-primary" /> Anexos de Habilitação / Documentos
            </Label>
            <input ref={docRef} type="file" accept=".pdf,image/*" multiple className="hidden" onChange={e => handleDocFilesChange(e, docs === editDocFiles)} />
            <Button type="button" variant="outline" size="sm" onClick={() => docRef.current?.click()} className="w-full">
              <FileUp className="w-4 h-4 mr-2" /> Anexar Documentos
            </Button>
            {docs.length > 0 && (
              <div className="space-y-1 mt-2">
                {docs.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded border border-border/60">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate flex-1">{f.name}</span>
                    <button onClick={() => { const u = [...docs]; u.splice(i, 1); setDocs(u); }} className="text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold">Colaboradores</h1>
        <p className="text-muted-foreground text-sm mt-1">Lista e cadastro de funcionários</p>
      </motion.div>

      <Tabs defaultValue="lista" className="w-full mt-6">
        <TabsList className="w-full justify-start h-auto flex-wrap p-1.5 bg-muted/30 rounded-xl mb-6 border border-border">
          <TabsTrigger value="lista" className="px-5 py-2.5 text-sm font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all">Lista de Colaboradores</TabsTrigger>
        </TabsList>
        
        <TabsContent value="lista" className="space-y-6 outline-none">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {isDepartmentLocked && userDepartment ? (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border border-primary/20 text-primary font-semibold text-xs rounded-lg whitespace-nowrap">
            <Building2 className="w-4 h-4" />
            <span>{userDepartment}</span>
          </div>
        ) : (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Departamento" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos Departamentos</SelectItem>{departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={turnoFilter} onValueChange={setTurnoFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Turno/Escala" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Turnos</SelectItem>
            {TURNOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ATIVOS">Ativos (Padrão)</SelectItem>
            <SelectItem value="RESERVA/CB">Reserva / CB</SelectItem>
            <SelectItem value="AFASTADO">Afastados</SelectItem>
            <SelectItem value="DESLIGADO">Desligados</SelectItem>
            <SelectItem value="TODOS">Todos Status</SelectItem>
          </SelectContent>
        </Select>
        {canCreate('colaboradores') && (
          <div className="flex gap-2">
            <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
            <Button variant="outline" onClick={() => importFileRef.current?.click()} disabled={importing}>{importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}Importar</Button>
          </div>
        )}
        {canCreate('colaboradores') && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Novo Funcionário</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Cadastrar Novo Funcionário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-4 bg-muted/30 p-3 rounded-xl border border-border/60">
                  <input ref={newFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) { setNewPhotoFile(file); setNewPhotoPreview(URL.createObjectURL(file)); }}} />
                  {newPhotoPreview ? (
                    <div className="relative">
                      <img src={newPhotoPreview} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-primary/20" />
                      <button onClick={() => { setNewPhotoFile(null); setNewPhotoPreview(''); }} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => newFileRef.current?.click()} className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 text-primary transition-colors">
                      <Camera className="w-6 h-6" />
                    </button>
                  )}
                  <div>
                    <h5 className="font-semibold text-sm text-foreground">Foto do Perfil (Opcional)</h5>
                    <p className="text-xs text-muted-foreground">Clique no círculo para selecionar a foto de identificação do colaborador</p>
                  </div>
                </div>
                {renderFormFields(newData, setNewData, docFiles, setDocFiles, docFileRef as React.RefObject<HTMLInputElement>)}
                <Button className="w-full py-5 font-bold" onClick={handleCreate} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Cadastrar Colaborador
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Nenhum colaborador encontrado</p></div>
      ) : (
        <>
          {/* Bulk selection bar */}
          {canDelete('colaboradores') && (
            <div className="flex items-center gap-3 glass-card rounded-xl p-3">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={toggleSelectAll}
                id="select-all-employees"
              />
              <label htmlFor="select-all-employees" className="text-sm font-medium cursor-pointer">
                Selecionar todos ({filtered.length})
              </label>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground ml-auto">
                    {selectedIds.size} selecionado(s)
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir Selecionados
                  </Button>
                </>
              )}
            </div>
          )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {paginated.map((f, i) => {
            const turnoLabel = TURNOS.find(t => t.value === f.turno)?.label;
            return (
              <motion.div key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`glass-card rounded-2xl p-5 flex flex-col items-center text-center gap-4 hover:ring-1 hover:ring-primary/30 transition-all relative overflow-hidden group ${selectedIds.has(f.id) ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`}
              >
                {canDelete('colaboradores') && (
                  <div className="absolute top-4 left-4">
                    <Checkbox
                      checked={selectedIds.has(f.id)}
                      onCheckedChange={() => toggleSelect(f.id)}
                    />
                  </div>
                )}
                
                {(canEdit('colaboradores') || canDelete('colaboradores')) && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm">
                    {canEdit('colaboradores') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => openEdit(f)} title="Editar"><Edit className="w-3.5 h-3.5" /></Button>
                    )}
                    {canDelete('colaboradores') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-destructive hover:text-destructive" onClick={() => setDeleteId(f.id)} title="Excluir"><Trash2 className="w-3.5 h-3.5" /></Button>
                    )}
                  </div>
                )}

                <div className="mt-2">
                  {f.foto_url ? (
                    <img src={f.foto_url} alt={f.nome} className="w-20 h-20 rounded-full object-cover border-4 border-background shadow-md mx-auto" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border-4 border-background shadow-sm mx-auto"><span className="text-primary font-black text-2xl">{f.nome.charAt(0)}</span></div>
                  )}
                </div>
                
                <div className="flex-1 w-full space-y-2">
                  <div>
                    <p className="font-bold text-base line-clamp-1">{f.nome}</p>
                    <p className="text-xs text-primary font-medium">{f.cargo}</p>
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                    <HierarchyBadge cargo={f.cargo} />
                    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{f.departamento}</span>
                    {f.status_colaborador && f.status_colaborador !== 'ATIVO' && (
                      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        f.status_colaborador === 'DESLIGADO'
                          ? 'bg-destructive/15 text-destructive'
                          : f.status_colaborador === 'AFASTADO'
                          ? 'bg-orange-500/15 text-orange-600'
                          : 'bg-amber-500/15 text-amber-700'
                      }`}>
                        {f.status_colaborador}
                      </span>
                    )}
                    {f.contrato_vinculado && f.contrato_vinculado !== f.departamento && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20" title={`Vinculado ao ${f.contrato_vinculado}`}>
                        📍 Vinculado: {f.contrato_vinculado}
                      </span>
                    )}
                    {turnoLabel && <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-chart-3/10 text-chart-3">{turnoLabel}</span>}
                    {f.frente_atendimento && <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">{f.frente_atendimento}</span>}
                    {f.polivalencia && <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700" title="Polivalência / Observação">{f.polivalencia}</span>}
                  </div>
                  {(f.telefone || f.data_admissao || f.ultima_ferias) && (
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-1">
                      {f.telefone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{f.telefone}</span>}
                      {f.data_admissao && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Adm: {new Date(f.data_admissao + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                      {f.ultima_ferias && <span className="inline-flex items-center gap-1 text-teal-600 font-medium">Férias: {new Date(f.ultima_ferias + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                    </div>
                  )}
                </div>
                
                <div className="w-full mt-2 pt-4 border-t border-border/50">
                  <Button variant="outline" className="w-full text-xs" onClick={() => navigate(`/funcionario/${f.id}`)}><Eye className="w-3.5 h-3.5 mr-2" /> Ver Perfil</Button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-1">
            <p className="text-sm text-muted-foreground">
              Mostrando <span className="font-medium text-foreground">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</span> de <span className="font-medium text-foreground">{filtered.length}</span> colaboradores
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="h-8 px-3 text-xs"
              >
                ← Anterior
              </Button>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-1 text-muted-foreground text-xs">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={safePage === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(p as number)}
                      className="h-8 w-8 p-0 text-xs"
                    >
                      {p}
                    </Button>
                  )
                )
              }
              <Button
                variant="outline" size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="h-8 px-3 text-xs"
              >
                Próximo →
              </Button>
            </div>
          </div>
        )}
        </>
      )}
      </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Editar Dados do Funcionário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4 bg-muted/30 p-3 rounded-xl border border-border/60">
              <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) { setEditPhotoFile(file); setEditPhotoPreview(URL.createObjectURL(file)); }}} />
              {editPhotoPreview ? (
                <div className="relative">
                  <img src={editPhotoPreview} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-primary/20" />
                  <button onClick={() => { setEditPhotoFile(null); setEditPhotoPreview(''); setEditData({ ...editData, foto_url: '' }); }} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => editFileRef.current?.click()} className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 text-primary transition-colors">
                  <Camera className="w-6 h-6" />
                </button>
              )}
              <div>
                <h5 className="font-semibold text-sm text-foreground">Foto do Perfil</h5>
                <p className="text-xs text-muted-foreground">Clique na foto para atualizar a imagem de identificação do colaborador</p>
              </div>
            </div>
            {renderFormFields(editData, setEditData as (v: typeof editData | ((p: typeof editData) => typeof editData)) => void, editDocFiles, setEditDocFiles, editDocFileRef as React.RefObject<HTMLInputElement>)}
            <Button className="w-full py-5 font-bold" onClick={handleEdit} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir funcionário?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={open => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} funcionário(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir permanentemente os funcionários selecionados. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkDeleting ? 'Excluindo...' : `Excluir ${selectedIds.size} funcionário(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
