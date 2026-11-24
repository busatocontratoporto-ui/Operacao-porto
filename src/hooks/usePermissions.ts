import { useAuth } from '@/contexts/AuthContext';
import { PAGES, CCO_PAGE_KEYS } from '@/lib/permissions';

export function usePermissions() {
  const { isAdmin, permissions } = useAuth();

  const hasGranularCco = CCO_PAGE_KEYS.some((k) => permissions[k] !== undefined);

  const resolvePerm = (page: string) => {
    if (page === 'cco') {
      if (hasGranularCco) {
        const ccoPerms = CCO_PAGE_KEYS.map((k) => permissions[k]).filter(Boolean);
        return {
          can_view: ccoPerms.some((p) => p.can_view),
          can_create: ccoPerms.some((p) => p.can_create),
          can_edit: ccoPerms.some((p) => p.can_edit),
          can_delete: ccoPerms.some((p) => p.can_delete),
        };
      }
      return permissions['cco'];
    }

    if (permissions[page] !== undefined) return permissions[page];

    // Se for uma sub-página do CCO e o usuário só tiver permissão legada 'cco' (sem nenhuma granular salva)
    const def = PAGES.find((p) => p.key === page);
    if (def?.legacyAlias === 'cco' && !hasGranularCco && permissions['cco'] !== undefined) {
      return permissions['cco'];
    }

    return undefined;
  };

  const canView = (page: string) => {
    if (isAdmin) return true;
    return resolvePerm(page)?.can_view === true;
  };

  const canCreate = (page: string) => {
    if (isAdmin) return true;
    return resolvePerm(page)?.can_create === true;
  };

  const canEdit = (page: string) => {
    if (isAdmin) return true;
    return resolvePerm(page)?.can_edit === true;
  };

  const canDelete = (page: string) => {
    if (isAdmin) return true;
    return resolvePerm(page)?.can_delete === true;
  };

  return {
    isAdmin,
    permissions,
    canView,
    canCreate,
    canEdit,
    canDelete,
  };
}
