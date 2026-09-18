import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  authenticateClient,
  authenticateMasterAdmin,
  changeClientPin,
  adminResetClientPin,
  initWorkspaceAuth,
  getPublicAuthState,
  getAuditLogs,
  generateToken,
  verifyToken,
  checkLockout,
} from './server/auth.ts';

const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();

  app.use(express.json());

  // Request logger for auth endpoints
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/auth')) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
  });

  // ----------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'niagapos-v2-server',
      version: '4.4.0',
      timestamp: new Date().toISOString(),
    });
  });

  // ----------------------------------------------------
  // DYNAMIC PWA MANIFEST (Workspace-Specific)
  // ----------------------------------------------------
  const handleDynamicManifest = (req: Request, res: Response) => {
    let slug = req.params.slug || (req.query.slug as string) || (req.query.workspace as string);
    let name = (req.query.name as string) || '';

    if (!slug && req.headers.referer) {
      try {
        const refUrl = new URL(req.headers.referer);
        const segs = refUrl.pathname.split('/').map((s) => s.trim()).filter(Boolean);
        const RESERVED = ['admin', 'api', 'assets', 'login', 'pos', 'settings', 'inventory', 'reports', 'customers', 'suppliers', 'purchases', 'dashboard', 'setup', 'sw.js', 'konsol', 'klien'];
        if (segs.length > 0 && !segs[0].includes('.') && !RESERVED.includes(segs[0].toLowerCase())) {
          slug = segs[0];
        }
      } catch {}
    }

    const cleanSlug = slug?.trim()?.toLowerCase();
    const isWorkspace = Boolean(cleanSlug && !['admin', 'api', 'assets', 'login', 'pos', 'settings', 'inventory', 'reports', 'dashboard', 'setup', 'sw.js'].includes(cleanSlug));

    const displayName = isWorkspace
      ? (name || cleanSlug!.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      : 'NiagaPOS';

    const manifest = {
      id: isWorkspace ? `/${cleanSlug}` : '/',
      name: isWorkspace ? `${displayName} — NiagaPOS` : 'NiagaPOS',
      short_name: displayName,
      description: isWorkspace
        ? `NiagaPOS - Sistem POS & Pengurusan Inventori untuk ${displayName}`
        : 'NiagaPOS - Sistem POS & Pengurusan Inventori Runcit',
      start_url: isWorkspace ? `/${cleanSlug}` : '/',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#082f63',
      theme_color: '#082f63',
      icons: [
        {
          src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/web-app-manifest-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/web-app-manifest-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/web-app-manifest-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/web-app-manifest-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(manifest);
  };

  app.get('/site.webmanifest', handleDynamicManifest);
  app.get('/manifest.json', handleDynamicManifest);
  app.get('/api/manifest/:slug?', handleDynamicManifest);

  // ----------------------------------------------------
  // CLIENT WORKSPACE AUTHENTICATION
  // ----------------------------------------------------

  // Check lockout & public auth state for a workspace
  app.get('/api/auth/client/status/:slug', (req: Request, res: Response) => {
    const { slug } = req.params;
    const lockout = checkLockout(slug);
    const publicState = getPublicAuthState(slug);

    res.json({
      success: true,
      workspaceSlug: slug,
      isLocked: lockout.locked,
      remainingSeconds: lockout.remainingSeconds,
      authConfig: publicState,
    });
  });

  // Client login with workspace PIN
  app.post('/api/auth/client/login', (req: Request, res: Response) => {
    const { workspaceSlug, pin, workspaceName } = req.body || {};

    if (!workspaceSlug || !pin) {
      res.status(400).json({
        success: false,
        error: 'Slug workspace dan nombor PIN diperlukan.',
      });
      return;
    }

    const result = authenticateClient(workspaceSlug, pin, workspaceName);
    if (!result.success) {
      res.status(result.remainingSeconds ? 429 : 401).json(result);
      return;
    }

    res.json(result);
  });

  // Verify client session token
  app.post('/api/auth/client/verify', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body?.token;
    const targetSlug = req.body?.workspaceSlug;

    if (!token) {
      res.status(401).json({ success: false, error: 'Token sesi tidak dibekalkan.' });
      return;
    }

    const decoded = verifyToken<{ workspaceId: string; workspaceSlug: string; role: string; exp: number }>(token);
    if (!decoded || decoded.role !== 'CLIENT') {
      res.status(401).json({ success: false, error: 'Sesi tidak sah atau telah tamat tempoh.' });
      return;
    }

    // Enforce workspace tenant match: Pak Abu cannot use token on Mak Limah workspace!
    if (targetSlug && decoded.workspaceSlug !== targetSlug.toLowerCase()) {
      res.status(403).json({
        success: false,
        error: 'Pencerobohan dikesan: Sesi ini tidak dibenarkan mengakses ruang kerja yang diminta.',
      });
      return;
    }

    res.json({
      success: true,
      valid: true,
      workspaceId: decoded.workspaceId,
      workspaceSlug: decoded.workspaceSlug,
      role: decoded.role,
    });
  });

  // Change Client PIN
  app.post('/api/auth/client/change-pin', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body?.token;
    const { workspaceSlug, currentPin, newPin, confirmPin } = req.body || {};

    if (!workspaceSlug || !currentPin || !newPin || !confirmPin) {
      res.status(400).json({ success: false, error: 'Sila lengkapkan semua medan PIN dan slug workspace.' });
      return;
    }

    // If a valid server token is provided, verify tenant scope
    if (token && !token.startsWith('local_')) {
      const decoded = verifyToken<{ workspaceSlug: string; role: string }>(token);
      if (decoded && decoded.workspaceSlug !== (workspaceSlug || '').toLowerCase() && decoded.role !== 'MASTER_ADMIN') {
        res.status(403).json({ success: false, error: 'Sesi tidak sah untuk mengemas kini PIN workspace ini.' });
        return;
      }
    }

    const result = changeClientPin(workspaceSlug, currentPin, newPin, confirmPin);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    // Generate fresh session token for the client
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const freshToken = generateToken({
      workspaceId: result.authConfig?.workspaceId || `ws_${workspaceSlug.toLowerCase()}`,
      workspaceSlug: workspaceSlug.toLowerCase(),
      role: 'CLIENT',
      pinVersion: result.authConfig?.pinVersion || 2,
      exp: expiresAt,
    });

    res.json({
      ...result,
      session: {
        token: freshToken,
        workspaceId: result.authConfig?.workspaceId || `ws_${workspaceSlug.toLowerCase()}`,
        workspaceSlug: workspaceSlug.toLowerCase(),
        workspaceName: workspaceSlug,
        role: 'CLIENT',
        isPinEnabled: true,
        mustChangeDefaultPin: false,
        pinVersion: result.authConfig?.pinVersion || 2,
        expiresAt,
      },
    });
  });

  // Initialize workspace PIN (called on workspace creation)
  app.post('/api/auth/client/init', (req: Request, res: Response) => {
    const { workspaceId, workspaceSlug, customPin } = req.body || {};
    if (!workspaceId || !workspaceSlug) {
      res.status(400).json({ success: false, error: 'workspaceId and workspaceSlug are required' });
      return;
    }

    initWorkspaceAuth(workspaceId, workspaceSlug, customPin);
    res.json({
      success: true,
      message: 'Workspace auth successfully initialized with default PIN (1234).',
      workspaceId,
      workspaceSlug,
    });
  });

  // ----------------------------------------------------
  // MASTER ADMIN AUTHENTICATION & MANAGEMENT
  // ----------------------------------------------------

  // Master Admin login (PIN 5313 exclusively)
  app.post('/api/auth/admin/login', (req: Request, res: Response) => {
    const { pin } = req.body || {};
    if (!pin) {
      res.status(400).json({ success: false, error: 'PIN Master Admin diperlukan.' });
      return;
    }

    const result = authenticateMasterAdmin(pin);
    if (!result.success) {
      res.status(result.remainingSeconds ? 429 : 401).json(result);
      return;
    }

    res.json(result);
  });

  // Master Admin: Reset Client PIN to default 1234
  app.post('/api/auth/admin/reset-client-pin', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body?.token;
    const { workspaceIdOrSlug } = req.body || {};

    if (!token) {
      res.status(401).json({ success: false, error: 'Akses ditolak: Token Master Admin diperlukan.' });
      return;
    }

    const decoded = verifyToken<{ role: string }>(token);
    if (!decoded || decoded.role !== 'MASTER_ADMIN') {
      res.status(403).json({ success: false, error: 'Akses ditolak: Hanya Master Admin dibenarkan.' });
      return;
    }

    if (!workspaceIdOrSlug) {
      res.status(400).json({ success: false, error: 'ID atau slug workspace diperlukan.' });
      return;
    }

    const result = adminResetClientPin(workspaceIdOrSlug);
    res.json(result);
  });

  // Master Admin: Get Audit Logs
  app.get('/api/auth/admin/audit-logs', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);

    if (!token) {
      res.status(401).json({ success: false, error: 'Token Master Admin diperlukan.' });
      return;
    }

    const decoded = verifyToken<{ role: string }>(token);
    if (!decoded || decoded.role !== 'MASTER_ADMIN') {
      res.status(403).json({ success: false, error: 'Akses ditolak.' });
      return;
    }

    const logs = getAuditLogs();
    res.json({ success: true, logs });
  });

  // ----------------------------------------------------
  // FRONTEND SERVING (VITE DEV / STATIC PRODUCTION)
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[NiagaPOS] Server running securely at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[NiagaPOS] Fatal error starting server:', err);
  process.exit(1);
});
