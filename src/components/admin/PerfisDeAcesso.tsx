import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield, Loader2, Save, CheckSquare, XSquare, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FastInput } from '@/components/ui/fast-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

import { PAGES, PAGE_GROUPS, RH_AUSENCIAS_PAGE_KEYS } from '@/lib/permissions';
import { useAuth } from '@/contexts/AuthContext';

interface AccessProfile {
  id: string;
  name: string;
  description: string;
}

interface ProfilePermission {
  page: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export function PerfisDeAcesso({ onProfilesChanged }: { onProfilesChanged?: () => void }) {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [profilePermsSummary, setProfilePermsSummary] = useState<Record<string, ProfilePermission[]>>({});
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileData, setProfileData] = useState<{ id: string | null; name: string; description: string }>({
    id: null,
    name: '',
    description: '',
  });
  const [editingPerms, setEditingPerms] = useState<ProfilePermission[]>([]);
  const [activeModuleTab, setActiveModuleTab] = useState<string>(PAGE_GROUPS[0].id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    setLoading(true);
    const [{ data, error }, { data: allPerms }] = await Promise.all([
      supabase.from('access_profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('access_profile_permissions').select('profile_id, page, can_view, can_create, can_edit, can_delete'),
    ]);

    if (error) {
      toast.error('Erro ao buscar perfis');
    } else {
      setProfiles(data || []);
      const grouped: Record<string, ProfilePermission[]> = {};
      (allPerms || []).forEach((row: any) => {
        if (!grouped[row.profile_id]) grouped[row.profile_id] = [];
        grouped[row.profile_id].push({
          page: row.page,
          can_view: !!row.can_view,
          can_create: !!row.can_create,
          can_edit: !!row.can_edit,
          can_delete: !!row.can_delete,
        });
      });
      setProfilePermsSummary(grouped);
    }
    setLoading(false);
  }

  function openCreateProfile() {
    setProfileData({ id: null, name: '', description: '' });
    setEditingPerms(
      PAGES.map((p) => ({
        page: p.key,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
      }))
    );
    setActiveModuleTab(PAGE_GROUPS[0].id);
    setDialogOpen(true);
  }

  async function openEditProfile(profile: AccessProfile) {
    setProfileData({ id: profile.id, name: profile.name, description: profile.description || '' });

    const { data, error } = await supabase
      .from('access_profile_permissions')
      .select('*')
      .eq('profile_id', profile.id);

    if (error) {
      toast.error('Erro ao carregar permissões');
      return;
    }

    const permsMap = new Map((data || []).map((p: any) => [p.page, p]));
    const legacyCco = permsMap.get('cco') as ProfilePermission | undefined;
    const hasGranularCco = PAGES.some((p) => p.legacyAlias === 'cco' && permsMap.has(p.key));
    const legacyAusencias = permsMap.get('ausencias') as ProfilePermission | undefined;
    const hasGranularAusencias = PAGES.some((p) => p.legacyAlias === 'ausencias' && permsMap.has(p.key));

    const defaultPerms = PAGES.map((p) => {
      const existing = (permsMap.get(p.key) ||
        (!hasGranularCco && p.legacyAlias === 'cco' ? legacyCco : undefined) ||
        (!hasGranularAusencias && p.legacyAlias === 'ausencias' ? legacyAusencias : undefined)) as
        | ProfilePermission
        | undefined;
      return {
        page: p.key,
        can_view: existing?.can_view || false,
        can_create: existing?.can_create || false,
        can_edit: existing?.can_edit || false,
        can_delete: existing?.can_delete || false,
      };
    });
    setEditingPerms(defaultPerms);
    setActiveModuleTab(PAGE_GROUPS[0].id);
    setDialogOpen(true);
  }

  function setModuleAccess(moduleId: string, grantView: boolean, grantFullCrud: boolean) {
    const group = PAGE_GROUPS.find((g) => g.id === moduleId);
    if (!group) return;
    const keys = new Set(group.pages.map((p) => p.key));
    setEditingPerms((prev) =>
      prev.map((perm) =>
        keys.has(perm.page)
          ? {
              ...perm,
              can_view: grantView,
              can_create: grantView ? (grantFullCrud ? true : perm.can_create) : false,
              can_edit: grantView ? (grantFullCrud ? true : perm.can_edit) : false,
              can_delete: grantView ? (grantFullCrud ? true : perm.can_delete) : false,
            }
          : perm
      )
    );
  }

  async function handleSaveProfile() {
    if (!profileData.name.trim()) return toast.error('Nome do perfil é obrigatório');
    setSaving(true);

    let profileId = profileData.id;

    if (!profileId) {
      const { data, error } = await supabase
        .from('access_profiles')
        .insert({
          name: profileData.name.trim(),
          description: profileData.description.trim(),
        })
        .select()
        .single();

      if (error) {
        toast.error('Erro ao criar perfil');
        setSaving(false);
        return;
      }
      profileId = data.id;
    } else {
      const { error } = await supabase
        .from('access_profiles')
        .update({
          name: profileData.name.trim(),
          description: profileData.description.trim(),
        })
        .eq('id', profileId);

      if (error) {
        toast.error('Erro ao atualizar perfil');
        setSaving(false);
        return;
      }
    }

    await supabase.from('access_profile_permissions').delete().eq('profile_id', profileId);

    // Inclui também as chaves legadas 'cco' e 'ausencias' sincronizadas
    const ccoPerms = editingPerms.filter((p) => p.page.startsWith('cco_'));
    const ccoAggregate = {
      page: 'cco',
      can_view: ccoPerms.some((p) => p.can_view),
      can_create: ccoPerms.some((p) => p.can_create),
      can_edit: ccoPerms.some((p) => p.can_edit),
      can_delete: ccoPerms.some((p) => p.can_delete),
    };

    const rhPerms = editingPerms.filter((p) => (RH_AUSENCIAS_PAGE_KEYS as readonly string[]).includes(p.page));
    const ausenciasAggregate = {
      page: 'ausencias',
      can_view: rhPerms.some((p) => p.can_view),
      can_create: rhPerms.some((p) => p.can_create),
      can_edit: rhPerms.some((p) => p.can_edit),
      can_delete: rhPerms.some((p) => p.can_delete),
    };

    const toInsert = [...editingPerms, ccoAggregate, ausenciasAggregate].map((p) => ({
      profile_id: profileId,
      ...p,
    }));

    const { error: permsError } = await supabase.from('access_profile_permissions').insert(toInsert);

    if (permsError) {
      toast.error('Erro ao salvar permissões');
    } else {
      toast.success(profileData.id ? 'Perfil atualizado com sucesso!' : 'Perfil criado com sucesso!');
      setDialogOpen(false);
      await fetchProfiles();
      onProfilesChanged?.();
    }
    setSaving(false);
  }

  async function handleDeleteProfile(id: string) {
    if (!confirm('Tem certeza que deseja excluir este perfil? Usuários associados perderão seus acessos.')) return;
    const { error } = await supabase.from('access_profiles').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir. Verifique se existem usuários atrelados.');
    } else {
      toast.success('Perfil excluído com sucesso');
      setProfiles(profiles.filter((p) => p.id !== id));
      onProfilesChanged?.();
    }
  }

  if (loading) return <div className="p-4 text-muted-foreground">Carregando perfis...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Perfis de Acesso (Por Módulo & Página)</h2>
          <p className="text-xs text-muted-foreground">
            Padronize cargos e equipes definindo quais módulos e páginas cada perfil pode visualizar, criar, editar ou excluir.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreateProfile}>
            <Plus className="w-4 h-4 mr-2" /> Novo Perfil
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((p) => {
          const perms = profilePermsSummary[p.id] || [];
          const permMap = new Map(perms.map((x) => [x.page, x]));
          const hasGranularCco = PAGES.some((pg) => pg.legacyAlias === 'cco' && permMap.has(pg.key));
          const hasGranularAusencias = PAGES.some((pg) => pg.legacyAlias === 'ausencias' && permMap.has(pg.key));

          return (
            <div key={p.id} className="glass-card rounded-xl p-5 space-y-4 border border-border/60 flex flex-col justify-between">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Shield className="w-4 h-4" /> {p.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 min-h-[28px]">
                    {p.description || 'Sem descrição'}
                  </p>
                </div>

                {/* Resumo visual de módulos liberados neste perfil */}
                <div className="flex flex-wrap gap-1.5">
                  {PAGE_GROUPS.map((g) => {
                    const countAllowed = g.pages.filter((pg) => {
                      const entry =
                        permMap.get(pg.key) ||
                        (!hasGranularCco && pg.legacyAlias === 'cco' ? permMap.get('cco') : undefined) ||
                        (!hasGranularAusencias && pg.legacyAlias === 'ausencias' ? permMap.get('ausencias') : undefined);
                      return entry?.can_view === true;
                    }).length;
                    if (countAllowed === 0) return null;
                    return (
                      <Badge
                        key={g.id}
                        variant="outline"
                        className="text-[10px] font-semibold bg-primary/5 border-primary/25 text-primary"
                      >
                        {g.module.split('—')[0].trim()} ({countAllowed}/{g.pages.length})
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border/50">
                <Button variant="outline" size="sm" className={isAdmin ? 'flex-1' : 'w-full'} onClick={() => openEditProfile(p)}>
                  <Layers className="w-3.5 h-3.5 mr-1.5" /> Configurar Módulos & Páginas
                </Button>
                {isAdmin && (
                  <>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditProfile(p)} title="Editar Perfil">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDeleteProfile(p.id)} title="Excluir Perfil">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {profileData.id ? `Editar Perfil — ${profileData.name}` : 'Criar Novo Perfil de Acesso'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pt-2 pb-4 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1">
              <div className="space-y-1.5">
                <Label>Nome do Perfil *</Label>
                <FastInput
                  disabled={!isAdmin}
                  value={profileData.name}
                  onValueChange={(v) => setProfileData({ ...profileData, name: v })}
                  placeholder="Ex: Operador CCO / Analista RH"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <FastInput
                  disabled={!isAdmin}
                  value={profileData.description}
                  onValueChange={(v) => setProfileData({ ...profileData, description: v })}
                  placeholder="Escopo de atuação deste perfil..."
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Autorização por Módulo & Páginas</h3>
                  <p className="text-xs text-muted-foreground">
                    Selecione um módulo abaixo para autorizar o módulo inteiro ou escolher páginas específicas.
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditingPerms((prev) =>
                          prev.map((p) => ({ ...p, can_view: true, can_create: true, can_edit: true, can_delete: true }))
                        )
                      }
                    >
                      <CheckSquare className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Liberar Tudo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditingPerms((prev) =>
                          prev.map((p) => ({ ...p, can_view: false, can_create: false, can_edit: false, can_delete: false }))
                        )
                      }
                    >
                      <XSquare className="w-3.5 h-3.5 mr-1 text-destructive" /> Limpar Tudo
                    </Button>
                  </div>
                )}
              </div>

              {/* Abas separadas por Módulo */}
              <Tabs value={activeModuleTab} onValueChange={setActiveModuleTab} className="space-y-4">
                <TabsList className="flex flex-wrap h-auto gap-1.5 bg-muted/50 p-1.5 justify-start">
                  {PAGE_GROUPS.map((g) => {
                    const allowedCount = g.pages.filter(
                      (pg) => editingPerms.find((ep) => ep.page === pg.key)?.can_view
                    ).length;
                    return (
                      <TabsTrigger
                        key={g.id}
                        value={g.id}
                        className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        <span>{g.module.split('—')[0].trim()}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            allowedCount > 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-muted-foreground/20'
                          }`}
                        >
                          {allowedCount}/{g.pages.length}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {PAGE_GROUPS.map((group) => (
                  <TabsContent key={group.id} value={group.id} className="space-y-3 mt-0">
                    <div className="rounded-xl border border-border bg-muted/20 p-3.5 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-primary">{group.module}</h4>
                        <p className="text-xs text-muted-foreground">{group.description}</p>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                            onClick={() => setModuleAccess(group.id, true, false)}
                          >
                            👁️ Ver Módulo Completo
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-primary/40 text-primary"
                            onClick={() => setModuleAccess(group.id, true, true)}
                          >
                            ✅ Acesso Total no Módulo
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive border-destructive/30"
                            onClick={() => setModuleAccess(group.id, false, false)}
                          >
                            🚫 Bloquear Módulo
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="grid grid-cols-[1fr_70px_70px_70px_70px] gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                        <span className="text-xs font-bold text-muted-foreground uppercase">Página / Sub-aba</span>
                        <span className="text-xs font-bold text-muted-foreground uppercase text-center">Ver</span>
                        <span className="text-xs font-bold text-muted-foreground uppercase text-center">Criar</span>
                        <span className="text-xs font-bold text-muted-foreground uppercase text-center">Editar</span>
                        <span className="text-xs font-bold text-muted-foreground uppercase text-center">Excluir</span>
                      </div>

                      <div className="divide-y divide-border">
                        {group.pages.map((page) => {
                          const permIdx = editingPerms.findIndex((p) => p.page === page.key);
                          const perm = editingPerms[permIdx];
                          if (!perm) return null;
                          return (
                            <div
                              key={page.key}
                              className="grid grid-cols-[1fr_70px_70px_70px_70px] gap-2 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors"
                            >
                              <div>
                                <div className="text-sm font-medium text-foreground">{page.label}</div>
                                {page.path && <div className="text-[11px] text-muted-foreground font-mono">{page.path}</div>}
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={perm.can_view}
                                  disabled={!isAdmin}
                                  onCheckedChange={(c) => {
                                    const isChecked = c === true;
                                    const upd = [...editingPerms];
                                    upd[permIdx] = { ...upd[permIdx], can_view: isChecked };
                                    if (!isChecked) {
                                      upd[permIdx].can_create = false;
                                      upd[permIdx].can_edit = false;
                                      upd[permIdx].can_delete = false;
                                    }
                                    setEditingPerms(upd);
                                  }}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={perm.can_create}
                                  disabled={!perm.can_view || !isAdmin}
                                  onCheckedChange={(c) => {
                                    const upd = [...editingPerms];
                                    upd[permIdx] = { ...upd[permIdx], can_create: c === true };
                                    setEditingPerms(upd);
                                  }}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={perm.can_edit}
                                  disabled={!perm.can_view || !isAdmin}
                                  onCheckedChange={(c) => {
                                    const upd = [...editingPerms];
                                    upd[permIdx] = { ...upd[permIdx], can_edit: c === true };
                                    setEditingPerms(upd);
                                  }}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={perm.can_delete}
                                  disabled={!perm.can_view || !isAdmin}
                                  onCheckedChange={(c) => {
                                    const upd = [...editingPerms];
                                    upd[permIdx] = { ...upd[permIdx], can_delete: c === true };
                                    setEditingPerms(upd);
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>

          <div className="pt-4 border-t mt-auto">
            {isAdmin ? (
              <Button onClick={handleSaveProfile} className="w-full" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {profileData.id ? 'Salvar Alterações do Perfil' : 'Criar Perfil de Acesso'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground text-center">Apenas administradores podem alterar permissões.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
