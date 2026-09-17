/**
 * Kedai PAPA POS - Part 01: Foundation & Application Architecture
 * Product Direction: PRODUCT → INVENTORY → POS → SALES → PROFIT TRACKING
 */

import React, { useState } from 'react';
import { StoreProvider } from './context/StoreContext';
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

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('pos');

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActivePage} />;
      case 'products':
        return <ProductsPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'pos':
        return <PosPage />;
      case 'purchases':
        return <PurchasesPage onNavigate={setActivePage} />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'customers':
        return <CustomersPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setActivePage} />;
    }
  };

  return (
    <StoreProvider>
      <AppShell activePage={activePage} onNavigate={setActivePage}>
        {renderActivePage()}
      </AppShell>
    </StoreProvider>
  );
}
