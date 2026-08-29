/**
 * Application router — docs/ARCHITECTURE.md §3.7 (`app/router.tsx`).
 *
 * HashRouter over the full documented route table (PROJECT_SPEC §3.1) wrapped
 * in the shared `Layout`. Each route binds to its feature module's default
 * page; the feature owns its own UI and re-exports the page from its
 * `features/<area>/index.ts` barrel.
 *
 * - `PaddyRoutes` is the layout-wrapped <Routes/> table — exported separately
 *   so tests can render it inside a `MemoryRouter`.
 * - Unknown paths redirect to the Dashboard (`PROJECT_SPEC §3.1`).
 *
 * Route set preserved exactly:
 *   /  /purchase/new  /purchase/:id  /history  /history/:farmerId
 *   /moisture  /profit-loss  /farmers  /rice-types  /rice-prices  /settings
 */
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import DashboardPage from '@/features/dashboard'
import FarmersPage from '@/features/farmers'
import HistoryPage from '@/features/history'
import MoisturePage from '@/features/moisture'
import NewPurchasePage from '@/features/newpurchase'
import ProfitLossPage from '@/features/pnl'
import RicePricesPage from '@/features/riceprices'
import RiceTypesPage from '@/features/ricetypes'
import SettingsPage from '@/features/settings'
import HistoryFarmerPage from '@/features/history/HistoryFarmerPage'

import Layout from './Layout'

export function PaddyRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Dashboard (Home) */}
        <Route path="/" element={<DashboardPage />} />

        {/* Purchases */}
        <Route path="/purchase/new" element={<NewPurchasePage />} />
        <Route path="/purchase/:id" element={<NewPurchasePage />} />

        {/* History */}
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:farmerId" element={<HistoryFarmerPage />} />

        {/* Other documented feature areas */}
        <Route path="/moisture" element={<MoisturePage />} />
        <Route path="/profit-loss" element={<ProfitLossPage />} />
        <Route path="/farmers" element={<FarmersPage />} />
        <Route path="/rice-types" element={<RiceTypesPage />} />
        <Route path="/rice-prices" element={<RicePricesPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Unknown path → Dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/** HashRouter wrapper — static-hostable (GitHub Pages / web build). */
export default function PaddyRouter() {
  return (
    <HashRouter>
      <PaddyRoutes />
    </HashRouter>
  )
}