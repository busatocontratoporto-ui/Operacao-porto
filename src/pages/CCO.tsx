import React from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Clock,
  AlertTriangle,
  Truck,
  Wrench,
  Settings,
  Activity,
} from 'lucide-react';
import { BusatoProvider } from '@/contexts/BusatoContext';
import {
  CCODashboardView,
  CorretivasDiaView,
  OperacaoDiariaView,
  MedicaoPorPlacaView,
  AuditoriaExportacaoView,
  CadastrosCCOView,
} from '@/components/cco/CCOOpsViews';
import { ProgramacaoPortoView } from '@/components/cco/ProgramacaoPortoView';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';
import { AccessDenied } from '@/components/auth/PageGuard';

const CCO_TABS = [
  { id: 'painel', path: '/cco', label: 'Painel Analítico & Paradas', icon: LayoutDashboard, permKey: 'cco_painel' },
  { id: 'programacao', path: '/cco/programacao', label: 'Programação', icon: FileSpreadsheet, permKey: 'cco_programacao' },
  { id: 'operacao', path: '/cco/operacao', label: 'Operação Diária ao Vivo', icon: Clock, permKey: 'cco_operacao' },
  { id: 'corretivas', path: '/cco/corretivas', label: 'Corretivas do Dia (Ao Vivo)', icon: AlertTriangle, permKey: 'cco_corretivas' },
  { id: 'medicao', path: '/cco/medicao', label: 'Boletim de Medição por Placa', icon: Truck, permKey: 'cco_medicao' },
  { id: 'relatorios', path: '/cco/relatorios', label: 'Histórico & Exportação', icon: Wrench, permKey: 'cco_relatorios' },
  { id: 'cadastros', path: '/cco/cadastros', label: 'Gestão de Cadastros', icon: Settings, permKey: 'cco_cadastros' },
];

export default function CCO() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { canView } = usePermissions();

  const visibleTabs = CCO_TABS.filter((t) => canView(t.permKey));
  const requestedTab = tab || 'painel';

  // Caso tente acessar sub-aba antiga (ex: /cco/frota) ou sem permissão, redireciona para primeira aba permitida
  if (visibleTabs.length === 0) {
    return <AccessDenied />;
  }

  const currentTabObj = visibleTabs.find((t) => t.id === requestedTab);
  if (!currentTabObj) {
    return <Navigate to={visibleTabs[0].path} replace />;
  }

  const activeMainTab = currentTabObj.id;

  return (
    <BusatoProvider>
      <div className="flex flex-col min-h-screen bg-background -m-4 md:-m-6">
        {/* ── Header ── */}
        <div className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Activity className="w-4.5 h-4.5 text-primary" />
                </div>
                <h1 className="text-xl font-bold text-foreground tracking-tight">
                  CCO — Centro de Controle Operacional
                </h1>
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0.5 text-primary border-primary/30 bg-primary/5"
                >
                  BUSATO PORTO
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground ml-10.5">
                Controle operacional ao vivo, programação semanal, paradas corretivas, medição por placa e cadastros
              </p>
            </div>
          </div>

          {/* Main CCO Sub-Tabs bar */}
          <div className="px-6 flex gap-0 overflow-x-auto border-t border-border/40">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeMainTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(t.path)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                    isActive
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMainTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {activeMainTab === 'painel' && <CCODashboardView />}
              {activeMainTab === 'programacao' && <ProgramacaoPortoView />}
              {activeMainTab === 'operacao' && <OperacaoDiariaView />}
              {activeMainTab === 'corretivas' && <CorretivasDiaView />}
              {activeMainTab === 'medicao' && <MedicaoPorPlacaView />}
              {activeMainTab === 'relatorios' && <AuditoriaExportacaoView />}
              {activeMainTab === 'cadastros' && <CadastrosCCOView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </BusatoProvider>
  );
}
