import { Bell, Search, AlertTriangle, ShieldAlert, Clock, Moon, Sun, LogOut, Settings, Stethoscope, Users } from 'lucide-react';
import busatoGlobo from '@/assets/busato-globo.png';
import { useTheme } from '@/components/ThemeProvider';

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface AlertItem {
  id: string;
  type: 'warning' | 'event' | 'medical' | 'absence';
  title: string;
  description: string;
  date: string;
  link?: string;
  icon: typeof AlertTriangle;
  color: string;
}

export default function TopBar() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [empQuery, setEmpQuery] = useState('');
  const [empResults, setEmpResults] = useState<{ id: string; nome: string; cargo: string }[]>([]);
  const [empOpen, setEmpOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('seen_alerts');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  
  let userName = 'Usuário';
  if (user?.user_metadata?.full_name && typeof user.user_metadata.full_name === 'string') {
    userName = user.user_metadata.full_name;
  } else if (user?.email && typeof user.email === 'string') {
    userName = user.email;
  }
  
  let initials = 'US';
  try {
    initials = userName.split(' ').map((n: string) => n?.[0]).filter(Boolean).join('').substring(0, 2).toUpperCase();
  } catch {
    // ignore
  }

  useEffect(() => {
    fetchAlerts();
  }, []);

  useEffect(() => {
    const q = empQuery.trim();
    if (q.length < 2) {
      setEmpResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('funcionarios')
        .select('id, nome, cargo')
        .ilike('nome', `%${q}%`)
        .limit(8);
      setEmpResults((data || []) as { id: string; nome: string; cargo: string }[]);
    }, 200);
    return () => clearTimeout(timer);
  }, [empQuery]);

  async function fetchAlerts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString().slice(0, 10);

    const [warnRes, evtRes, attRes] = await Promise.all([
      supabase.from('employee_warnings').select('id, date, reason, employee_id, applied').gte('date', since).order('date', { ascending: false }).limit(20),
      supabase.from('events').select('id, event_date, description, involved_name').gte('event_date', since).order('event_date', { ascending: false }).limit(20),
      supabase.from('daily_attendance').select('id, date, status, employee_id, cid, dias_afastamento').gte('date', since).in('status', ['falta', 'falta_injustificada', 'atestado', 'afastamento']).order('date', { ascending: false }).limit(30),
    ]);

    const empIds = new Set<string>();
    warnRes.data?.forEach((w: { employee_id: string }) => empIds.add(w.employee_id));
    attRes.data?.forEach((a: { employee_id: string }) => empIds.add(a.employee_id));

    let nameMap: Record<string, string> = {};
    if (empIds.size > 0) {
      const { data: emps } = await supabase.from('funcionarios').select('id, nome').in('id', Array.from(empIds));
      if (emps) nameMap = Object.fromEntries(emps.map((e: { id: string; nome: string }) => [e.id, e.nome]));
    }

    const items: AlertItem[] = [];

    warnRes.data?.forEach((w: { id: string; employee_id: string; applied: boolean; reason?: string; date: string }) => {
      items.push({
        id: `warn-${w.id}`,
        type: 'warning',
        title: `Advertência ${w.applied ? 'aplicada' : 'pendente'}`,
        description: `${nameMap[w.employee_id] || 'Colaborador'} — ${w.reason || 'Sem motivo'}`,
        date: w.date,
        link: '/ponto',
        icon: ShieldAlert,
        color: 'text-destructive',
      });
    });

    evtRes.data?.forEach((e: { id: string; event_date: string; description?: string; involved_name: string }) => {
      items.push({
        id: `evt-${e.id}`,
        type: 'event',
        title: 'Evento SSMA registrado',
        description: `${e.involved_name} — ${e.description?.slice(0, 60) || ''}`,
        date: e.event_date,
        link: '/eventos',
        icon: AlertTriangle,
        color: 'text-warning',
      });
    });

    attRes.data?.forEach((a: { id: string; employee_id: string; date: string; status: string; cid?: string; dias_afastamento?: number }) => {
      if (a.status === 'atestado' || a.status === 'afastamento') {
        items.push({
          id: `med-${a.id}`,
          type: 'medical',
          title: a.status === 'afastamento' ? 'Afastamento médico' : 'Atestado registrado',
          description: `${nameMap[a.employee_id] || 'Colaborador'}${a.dias_afastamento ? ` (${a.dias_afastamento}d)` : ''}${a.cid ? ` • CID ${a.cid}` : ''}`,
          date: a.date,
          link: '/atestados',
          icon: Stethoscope,
          color: 'text-blue-600',
        });
      } else {
        items.push({
          id: `abs-${a.id}`,
          type: 'absence',
          title: 'Falta injustificada',
          description: nameMap[a.employee_id] || 'Colaborador',
          date: a.date,
          link: '/ponto',
          icon: Clock,
          color: 'text-destructive',
        });
      }
    });

    items.sort((a, b) => b.date.localeCompare(a.date));
    setAlerts(items);
  }

  const unseenCount = useMemo(() => alerts.filter(a => !seen.has(a.id)).length, [alerts, seen]);

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && unseenCount > 0) {
      const newSeen = new Set(seen);
      alerts.forEach(a => newSeen.add(a.id));
      setSeen(newSeen);
      try { localStorage.setItem('seen_alerts', JSON.stringify(Array.from(newSeen))); } catch {}
    }
  }

  function handleClick(alert: AlertItem) {
    if (alert.link) {
      navigate(alert.link);
      setOpen(false);
    }
  }

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3 md:hidden">
        <img src={busatoGlobo} alt="Busato" className="w-8 h-8" />
        <span className="font-semibold text-sm">Busato</span>
      </div>

      <div className="hidden md:block relative w-80">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={empQuery}
            onChange={(e) => { setEmpQuery(e.target.value); setEmpOpen(true); }}
            onFocus={() => setEmpOpen(true)}
            onBlur={() => setTimeout(() => setEmpOpen(false), 180)}
            placeholder="Buscar colaborador pelo nome..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
          />
        </div>
        {empOpen && empResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            {empResults.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onMouseDown={() => {
                  setEmpQuery('');
                  setEmpOpen(false);
                  navigate(`/funcionario/${emp.id}`);
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2.5 border-b border-border/50 last:border-0"
              >
                <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate text-foreground">{emp.nome}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{emp.cargo}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Moon className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        <Popover open={open} onOpenChange={handleOpen}>
          <PopoverTrigger asChild>
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {unseenCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-bold px-1">
                  {unseenCount > 99 ? '99+' : unseenCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Notificações Operacionais</h3>
              <p className="text-xs text-muted-foreground">Últimos 30 dias (Ponto, Atestados e SSMA)</p>
            </div>
            <ScrollArea className="max-h-[400px]">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
              ) : (
                <div className="divide-y divide-border">
                  {alerts.map(alert => (
                    <button
                      key={alert.id}
                      onClick={() => handleClick(alert)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3 ${!seen.has(alert.id) ? 'bg-primary/5' : ''}`}
                    >
                      <alert.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alert.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{alert.title}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {alert.type === 'warning' ? 'Adv.' : alert.type === 'event' ? 'SSMA' : alert.type === 'medical' ? 'Atestado' : 'Ponto'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{alert.description}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{new Date(alert.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="outline-none">
              <Avatar className="w-8 h-8 cursor-pointer ring-2 ring-transparent transition-all hover:ring-primary/50">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-2">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground truncate">
                  {user?.email}
                </p>
                {userDepartment ? (
                  <p className="text-[11px] font-medium text-primary mt-1 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {userDepartment}
                  </p>
                ) : isAdmin ? (
                  <p className="text-[11px] font-medium text-muted-foreground mt-1 flex items-center gap-1">
                    🌐 Acesso Geral (Admin)
                  </p>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/configuracoes')} className="cursor-pointer">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={async () => {
              await signOut();
              navigate('/');
            }} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
              <LogOut className="w-4 h-4 mr-2" />
              Sair do sistema
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
