import { useAuth } from '@/contexts/AuthContext';
import { PAGES, CCO_PAGE_KEYS, RH_AUSENCIAS_PAGE_KEYS } from '@/lib/permissions';

export function usePermissions() {
  const { isAdmin, permissions } = useAuth();

  const hasGranularCco = CCO_PAGE_KEYS.some((k) => permissions[k] !== undefined);
  const hasGranularAusencias = RH_AUSENCIAS_PAGE_KEYS.some((k) => permissions[k] !== undefined);

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

    if (page === 'ausencias') {
      if (hasGranularAusencias) {
        const rhPerms = RH_AUSENCIAS_PAGE_KEYS.map((k) => permissions[k]).filter(Boolean);
        return {
          can_view: rhPerms.some((p) => p.can_view),
          can_create: rhPerms.some((p) => p.can_create),
          can_edit: rhPerms.some((p) => p.can_edit),
          can_delete: rhPerms.some((p) => p.can_delete),
        };
      }
      return permissions['ausencias'];
    }

    if (permissions[page] !== undefined) return permissions[page];

    const def = PAGES.find((p) => p.key === page);
    if (def?.legacyAlias === 'cco' && !hasGranularCco && permissions['cco'] !== undefined) {
      return permissions['cco'];
    }
    if (def?.legacyAlias === 'ausencias' && !hasGranularAusencias && permissions['ausencias'] !== undefined) {
      return permissions['ausencias'];
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
