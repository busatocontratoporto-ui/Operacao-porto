import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Shield,
  Users,
  Edit,
  Ban,
  KeyRound,
  Check,
  Trash2,
  Eye,
  EyeOff,
  MoreHorizontal,
  Building2,
  Crown,
  Layers,
  Search,
  CheckSquare,
  XSquare,
  RotateCcw,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PerfisDeAcesso } from '@/components/admin/PerfisDeAcesso';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { FastInput } from '@/components/ui/fast-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { PAGES, PAGE_GROUPS, CCO_PAGE_KEYS } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { DEPARTAMENTOS } from '@/lib/departments';

interface PermEntry {
  page: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  role: string;
  banned: boolean;
  profile_id: string | null;
  departamento: string | null;
  hasCustomPerms?: boolean;
  effectivePerms?: Record<string, PermEntry>;
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', profile_id: '', departamento: '' });
  const [accessProfiles, setAccessProfiles] = useState<{ id: string; name: string }[]>([]);

  // Filtros da aba Usuários
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'BLOQUEADOS'>('TODOS');
  const [moduleFilter, setModuleFilter] = useState<string>('TODOS');

  // Aba Matriz por Módulo
  const [activeMatrixModule, setActiveMatrixModule] = useState<string>(PAGE_GROUPS[4].id); // Começa destacando CCO ou primeiro módulo
  const [savingMatrixUserId, setSavingMatrixUserId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  // Modal Permissões Individuais (por Módulo e Páginas)
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [editPerms, setEditPerms] = useState<PermEntry[]>([]);
  const [activeModalModuleTab, setActiveModalModuleTab] = useState<string>(PAGE_GROUPS[0].id);
  const [savingPerms, setSavingPerms] = useState(false);

  // Edit user dialog
  const [editUserDialog, setEditUserDialog] = useState<UserWithRole | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editProfileId, setEditProfileId] = useState<string>('');
  const [editDepartamento, setEditDepartamento] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Change password dialog
  const [passwordUser, setPasswordUser] = useState<UserWithRole | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Block confirmation
  const [blockUser, setBlockUser] = useState<UserWithRole | null>(null);
  const [blockAction, setBlockAction] = useState<'ban' | 'unban'>('ban');
  const [savingBlock, setSavingBlock] = useState(false);

  // Delete user handler
  const [deleteUser, setDeleteUser] = useState<UserWithRole | null>(null);
  const [savingDelete, setSavingDelete] = useState(false);

  const adminAuthRequest = useCallback(async (action: 'create' | 'manage', payload: Record<string, unknown>) => {
    const functionName = action === 'create' ? 'create-user' : 'manage-user';
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload,
    });

    if (error) {
      console.error('Function error:', error);
      throw new Error(error.message || 'Erro na Edge Function');
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    return data;
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: dbProfiles }, { data: allRoles }, { data: allUserPerms }, { data: allProfilePerms }] =
        await Promise.all([
          supabase.from('profiles').select('*'),
          supabase.from('user_roles').select('user_id, role, profile_id'),
          supabase.from('user_permissions').select('user_id, page, can_view, can_create, can_edit, can_delete'),
          supabase.from('access_profile_permissions').select('profile_id, page, can_view, can_create, can_edit, can_delete'),
        ]);

      const bannedUserIds = new Set(
        (allUserPerms || []).filter((r: any) => r.page === 'banned').map((r: any) => r.user_id)
      );

      const profilePermsByProfId = new Map<string, Record<string, PermEntry>>();
      (allProfilePerms || []).forEach((row: any) => {
        if (!profilePermsByProfId.has(row.profile_id)) profilePermsByProfId.set(row.profile_id, {});
        profilePermsByProfId.get(row.profile_id)![row.page] = {
          page: row.page,
          can_view: !!row.can_view,
          can_create: !!row.can_create,
          can_edit: !!row.can_edit,
          can_delete: !!row.can_delete,
        };
      });

      const userPermsByUserId = new Map<string, Record<string, PermEntry>>();
      (allUserPerms || [])
        .filter((row: any) => row.page !== 'banned')
        .forEach((row: any) => {
          if (!userPermsByUserId.has(row.user_id)) userPermsByUserId.set(row.user_id, {});
          userPermsByUserId.get(row.user_id)![row.page] = {
            page: row.page,
            can_view: !!row.can_view,
            can_create: !!row.can_create,
            can_edit: !!row.can_edit,
            can_delete: !!row.can_delete,
          };
        });

      let authUsers: any[] = [];
      try {
        const response = await adminAuthRequest('manage', { action: 'list_users' });
        authUsers = response.users || [];
      } catch {
        authUsers = dbProfiles || [];
      }

      const usersData: UserWithRole[] = authUsers
        .filter((u: any) => u.full_name !== '__DELETED__')
        .map((u: any) => {
          const prof = dbProfiles?.find((p) => p.id === u.id);
          const roleRow = allRoles?.find((r) => r.user_id === u.id);
          const savedDept = localStorage.getItem(`user_dept_${u.id}`);
          const finalDept = u.departamento ?? (prof as any)?.departamento ?? savedDept ?? null;
          const role = roleRow?.role || u.role || 'user';
          const profileId = u.profile_id || roleRow?.profile_id || null;

          const baseProfPerms = profileId ? profilePermsByProfId.get(profileId) || {} : {};
          const indivPerms = userPermsByUserId.get(u.id) || {};
          const hasCustomPerms = Object.keys(indivPerms).length > 0;
          const mergedPerms: Record<string, PermEntry> = { ...baseProfPerms, ...indivPerms };

          // Expand fallback legado 'cco' se ainda não tiver granularidade salva
          const hasGranularCco = CCO_PAGE_KEYS.some((k) => mergedPerms[k] !== undefined);
          if (!hasGranularCco && mergedPerms['cco']) {
            CCO_PAGE_KEYS.forEach((k) => {
              mergedPerms[k] = { ...mergedPerms['cco'], page: k };
            });
          }

          return {
            id: u.id,
            email: u.email,
            full_name: u.full_name || prof?.full_name || '',
            role,
            banned: u.banned ?? bannedUserIds.has(u.id),
            profile_id: profileId,
            departamento: finalDept,
            hasCustomPerms,
            effectivePerms: mergedPerms,
          };
        });

      setUsers(usersData);
    } finally {
      setLoading(false);
    }
  }, [adminAuthRequest]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  useEffect(() => {
    if (isAdmin) {
      supabase
        .from('access_profiles')
        .select('id, name')
        .then(({ data }) => {
          if (!data) return;
          const map = new Map<string, { id: string; name: string }>();
          data.forEach((p) => {
            const cleanName = (p.name || '').trim();
            if (cleanName && !map.has(cleanName)) {
              map.set(cleanName, { id: p.id, name: cleanName });
            }
          });
          setAccessProfiles(Array.from(map.values()));
        });
    }
  }, [isAdmin]);

  // Helper para verificar se usuário tem acesso a um módulo/página
  function getUserPagePerm(u: UserWithRole, pageKey: string): PermEntry {
    if (u.role === 'admin') {
      return { page: pageKey, can_view: true, can_create: true, can_edit: true, can_delete: true };
    }
    const found = u.effectivePerms?.[pageKey];
    if (found) return found;
    return { page: pageKey, can_view: false, can_create: false, can_edit: false, can_delete: false };
  }

  function getUserModuleStats(u: UserWithRole, groupId: string) {
    const group = PAGE_GROUPS.find((g) => g.id === groupId);
    if (!group) return { allowed: 0, total: 0 };
    const allowed = group.pages.filter((pg) => getUserPagePerm(u, pg.key).can_view).length;
    return { allowed, total: group.pages.length };
  }

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'ATIVOS' && u.banned) return false;
      if (statusFilter === 'BLOQUEADOS' && !u.banned) return false;
      if (moduleFilter !== 'TODOS') {
        const stats = getUserModuleStats(u, moduleFilter);
        if (stats.allowed === 0) return false;
      }
      if (q) {
        const hay = `${u.full_name} ${u.email} ${u.departamento || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, searchTerm, statusFilter, moduleFilter]);

  async function confirmDeleteUser() {
    if (!deleteUser) return;
    setSavingDelete(true);
    try {
      await adminAuthRequest('manage', {
        action: 'update',
        user_id: deleteUser.id,
        full_name: '__DELETED__',
        email: deleteUser.email,
      });
      await adminAuthRequest('manage', { action: 'ban', user_id: deleteUser.id });

      await logAudit({
        action: 'user_deleted',
        record_id: deleteUser.id,
        old_data: { email: deleteUser.email, full_name: deleteUser.full_name, role: deleteUser.role },
      });

      toast.success(`Conta de "${deleteUser.full_name}" excluída com sucesso!`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Erro ao excluir conta');
    }
    setSavingDelete(false);
    setDeleteUser(null);
  }

  async function createUser() {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      toast.error('Preencha todos os campos');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }
    setCreating(true);

    try {
      const createdRes = await adminAuthRequest('create', {
        email: newUser.email,
        password: newUser.password,
        full_name: newUser.full_name,
        departamento: newUser.departamento || null,
      });

      toast.success('Usuário criado com sucesso!');
      const userId = createdRes.user_id;
      if (userId) {
        if (newUser.departamento) {
          localStorage.setItem(`user_dept_${userId}`, newUser.departamento);
          try {
            await supabase.from('profiles').update({ departamento: newUser.departamento }).eq('id', userId);
          } catch (_) {}
        }
        if (!newUser.profile_id) {
          const isDeptAccount = !!newUser.departamento;
          const deptAllowedKeys = [
            'colaboradores',
            'organograma',
            'ausencias',
            'desempenho',
            'feedbacks',
            'novo_feedback',
            'treinamentos',
            'disc',
            'mbti',
            'bigfive',
            'configuracoes',
          ];
          const defaultPerms = PAGES.map((p) => ({
            user_id: userId,
            page: p.key,
            can_view: isDeptAccount ? deptAllowedKeys.includes(p.key) : false,
            can_create: isDeptAccount ? deptAllowedKeys.includes(p.key) : false,
            can_edit: isDeptAccount ? deptAllowedKeys.includes(p.key) : false,
            can_delete: isDeptAccount ? deptAllowedKeys.includes(p.key) : false,
          }));
          await supabase.from('user_permissions').insert(defaultPerms);
        }
        await supabase.from('user_roles').insert({
          user_id: userId,
          role: 'user',
          profile_id: newUser.profile_id || null,
        });

        await logAudit({
          action: 'user_created',
          record_id: userId,
          new_data: {
            email: newUser.email,
            full_name: newUser.full_name,
            profile_id: newUser.profile_id || null,
            departamento: newUser.departamento || null,
          },
        });
      }
      setNewUser({ email: '', password: '', full_name: '', profile_id: '', departamento: '' });
      setDialogOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      toast.error(msg);
    }
    setCreating(false);
  }

  async function openPermissions(targetUser: UserWithRole, initialModuleId?: string) {
    setEditingUser(targetUser);
    setActiveModalModuleTab(initialModuleId || PAGE_GROUPS[0].id);

    const [{ data: existingPerms }, { data: profPerms }] = await Promise.all([
      supabase
        .from('user_permissions')
        .select('page, can_view, can_create, can_edit, can_delete')
        .eq('user_id', targetUser.id)
        .neq('page', 'banned'),
      targetUser.profile_id
        ? supabase
            .from('access_profile_permissions')
            .select('page, can_view, can_create, can_edit, can_delete')
            .eq('profile_id', targetUser.profile_id)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const indivMap = new Map((existingPerms || []).map((up: any) => [up.page, up]));
    const profMap = new Map((profPerms || []).map((pp: any) => [pp.page, pp]));

    const hasGranularCco =
      PAGES.some((p) => p.legacyAlias === 'cco' && indivMap.has(p.key)) ||
      PAGES.some((p) => p.legacyAlias === 'cco' && profMap.has(p.key));
    const legacyCco = (indivMap.get('cco') || profMap.get('cco')) as PermEntry | undefined;

    const perms: PermEntry[] = PAGES.map((p) => {
      const existing =
        indivMap.get(p.key) ||
        profMap.get(p.key) ||
        (!hasGranularCco && p.legacyAlias === 'cco' ? legacyCco : undefined);
      return {
        page: p.key,
        can_view: existing?.can_view ?? false,
        can_create: existing?.can_create ?? false,
        can_edit: existing?.can_edit ?? false,
        can_delete: existing?.can_delete ?? false,
      };
    });
    setEditPerms(perms);
  }

  function setModalModuleAccess(moduleId: string, grantView: boolean, grantFullCrud: boolean) {
    const group = PAGE_GROUPS.find((g) => g.id === moduleId);
    if (!group) return;
    const keys = new Set(group.pages.map((p) => p.key));
    setEditPerms((prev) =>
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

  async function persistUserPermissions(targetUser: UserWithRole, permsList: PermEntry[]) {
    await supabase.from('user_permissions').delete().eq('user_id', targetUser.id).neq('page', 'banned');

    const ccoPerms = permsList.filter((p) => p.page.startsWith('cco_'));
    const ccoAggregate: PermEntry = {
      page: 'cco',
      can_view: ccoPerms.some((p) => p.can_view),
      can_create: ccoPerms.some((p) => p.can_create),
      can_edit: ccoPerms.some((p) => p.can_edit),
      can_delete: ccoPerms.some((p) => p.can_delete),
    };

    const payload = [...permsList, ccoAggregate].map((p) => ({
      user_id: targetUser.id,
      page: p.page,
      can_view: p.can_view,
      can_create: p.can_create,
      can_edit: p.can_edit,
      can_delete: p.can_delete,
    }));

    const { error } = await supabase.from('user_permissions').insert(payload);
    if (error) throw new Error(error.message);

    await logAudit({
      action: 'permissions_updated',
      table_name: 'user_permissions',
      record_id: targetUser.id,
      new_data: { permissions: payload, target_user: targetUser.email },
    });
  }

  async function savePermissions() {
    if (!editingUser) return;
    setSavingPerms(true);
    try {
      await persistUserPermissions(editingUser, editPerms);
      toast.success(`Autorizações de "${editingUser.full_name}" atualizadas!`);
      setEditingUser(null);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar permissões');
    } finally {
      setSavingPerms(false);
    }
  }

  async function resetToProfileOnly() {
    if (!editingUser) return;
    setSavingPerms(true);
    try {
      await supabase.from('user_permissions').delete().eq('user_id', editingUser.id).neq('page', 'banned');
      toast.success(`"${editingUser.full_name}" agora segue exclusivamente o Perfil de Acesso atribuído.`);
      setEditingUser(null);
      await fetchUsers();
    } finally {
      setSavingPerms(false);
    }
  }

  // Toggle direto na Matriz Rápida por Módulo & Página
  async function handleMatrixPageToggle(targetUser: UserWithRole, pageKey: string, nextView: boolean) {
    if (targetUser.role === 'admin') return;
    setSavingMatrixUserId(targetUser.id);
    try {
      const fullPerms: PermEntry[] = PAGES.map((pg) => {
        const cur = getUserPagePerm(targetUser, pg.key);
        if (pg.key === pageKey) {
          return {
            page: pg.key,
            can_view: nextView,
            can_create: nextView ? true : false,
            can_edit: nextView ? true : false,
            can_delete: nextView ? cur.can_delete : false,
          };
        }
        return cur;
      });
      await persistUserPermissions(targetUser, fullPerms);
      toast.success(
        `${nextView ? 'Liberado' : 'Removido'} acesso de ${targetUser.full_name} em "${PAGES.find((p) => p.key === pageKey)?.label}"`
      );
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar permissão');
    } finally {
      setSavingMatrixUserId(null);
    }
  }

  async function handleMatrixModuleToggle(targetUser: UserWithRole, groupId: string, grantAll: boolean) {
    if (targetUser.role === 'admin') return;
    const group = PAGE_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const keys = new Set(group.pages.map((p) => p.key));
    setSavingMatrixUserId(targetUser.id);
    try {
      const fullPerms: PermEntry[] = PAGES.map((pg) => {
        const cur = getUserPagePerm(targetUser, pg.key);
        if (keys.has(pg.key)) {
          return {
            page: pg.key,
            can_view: grantAll,
            can_create: grantAll,
            can_edit: grantAll,
            can_delete: grantAll ? cur.can_delete : false,
          };
        }
        return cur;
      });
      await persistUserPermissions(targetUser, fullPerms);
      toast.success(
        `Módulo "${group.module.split('—')[0].trim()}" ${grantAll ? 'liberado' : 'bloqueado'} para ${targetUser.full_name}`
      );
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar módulo');
    } finally {
      setSavingMatrixUserId(null);
    }
  }

  function openEditUser(targetUser: UserWithRole) {
    setEditUserDialog(targetUser);
    setEditName(targetUser.full_name);
    setEditEmail(targetUser.email);
    setEditProfileId(targetUser.profile_id || '');
    const saved = localStorage.getItem(`user_dept_${targetUser.id}`);
    setEditDepartamento(targetUser.departamento ?? saved ?? '');
  }

  async function saveEditUser() {
    if (!editUserDialog) return;
    setSavingEdit(true);
    try {
      const oldData = {
        email: editUserDialog.email,
        full_name: editUserDialog.full_name,
        profile_id: editUserDialog.profile_id,
        departamento: editUserDialog.departamento,
      };
      const finalDeptToSave = editDepartamento ? editDepartamento : 'all';

      await adminAuthRequest('manage', {
        action: 'update',
        user_id: editUserDialog.id,
        email: editEmail,
        full_name: editName,
        departamento: finalDeptToSave,
      });

      localStorage.setItem(`user_dept_${editUserDialog.id}`, finalDeptToSave);
      try {
        await supabase.from('profiles').upsert({
          id: editUserDialog.id,
          email: editEmail,
          full_name: editName,
          departamento: finalDeptToSave,
        });
      } catch (_) {}

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', editUserDialog.id)
        .maybeSingle();
      if (roleData) {
        await supabase.from('user_roles').update({ profile_id: editProfileId || null }).eq('user_id', editUserDialog.id);
      } else {
        await supabase
          .from('user_roles')
          .insert({ user_id: editUserDialog.id, role: 'user', profile_id: editProfileId || null });
      }

      await logAudit({
        action: 'user_updated',
        record_id: editUserDialog.id,
        old_data: oldData,
        new_data: {
          email: editEmail,
          full_name: editName,
          profile_id: editProfileId || null,
          departamento: editDepartamento || null,
        },
      });

      toast.success('Usuário atualizado com sucesso!');
      setEditUserDialog(null);
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar';
      toast.error(msg);
    }
    setSavingEdit(false);
  }

  function openBlockUser(targetUser: UserWithRole) {
    setBlockUser(targetUser);
    setBlockAction(targetUser.banned ? 'unban' : 'ban');
  }

  async function confirmBlock() {
    if (!blockUser) return;
    setSavingBlock(true);
    try {
      await adminAuthRequest('manage', { action: blockAction, user_id: blockUser.id });

      if (blockAction === 'ban') {
        await supabase
          .from('user_permissions')
          .upsert({ user_id: blockUser.id, page: 'banned', can_view: true }, { onConflict: 'user_id,page' });
      } else {
        await supabase.from('user_permissions').delete().eq('user_id', blockUser.id).eq('page', 'banned');
      }

      await logAudit({
        action: blockAction === 'ban' ? 'user_banned' : 'user_unbanned',
        record_id: blockUser.id,
        new_data: { target_email: blockUser.email, target_name: blockUser.full_name },
      });

      toast.success(blockAction === 'ban' ? 'Usuário bloqueado com sucesso!' : 'Usuário desbloqueado com sucesso!');
      setBlockUser(null);
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar status do usuário';
      toast.error(msg);
    }
    setSavingBlock(false);
  }

  function openChangePassword(targetUser: UserWithRole) {
    setPasswordUser(targetUser);
    setNewPassword('');
  }

  async function savePassword() {
    if (!passwordUser) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }
    setSavingPassword(true);
    try {
      await adminAuthRequest('manage', { action: 'change_password', user_id: passwordUser.id, password: newPassword });

      await logAudit({
        action: 'password_changed',
        record_id: passwordUser.id,
        new_data: { target_email: passwordUser.email, target_name: passwordUser.full_name },
      });

      toast.success('Senha alterada com sucesso!');
      setPasswordUser(null);
      setNewPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar senha';
      toast.error(msg);
    }
    setSavingPassword(false);
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Shield className="w-8 h-8 mr-3" />
        <p>Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Central de Gestão de Usuários & Controle por Módulo
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie credenciais, autorize acesso por módulo e páginas individuais, e organize perfis de acesso.
          </p>
        </div>
      </motion.div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4 border-l-4 border-l-primary flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total de Contas</p>
            <h3 className="text-2xl font-black text-foreground mt-1">{users.length}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {users.filter((u) => !u.banned).length} ativos • {users.filter((u) => u.banned).length} bloqueados
            </p>
          </div>
          <Users className="w-8 h-8 text-primary opacity-80" />
        </div>

        <div className="glass-card rounded-xl p-4 border-l-4 border-l-amber-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acesso Global</p>
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {users.filter((u) => !u.departamento || u.departamento === 'all' || u.departamento.includes('Todos')).length}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Diretoria, Admin & Gerente Geral</p>
          </div>
          <Crown className="w-8 h-8 text-amber-500 opacity-80" />
        </div>

        <div className="glass-card rounded-xl p-4 border-l-4 border-l-blue-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gestores de Setor</p>
            <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {users.filter((u) => u.departamento && u.departamento !== 'all' && !u.departamento.includes('Todos')).length}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Vinculados a contratos específicos</p>
          </div>
          <Building2 className="w-8 h-8 text-blue-500 opacity-80" />
        </div>

        <div className="glass-card rounded-xl p-4 border-l-4 border-l-emerald-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Módulos & Páginas</p>
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {PAGE_GROUPS.length} <span className="text-sm font-semibold text-muted-foreground">/ {PAGES.length} pág.</span>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{accessProfiles.length} perfis configurados</p>
          </div>
          <Layers className="w-8 h-8 text-emerald-500 opacity-80" />
        </div>
      </div>

      {/* Abas Principais da Administração */}
      <Tabs defaultValue="usuarios" className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/60 pb-3 flex-wrap gap-3">
          <TabsList className="bg-muted/50 p-1 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="usuarios" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold">
              <Users className="w-4 h-4" /> Usuários & Acesso Individual
            </TabsTrigger>
            <TabsTrigger value="modulos" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold">
              <Layers className="w-4 h-4" /> Autorização por Módulo & Página
            </TabsTrigger>
            <TabsTrigger value="perfis" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold">
              <Shield className="w-4 h-4" /> Perfis de Acesso
            </TabsTrigger>
          </TabsList>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <FastInput
                    value={newUser.full_name}
                    onValueChange={(v) => setNewUser({ ...newUser, full_name: v })}
                    placeholder="Nome do usuário"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <FastInput
                    type="email"
                    value={newUser.email}
                    onValueChange={(v) => setNewUser({ ...newUser, email: v })}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Perfil de Acesso</Label>
                  <Select
                    value={newUser.profile_id || 'none'}
                    onValueChange={(v) => setNewUser({ ...newUser, profile_id: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um perfil (Opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (Definir autorização por módulo/página)</SelectItem>
                      {accessProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 border border-border/80 rounded-xl p-3.5 bg-muted/20">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Departamentos & Setores de Acesso
                    </Label>
                    {newUser.departamento && newUser.departamento !== 'all' && (
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {newUser.departamento.split(',').filter(Boolean).length} setor(es)
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border/60 cursor-pointer hover:bg-muted/40 transition-colors">
                      <Checkbox
                        checked={!newUser.departamento || newUser.departamento === 'all'}
                        onCheckedChange={(checked) => {
                          setNewUser({ ...newUser, departamento: checked ? '' : DEPARTAMENTOS[0] });
                        }}
                      />
                      <span className="text-xs font-bold text-foreground">
                        🌐 Todos / Acesso Global (Diretoria/Admin/Gerente Geral)
                      </span>
                    </label>

                    {newUser.departamento !== '' && newUser.departamento !== 'all' && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1.5 max-h-48 overflow-y-auto pr-1">
                        {DEPARTAMENTOS.map((d) => {
                          const selectedList = (newUser.departamento || '')
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          const isChecked = selectedList.includes(d);
                          return (
                            <label
                              key={d}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-primary/10 border-primary/40 font-semibold text-primary'
                                  : 'bg-background border-border/60 hover:bg-muted/30 text-muted-foreground'
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const newList = checked
                                    ? [...selectedList, d]
                                    : selectedList.filter((item) => item !== d);
                                  setNewUser({ ...newUser, departamento: newList.join(', ') });
                                }}
                              />
                              <span className="truncate">{d}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <div className="relative">
                    <FastInput
                      type={showPassword ? 'text' : 'password'}
                      value={newUser.password}
                      onValueChange={(v) => setNewUser({ ...newUser, password: v })}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={createUser} className="w-full" disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── ABA 1: USUÁRIOS & CREDENCIAIS (COM RESUMO DE MÓDULOS AUTORIZADOS) ── */}
        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap bg-card border border-border rounded-xl p-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar usuário por nome, e-mail ou setor..."
                className="pl-9 h-9 text-xs"
              />
            </div>

            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[230px] h-9 text-xs">
                <SelectValue placeholder="Filtrar por módulo autorizado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os Módulos</SelectItem>
                {PAGE_GROUPS.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    Com acesso: {g.module.split('—')[0].trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os Status</SelectItem>
                <SelectItem value="ATIVOS">Somente Ativos</SelectItem>
                <SelectItem value="BLOQUEADOS">Bloqueados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando usuários...</p>
          ) : filteredUsers.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">
              Nenhum usuário encontrado com os filtros aplicados.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u, i) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`glass-card rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-4 border transition-colors ${
                    u.banned ? 'border-destructive/30 bg-destructive/5' : 'border-border/60'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                        u.role === 'admin'
                          ? 'bg-primary/20 text-primary'
                          : u.banned
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {(u.full_name || 'U').charAt(0).toUpperCase()}
                    </div>

                    {/* Info + Módulos Autorizados */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-semibold text-sm ${u.banned ? 'text-muted-foreground line-through' : ''}`}>
                            {u.full_name || 'Sem nome'}
                          </p>
                          {u.role === 'admin' && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-primary/15 text-primary">
                              👑 Admin Total
                            </span>
                          )}
                          {u.profile_id && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              Perfil: {accessProfiles.find((p) => p.id === u.profile_id)?.name || 'Atribuído'}
                            </span>
                          )}
                          {u.hasCustomPerms && u.role !== 'admin' && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              ⚙️ Acesso Customizado
                            </span>
                          )}
                          {u.departamento && u.departamento !== 'all' ? (
                            u.departamento
                              .split(',')
                              .map((d) => d.trim())
                              .filter(Boolean)
                              .map((d) => (
                                <span
                                  key={d}
                                  className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                >
                                  📍 {d}
                                </span>
                              ))
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400">
                              🌐 Acesso Global
                            </span>
                          )}
                          {u.banned && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-destructive/15 text-destructive flex items-center gap-1">
                              <Ban className="w-3 h-3" /> Bloqueado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                      </div>

                      {/* Badges de Módulos Autorizados (clica para abrir já na aba daquele módulo) */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                          Módulos:
                        </span>
                        {PAGE_GROUPS.map((g) => {
                          const { allowed, total } = getUserModuleStats(u, g.id);
                          const shortName = g.module.split('—')[0].trim();
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => openPermissions(u, g.id)}
                              title={`Clique para configurar páginas de ${g.module}`}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                                allowed === total
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : allowed > 0
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                  : 'bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted'
                              }`}
                            >
                              {shortName}: {allowed}/{total}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {u.role !== 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                        onClick={() => openPermissions(u)}
                      >
                        <Shield className="w-3.5 h-3.5" /> Módulos & Páginas
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openEditUser(u)}>
                      <Edit className="w-3.5 h-3.5" /> Editar
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => openPermissions(u)}>
                          <Shield className="w-4 h-4 mr-2 text-primary" /> Autorizar Módulos & Páginas
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditUser(u)}>
                          <Edit className="w-4 h-4 mr-2 text-muted-foreground" /> Editar Dados / Perfil / Setor
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openChangePassword(u)}>
                          <KeyRound className="w-4 h-4 mr-2 text-muted-foreground" /> Alterar Senha
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.banned ? (
                          <DropdownMenuItem
                            onClick={() => openBlockUser(u)}
                            className="text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700 dark:text-emerald-400 dark:focus:bg-emerald-950"
                          >
                            <Check className="w-4 h-4 mr-2" /> Desbloquear Usuário
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => openBlockUser(u)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Ban className="w-4 h-4 mr-2" /> Bloquear Usuário
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteUser(u)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive font-medium"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir Conta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ABA 2: AUTORIZAÇÃO SEPARADA POR MÓDULO & PÁGINAS (MATRIZ RÁPIDA) ── */}
        <TabsContent value="modulos" className="space-y-4">
          <div className="glass-card rounded-xl p-4 border border-border/60 space-y-4">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Controle de Acesso Separado por Módulo & Páginas
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Escolha abaixo a aba do módulo desejado para liberar o módulo completo ou autorizar cada página/sub-aba individualmente por usuário.
              </p>
            </div>

            <Tabs value={activeMatrixModule} onValueChange={setActiveMatrixModule} className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1.5 bg-muted/50 p-1.5 justify-start">
                {PAGE_GROUPS.map((g) => (
                  <TabsTrigger
                    key={g.id}
                    value={g.id}
                    className="text-xs px-3 py-2 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {g.module.split('—')[0].trim()} ({g.pages.length})
                  </TabsTrigger>
                ))}
              </TabsList>

              {PAGE_GROUPS.map((group) => (
                <TabsContent key={group.id} value={group.id} className="space-y-3 mt-0">
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-bold text-sm text-primary">{group.module}</div>
                      <div className="text-xs text-muted-foreground">{group.description}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {group.pages.length} página(s) / sub-aba(s)
                    </Badge>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-3 py-2.5 font-bold text-muted-foreground min-w-[210px]">
                            Usuário
                          </th>
                          <th className="text-center px-2 py-2.5 font-bold text-muted-foreground min-w-[130px]">
                            Módulo Completo
                          </th>
                          {group.pages.map((pg) => (
                            <th key={pg.key} className="text-center px-2 py-2.5 font-bold text-muted-foreground min-w-[110px]">
                              <div>{pg.label}</div>
                              {pg.path && <div className="text-[10px] font-normal opacity-70">{pg.path}</div>}
                            </th>
                          ))}
                          <th className="text-center px-2 py-2.5 font-bold text-muted-foreground">Detalhes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {users.map((u) => {
                          const isUserAdm = u.role === 'admin';
                          const stats = getUserModuleStats(u, group.id);
                          const allAllowed = stats.allowed === stats.total;
                          const isSavingThis = savingMatrixUserId === u.id;

                          return (
                            <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-foreground">{u.full_name || u.email}</div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                  <span>{u.email}</span>
                                  {isUserAdm && (
                                    <span className="text-[10px] text-primary font-bold">• Admin</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                {isUserAdm ? (
                                  <Badge className="bg-primary/15 text-primary border-none text-[10px]">
                                    Total (Admin)
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={allAllowed ? 'default' : 'outline'}
                                    disabled={isSavingThis}
                                    className={`h-7 text-[11px] px-2.5 ${
                                      allAllowed ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                                    }`}
                                    onClick={() => handleMatrixModuleToggle(u, group.id, !allAllowed)}
                                  >
                                    {isSavingThis
                                      ? 'Salvando...'
                                      : allAllowed
                                      ? `✅ Liberado (${stats.allowed}/${stats.total})`
                                      : `🔓 Liberar (${stats.allowed}/${stats.total})`}
                                  </Button>
                                )}
                              </td>
                              {group.pages.map((pg) => {
                                const allowed = isUserAdm || getUserPagePerm(u, pg.key).can_view;
                                return (
                                  <td key={pg.key} className="px-2 py-2.5 text-center">
                                    <div className="flex justify-center">
                                      <Checkbox
                                        checked={allowed}
                                        disabled={isUserAdm || isSavingThis}
                                        onCheckedChange={(checked) =>
                                          handleMatrixPageToggle(u, pg.key, checked === true)
                                        }
                                      />
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2.5 text-center">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[11px]"
                                  onClick={() => openPermissions(u, group.id)}
                                >
                                  ⚙️ CRUD
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </TabsContent>

        {/* ── ABA 3: PERFIS DE ACESSO ── */}
        <TabsContent value="perfis">
          <PerfisDeAcesso onProfilesChanged={fetchUsers} />
        </TabsContent>
      </Tabs>

      {/* ── MODAL DE PERMISSÕES INDIVIDUAIS SEPARADAS POR MÓDULO & PÁGINAS ── */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Autorização por Módulo & Páginas — {editingUser?.full_name}
            </DialogTitle>
          </DialogHeader>

          {editingUser?.profile_id && (
            <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <span>
                ⚠️ Usuário vinculado ao perfil{' '}
                <strong>{accessProfiles.find((p) => p.id === editingUser.profile_id)?.name}</strong>. Ajustes feitos aqui sobrescrevem o perfil.
              </span>
              {editingUser.hasCustomPerms && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={resetToProfileOnly} disabled={savingPerms}>
                  <RotateCcw className="w-3 h-3" /> Restaurar Padrão do Perfil
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">
              Escolha a aba de cada módulo para liberar todas as páginas do módulo ou marcar páginas específicas.
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setEditPerms((prev) =>
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
                  setEditPerms((prev) =>
                    prev.map((p) => ({ ...p, can_view: false, can_create: false, can_edit: false, can_delete: false }))
                  )
                }
              >
                <XSquare className="w-3.5 h-3.5 mr-1 text-destructive" /> Limpar Tudo
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-1 pr-1">
            <Tabs value={activeModalModuleTab} onValueChange={setActiveModalModuleTab} className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1.5 bg-muted/50 p-1.5 justify-start">
                {PAGE_GROUPS.map((g) => {
                  const allowedCount = g.pages.filter((pg) => editPerms.find((ep) => ep.page === pg.key)?.can_view).length;
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
                  <div className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-primary">{group.module}</h4>
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                        onClick={() => setModalModuleAccess(group.id, true, false)}
                      >
                        👁️ Ver Módulo Completo
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-primary/40 text-primary"
                        onClick={() => setModalModuleAccess(group.id, true, true)}
                      >
                        ✅ Acesso Total (CRUD)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-destructive border-destructive/30"
                        onClick={() => setModalModuleAccess(group.id, false, false)}
                      >
                        🚫 Bloquear Módulo
                      </Button>
                    </div>
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
                        const permIdx = editPerms.findIndex((p) => p.page === page.key);
                        const perm = editPerms[permIdx];
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
                                onCheckedChange={(c) => {
                                  const checked = c === true;
                                  const upd = [...editPerms];
                                  upd[permIdx] = { ...upd[permIdx], can_view: checked };
                                  if (!checked) {
                                    upd[permIdx].can_create = false;
                                    upd[permIdx].can_edit = false;
                                    upd[permIdx].can_delete = false;
                                  }
                                  setEditPerms(upd);
                                }}
                              />
                            </div>
                            <div className="flex justify-center">
                              <Checkbox
                                checked={perm.can_create}
                                disabled={!perm.can_view}
                                onCheckedChange={(c) => {
                                  const upd = [...editPerms];
                                  upd[permIdx] = { ...upd[permIdx], can_create: c === true };
                                  setEditPerms(upd);
                                }}
                              />
                            </div>
                            <div className="flex justify-center">
                              <Checkbox
                                checked={perm.can_edit}
                                disabled={!perm.can_view}
                                onCheckedChange={(c) => {
                                  const upd = [...editPerms];
                                  upd[permIdx] = { ...upd[permIdx], can_edit: c === true };
                                  setEditPerms(upd);
                                }}
                              />
                            </div>
                            <div className="flex justify-center">
                              <Checkbox
                                checked={perm.can_delete}
                                disabled={!perm.can_view}
                                onCheckedChange={(c) => {
                                  const upd = [...editPerms];
                                  upd[permIdx] = { ...upd[permIdx], can_delete: c === true };
                                  setEditPerms(upd);
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

          <div className="pt-4 border-t mt-auto">
            <Button onClick={savePermissions} className="w-full" disabled={savingPerms}>
              {savingPerms ? 'Salvando autorizações...' : '💾 Salvar Autorizações por Módulo & Páginas'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editUserDialog} onOpenChange={(open) => !open && setEditUserDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <FastInput value={editName} onValueChange={setEditName} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <FastInput type="email" value={editEmail} onValueChange={setEditEmail} />
            </div>
            <div className="space-y-2">
              <Label>Perfil de Acesso</Label>
              <Select value={editProfileId || 'none'} onValueChange={(v) => setEditProfileId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil (Opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (Permissões individuais)</SelectItem>
                  {accessProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 border border-border/80 rounded-xl p-3.5 bg-muted/20">
              <div className="flex items-center justify-between mb-1">
                <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Departamentos & Setores de Acesso
                </Label>
                {editDepartamento && editDepartamento !== 'all' && (
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {editDepartamento.split(',').filter(Boolean).length} setor(es)
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border/60 cursor-pointer hover:bg-muted/40 transition-colors">
                  <Checkbox
                    checked={!editDepartamento || editDepartamento === 'all'}
                    onCheckedChange={(checked) => {
                      setEditDepartamento(checked ? '' : DEPARTAMENTOS[0]);
                    }}
                  />
                  <span className="text-xs font-bold text-foreground">
                    🌐 Todos / Acesso Global (Diretoria/Admin/Gerente Geral)
                  </span>
                </label>

                {editDepartamento !== '' && editDepartamento !== 'all' && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 max-h-48 overflow-y-auto pr-1">
                    {DEPARTAMENTOS.map((d) => {
                      const selectedList = (editDepartamento || '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const isChecked = selectedList.includes(d);
                      return (
                        <label
                          key={d}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-primary/10 border-primary/40 font-semibold text-primary'
                              : 'bg-background border-border/60 hover:bg-muted/30 text-muted-foreground'
                          }`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              const newList = checked
                                ? [...selectedList, d]
                                : selectedList.filter((item) => item !== d);
                              setEditDepartamento(newList.join(', '));
                            }}
                          />
                          <span className="truncate">{d}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <Button onClick={saveEditUser} className="w-full" disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={!!passwordUser} onOpenChange={(open) => !open && setPasswordUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha — {passwordUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <div className="relative">
                <FastInput
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onValueChange={setNewPassword}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button onClick={savePassword} className="w-full" disabled={savingPassword}>
              {savingPassword ? 'Salvando...' : 'Alterar Senha'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block/Unblock confirmation */}
      <AlertDialog open={!!blockUser} onOpenChange={(open) => !open && setBlockUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockAction === 'ban' ? 'Bloquear Usuário' : 'Desbloquear Usuário'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockAction === 'ban'
                ? `Tem certeza que deseja bloquear "${blockUser?.full_name}"? O usuário não conseguirá fazer login.`
                : `Tem certeza que deseja desbloquear "${blockUser?.full_name}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingBlock}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBlock} disabled={savingBlock}>
              {savingBlock ? 'Aguarde...' : blockAction === 'ban' ? 'Bloquear' : 'Desbloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete user confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir permanentemente a conta de "{deleteUser?.full_name}"?
              Esta ação não pode ser desfeita. Todos os dados do usuário serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingDelete}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              disabled={savingDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingDelete ? 'Excluindo...' : 'Excluir Permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
