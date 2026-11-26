import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSpreadsheet,
  Calculator,
  ArrowLeftRight,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  CalendarRange,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { type ColaboradorOption } from '@/components/colaboradores/ColaboradorSearchSelect';
import {
  getCurrentPortoCycle,
  getCycleByKey,
  shiftCycleKey,
  listCycleOptions,
  loadCycleData,
  saveCycleData,
  buildEffectiveCatalog,
  computeBdLancamento,
  computeDfTable,
  computeValeComparison,
  computeMemoriaCalculo,
  parseMedicaoExcelBuffer,
  exportMedicaoCycleToExcel,
  type MedicaoPortoCyclePayload,
  type BdLancamentoInput,
  type DfCycleParams,
  type QqpCycleOverride,
  type MemoriaItemComplementar,
} from '@/lib/medicao-porto-service';
import { LancamentosTab } from '@/components/medicao-porto/LancamentosTab';
import { DfTab } from '@/components/medicao-porto/DfTab';
import { BdValeTab } from '@/components/medicao-porto/BdValeTab';
import { MemoriaCalculoTab } from '@/components/medicao-porto/MemoriaCalculoTab';

const SUB_TABS = [
  {
    id: 'lancamentos',
    path: '/medicao-porto/lancamentos',
    label: 'Lançamentos (BD)',
    icon: FileSpreadsheet,
  },
  {
    id: 'df',
    path: '/medicao-porto/df',
    label: 'DF (Aderência)',
    icon: Gauge,
  },
  {
    id: 'bd-vale',
    path: '/medicao-porto/bd-vale',
    label: 'BD Vale (BD Real)',
    icon: ArrowLeftRight,
  },
  {
    id: 'memoria',
    path: '/medicao-porto/memoria',
    label: 'Memória de Cálculo',
    icon: Calculator,
  },
] as const;

type SubTabId = (typeof SUB_TABS)[number]['id'];

export default function MedicaoPorto() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();

  const fullWorkbookInputRef = useRef<HTMLInputElement>(null);

  const [cycleKey, setCycleKey] = useState<string>(() => getCurrentPortoCycle().key);
  const cycle = useMemo(() => getCycleByKey(cycleKey), [cycleKey]);
  const cycleOptions = useMemo(() => listCycleOptions(cycleKey), [cycleKey]);

  const [payload, setPayload] = useState<MedicaoPortoCyclePayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [colaboradores, setColaboradores] = useState<ColaboradorOption[]>([]);
  const [registeredPlates, setRegisteredPlates] = useState<string[]>([]);

  const activeTab: SubTabId = useMemo(() => {
    const found = SUB_TABS.find((t) => t.id === tab);
    return found ? found.id : 'lancamentos';
  }, [tab]);

  // Carrega colaboradores e placas cadastradas no sistema para vincular aos lançamentos
  useEffect(() => {
    let mounted = true;
    async function loadSystemLookups() {
      try {
        const [{ data: funcs }, { data: ccoCad }] = await Promise.all([
          supabase
            .from('funcionarios')
            .select('id, nome, cargo, turno, letra, cpf, frente_atendimento')
            .order('nome'),
          (
            supabase as unknown as {
              from: (t: string) => {
                select: (c: string) => {
                  eq: (k: string, v: string) => {
                    maybeSingle: () => Promise<{
                      data: { payload?: { equipamentos?: { placa?: string }[] } } | null;
                    }>;
                  };
                };
              };
            }
          )
            .from('busato_cadastros')
            .select('payload')
            .eq('id', 'default')
            .maybeSingle(),
        ]);

        if (!mounted) return;
        if (funcs) {
          setColaboradores(funcs as ColaboradorOption[]);
        }
        const eqs = ccoCad?.payload?.equipamentos;
        if (Array.isArray(eqs)) {
          const plates = eqs
            .map((e) => String(e.placa || '').trim().toUpperCase())
            .filter((p) => p && p !== 'A DEFINIR');
          setRegisteredPlates(Array.from(new Set(plates)));
        }
      } catch {
        // silencioso se offline
      }
    }
    loadSystemLookups();
    return () => {
      mounted = false;
    };
  }, []);

  // Carrega dados do ciclo 21..20 selecionado
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadCycleData(cycleKey)
      .then((data) => {
        if (active) {
          setPayload(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cycleKey]);

  const persistUpdate = useCallback(
    async (updater: (prev: MedicaoPortoCyclePayload) => MedicaoPortoCyclePayload) => {
      setPayload((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        setSaving(true);
        saveCycleData(next).finally(() => setSaving(false));
        return next;
      });
    },
    []
  );

  // Cálculos reativos encadeados: BD -> DF -> BD Vale -> Memória de Cálculo
  const computedLancamentos = useMemo(
    () => (payload?.lancamentos || []).map(computeBdLancamento),
    [payload?.lancamentos]
  );

  const effectiveCatalog = useMemo(() => {
    const extraNames = [
      ...computedLancamentos.map((l) => l.tipoQqp),
      ...(payload?.bdVale || []).map((v) => v.equipamento),
    ];
    return buildEffectiveCatalog(payload?.qqpOverrides || {}, extraNames);
  }, [payload?.qqpOverrides, computedLancamentos, payload?.bdVale]);

  const dfResult = useMemo(
    () =>
      computeDfTable(
        cycle,
        effectiveCatalog,
        computedLancamentos,
        payload?.dfParams || {
          horasTurnoMin: 630,
          preventivaMfeMin: 240,
          preventivaTpmMin: 240,
          fonteAderenciaMemoria: 'BUSATO',
        }
      ),
    [cycle, effectiveCatalog, computedLancamentos, payload?.dfParams]
  );

  const valeResult = useMemo(
    () =>
      computeValeComparison(
        effectiveCatalog,
        computedLancamentos,
        payload?.bdVale || [],
        dfResult.rows
      ),
    [effectiveCatalog, computedLancamentos, payload?.bdVale, dfResult.rows]
  );

  const memoria = useMemo(
    () =>
      computeMemoriaCalculo(
        effectiveCatalog,
        dfResult.rows,
        valeResult.valeAderenciaMap,
        payload?.qqpOverrides || {},
        payload?.dfParams || {
          horasTurnoMin: 630,
          preventivaMfeMin: 240,
          preventivaTpmMin: 240,
          fonteAderenciaMemoria: 'BUSATO',
        },
        payload?.itensComplementares || []
      ),
    [
      effectiveCatalog,
      dfResult.rows,
      valeResult.valeAderenciaMap,
      payload?.qqpOverrides,
      payload?.dfParams,
      payload?.itensComplementares,
    ]
  );

  // Handlers de Lançamentos (BD)
  const handleUpsertLancamento = (row: BdLancamentoInput) => {
    persistUpdate((prev) => {
      const idx = prev.lancamentos.findIndex((x) => x.id === row.id);
      const nextList = [...prev.lancamentos];
      if (idx >= 0) nextList[idx] = row;
      else nextList.unshift(row);
      return { ...prev, lancamentos: nextList };
    });
    toast.success('Lançamento salvo na aba BD.');
  };

  const handleGenerateDayBatch = (dateIso: string) => {
    if (!payload) return;
    const existingKeys = new Set(
      payload.lancamentos
        .filter((l) => l.data === dateIso)
        .map((l) => `${l.tipoQqp}|${l.horaInicial}`)
    );

    const lastPlateByQqp = new Map<string, string>();
    for (const l of payload.lancamentos) {
      if (l.tipoQqp && l.placaTag && !lastPlateByQqp.has(l.tipoQqp)) {
        lastPlateByQqp.set(l.tipoQqp, l.placaTag);
      }
    }

    const generated: BdLancamentoInput[] = [];
    for (const item of effectiveCatalog.slice(0, 34)) {
      const keyDia = `${item.tipoQqp}|07:00`;
      if (!existingKeys.has(keyDia)) {
        generated.push({
          id: `bd-${dateIso}-d-${item.ordem}-${Math.random().toString(36).slice(2, 6)}`,
          os: '',
          pde: '',
          tipoQqp: item.tipoQqp,
          placaTag: lastPlateByQqp.get(item.tipoQqp) || '',
          matricula: '',
          data: dateIso,
          horaInicial: '07:00',
          horaFinal: '17:30',
          empresa: 'VALE',
        });
      }
      if (item.turno === '24h' || item.regimeDf === '24h') {
        const keyNoite = `${item.tipoQqp}|19:00`;
        if (!existingKeys.has(keyNoite)) {
          generated.push({
            id: `bd-${dateIso}-n-${item.ordem}-${Math.random().toString(36).slice(2, 6)}`,
            os: '',
            pde: '',
            tipoQqp: item.tipoQqp,
            placaTag: lastPlateByQqp.get(item.tipoQqp) || '',
            matricula: '',
            data: dateIso,
            horaInicial: '19:00',
            horaFinal: '05:30',
            empresa: 'VALE',
          });
        }
      }
    }

    if (generated.length === 0) {
      toast.info('Todas as linhas padrão desta data já foram geradas.');
      return;
    }

    persistUpdate((prev) => ({
      ...prev,
      lancamentos: [...generated, ...prev.lancamentos],
    }));
    toast.success(`${generated.length} linhas de atendimento geradas para o dia.`);
  };

  const handleDeleteLancamento = (id: string) => {
    persistUpdate((prev) => ({
      ...prev,
      lancamentos: prev.lancamentos.filter((l) => l.id !== id),
    }));
    toast.success('Linha removida.');
  };

  const handleClearLancamentos = () => {
    if (!window.confirm(`Deseja limpar todos os lançamentos (BD) do ciclo ${cycle.fullLabel}?`)) {
      return;
    }
    persistUpdate((prev) => ({ ...prev, lancamentos: [] }));
    toast.success('Lançamentos do ciclo limpos.');
  };

  // Handlers Importação Excel
  const handleImportExcel = async (file: File, mode: 'FULL' | 'ONLY_BD' | 'ONLY_VALE') => {
    const toastId = toast.loading('Processando planilha Excel...');
    try {
      const buf = await file.arrayBuffer();
      const res = parseMedicaoExcelBuffer(buf, cycle, mode);

      if (mode === 'FULL' && res.detectedCycleKey && res.detectedCycleKey !== cycleKey) {
        const targetCycleObj = getCycleByKey(res.detectedCycleKey);
        const targetExisting = await loadCycleData(res.detectedCycleKey);
        const merged: MedicaoPortoCyclePayload = {
          ...targetExisting,
          cycleKey: res.detectedCycleKey,
          lancamentos:
            res.lancamentos.length > 0 ? res.lancamentos : targetExisting.lancamentos,
          bdVale: res.bdVale.length > 0 ? res.bdVale : targetExisting.bdVale,
          qqpOverrides: {
            ...targetExisting.qqpOverrides,
            ...res.qqpOverrides,
          },
          itensComplementares:
            res.itensComplementares.length > 0
              ? res.itensComplementares
              : targetExisting.itensComplementares,
        };
        await saveCycleData(merged);
        setCycleKey(res.detectedCycleKey);
        setPayload(merged);
        toast.success(
          `Planilha importada no ciclo ${targetCycleObj.label}: ${res.importedBdCount} linhas BD e ${res.importedValeCount} linhas BD Vale!`,
          { id: toastId }
        );
        return;
      }

      persistUpdate((prev) => ({
        ...prev,
        lancamentos:
          mode === 'ONLY_VALE'
            ? prev.lancamentos
            : res.lancamentos.length > 0
            ? res.lancamentos
            : prev.lancamentos,
        bdVale:
          mode === 'ONLY_BD'
            ? prev.bdVale
            : res.bdVale.length > 0
            ? res.bdVale
            : prev.bdVale,
        qqpOverrides:
          mode === 'FULL'
            ? { ...prev.qqpOverrides, ...res.qqpOverrides }
            : prev.qqpOverrides,
        itensComplementares:
          mode === 'FULL' && res.itensComplementares.length > 0
            ? res.itensComplementares
            : prev.itensComplementares,
      }));

      toast.success(
        mode === 'ONLY_BD'
          ? `${res.importedBdCount} lançamentos importados na aba BD!`
          : mode === 'ONLY_VALE'
          ? `${res.importedValeCount} registros da Vale importados em BD Vale!`
          : `Importação concluída: ${res.importedBdCount} linhas BD e ${res.importedValeCount} linhas BD Vale!`,
        { id: toastId }
      );
    } catch (err) {
      console.error(err);
      toast.error('Falha ao ler o arquivo Excel. Verifique o formato da planilha.', {
        id: toastId,
      });
    }
  };

  // Handlers DF & Memória
  const handleUpdateDfParams = (patch: Partial<DfCycleParams>) => {
    persistUpdate((prev) => ({
      ...prev,
      dfParams: { ...prev.dfParams, ...patch },
    }));
  };

  const handleUpdateRegimeDf = (tipoQqp: string, regimeDf: '12h' | '24h') => {
    persistUpdate((prev) => ({
      ...prev,
      qqpOverrides: {
        ...prev.qqpOverrides,
        [tipoQqp]: { ...(prev.qqpOverrides[tipoQqp] || {}), regimeDf },
      },
    }));
  };

  const handleSaveEquipmentOverride = (tipoQqp: string, override: QqpCycleOverride) => {
    persistUpdate((prev) => ({
      ...prev,
      qqpOverrides: {
        ...prev.qqpOverrides,
        [tipoQqp]: { ...(prev.qqpOverrides[tipoQqp] || {}), ...override },
      },
    }));
    toast.success('Parâmetros da linha atualizados na Memória de Cálculo.');
  };

  const handleApplyValeAderencia = () => {
    persistUpdate((prev) => {
      const nextOv = { ...prev.qqpOverrides };
      for (const [qqp, ratio] of Object.entries(valeResult.valeAderenciaMap)) {
        nextOv[qqp] = { ...(nextOv[qqp] || {}), aderenciaValeManualRatio: ratio };
      }
      return { ...prev, qqpOverrides: nextOv };
    });
    toast.success('Aderência calculada do BD Vale sincronizada na coluna VALE % da Memória!');
  };

  const handleUpsertComplementar = (item: MemoriaItemComplementar) => {
    persistUpdate((prev) => {
      const idx = prev.itensComplementares.findIndex((c) => c.id === item.id);
      const next = [...prev.itensComplementares];
      if (idx >= 0) next[idx] = item;
      else next.push(item);
      return { ...prev, itensComplementares: next };
    });
    toast.success('Item complementar atualizado.');
  };

  const handleDeleteComplementar = (id: string) => {
    persistUpdate((prev) => ({
      ...prev,
      itensComplementares: prev.itensComplementares.filter((c) => c.id !== id),
    }));
    toast.success('Item removido.');
  };

  const canWrite = canCreate('medicao_porto') || canEdit('medicao_porto');

  return (
    <div className="flex flex-col min-h-screen bg-background -m-4 md:-m-6">
      <input
        ref={fullWorkbookInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportExcel(f, 'FULL');
          e.target.value = '';
        }}
      />

      {/* Cabeçalho Fixo Medição Porto + Seletor de Ciclo Fixo 21..20 */}
      <div className="border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Medição Porto</h1>
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 text-primary border-primary/30 bg-primary/5"
              >
                CICLO FIXO 21 A 20
              </Badge>
              {saving ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Salvando...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                  <CheckCircle2 className="w-3 h-3" />
                  Sincronizado
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-10">
              Fechamento contratual unificado: Lançamentos Diários (BD), Aderência (DF), Conciliação BD Vale e Memória de Cálculo
            </p>
          </div>

          {/* Seletor de Ciclo Fixo 21/M-1 a 20/M + Ações Globais */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-lg p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Ciclo anterior (21 a 20)"
                onClick={() => setCycleKey((k) => shiftCycleKey(k, -1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Select value={cycleKey} onValueChange={setCycleKey}>
                <SelectTrigger className="h-7 border-0 bg-transparent shadow-none text-xs font-semibold min-w-[245px] focus:ring-0">
                  <div className="flex items-center gap-1.5">
                    <CalendarRange className="w-3.5 h-3.5 text-primary shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {cycleOptions.map((c) => (
                    <SelectItem key={c.key} value={c.key} className="text-xs">
                      {c.fullLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Próximo ciclo (21 a 20)"
                onClick={() => setCycleKey((k) => shiftCycleKey(k, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-1.5"
                onClick={() => fullWorkbookInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                Importar Planilha Modelo (.xlsx)
              </Button>
            )}

            <Button
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() =>
                exportMedicaoCycleToExcel(
                  cycle,
                  computedLancamentos,
                  dfResult,
                  valeResult,
                  payload?.bdVale || [],
                  memoria
                )
              }
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Fechamento
            </Button>
          </div>
        </div>

        {/* Barra das 4 Subabas */}
        <div className="px-6 flex gap-0 overflow-x-auto border-t border-border/50">
          {SUB_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(t.path)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.id === 'lancamentos' && computedLancamentos.length > 0 && (
                  <span className="text-[10px] font-mono bg-muted px-1.5 py-0.2 rounded-full">
                    {computedLancamentos.length}
                  </span>
                )}
                {t.id === 'bd-vale' && (payload?.bdVale.length || 0) > 0 && (
                  <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-700 px-1.5 py-0.2 rounded-full">
                    {payload?.bdVale.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da Subaba Ativa */}
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Carregando ciclo {cycle.fullLabel}...</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${cycleKey}-${activeTab}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14 }}
            >
              {activeTab === 'lancamentos' && (
                <LancamentosTab
                  cycle={cycle}
                  catalog={effectiveCatalog}
                  lancamentos={computedLancamentos}
                  colaboradores={colaboradores}
                  registeredPlates={registeredPlates}
                  canCreate={canWrite}
                  canEdit={canWrite}
                  canDelete={canDelete('medicao_porto') || canWrite}
                  onUpsertLancamento={handleUpsertLancamento}
                  onGenerateDayBatch={handleGenerateDayBatch}
                  onDeleteLancamento={handleDeleteLancamento}
                  onClearLancamentos={handleClearLancamentos}
                  onImportBdFile={(f) => handleImportExcel(f, 'ONLY_BD')}
                />
              )}

              {activeTab === 'df' && payload && (
                <DfTab
                  cycle={cycle}
                  dfResult={dfResult}
                  dfParams={payload.dfParams}
                  canEdit={canWrite}
                  onUpdateParams={handleUpdateDfParams}
                  onUpdateRegimeDf={handleUpdateRegimeDf}
                />
              )}

              {activeTab === 'bd-vale' && payload && (
                <BdValeTab
                  cycle={cycle}
                  bdVale={payload.bdVale}
                  valeResult={valeResult}
                  canEdit={canWrite}
                  onImportValeFile={(f) => handleImportExcel(f, 'ONLY_VALE')}
                  onApplyValeAderenciaToMemoria={handleApplyValeAderencia}
                  onClearVale={() => {
                    if (window.confirm('Limpar os registros importados do BD Vale neste ciclo?')) {
                      persistUpdate((prev) => ({ ...prev, bdVale: [] }));
                      toast.success('BD Vale limpo.');
                    }
                  }}
                />
              )}

              {activeTab === 'memoria' && payload && (
                <MemoriaCalculoTab
                  cycle={cycle}
                  memoria={memoria}
                  dfParams={payload.dfParams}
                  canEdit={canWrite}
                  onChangeFonteAderencia={(fonte) =>
                    handleUpdateDfParams({ fonteAderenciaMemoria: fonte })
                  }
                  onSaveEquipmentOverride={handleSaveEquipmentOverride}
                  onUpsertComplementar={handleUpsertComplementar}
                  onDeleteComplementar={handleDeleteComplementar}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
