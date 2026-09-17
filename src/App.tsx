/**
 * NiagaPOS V2 - Full Client Multi-Tenant Architecture Entry
 * 
 * Supports:
 * - Master Admin Onboarding Console (`/admin` or admin mode button)
 * - Tenant Client Workspaces (`/{workspaceSlug}`)
 * - Trial Lifecycle Banner & Hard Lockdown for Expired/Suspended Workspaces
 * - Standard POS & Store pages with isolated data per client
 */

import React, { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { AppShell } from './components/layout/AppShell';
import { ActivePage } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { PosPage } from './pages/PosPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { CustomersPage } from './pages/CustomersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { MasterAdminPage } from './pages/MasterAdminPage';
import { parseRoute, pushRoute } from './services/urlRouter';
import { WorkspaceService } from './services/workspaceService';
import type { Workspace } from './types/workspace';
import { AlertOctagon, Clock, ShieldAlert, Ban, ExternalLink } from 'lucide-react';

function WorkspaceTrialBanner({ workspace }: { workspace: Workspace }) {
  const trialStatus = WorkspaceService.calculateTrialStatus(workspace);
  const remaining = WorkspaceService.getRemainingTime(workspace);

  if (trialStatus === 'ACTIVE' && remaining.days > 7) {
    return null;
  }

  if (trialStatus === 'TRIAL_ENDING') {
    return (
      <div className="bg-amber-500 text-stone-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Peringatan Tempoh Percubaan: Baki {remaining.days} hari {remaining.hours} jam sebelum percubaan akaun{' '}
            <strong>{workspace.workspaceName}</strong> tamat.
          </span>
        </div>
        <span className="text-[11px] bg-amber-600/30 px-2 py-0.5 rounded font-mono">
          Tamat: {new Date(workspace.trialExpiresAt).toLocaleDateString('ms-MY')}
        </span>
      </div>
    );
  }

  if (trialStatus === 'GRACE_PERIOD') {
    return (
      <div className="bg-orange-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 shrink-0" />
          <span>
            Fasa Tangguh (Grace Period): Percubaan telah tamat. Sistem akan disekat dalam {remaining.days} hari {remaining.hours} jam.
          </span>
        </div>
        <span className="text-[11px] bg-black/20 px-2 py-0.5 rounded font-mono">
          Sekatan Penuh: {new Date(workspace.gracePeriodEndsAt).toLocaleDateString('ms-MY')}
        </span>
      </div>
    );
  }

  if (trialStatus === 'EXPIRED' || trialStatus === 'SUSPENDED') {
    return (
      <div className="bg-rose-700 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Ban className="w-4 h-4 shrink-0" />
          <span>
            {trialStatus === 'SUSPENDED'
              ? `Akaun Workspace "${workspace.workspaceName}" telah digantung oleh Pentadbir Platform.`
              : `Tempoh percubaan untuk "${workspace.workspaceName}" telah tamat. Mod Baca Sahaja aktif.`}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider bg-black/30 px-2 py-0.5 rounded">
          SEKATAN PENULISAN AKTIF (SES v4.4)
        </span>
      </div>
    );
  }

  return null;
}

function MainAppContent() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [activePage, setActivePage] = useState<ActivePage>(() => route.systemPage || 'pos');
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseRoute(window.location.pathname);
      setRoute(parsed);
      if (parsed.systemPage) {
        setActivePage(parsed.systemPage);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync workspace from route
  useEffect(() => {
    if (route.workspaceSlug) {
      WorkspaceService.getWorkspaceBySlugAsync(route.workspaceSlug).then((ws) => {
        if (ws) {
          setCurrentWorkspace(ws);
        } else {
          // If slug not registered yet, check local
          const localWs = WorkspaceService.getWorkspaceBySlug(route.workspaceSlug!);
          setCurrentWorkspace(localWs);
        }
      });
    } else {
      setCurrentWorkspace(null);
    }
  }, [route.workspaceSlug]);

  const handleNavigate = (page: ActivePage) => {
    setActivePage(page);
    if (page === 'konsol') {
      pushRoute('/admin');
      setRoute({
        isMasterAdmin: true,
        workspaceSlug: null,
        systemPage: 'konsol',
        rawPath: '/admin',
      });
      return;
    }
    if (route.workspaceSlug) {
      pushRoute(`/${route.workspaceSlug}/${page}`);
    } else {
      pushRoute(`/${page}`);
    }
  };

  // 1. If path is /admin or Master Admin / Konsol Klien is requested
  if (route.isMasterAdmin || activePage === 'konsol') {
    return (
      <MasterAdminPage
        onExitAdmin={() => {
          setActivePage('pos');
          pushRoute('/');
          setRoute(parseRoute('/'));
        }}
        onSelectWorkspace={(slug) => {
          setActivePage('pos');
          pushRoute(`/${slug}/pos`);
          setRoute(parseRoute(`/${slug}/pos`));
        }}
      />
    );
  }

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavigate} />;
      case 'products':
        return <ProductsPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'pos':
        return <PosPage />;
      case 'purchases':
        return <PurchasesPage onNavigate={handleNavigate} />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'customers':
        return <CustomersPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Workspace Trial Notification Bar */}
      {currentWorkspace && <WorkspaceTrialBanner workspace={currentWorkspace} />}

      <AppShell activePage={activePage} onNavigate={handleNavigate}>
        {renderActivePage()}
      </AppShell>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <MainAppContent />
    </StoreProvider>
  );
}
