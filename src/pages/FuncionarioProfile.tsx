import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  Pencil,
  Trash2,
  Plus,
  FileText,
  ExternalLink,
  Camera,
  Loader2,
  Clock,
  Sun,
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  Briefcase,
  Phone,
  IdCard,
  Truck,
  CheckCircle2,
  Upload,
  Download,
  Award,
  Layers,
  User,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FastInput } from '@/components/ui/fast-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBusatoLogoBase64, drawBusatoHeader, drawBusatoFooter } from '@/lib/pdfLogo';
import { HierarchyBadge } from '@/components/hierarchy/HierarchyBadge';
import { calcularSituacaoFerias, formatCpf, normalizeCpf } from '@/lib/colaboradores-import';

interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  departamento: string;
  contrato_vinculado?: string | null;
  foto_url: string | null;
  email: string | null;
  cpf?: string | null;
  telefone?: string | null;
  data_admissao: string | null;
  ultima_ferias?: string | null;
  frente_atendimento?: string | null;
  polivalencia?: string | null;
  status_colaborador?: string | null;
  turno: string;
  letra: string;
  encarregado_id: string | null;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: string;
  cid?: string | null;
  crm?: string | null;
  dias_afastamento?: number | null;
  observation: string | null;
}

interface VacationInfo {
  id: string;
  employee_id: string;
  start_date: string | null;
  end_date: string | null;
  days_count: number;
  scheduled_month: string;
  remaining_days: number | null;
  observation: string;
}

interface WarningRecord {
  id: string;
  date: string;
  reason: string;
  applied: boolean;
  observation: string;
  created_at: string;
}

interface EmployeeDocument {
  id: string;
  file_url: string;
  file_name: string;
  document_type: string;
  created_at: string;
}

interface TreinamentoSSMARow {
  id: string;
  nome: string;
  cpf: string;
  funcao: string;
  situacao: string;
  cnh_categoria: string;
  cnh_vencimento: string;
  treinamentos: Record<string, string>;
}

interface EventRecord {
  id: string;
  event_date: string;
  event_time: string;
  day_of_week: string;
  description: string;
  location: string;
  equipment: string;
  plate_tag: string;
  shift: string;
  supervisor: string;
  categoria_evento?: string;
}

interface DocWithAutoTable {
  lastAutoTable?: { finalY: number };
}

const TURNO_OPTIONS = [
  { value: 'dia_a', label: 'Dia — Letra A', letra: 'A' },
  { value: 'dia_b', label: 'Dia — Letra B', letra: 'B' },
  { value: 'noite_a', label: 'Noite — Letra A', letra: 'A' },
  { value: 'noite_b', label: 'Noite — Letra B', letra: 'B' },
  { value: 'adm', label: 'Administrativo (ADM)', letra: '' },
];

const TURNO_LABELS: Record<string, string> = {
  dia_a: 'Dia A',
  dia_b: 'Dia B',
  noite_a: 'Noite A',
  noite_b: 'Noite B',
  adm: 'ADM',
};

const PONTO_STATUS_LABELS: Record<string, string> = {
  presente: 'Presente',
  falta: 'Falta Injustificada',
  falta_injustificada: 'Falta Injustificada',
  falta_justificada: 'Falta Justificada',
  extra: 'Hora Extra',
  banco_horas: 'Banco de Horas',
  abono: 'Abono',
  ferias: 'Férias',
};

const PONTO_STATUS_COLORS: Record<string, string> = {
  presente: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  falta: 'bg-destructive/10 text-destructive border-destructive/20',
  falta_injustificada: 'bg-destructive/10 text-destructive border-destructive/20',
  falta_justificada: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  extra: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  banco_horas: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  abono: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  ferias: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
};

const DEFAULT_RACS = [
  'RAC 01 (Altura)',
  'RAC 02 (Veículos Leves)',
  'RAC 03 (Equipamentos Móveis)',
  'RAC 04 (Bloqueio de Energia)',
  'RAC 05 (Içamento)',
  'Prontidão',
  'Regras de Ouro',
  'Direitos Humanos',
  'NR 06 (EPI)',
  'NR 20',
  'NR 26',
];

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const clean = iso.includes('T') ? iso.split('T')[0] : iso;
  if (clean.includes('/')) return clean;
  const parts = clean.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function calcTempoDeCasa(admissao?: string | null): string {
  if (!admissao) return 'Data não informada';
  const start = new Date(`${admissao}T00:00:00`);
  if (isNaN(start.getTime())) return '—';
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months = Math.max(0, months - 1);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0 && remMonths === 0) return 'Menos de 1 mês';
  if (years === 0) return `${remMonths} ${remMonths === 1 ? 'mês' : 'meses'}`;
  if (remMonths === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years}a ${remMonths}m`;
}

function calcDataRetorno(startIso: string, dias?: number | null): string | null {
  if (!startIso) return null;
  const n = Math.max(1, Number(dias || 1));
  const d = new Date(`${startIso}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function evaluateTrainingDate(raw?: string | null): {
  status: 'EM_DIA' | 'ATENCAO' | 'VENCIDO' | 'NA';
  label: string;
  badgeClass: string;
  daysLeft: number | null;
} {
  const val = String(raw || '').trim();
  if (!val || val === '-' || val.toUpperCase() === 'N/A' || val.toUpperCase() === 'NA') {
    return {
      status: 'NA',
      label: 'N/A',
      badgeClass: 'bg-muted text-muted-foreground border-border',
      daysLeft: null,
    };
  }
  const lower = val.toLowerCase();
  if (lower.includes('realizado') || lower === 'ok' || lower.includes('em dia')) {
    return {
      status: 'EM_DIA',
      label: 'Em Dia',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
      daysLeft: null,
    };
  }
  if (lower.includes('programado') || lower.includes('pendente')) {
    return {
      status: 'ATENCAO',
      label: 'Programado',
      badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/25',
      daysLeft: null,
    };
  }

  let d: Date | null = null;
  if (val.includes('/')) {
    const p = val.split('/');
    if (p.length === 3) {
      const year = p[2].length === 2 ? 2000 + Number(p[2]) : Number(p[2]);
      d = new Date(year, Number(p[1]) - 1, Number(p[0]));
    }
  } else if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    d = new Date(`${val.slice(0, 10)}T00:00:00`);
  }

  if (!d || isNaN(d.getTime())) {
    return {
      status: 'NA',
      label: val,
      badgeClass: 'bg-muted text-muted-foreground border-border',
      daysLeft: null,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      status: 'VENCIDO',
      label: `Vencido (${Math.abs(diffDays)}d)`,
      badgeClass: 'bg-destructive/15 text-destructive border-destructive/30',
      daysLeft: diffDays,
    };
  }
  if (diffDays <= 30) {
    return {
      status: 'ATENCAO',
      label: `Vence em ${diffDays}d`,
      badgeClass: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
      daysLeft: diffDays,
    };
  }
  return {
    status: 'EM_DIA',
    label: 'Em Dia',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
    daysLeft: diffDays,
  };
}

export default function FuncionarioProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['visao-geral', 'ponto', 'ferias', 'atestados', 'treinamentos', 'documentos'];
  const rawTab = searchParams.get('tab') || 'visao-geral';
  const initialTab = validTabs.includes(rawTab) ? rawTab : 'visao-geral';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const t = searchParams.get('tab') || 'visao-geral';
    setActiveTab(validTabs.includes(t) ? t : 'visao-geral');
  }, [searchParams]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setSearchParams({ tab: val }, { replace: true });
  };

  const { canCreate, canEdit, canDelete } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [func, setFunc] = useState<Funcionario | null>(null);
  const [gestorNome, setGestorNome] = useState<string | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [vacationInfo, setVacationInfo] = useState<VacationInfo | null>(null);
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [treinamentoRow, setTreinamentoRow] = useState<TreinamentoSSMARow | null>(null);
  const [ssmaEvents, setSsmaEvents] = useState<EventRecord[]>([]);

  // Photo & Document Upload
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTypeToUpload, setDocTypeToUpload] = useState('CNH / Habilitação');
  const [deleteDocItem, setDeleteDocItem] = useState<EmployeeDocument | null>(null);

  // Quick Edit Collaborator Modal
  const [editColabOpen, setEditColabOpen] = useState(false);
  const [savingColab, setSavingColab] = useState(false);
  const [colabForm, setColabForm] = useState({
    cargo: '',
    cpf: '',
    telefone: '',
    data_admissao: '',
    ultima_ferias: '',
    status_colaborador: 'ATIVO',
    turno: '',
    frente_atendimento: '',
    polivalencia: '',
  });

  // Ponto Modal
  const [pontoDialogOpen, setPontoDialogOpen] = useState(false);
  const [savingPonto, setSavingPonto] = useState(false);
  const [pontoFilter, setPontoFilter] = useState('TODOS');
  const [pontoForm, setPontoForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    status: 'extra',
    observation: '',
  });
  const [deleteAttendanceId, setDeleteAttendanceId] = useState<string | null>(null);

  // Warning Modal
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [savingWarning, setSavingWarning] = useState(false);
  const [warningForm, setWarningForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    reason: '',
    applied: true,
    observation: '',
  });
  const [deleteWarningId, setDeleteWarningId] = useState<string | null>(null);

  // Vacation Modal
  const [feriasDialogOpen, setFeriasDialogOpen] = useState(false);
  const [savingFerias, setSavingFerias] = useState(false);
  const [feriasForm, setFeriasForm] = useState({
    data_admissao: '',
    ultima_ferias: '',
    scheduled_month: '',
    start_date: '',
    end_date: '',
    days_count: 30,
    remaining_days: 0,
    observation: '',
  });

  // Atestado Modal
  const [atestadoDialogOpen, setAtestadoDialogOpen] = useState(false);
  const [savingAtestado, setSavingAtestado] = useState(false);
  const [atestadoForm, setAtestadoForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    status: 'atestado',
    dias_afastamento: 1,
    cid: '',
    crm: '',
    observation: '',
  });

  // Treinamento / CNH Edit Modal
  const [treinDialogOpen, setTreinDialogOpen] = useState(false);
  const [savingTrein, setSavingTrein] = useState(false);
  const [treinForm, setTreinForm] = useState<{
    cnh_categoria: string;
    cnh_vencimento: string;
    treinamentos: Record<string, string>;
    novoNomeRac: string;
    novaDataRac: string;
  }>({
    cnh_categoria: '',
    cnh_vencimento: '',
    treinamentos: {},
    novoNomeRac: '',
    novaDataRac: '',
  });

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: funcData, error: funcErr } = await supabase
      .from('funcionarios')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (funcErr || !funcData) {
      setFunc(null);
      setLoading(false);
      return;
    }

    const f = funcData as unknown as Funcionario;
    setFunc(f);

    const [
      gestorRes,
      attRes,
      vacRes,
      warnRes,
      docsRes,
      treinRes,
      eventsRes,
    ] = await Promise.all([
      f.encarregado_id
        ? supabase.from('funcionarios').select('nome').eq('id', f.encarregado_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('daily_attendance').select('*').eq('employee_id', id).order('date', { ascending: false }),
      supabase.from('vacation_control').select('*').eq('employee_id', id).maybeSingle(),
      supabase.from('employee_warnings').select('*').eq('employee_id', id).order('date', { ascending: false }),
      supabase.from('employee_documents').select('*').eq('employee_id', id).order('created_at', { ascending: false }),
      supabase.from('treinamentos_ssma').select('*'),
      supabase.from('events').select('*').ilike('involved_name', `%${f.nome.trim()}%`).order('event_date', { ascending: false }),
    ]);

    setGestorNome(gestorRes.data?.nome || null);
    setAttendanceRecords((attRes.data as unknown as AttendanceRecord[]) || []);
    setVacationInfo((vacRes.data as unknown as VacationInfo) || null);
    setWarnings((warnRes.data as unknown as WarningRecord[]) || []);
    setDocuments((docsRes.data as unknown as EmployeeDocument[]) || []);
    setSsmaEvents((eventsRes.data as unknown as EventRecord[]) || []);

    // Match treinamento row by CPF (digits) or exact/normalized name
    const allTrein = (treinRes.data as unknown as TreinamentoSSMARow[]) || [];
    const targetCpf = normalizeCpf(f.cpf);
    const targetName = f.nome.trim().toUpperCase();
    const matchedTrein =
      allTrein.find((t) => targetCpf && normalizeCpf(t.cpf) === targetCpf) ||
      allTrein.find((t) => (t.nome || '').trim().toUpperCase() === targetName) ||
      null;
    setTreinamentoRow(matchedTrein);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived splits: Ponto vs Atestados
  const pontoRecords = useMemo(
    () => attendanceRecords.filter((r) => !['atestado', 'afastamento'].includes(r.status)),
    [attendanceRecords]
  );

  const atestadoRecords = useMemo(
    () => attendanceRecords.filter((r) => ['atestado', 'afastamento'].includes(r.status)),
    [attendanceRecords]
  );

  const filteredPontoRecords = useMemo(() => {
    if (pontoFilter === 'TODOS') return pontoRecords;
    if (pontoFilter === 'FALTAS') {
      return pontoRecords.filter((r) => ['falta', 'falta_injustificada', 'falta_justificada'].includes(r.status));
    }
    return pontoRecords.filter((r) => r.status === pontoFilter);
  }, [pontoRecords, pontoFilter]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthPrefix = useMemo(() => todayIso.slice(0, 7), [todayIso]);

  // Ponto Metrics
  const pontoStats = useMemo(() => {
    const faltasInjust = pontoRecords.filter((r) => r.status === 'falta' || r.status === 'falta_injustificada').length;
    const faltasJust = pontoRecords.filter((r) => r.status === 'falta_justificada').length;
    const abonos = pontoRecords.filter((r) => r.status === 'abono').length;
    const extrasTotal = pontoRecords.filter((r) => r.status === 'extra').length;
    const extrasMes = pontoRecords.filter((r) => r.status === 'extra' && r.date.startsWith(currentMonthPrefix)).length;
    const bancoHoras = pontoRecords.filter((r) => r.status === 'banco_horas').length;
    const saldoLiquidoBanco = bancoHoras - faltasInjust;
    return { faltasInjust, faltasJust, abonos, extrasTotal, extrasMes, bancoHoras, saldoLiquidoBanco };
  }, [pontoRecords, currentMonthPrefix]);

  // Vacation Eligibility
  const feriasElegibilidade = useMemo(
    () => calcularSituacaoFerias(func?.data_admissao, func?.ultima_ferias),
    [func?.data_admissao, func?.ultima_ferias]
  );

  const emFeriasHoje = useMemo(() => {
    if (!vacationInfo?.start_date || !vacationInfo?.end_date) return false;
    return vacationInfo.start_date <= todayIso && todayIso <= vacationInfo.end_date;
  }, [vacationInfo, todayIso]);

  // Medical Leave Stats
  const atestadoStats = useMemo(() => {
    const totalAtestados = atestadoRecords.length;
    const totalDias = atestadoRecords.reduce((acc, r) => acc + Math.max(1, Number(r.dias_afastamento || 1)), 0);
    const ultimo = atestadoRecords[0] || null;

    // Check if any atestado/afastamento covers today
    let afastadoHojeAte: string | null = null;
    for (const r of atestadoRecords) {
      const retorno = calcDataRetorno(r.date, r.dias_afastamento);
      if (r.date <= todayIso && retorno && todayIso < retorno) {
        if (!afastadoHojeAte || retorno > afastadoHojeAte) {
          afastadoHojeAte = retorno;
        }
      }
    }
    return { totalAtestados, totalDias, ultimo, afastadoHojeAte };
  }, [atestadoRecords, todayIso]);

  // Trainings & CNH Evaluation
  const trainingSummary = useMemo(() => {
    const cnhEval = evaluateTrainingDate(treinamentoRow?.cnh_vencimento);
    const entries = Object.entries(treinamentoRow?.treinamentos || {}).map(([name, rawVal]) => ({
      name,
      rawVal,
      ...evaluateTrainingDate(rawVal),
    }));
    const emDia = entries.filter((e) => e.status === 'EM_DIA').length;
    const atencao = entries.filter((e) => e.status === 'ATENCAO').length;
    const vencidos = entries.filter((e) => e.status === 'VENCIDO').length;
    return { cnhEval, entries, emDia, atencao, vencidos };
  }, [treinamentoRow]);

  // Unified timeline for Overview tab
  const recentTimeline = useMemo(() => {
    const items: { id: string; date: string; category: string; title: string; subtitle: string; badgeClass: string }[] = [];

    pontoRecords.slice(0, 8).forEach((r) => {
      items.push({
        id: `ponto-${r.id}`,
        date: r.date,
        category: 'Ponto',
        title: PONTO_STATUS_LABELS[r.status] || r.status,
        subtitle: r.observation || 'Apontamento registrado em Controle de Ponto',
        badgeClass: PONTO_STATUS_COLORS[r.status] || 'bg-muted text-foreground',
      });
    });

    atestadoRecords.slice(0, 6).forEach((r) => {
      const dias = Math.max(1, Number(r.dias_afastamento || 1));
      items.push({
        id: `atestado-${r.id}`,
        date: r.date,
        category: 'Atestado',
        title: `${r.status === 'afastamento' ? 'Afastamento Médico' : 'Atestado Médico'} (${dias}d)`,
        subtitle: `${r.cid ? `CID ${r.cid}` : 'Sem CID'}${r.crm ? ` • CRM ${r.crm}` : ''}${r.observation ? ` — ${r.observation}` : ''}`,
        badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/25',
      });
    });

    warnings.slice(0, 5).forEach((w) => {
      items.push({
        id: `warn-${w.id}`,
        date: w.date,
        category: 'Advertência',
        title: `Advertência: ${w.reason}`,
        subtitle: w.observation || (w.applied ? 'Aplicada formalmente' : 'Registrada'),
        badgeClass: 'bg-destructive/10 text-destructive border-destructive/25',
      });
    });

    ssmaEvents.slice(0, 5).forEach((ev) => {
      items.push({
        id: `ev-${ev.id}`,
        date: (ev.event_date || '').slice(0, 10),
        category: 'SSMA',
        title: ev.description || 'Ocorrência operacional SSMA',
        subtitle: [ev.location, ev.equipment, ev.plate_tag].filter(Boolean).join(' • '),
        badgeClass: 'bg-orange-500/10 text-orange-700 border-orange-500/25',
      });
    });

    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  }, [pontoRecords, atestadoRecords, warnings, ssmaEvents]);

  // Handlers
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !func) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop();
    const path = `fotos/${func.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('documentos').upload(path, file, { upsert: true });
    if (error) {
      toast.error('Erro ao enviar foto');
      setUploadingPhoto(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path);
    const { error: updErr } = await supabase
      .from('funcionarios')
      .update({ foto_url: urlData.publicUrl })
      .eq('id', func.id);
    if (updErr) {
      toast.error('Erro ao salvar foto no cadastro');
    } else {
      setFunc({ ...func, foto_url: urlData.publicUrl });
      toast.success('Foto atualizada com sucesso!');
    }
    setUploadingPhoto(false);
  }

  function openEditColabModal() {
    if (!func) return;
    setColabForm({
      cargo: func.cargo || '',
      cpf: formatCpf(func.cpf) || '',
      telefone: func.telefone || '',
      data_admissao: func.data_admissao || '',
      ultima_ferias: func.ultima_ferias || '',
      status_colaborador: func.status_colaborador || 'ATIVO',
      turno: func.turno || '',
      frente_atendimento: func.frente_atendimento || '',
      polivalencia: func.polivalencia || '',
    });
    setEditColabOpen(true);
  }

  async function handleSaveColab() {
    if (!func) return;
    setSavingColab(true);
    const selectedTurno = TURNO_OPTIONS.find((t) => t.value === colabForm.turno);
    const payload = {
      cargo: colabForm.cargo.trim() || func.cargo,
      cpf: normalizeCpf(colabForm.cpf) || null,
      telefone: colabForm.telefone.trim(),
      data_admissao: colabForm.data_admissao || null,
      ultima_ferias: colabForm.ultima_ferias || null,
      status_colaborador: colabForm.status_colaborador || 'ATIVO',
      turno: colabForm.turno || '',
      letra: selectedTurno ? selectedTurno.letra : func.letra || '',
      frente_atendimento: colabForm.frente_atendimento.trim(),
      polivalencia: colabForm.polivalencia.trim(),
    };

    const { error } = await supabase.from('funcionarios').update(payload as never).eq('id', func.id);
    setSavingColab(false);
    if (error) {
      toast.error(`Erro ao atualizar cadastro: ${error.message}`);
      return;
    }
    toast.success('Dados do colaborador atualizados!');
    setEditColabOpen(false);
    loadData();
  }

  async function handleCreatePonto() {
    if (!func || !pontoForm.date) return;
    setSavingPonto(true);
    const { error } = await supabase.from('daily_attendance').upsert(
      {
        employee_id: func.id,
        date: pontoForm.date,
        status: pontoForm.status,
        observation: pontoForm.observation.trim(),
      },
      { onConflict: 'employee_id,date' }
    );
    setSavingPonto(false);
    if (error) {
      toast.error(`Erro ao registrar ponto: ${error.message}`);
      return;
    }
    toast.success('Apontamento salvo no histórico do colaborador!');
    setPontoDialogOpen(false);
    setPontoForm({ date: new Date().toISOString().slice(0, 10), status: 'extra', observation: '' });
    loadData();
  }

  async function handleDeleteAttendance() {
    if (!deleteAttendanceId) return;
    const { error } = await supabase.from('daily_attendance').delete().eq('id', deleteAttendanceId);
    setDeleteAttendanceId(null);
    if (error) {
      toast.error('Erro ao excluir lançamento');
      return;
    }
    toast.success('Registro excluído!');
    loadData();
  }

  async function handleCreateWarning() {
    if (!func || !warningForm.reason.trim()) {
      toast.error('Informe o motivo da advertência');
      return;
    }
    setSavingWarning(true);
    const { error } = await supabase.from('employee_warnings').insert({
      employee_id: func.id,
      date: warningForm.date,
      reason: warningForm.reason.trim(),
      applied: warningForm.applied,
      observation: warningForm.observation.trim(),
    });
    setSavingWarning(false);
    if (error) {
      toast.error(`Erro ao salvar advertência: ${error.message}`);
      return;
    }
    toast.success('Advertência registrada!');
    setWarningDialogOpen(false);
    setWarningForm({ date: new Date().toISOString().slice(0, 10), reason: '', applied: true, observation: '' });
    loadData();
  }

  async function handleDeleteWarning() {
    if (!deleteWarningId) return;
    const { error } = await supabase.from('employee_warnings').delete().eq('id', deleteWarningId);
    setDeleteWarningId(null);
    if (error) {
      toast.error('Erro ao excluir advertência');
      return;
    }
    toast.success('Advertência removida!');
    loadData();
  }

  function openFeriasModal() {
    if (!func) return;
    setFeriasForm({
      data_admissao: func.data_admissao || '',
      ultima_ferias: func.ultima_ferias || '',
      scheduled_month: vacationInfo?.scheduled_month || MONTHS[new Date().getMonth()],
      start_date: vacationInfo?.start_date || '',
      end_date: vacationInfo?.end_date || '',
      days_count: vacationInfo?.days_count ?? 30,
      remaining_days: vacationInfo?.remaining_days ?? 0,
      observation: vacationInfo?.observation || '',
    });
    setFeriasDialogOpen(true);
  }

  async function handleSaveFerias() {
    if (!func) return;
    setSavingFerias(true);

    const { error: funcErr } = await supabase
      .from('funcionarios')
      .update({
        data_admissao: feriasForm.data_admissao || null,
        ultima_ferias: feriasForm.ultima_ferias || null,
      } as never)
      .eq('id', func.id);

    if (funcErr) {
      setSavingFerias(false);
      toast.error(`Erro ao salvar datas base: ${funcErr.message}`);
      return;
    }

    if (feriasForm.scheduled_month || feriasForm.start_date) {
      const { error: vacErr } = await supabase.from('vacation_control').upsert(
        {
          employee_id: func.id,
          scheduled_month: feriasForm.scheduled_month || '',
          start_date: feriasForm.start_date || null,
          end_date: feriasForm.end_date || null,
          days_count: Number(feriasForm.days_count || 30),
          remaining_days: Number(feriasForm.remaining_days || 0),
          observation: feriasForm.observation.trim(),
        },
        { onConflict: 'employee_id' }
      );

      if (vacErr) {
        setSavingFerias(false);
        toast.error(`Erro ao salvar programação de férias: ${vacErr.message}`);
        return;
      }
    }

    setSavingFerias(false);
    toast.success('Gestão e programação de férias atualizadas!');
    setFeriasDialogOpen(false);
    loadData();
  }

  async function handleCreateAtestado() {
    if (!func || !atestadoForm.date) return;
    setSavingAtestado(true);
    const { error } = await supabase.from('daily_attendance').upsert(
      {
        employee_id: func.id,
        date: atestadoForm.date,
        status: atestadoForm.status,
        dias_afastamento: Math.max(1, Number(atestadoForm.dias_afastamento || 1)),
        cid: atestadoForm.cid.trim().toUpperCase(),
        crm: atestadoForm.crm.trim().toUpperCase(),
        observation: atestadoForm.observation.trim(),
      } as never,
      { onConflict: 'employee_id,date' }
    );
    setSavingAtestado(false);
    if (error) {
      toast.error(`Erro ao registrar atestado: ${error.message}`);
      return;
    }
    toast.success('Atestado médico registrado com sucesso!');
    setAtestadoDialogOpen(false);
    setAtestadoForm({
      date: new Date().toISOString().slice(0, 10),
      status: 'atestado',
      dias_afastamento: 1,
      cid: '',
      crm: '',
      observation: '',
    });
    loadData();
  }

  function openTreinamentosModal() {
    const existingMap = { ...(treinamentoRow?.treinamentos || {}) };
    DEFAULT_RACS.forEach((rac) => {
      if (existingMap[rac] === undefined) existingMap[rac] = '';
    });
    setTreinForm({
      cnh_categoria: treinamentoRow?.cnh_categoria || '',
      cnh_vencimento: treinamentoRow?.cnh_vencimento || '',
      treinamentos: existingMap,
      novoNomeRac: '',
      novaDataRac: '',
    });
    setTreinDialogOpen(true);
  }

  async function handleSaveTreinamentos() {
    if (!func) return;
    setSavingTrein(true);

    const cleanedMap: Record<string, string> = {};
    Object.entries(treinForm.treinamentos).forEach(([k, v]) => {
      if (k.trim() && String(v ?? '').trim() !== '') {
        cleanedMap[k.trim()] = String(v).trim();
      }
    });
    if (treinForm.novoNomeRac.trim() && treinForm.novaDataRac.trim()) {
      cleanedMap[treinForm.novoNomeRac.trim()] = treinForm.novaDataRac.trim();
    }

    const payload = {
      nome: func.nome,
      cpf: formatCpf(func.cpf) || func.cpf || '',
      funcao: func.cargo || '',
      situacao: func.status_colaborador || 'ATIVO',
      cnh_categoria: treinForm.cnh_categoria.trim().toUpperCase(),
      cnh_vencimento: treinForm.cnh_vencimento.trim(),
      treinamentos: cleanedMap,
    };

    const { error } = treinamentoRow?.id
      ? await supabase.from('treinamentos_ssma').update(payload).eq('id', treinamentoRow.id)
      : await supabase.from('treinamentos_ssma').insert(payload);

    setSavingTrein(false);
    if (error) {
      toast.error(`Erro ao salvar treinamentos/CNH: ${error.message}`);
      return;
    }
    toast.success('Habilitações e treinamentos atualizados!');
    setTreinDialogOpen(false);
    loadData();
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !func) return;
    setUploadingDoc(true);

    let uploadedCount = 0;
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `colaboradores/${func.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('documentos').upload(path, file);
      if (upErr) continue;
      const { data: pub } = supabase.storage.from('documentos').getPublicUrl(path);
      const { error: insErr } = await supabase.from('employee_documents').insert({
        employee_id: func.id,
        file_url: pub.publicUrl,
        file_name: file.name,
        document_type: docTypeToUpload,
      });
      if (!insErr) uploadedCount++;
    }

    setUploadingDoc(false);
    if (docInputRef.current) docInputRef.current.value = '';
    if (uploadedCount > 0) {
      toast.success(`${uploadedCount} documento(s) anexado(s)!`);
      loadData();
    } else {
      toast.error('Não foi possível anexar o arquivo');
    }
  }

  async function handleDeleteDocument() {
    if (!deleteDocItem) return;
    const { error } = await supabase.from('employee_documents').delete().eq('id', deleteDocItem.id);
    setDeleteDocItem(null);
    if (error) {
      toast.error('Erro ao remover documento');
      return;
    }
    toast.success('Documento excluído!');
    loadData();
  }

  async function exportProntuarioPDF() {
    if (!func) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    const logoBase64 = await getBusatoLogoBase64();

    let y = drawBusatoHeader(
      doc,
      logoBase64,
      'PRONTUÁRIO OPERACIONAL DO COLABORADOR',
      `${func.nome} • ${func.cargo}`
    );

    // 1. Dados Cadastrais & Escala
    autoTable(doc, {
      startY: y,
      head: [['Campo Cadastral', 'Informação', 'Campo Operacional', 'Informação']],
      body: [
        ['Nome Completo', func.nome, 'Status Atual', func.status_colaborador || 'ATIVO'],
        ['CPF', formatCpf(func.cpf) || 'Não informado', 'Turno / Letra', TURNO_LABELS[func.turno] || func.letra || 'Não definido'],
        ['Cargo / Função', func.cargo, 'Atendimento / Equipamento', func.frente_atendimento || '—'],
        ['Departamento', func.departamento, 'Polivalência', func.polivalencia || '—'],
        ['Telefone', func.telefone || '—', 'Data de Admissão', `${fmtDate(func.data_admissao)} (${calcTempoDeCasa(func.data_admissao)})`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [42, 90, 140], fontSize: 8.5 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    y = ((doc as unknown as DocWithAutoTable).lastAutoTable?.finalY || y + 40) + 8;

    // 2. Férias
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(42, 90, 140);
    doc.text('1. GESTÃO DE FÉRIAS (AQUISITIVO & PROGRAMAÇÃO)', 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Admissão', 'Última Férias', 'Próximo Vencimento', 'Situação', 'Programação Vigente']],
      body: [
        [
          fmtDate(func.data_admissao),
          fmtDate(func.ultima_ferias),
          fmtDate(feriasElegibilidade.proximoVencimento),
          feriasElegibilidade.situacao === 'VENCIDA'
            ? 'FÉRIAS VENCIDA'
            : feriasElegibilidade.situacao === 'VENCENDO'
            ? `Vencendo (${feriasElegibilidade.diasParaVencer}d)`
            : feriasElegibilidade.situacao === 'EM_DIA'
            ? 'Em dia'
            : 'Sem data base',
          vacationInfo
            ? `${vacationInfo.scheduled_month || ''} ${
                vacationInfo.start_date ? `(${fmtDate(vacationInfo.start_date)} a ${fmtDate(vacationInfo.end_date)})` : ''
              } • ${vacationInfo.days_count}d`
            : 'Não programada',
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [13, 148, 136], fontSize: 8.5 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    y = ((doc as unknown as DocWithAutoTable).lastAutoTable?.finalY || y + 25) + 8;

    // 3. Ponto & Advertências
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(42, 90, 140);
    doc.text(
      `2. RESUMO DE PONTO, EXTRAS & BANCO DE HORAS (Extras: ${pontoStats.extrasTotal} | Banco: ${pontoStats.bancoHoras} | Faltas Inj.: ${pontoStats.faltasInjust} | Adv.: ${warnings.length})`,
      14,
      y
    );
    y += 4;

    if (pontoRecords.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Data', 'Tipo de Apontamento', 'Observação']],
        body: pontoRecords.slice(0, 20).map((r) => [
          fmtDate(r.date),
          PONTO_STATUS_LABELS[r.status] || r.status,
          r.observation || '—',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 187], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 14, right: 14 },
      });
      y = ((doc as unknown as DocWithAutoTable).lastAutoTable?.finalY || y + 20) + 8;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      doc.text('Nenhum apontamento de ponto/extra registrado até o momento.', 14, y + 4);
      y += 10;
    }

    // 4. Atestados Médicos
    if (y > 240) {
      drawBusatoFooter(doc, 1, { pageWidth: pw });
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(42, 90, 140);
    doc.text(
      `3. HISTÓRICO DE ATESTADOS E AFASTAMENTOS (${atestadoStats.totalAtestados} registros | ${atestadoStats.totalDias} dias acumulados)`,
      14,
      y
    );
    y += 4;

    if (atestadoRecords.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Data Início', 'Tipo', 'Dias', 'Retorno Previsto', 'CID', 'CRM', 'Observação']],
        body: atestadoRecords.slice(0, 15).map((r) => [
          fmtDate(r.date),
          r.status === 'afastamento' ? 'Afastamento' : 'Atestado',
          String(r.dias_afastamento || 1),
          fmtDate(calcDataRetorno(r.date, r.dias_afastamento)),
          r.cid || '—',
          r.crm || '—',
          r.observation || '—',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 14, right: 14 },
      });
      y = ((doc as unknown as DocWithAutoTable).lastAutoTable?.finalY || y + 20) + 8;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      doc.text('Nenhum atestado ou afastamento médico registrado.', 14, y + 4);
      y += 10;
    }

    // 5. Treinamentos SSMA / CNH
    if (y > 235) {
      drawBusatoFooter(doc, doc.getNumberOfPages(), { pageWidth: pw });
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(42, 90, 140);
    doc.text(
      `4. HABILITAÇÃO CNH & TREINAMENTOS SSMA (CNH: ${treinamentoRow?.cnh_categoria || '—'} • Venc.: ${
        treinamentoRow?.cnh_vencimento || '—'
      })`,
      14,
      y
    );
    y += 4;

    if (trainingSummary.entries.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Treinamento / RAC / NR', 'Vencimento / Registro', 'Status']],
        body: trainingSummary.entries.map((e) => [e.name, e.rawVal || '—', e.label]),
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 14, right: 14 },
      });
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawBusatoFooter(doc, p, { pageWidth: pw });
    }

    doc.save(`Prontuario_${func.nome.replace(/\s+/g, '_')}.pdf`);
    toast.success('Prontuário PDF gerado com sucesso!');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!func) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-muted-foreground">Colaborador não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/colaboradores')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Colaboradores
        </Button>
      </div>
    );
  }

  const canEditColab = canEdit('colaboradores');
  const canCreatePonto = canCreate('ponto');
  const canDeletePonto = canDelete('ponto');
  const canEditFerias = canEdit('ferias') || canCreate('ferias');
  const canCreateAtestado = canCreate('atestados');
  const canDeleteAtestado = canDelete('atestados');

  return (
    <div className="space-y-6 pb-10">
      {/* Top Navigation & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/colaboradores')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Voltar para Colaboradores
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/ponto')} className="text-xs">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Aba Ponto
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ferias')} className="text-xs">
            <Sun className="w-3.5 h-3.5 mr-1.5" /> Aba Férias
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/atestados')} className="text-xs">
            <Stethoscope className="w-3.5 h-3.5 mr-1.5" /> Aba Atestados
          </Button>
          {canEditColab && (
            <Button variant="outline" size="sm" onClick={openEditColabModal} className="text-xs">
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar Cadastro
            </Button>
          )}
          <Button size="sm" onClick={exportProntuarioPDF} className="text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar Prontuário (PDF)
          </Button>
        </div>
      </div>

      {/* Main Collaborator Header Card */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-6 border border-border/70"
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
          {/* Avatar */}
          <div className="relative group shrink-0">
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            {func.foto_url ? (
              <img
                src={func.foto_url}
                alt={func.nome}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-primary/20 shadow-sm"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <span className="text-primary font-black text-3xl">{func.nome.charAt(0)}</span>
              </div>
            )}
            {canEditColab && (
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                title="Atualizar foto"
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Identity & Operational Metadata */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{func.nome}</h1>
              <span
                className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  func.status_colaborador === 'DESLIGADO'
                    ? 'bg-destructive/15 text-destructive'
                    : func.status_colaborador === 'AFASTADO' || atestadoStats.afastadoHojeAte
                    ? 'bg-orange-500/15 text-orange-600'
                    : emFeriasHoje
                    ? 'bg-teal-500/15 text-teal-700'
                    : func.status_colaborador === 'RESERVA/CB'
                    ? 'bg-amber-500/15 text-amber-700'
                    : 'bg-emerald-500/15 text-emerald-700'
                }`}
              >
                {atestadoStats.afastadoHojeAte
                  ? `AFASTADO ATÉ ${fmtDate(atestadoStats.afastadoHojeAte)}`
                  : emFeriasHoje
                  ? 'EM FÉRIAS HOJE'
                  : func.status_colaborador || 'ATIVO'}
              </span>
              <HierarchyBadge cargo={func.cargo} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="font-semibold">
                <Briefcase className="w-3 h-3 mr-1" /> {func.cargo}
              </Badge>
              <Badge variant="outline">{func.departamento}</Badge>
              {func.contrato_vinculado && func.contrato_vinculado !== func.departamento && (
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">
                  Vinculado: {func.contrato_vinculado}
                </Badge>
              )}
              {(func.turno || func.letra) && (
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 border-indigo-500/20">
                  Escala: {TURNO_LABELS[func.turno] || `Letra ${func.letra}`}
                </Badge>
              )}
              {func.frente_atendimento && (
                <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-500/20">
                  <Truck className="w-3 h-3 mr-1" /> {func.frente_atendimento}
                </Badge>
              )}
              {func.polivalencia && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                  <Layers className="w-3 h-3 mr-1" /> Polivalência: {func.polivalencia}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground pt-1">
              {func.cpf && (
                <span className="inline-flex items-center gap-1.5">
                  <IdCard className="w-3.5 h-3.5 text-primary" /> CPF: <strong className="text-foreground">{formatCpf(func.cpf)}</strong>
                </span>
              )}
              {func.telefone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-primary" /> {func.telefone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" /> Admissão:{' '}
                <strong className="text-foreground">{fmtDate(func.data_admissao)}</strong> ({calcTempoDeCasa(func.data_admissao)})
              </span>
              {gestorNome && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" /> Gestor: <strong className="text-foreground">{gestorNome}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active Operational Alerts for this Collaborator */}
        {(feriasElegibilidade.situacao === 'VENCIDA' ||
          feriasElegibilidade.situacao === 'VENCENDO' ||
          atestadoStats.afastadoHojeAte ||
          trainingSummary.vencidos > 0 ||
          trainingSummary.cnhEval.status === 'VENCIDO' ||
          pontoStats.extrasMes >= 3) && (
          <div className="mt-5 pt-4 border-t border-border/60 flex flex-wrap gap-2">
            {atestadoStats.afastadoHojeAte && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-700 border border-orange-500/30">
                <Stethoscope className="w-3.5 h-3.5" /> Em afastamento médico — retorno previsto em {fmtDate(atestadoStats.afastadoHojeAte)}
              </div>
            )}
            {feriasElegibilidade.situacao === 'VENCIDA' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive border border-destructive/30">
                <AlertTriangle className="w-3.5 h-3.5" /> Férias vencida desde {fmtDate(feriasElegibilidade.proximoVencimento)}
              </div>
            )}
            {feriasElegibilidade.situacao === 'VENCENDO' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 border border-amber-500/30">
                <Sun className="w-3.5 h-3.5" /> Férias vence em {feriasElegibilidade.diasParaVencer} dias ({fmtDate(feriasElegibilidade.proximoVencimento)})
              </div>
            )}
            {trainingSummary.cnhEval.status === 'VENCIDO' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive border border-destructive/30">
                <ShieldAlert className="w-3.5 h-3.5" /> CNH vencida ({treinamentoRow?.cnh_vencimento})
              </div>
            )}
            {trainingSummary.vencidos > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive border border-destructive/30">
                <ShieldAlert className="w-3.5 h-3.5" /> {trainingSummary.vencidos} treinamento(s)/RAC vencido(s)
              </div>
            )}
            {pontoStats.extrasMes >= 3 && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-700 border border-purple-500/30">
                <Clock className="w-3.5 h-3.5" /> Limite mensal de extras atingido ({pontoStats.extrasMes}/3 neste mês)
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 4 Executive Operational Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Ponto & Banco de Horas */}
        <button
          type="button"
          onClick={() => handleTabChange('ponto')}
          className={`glass-card rounded-xl p-4 text-left transition-all border hover:border-primary/40 ${
            activeTab === 'ponto' ? 'ring-2 ring-primary/40 border-primary/40' : 'border-border/60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ponto & Banco de Horas</span>
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <p className="text-lg font-black text-purple-600">{pontoStats.extrasTotal}</p>
              <p className="text-[10px] text-muted-foreground">Extras ({pontoStats.extrasMes}/3 mês)</p>
            </div>
            <div>
              <p className="text-lg font-black text-indigo-600">{pontoStats.bancoHoras}</p>
              <p className="text-[10px] text-muted-foreground">Banco Horas</p>
            </div>
            <div>
              <p className={`text-lg font-black ${pontoStats.faltasInjust > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                {pontoStats.faltasInjust}
              </p>
              <p className="text-[10px] text-muted-foreground">Faltas Injust.</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5 pt-2 border-t border-border/50">
            Abonos/Just.: <strong>{pontoStats.faltasJust + pontoStats.abonos}</strong> • Advertências: <strong>{warnings.length}</strong>
          </p>
        </button>

        {/* Card 2: Última & Próxima Férias */}
        <button
          type="button"
          onClick={() => handleTabChange('ferias')}
          className={`glass-card rounded-xl p-4 text-left transition-all border hover:border-primary/40 ${
            activeTab === 'ferias' ? 'ring-2 ring-primary/40 border-primary/40' : 'border-border/60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Última & Próxima Férias</span>
            <Sun className="w-4 h-4 text-teal-600" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Última Férias</p>
              <p className="text-sm font-bold text-foreground">{fmtDate(func.ultima_ferias)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Próxima / Limite</p>
              <p
                className={`text-sm font-bold ${
                  feriasElegibilidade.situacao === 'VENCIDA'
                    ? 'text-destructive'
                    : feriasElegibilidade.situacao === 'VENCENDO'
                    ? 'text-amber-600'
                    : 'text-teal-600'
                }`}
              >
                {fmtDate(feriasElegibilidade.proximoVencimento)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5 pt-2 border-t border-border/50 truncate">
            {vacationInfo?.start_date
              ? `Programada: ${fmtDate(vacationInfo.start_date)} a ${fmtDate(vacationInfo.end_date)}`
              : vacationInfo?.scheduled_month
              ? `Prevista p/ ${vacationInfo.scheduled_month} (${vacationInfo.days_count}d)`
              : 'Sem programação lançada'}
          </p>
        </button>

        {/* Card 3: Atestados & Afastamentos */}
        <button
          type="button"
          onClick={() => handleTabChange('atestados')}
          className={`glass-card rounded-xl p-4 text-left transition-all border hover:border-primary/40 ${
            activeTab === 'atestados' ? 'ring-2 ring-primary/40 border-primary/40' : 'border-border/60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Atestados & Saúde</span>
            <Stethoscope className="w-4 h-4 text-blue-600" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-lg font-black text-blue-600">{atestadoStats.totalAtestados}</p>
              <p className="text-[10px] text-muted-foreground">Atestados</p>
            </div>
            <div>
              <p className="text-lg font-black text-foreground">{atestadoStats.totalDias}d</p>
              <p className="text-[10px] text-muted-foreground">Dias Afastados</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5 pt-2 border-t border-border/50 truncate">
            {atestadoStats.ultimo
              ? `Último: ${fmtDate(atestadoStats.ultimo.date)}${atestadoStats.ultimo.cid ? ` • CID ${atestadoStats.ultimo.cid}` : ''}`
              : 'Nenhum atestado registrado'}
          </p>
        </button>

        {/* Card 4: Treinamentos, CNH & SSMA */}
        <button
          type="button"
          onClick={() => handleTabChange('treinamentos')}
          className={`glass-card rounded-xl p-4 text-left transition-all border hover:border-primary/40 ${
            activeTab === 'treinamentos' ? 'ring-2 ring-primary/40 border-primary/40' : 'border-border/60'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Treinamentos & SSMA</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <p className="text-lg font-black text-emerald-600">{trainingSummary.emDia}</p>
              <p className="text-[10px] text-muted-foreground">RACs em Dia</p>
            </div>
            <div>
              <p className={`text-lg font-black ${trainingSummary.vencidos > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {trainingSummary.vencidos}
              </p>
              <p className="text-[10px] text-muted-foreground">Vencidos</p>
            </div>
            <div>
              <p className={`text-lg font-black ${ssmaEvents.length > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                {ssmaEvents.length}
              </p>
              <p className="text-[10px] text-muted-foreground">Eventos SSMA</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5 pt-2 border-t border-border/50 truncate">
            CNH: <strong>{treinamentoRow?.cnh_categoria || '—'}</strong> • Venc.: <strong>{treinamentoRow?.cnh_vencimento || 'Não informada'}</strong>
          </p>
        </button>
      </div>

      {/* Main Profile Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start h-auto flex-wrap p-1.5 bg-muted/40 rounded-xl border border-border gap-1">
          <TabsTrigger value="visao-geral" className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg">
            Resumo Geral
          </TabsTrigger>
          <TabsTrigger value="ponto" className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg">
            Ponto & Banco de Horas ({pontoRecords.length})
          </TabsTrigger>
          <TabsTrigger value="ferias" className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg">
            Férias (Última & Próxima)
          </TabsTrigger>
          <TabsTrigger value="atestados" className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg">
            Atestados ({atestadoRecords.length})
          </TabsTrigger>
          <TabsTrigger value="treinamentos" className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg">
            Treinamentos, CNH & SSMA
          </TabsTrigger>
          <TabsTrigger value="documentos" className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg">
            Documentos ({documents.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: RESUMO GERAL */}
        <TabsContent value="visao-geral" className="mt-5 space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Ficha Cadastral e Operacional */}
            <div className="lg:col-span-1 glass-card rounded-xl p-5 border border-border/60 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-wider text-primary">Ficha Operacional</h3>
                {canEditColab && (
                  <Button variant="ghost" size="sm" onClick={openEditColabModal} className="h-7 text-xs">
                    <Pencil className="w-3 h-3 mr-1" /> Editar
                  </Button>
                )}
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Status</span>
                  <span className="font-semibold text-xs">{func.status_colaborador || 'ATIVO'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">CPF</span>
                  <span className="font-semibold text-xs">{formatCpf(func.cpf) || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Telefone</span>
                  <span className="font-semibold text-xs">{func.telefone || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Turno / Letra</span>
                  <span className="font-semibold text-xs">{TURNO_LABELS[func.turno] || func.letra || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Atendimento Habitual</span>
                  <span className="font-semibold text-xs text-right max-w-[180px] truncate">{func.frente_atendimento || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Polivalência</span>
                  <span className="font-semibold text-xs text-right max-w-[180px] truncate">{func.polivalencia || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Data de Admissão</span>
                  <span className="font-semibold text-xs">{fmtDate(func.data_admissao)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Última Férias</span>
                  <span className="font-semibold text-xs">{fmtDate(func.ultima_ferias)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground text-xs">Próxima Férias (Limite)</span>
                  <span className="font-bold text-xs text-primary">{fmtDate(feriasElegibilidade.proximoVencimento)}</span>
                </div>
              </div>
            </div>

            {/* Linha do Tempo Recente */}
            <div className="lg:col-span-2 glass-card rounded-xl p-5 border border-border/60 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wider text-primary">Histórico Recente do Colaborador</h3>
                  <p className="text-xs text-muted-foreground">Últimos apontamentos de ponto, atestados, advertências e SSMA</p>
                </div>
                <div className="flex gap-1.5">
                  {canCreatePonto && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPontoDialogOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Ponto / Extra
                    </Button>
                  )}
                  {canCreateAtestado && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAtestadoDialogOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Atestado
                    </Button>
                  )}
                </div>
              </div>

              {recentTimeline.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhuma movimentação registrada ainda para este colaborador.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentTimeline.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/50"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.badgeClass}`}>
                            {item.category}
                          </span>
                          <span className="font-semibold text-sm text-foreground">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{fmtDate(item.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: PONTO, EXTRAS, BANCO DE HORAS & ADVERTÊNCIAS */}
        <TabsContent value="ponto" className="mt-5 space-y-6 outline-none">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="glass-card rounded-xl p-3.5 border border-border/60">
              <p className="text-[11px] text-muted-foreground">Extras no Mês</p>
              <p className={`text-xl font-black mt-1 ${pontoStats.extrasMes >= 3 ? 'text-destructive' : 'text-purple-600'}`}>
                {pontoStats.extrasMes}/3
              </p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-border/60">
              <p className="text-[11px] text-muted-foreground">Extras Acumulados</p>
              <p className="text-xl font-black mt-1 text-purple-600">{pontoStats.extrasTotal}</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-border/60">
              <p className="text-[11px] text-muted-foreground">Banco de Horas</p>
              <p className="text-xl font-black mt-1 text-indigo-600">{pontoStats.bancoHoras}</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-border/60">
              <p className="text-[11px] text-muted-foreground">Faltas Injustificadas</p>
              <p className="text-xl font-black mt-1 text-destructive">{pontoStats.faltasInjust}</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-border/60">
              <p className="text-[11px] text-muted-foreground">Justificadas / Abonos</p>
              <p className="text-xl font-black mt-1 text-amber-600">{pontoStats.faltasJust + pontoStats.abonos}</p>
            </div>
            <div className="glass-card rounded-xl p-3.5 border border-border/60">
              <p className="text-[11px] text-muted-foreground">Advertências</p>
              <p className="text-xl font-black mt-1 text-foreground">{warnings.length}</p>
            </div>
          </div>

          <div className="glass-card rounded-xl p-5 border border-border/60 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base">Apontamentos de Ponto, Extras & Banco de Horas</h3>
                <p className="text-xs text-muted-foreground">Histórico individual sincronizado com a aba Ponto</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={pontoFilter} onValueChange={setPontoFilter}>
                  <SelectTrigger className="w-44 h-9 text-xs">
                    <SelectValue placeholder="Filtrar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos os tipos</SelectItem>
                    <SelectItem value="extra">Horas Extras</SelectItem>
                    <SelectItem value="banco_horas">Banco de Horas</SelectItem>
                    <SelectItem value="FALTAS">Faltas</SelectItem>
                    <SelectItem value="abono">Abonos</SelectItem>
                    <SelectItem value="presente">Presenças</SelectItem>
                  </SelectContent>
                </Select>
                {canCreatePonto && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setWarningDialogOpen(true)}>
                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-destructive" /> Registrar Advertência
                    </Button>
                    <Button size="sm" onClick={() => setPontoDialogOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Lançar Ponto / Extra
                    </Button>
                  </>
                )}
              </div>
            </div>

            {filteredPontoRecords.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                Nenhum apontamento de ponto encontrado para o filtro selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Observação / Justificativa</th>
                      {canDeletePonto && <th className="py-2.5 px-3 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredPontoRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3 font-mono text-xs">{fmtDate(r.date)}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                              PONTO_STATUS_COLORS[r.status] || 'bg-muted text-foreground'
                            }`}
                          >
                            {PONTO_STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">{r.observation || '—'}</td>
                        {canDeletePonto && (
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteAttendanceId(r.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Advertências Disciplinares */}
          <div className="glass-card rounded-xl p-5 border border-border/60 space-y-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> Histórico de Advertências ({warnings.length})
            </h3>
            {warnings.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">Nenhuma advertência disciplinar registrada.</p>
            ) : (
              <div className="space-y-2">
                {warnings.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{fmtDate(w.date)}</span>
                        <span className="font-bold text-sm text-foreground">{w.reason}</span>
                        <Badge variant={w.applied ? 'destructive' : 'outline'} className="text-[10px]">
                          {w.applied ? 'Aplicada' : 'Pendente'}
                        </Badge>
                      </div>
                      {w.observation && <p className="text-xs text-muted-foreground mt-0.5">{w.observation}</p>}
                    </div>
                    {canDeletePonto && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteWarningId(w.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: FÉRIAS (ÚLTIMA, PRÓXIMA & PROGRAMAÇÃO) */}
        <TabsContent value="ferias" className="mt-5 space-y-6 outline-none">
          <div className="glass-card rounded-xl p-6 border border-border/60 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base">Controle de Férias do Colaborador</h3>
                <p className="text-xs text-muted-foreground">
                  Cálculo automático de vencimento baseado na Data de Admissão e Última Férias
                </p>
              </div>
              {canEditFerias && (
                <Button size="sm" onClick={openFeriasModal}>
                  <Calendar className="w-3.5 h-3.5 mr-1.5" /> Atualizar Datas / Programar Férias
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Data de Admissão</p>
                <p className="text-xl font-bold mt-1">{fmtDate(func.data_admissao)}</p>
                <p className="text-xs text-muted-foreground mt-1">Tempo de casa: {calcTempoDeCasa(func.data_admissao)}</p>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Última Data de Férias</p>
                <p className="text-xl font-bold mt-1 text-teal-600">{fmtDate(func.ultima_ferias)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {func.ultima_ferias ? 'Base do ciclo atual' : 'Usando admissão como base'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Próxima Férias / Vencimento</p>
                <p className="text-xl font-bold mt-1 text-primary">{fmtDate(feriasElegibilidade.proximoVencimento)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {feriasElegibilidade.diasParaVencer !== null
                    ? feriasElegibilidade.diasParaVencer < 0
                      ? `Vencida há ${Math.abs(feriasElegibilidade.diasParaVencer)} dias`
                      : `Faltam ${feriasElegibilidade.diasParaVencer} dias`
                    : 'Informe admissão ou última férias'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Status do Período</p>
                <div className="mt-2">
                  {feriasElegibilidade.situacao === 'VENCIDA' && (
                    <Badge variant="destructive" className="text-xs px-3 py-1">
                      FÉRIAS VENCIDA
                    </Badge>
                  )}
                  {feriasElegibilidade.situacao === 'VENCENDO' && (
                    <Badge className="bg-amber-500 text-white text-xs px-3 py-1">VENCENDO (≤ 60 DIAS)</Badge>
                  )}
                  {feriasElegibilidade.situacao === 'EM_DIA' && (
                    <Badge className="bg-emerald-600 text-white text-xs px-3 py-1">PERÍODO EM DIA</Badge>
                  )}
                  {feriasElegibilidade.situacao === 'SEM_DATA' && (
                    <Badge variant="outline" className="text-xs px-3 py-1">
                      SEM DATA BASE
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Programação atual */}
            <div className="p-5 rounded-xl bg-teal-500/5 border border-teal-500/20 space-y-3">
              <h4 className="font-bold text-sm text-teal-700 dark:text-teal-400 flex items-center gap-2">
                <Sun className="w-4 h-4" /> Programação de Férias Registrada
              </h4>
              {vacationInfo ? (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Mês Programado</span>
                    <strong>{vacationInfo.scheduled_month || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Período de Gozo</span>
                    <strong>
                      {vacationInfo.start_date
                        ? `${fmtDate(vacationInfo.start_date)} até ${fmtDate(vacationInfo.end_date)}`
                        : 'Datas a definir'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Dias Programados / Saldo</span>
                    <strong>
                      {vacationInfo.days_count} dias (Saldo: {vacationInfo.remaining_days ?? 0}d)
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Observação</span>
                    <span>{vacationInfo.observation || '—'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhuma programação futura cadastrada para este colaborador. Clique em{' '}
                  <strong>"Atualizar Datas / Programar Férias"</strong> para agendar.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: ATESTADOS & AFASTAMENTOS */}
        <TabsContent value="atestados" className="mt-5 space-y-6 outline-none">
          <div className="glass-card rounded-xl p-5 border border-border/60 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base">Histórico de Atestados e Afastamentos Médicos</h3>
                <p className="text-xs text-muted-foreground">
                  Total de {atestadoStats.totalAtestados} registro(s) somando {atestadoStats.totalDias} dia(s) de afastamento
                </p>
              </div>
              {canCreateAtestado && (
                <Button size="sm" onClick={() => setAtestadoDialogOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Lançar Atestado
                </Button>
              )}
            </div>

            {atestadoRecords.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum atestado ou afastamento registrado para este colaborador.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2.5 px-3">Data Início</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Dias</th>
                      <th className="py-2.5 px-3">Retorno ao Trabalho</th>
                      <th className="py-2.5 px-3">CID</th>
                      <th className="py-2.5 px-3">CRM</th>
                      <th className="py-2.5 px-3">Observação</th>
                      {canDeleteAtestado && <th className="py-2.5 px-3 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {atestadoRecords.map((r) => {
                      const dias = Math.max(1, Number(r.dias_afastamento || 1));
                      const retorno = calcDataRetorno(r.date, dias);
                      return (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-mono text-xs">{fmtDate(r.date)}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.status === 'afastamento' ? 'destructive' : 'secondary'} className="text-xs">
                              {r.status === 'afastamento' ? 'Afastamento' : 'Atestado'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-xs">{dias}d</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-primary font-semibold">{fmtDate(retorno)}</td>
                          <td className="py-2.5 px-3 font-mono text-xs">{r.cid || '—'}</td>
                          <td className="py-2.5 px-3 font-mono text-xs">{r.crm || '—'}</td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">{r.observation || '—'}</td>
                          {canDeleteAtestado && (
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setDeleteAttendanceId(r.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 5: TREINAMENTOS, CNH & OCORRÊNCIAS SSMA */}
        <TabsContent value="treinamentos" className="mt-5 space-y-6 outline-none">
          <div className="glass-card rounded-xl p-5 border border-border/60 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" /> Matriz Individual de CNH, RACs & Treinamentos Normativos
                </h3>
                <p className="text-xs text-muted-foreground">
                  Controle de validade das habilitações operacionais do colaborador
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate('/eventos')}>
                  Abrir Matriz Geral SSMA
                </Button>
                {canEditColab && (
                  <Button size="sm" className="text-xs" onClick={openTreinamentosModal}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Atualizar CNH / RACs
                  </Button>
                )}
              </div>
            </div>

            {/* CNH Highlight */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <IdCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Carteira Nacional de Habilitação (CNH)</p>
                  <p className="text-sm font-bold">
                    Categoria: <span className="text-primary">{treinamentoRow?.cnh_categoria || 'Não informada'}</span> • Vencimento:{' '}
                    <span>{treinamentoRow?.cnh_vencimento || 'Não informado'}</span>
                  </p>
                </div>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${trainingSummary.cnhEval.badgeClass}`}>
                {trainingSummary.cnhEval.label}
              </span>
            </div>

            {/* Grid of RACs & NRs */}
            {trainingSummary.entries.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground space-y-2">
                <p>Nenhum treinamento/RAC vinculado ainda a este colaborador na matriz SSMA.</p>
                {canEditColab && (
                  <Button variant="outline" size="sm" onClick={openTreinamentosModal}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Cadastrar RACs e CNH Agora
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {trainingSummary.entries.map((item) => (
                  <div
                    key={item.name}
                    className="p-3.5 rounded-xl bg-background border border-border/70 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Vencimento / Status: {item.rawVal || '—'}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${item.badgeClass}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ocorrências SSMA */}
          <div className="glass-card rounded-xl p-5 border border-border/60 space-y-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-orange-600" /> Histórico de Eventos & Ocorrências SSMA ({ssmaEvents.length})
            </h3>
            {ssmaEvents.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Nenhuma ocorrência operacional ou incidente registrado em nome deste colaborador.
              </div>
            ) : (
              <div className="space-y-2.5">
                {ssmaEvents.map((ev) => (
                  <div key={ev.id} className="p-3.5 rounded-xl bg-muted/30 border border-border/60 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-sm">{ev.description}</span>
                      <span className="font-mono text-xs text-muted-foreground">{fmtDate(ev.event_date)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        ev.location && `Local: ${ev.location}`,
                        ev.equipment && `Equip.: ${ev.equipment}`,
                        ev.plate_tag && `Placa/TAG: ${ev.plate_tag}`,
                        ev.supervisor && `Sup.: ${ev.supervisor}`,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 6: DOCUMENTOS & ANEXOS */}
        <TabsContent value="documentos" className="mt-5 space-y-6 outline-none">
          <div className="glass-card rounded-xl p-5 border border-border/60 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base">Dossiê Digital & Anexos do Colaborador</h3>
                <p className="text-xs text-muted-foreground">CNH, Certificados de RAC/NR, ASO, Atestados Digitalizados e Termos</p>
              </div>
              {canEditColab && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={docTypeToUpload} onValueChange={setDocTypeToUpload}>
                    <SelectTrigger className="w-48 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CNH / Habilitação">CNH / Habilitação</SelectItem>
                      <SelectItem value="Certificado RAC / NR">Certificado RAC / NR</SelectItem>
                      <SelectItem value="ASO / Exame Médico">ASO / Exame Médico</SelectItem>
                      <SelectItem value="Atestado Médico">Atestado Médico</SelectItem>
                      <SelectItem value="Aviso / Recibo de Férias">Aviso / Recibo de Férias</SelectItem>
                      <SelectItem value="Outros Documentos">Outros Documentos</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,image/*,.doc,.docx"
                    multiple
                    className="hidden"
                    onChange={handleDocumentUpload}
                  />
                  <Button size="sm" onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}>
                    {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                    Anexar Arquivo
                  </Button>
                </div>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum documento anexado ainda para este colaborador.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {documents.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs truncate" title={d.file_name}>
                          {d.file_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {d.document_type || 'Documento'} • {fmtDate(d.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" title="Abrir arquivo">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      {canEditColab && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteDocItem(d)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOG 1: EDITAR DADOS DO COLABORADOR */}
      <Dialog open={editColabOpen} onOpenChange={setEditColabOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cadastro Operacional — {func.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cargo / Função</Label>
                <FastInput value={colabForm.cargo} onValueChange={(v) => setColabForm({ ...colabForm, cargo: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={colabForm.status_colaborador}
                  onValueChange={(v) => setColabForm({ ...colabForm, status_colaborador: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="RESERVA/CB">Reserva / CB</SelectItem>
                    <SelectItem value="AFASTADO">Afastado</SelectItem>
                    <SelectItem value="DESLIGADO">Desligado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CPF</Label>
                <FastInput value={colabForm.cpf} onValueChange={(v) => setColabForm({ ...colabForm, cpf: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <FastInput value={colabForm.telefone} onValueChange={(v) => setColabForm({ ...colabForm, telefone: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Admissão</Label>
                <Input
                  type="date"
                  value={colabForm.data_admissao}
                  onChange={(e) => setColabForm({ ...colabForm, data_admissao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Última Data de Férias</Label>
                <Input
                  type="date"
                  value={colabForm.ultima_ferias}
                  onChange={(e) => setColabForm({ ...colabForm, ultima_ferias: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Turno / Escala</Label>
                <Select value={colabForm.turno} onValueChange={(v) => setColabForm({ ...colabForm, turno: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o turno" />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNO_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Atendimento / Equipamento Habitual</Label>
                <FastInput
                  value={colabForm.frente_atendimento}
                  onValueChange={(v) => setColabForm({ ...colabForm, frente_atendimento: v })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Polivalência / Equipamentos Habilitados</Label>
                <FastInput
                  value={colabForm.polivalencia}
                  onValueChange={(v) => setColabForm({ ...colabForm, polivalencia: v })}
                />
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveColab} disabled={savingColab}>
              {savingColab && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: LANÇAR PONTO / EXTRA / BANCO */}
      <Dialog open={pontoDialogOpen} onOpenChange={setPontoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançar Ponto — {func.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={pontoForm.date} onChange={(e) => setPontoForm({ ...pontoForm, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de Registro *</Label>
              <Select value={pontoForm.status} onValueChange={(v) => setPontoForm({ ...pontoForm, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="extra">Hora Extra</SelectItem>
                  <SelectItem value="banco_horas">Banco de Horas</SelectItem>
                  <SelectItem value="falta_injustificada">Falta Injustificada</SelectItem>
                  <SelectItem value="falta_justificada">Falta Justificada</SelectItem>
                  <SelectItem value="abono">Abono</SelectItem>
                  <SelectItem value="presente">Presença Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação / Turno / Motivo</Label>
              <FastInput
                value={pontoForm.observation}
                onValueChange={(v) => setPontoForm({ ...pontoForm, observation: v })}
                placeholder="Ex: Dobrou turno na Retroescavadeira / Compensação..."
              />
            </div>
            <Button className="w-full" onClick={handleCreatePonto} disabled={savingPonto}>
              {savingPonto && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar Apontamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: REGISTRAR ADVERTÊNCIA */}
      <Dialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Advertência — {func.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Data *</Label>
              <Input
                type="date"
                value={warningForm.date}
                onChange={(e) => setWarningForm({ ...warningForm, date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo Principal *</Label>
              <FastInput
                value={warningForm.reason}
                onValueChange={(v) => setWarningForm({ ...warningForm, reason: v })}
                placeholder="Ex: Falta injustificada recorrente / Descumprimento de procedimento"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <FastInput
                value={warningForm.observation}
                onValueChange={(v) => setWarningForm({ ...warningForm, observation: v })}
                placeholder="Detalhes adicionais..."
              />
            </div>
            <Button variant="destructive" className="w-full" onClick={handleCreateWarning} disabled={savingWarning}>
              {savingWarning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar Advertência
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: ATUALIZAR DATAS & PROGRAMAR FÉRIAS */}
      <Dialog open={feriasDialogOpen} onOpenChange={setFeriasDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestão de Férias — {func.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Data de Admissão</Label>
                <Input
                  type="date"
                  value={feriasForm.data_admissao}
                  onChange={(e) => setFeriasForm({ ...feriasForm, data_admissao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Última Data de Férias</Label>
                <Input
                  type="date"
                  value={feriasForm.ultima_ferias}
                  onChange={(e) => setFeriasForm({ ...feriasForm, ultima_ferias: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Mês Previsto</Label>
                <Select
                  value={feriasForm.scheduled_month}
                  onValueChange={(v) => setFeriasForm({ ...feriasForm, scheduled_month: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade de Dias</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={feriasForm.days_count}
                  onChange={(e) => setFeriasForm({ ...feriasForm, days_count: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Saída (Início)</Label>
                <Input
                  type="date"
                  value={feriasForm.start_date}
                  onChange={(e) => setFeriasForm({ ...feriasForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Fim</Label>
                <Input
                  type="date"
                  value={feriasForm.end_date}
                  onChange={(e) => setFeriasForm({ ...feriasForm, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Saldo Restante (Dias)</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={feriasForm.remaining_days}
                  onChange={(e) => setFeriasForm({ ...feriasForm, remaining_days: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observação / Cobertura</Label>
                <FastInput
                  value={feriasForm.observation}
                  onValueChange={(v) => setFeriasForm({ ...feriasForm, observation: v })}
                  placeholder="Ex: Coberto pelo reserva CB..."
                />
              </div>
            </div>

            <Button className="w-full" onClick={handleSaveFerias} disabled={savingFerias}>
              {savingFerias && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar Gestão de Férias
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 5: LANÇAR ATESTADO / AFASTAMENTO */}
      <Dialog open={atestadoDialogOpen} onOpenChange={setAtestadoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançar Atestado Médico — {func.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data de Início *</Label>
                <Input
                  type="date"
                  value={atestadoForm.date}
                  onChange={(e) => setAtestadoForm({ ...atestadoForm, date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <Select value={atestadoForm.status} onValueChange={(v) => setAtestadoForm({ ...atestadoForm, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atestado">Atestado Médico</SelectItem>
                    <SelectItem value="afastamento">Afastamento INSS / Longo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dias de Afastamento *</Label>
                <Input
                  type="number"
                  min={1}
                  value={atestadoForm.dias_afastamento}
                  onChange={(e) => setAtestadoForm({ ...atestadoForm, dias_afastamento: Math.max(1, Number(e.target.value)) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Retorno Previsto</Label>
                <Input
                  disabled
                  value={fmtDate(calcDataRetorno(atestadoForm.date, atestadoForm.dias_afastamento))}
                  className="bg-muted font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CID</Label>
                <FastInput
                  value={atestadoForm.cid}
                  onValueChange={(v) => setAtestadoForm({ ...atestadoForm, cid: v })}
                  placeholder="Ex: M54.5"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CRM do Médico</Label>
                <FastInput
                  value={atestadoForm.crm}
                  onValueChange={(v) => setAtestadoForm({ ...atestadoForm, crm: v })}
                  placeholder="Ex: 12345-ES"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação / Clínica</Label>
              <FastInput
                value={atestadoForm.observation}
                onValueChange={(v) => setAtestadoForm({ ...atestadoForm, observation: v })}
                placeholder="Ex: Entregue via RH..."
              />
            </div>
            <Button className="w-full" onClick={handleCreateAtestado} disabled={savingAtestado}>
              {savingAtestado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar Atestado
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 6: ATUALIZAR CNH & TREINAMENTOS / RACS */}
      <Dialog open={treinDialogOpen} onOpenChange={setTreinDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CNH & Treinamentos SSMA — {func.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Categoria CNH</Label>
                <FastInput
                  value={treinForm.cnh_categoria}
                  onValueChange={(v) => setTreinForm({ ...treinForm, cnh_categoria: v })}
                  placeholder="Ex: D, E, AB..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Vencimento CNH</Label>
                <FastInput
                  value={treinForm.cnh_vencimento}
                  onValueChange={(v) => setTreinForm({ ...treinForm, cnh_vencimento: v })}
                  placeholder="DD/MM/AAAA ou AAAA-MM-DD"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-primary">Validade de RACs e NRs (Data ou "Realizado")</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(treinForm.treinamentos).map(([racName, val]) => (
                  <div key={racName} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{racName}</Label>
                    <Input
                      value={val}
                      placeholder="Ex: 15/08/2027 ou N/A"
                      onChange={(e) =>
                        setTreinForm({
                          ...treinForm,
                          treinamentos: { ...treinForm.treinamentos, [racName]: e.target.value },
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border">
              <div className="space-y-1">
                <Label className="text-xs">Adicionar Outro Curso/NR</Label>
                <FastInput
                  value={treinForm.novoNomeRac}
                  onValueChange={(v) => setTreinForm({ ...treinForm, novoNomeRac: v })}
                  placeholder="Ex: NR 35 / Direção Defensiva"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vencimento / Situação</Label>
                <FastInput
                  value={treinForm.novaDataRac}
                  onValueChange={(v) => setTreinForm({ ...treinForm, novaDataRac: v })}
                  placeholder="Ex: 10/10/2027"
                />
              </div>
            </div>

            <Button className="w-full" onClick={handleSaveTreinamentos} disabled={savingTrein}>
              {savingTrein && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar Habilitações & RACs
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CONFIRMATIONS */}
      <AlertDialog open={!!deleteAttendanceId} onOpenChange={(o) => !o && setDeleteAttendanceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação removerá permanentemente o lançamento selecionado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAttendance} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteWarningId} onOpenChange={(o) => !o && setDeleteWarningId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir advertência?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWarning} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDocItem} onOpenChange={(o) => !o && setDeleteDocItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo "{deleteDocItem?.file_name}"?</AlertDialogTitle>
            <AlertDialogDescription>O documento será desvinculado do prontuário deste colaborador.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
