/**
 * URL Slug Parser & Reserved Route Protection for NiagaPOS
 */

export const RESERVED_ROUTES = [
  'admin',
  'login',
  'setup',
  'settings',
  'products',
  'inventory',
  'pos',
  'sales',
  'purchases',
  'suppliers',
  'customers',
  'reports',
  'api',
  'assets',
  'favicon.ico',
];

export interface ParsedRoute {
  isMasterAdmin: boolean;
  workspaceSlug: string | null;
  systemPage: 'pos' | 'products' | 'customers' | 'reports' | 'settings' | 'inventory' | 'suppliers' | 'purchases' | null;
  rawPath: string;
}

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  const clean = slug.trim().toLowerCase();
  if (clean.length < 3 || clean.length > 32) return false;
  // Alphanumeric with single hyphens
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) return false;
  if (RESERVED_ROUTES.includes(clean)) return false;
  return true;
}

export function parseRoute(pathname: string = window.location.pathname): ParsedRoute {
  const segments = pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return {
      isMasterAdmin: false,
      workspaceSlug: null,
      systemPage: 'pos',
      rawPath: pathname,
    };
  }

  const first = segments[0].toLowerCase();

  // Check if Master Admin route
  if (first === 'admin') {
    return {
      isMasterAdmin: true,
      workspaceSlug: null,
      systemPage: null,
      rawPath: pathname,
    };
  }

  // Check if first segment is a direct system page (standalone legacy mode)
  if (
    ['pos', 'products', 'customers', 'reports', 'settings', 'inventory', 'suppliers', 'purchases'].includes(
      first
    )
  ) {
    return {
      isMasterAdmin: false,
      workspaceSlug: null,
      systemPage: first as any,
      rawPath: pathname,
    };
  }

  // Otherwise, first segment is treated as a tenant workspace slug
  const workspaceSlug = first;
  const second = segments[1]?.toLowerCase();
  let systemPage: any = 'pos';

  if (
    second &&
    ['pos', 'products', 'customers', 'reports', 'settings', 'inventory', 'suppliers', 'purchases'].includes(
      second
    )
  ) {
    systemPage = second;
  }

  return {
    isMasterAdmin: false,
    workspaceSlug,
    systemPage,
    rawPath: pathname,
  };
}

export function pushRoute(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
