import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import App from './App'
import ShellLayout from './layout/ShellLayout'

import Dashboard from './pages/Dashboard'
import DashboardHub from './pages/DashboardHub'
import Products from './pages/Products'
import Sell from './pages/Sell'
import CloseDay from './pages/CloseDay'
import Customers from './pages/Customers'
import Logi from './pages/Logi'
import Onboarding from './pages/Onboarding'
import AccountOverview from './pages/AccountOverview'
import BulkMessaging from './pages/BulkMessaging'
import StaffManagement from './pages/StaffManagement'
import { BillingVerifyPage } from './pages/BillingVerifyPage'
import Support from './pages/Support'
import Expenses from './pages/Expenses'
import DocumentsGenerator from './pages/DocumentsGenerator'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import InventorySystemGhana from './pages/InventorySystemGhana'
import DataTransfer from './pages/DataTransfer'
import PromoLandingPage from './pages/PromoLandingPage'
import PublicPageSettings from './pages/PublicPageSettings'

// ✅ NEW: public receipt page used by QR/share
import ReceiptView from './pages/ReceiptView'
import CustomerDisplay from './pages/CustomerDisplay'

import PrivacyPage from './pages/legal/PrivacyPage'
import CookiesPage from './pages/legal/CookiesPage'
import RefundPage from './pages/legal/RefundPage'
import IntegrationQuickstartPage from './pages/docs/IntegrationQuickstartPage'
import WordpressInstallGuidePage from './pages/docs/WordpressInstallGuidePage'

import { ToastProvider } from './components/ToastProvider'

const router = createBrowserRouter([
  // Public receipt route bypasses App-level redirects
  { path: '/receipt/:saleId', element: <ReceiptView /> },
  { path: '/promo/:slug', element: <PromoLandingPage /> },
  { path: '/:slug', element: <PromoLandingPage /> },
  { path: '/customer-display', element: <CustomerDisplay /> },
  { path: '/display', element: <CustomerDisplay /> },

  {
    path: '/',
    element: <App />,
    children: [
      {
        element: <ShellLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            element: <DashboardHub />,
            children: [
              { index: true, element: <Dashboard /> },
            ],
          },
          { path: 'products', element: <Products /> },
          { path: 'sell', element: <Sell /> },
          { path: 'customers', element: <Customers /> },
          { path: 'data-transfer', element: <DataTransfer /> },
          { path: 'bulk-messaging', element: <BulkMessaging /> },
          { path: 'logi', element: <Logi /> },

          // Finance
          { path: 'finance', element: <DocumentsGenerator /> },
          { path: 'finance/documents', element: <Navigate to="/finance" replace /> },
          { path: 'expenses', element: <Expenses /> },

          // Close day
          { path: 'close-day', element: <CloseDay /> },

          // Other authenticated pages
          { path: 'onboarding', element: <Onboarding /> },
          { path: 'staff', element: <StaffManagement /> },
          { path: 'account', element: <AccountOverview /> },
          { path: 'public-page', element: <PublicPageSettings /> },
          { path: 'support', element: <Support /> },
        ],
      },

      // Public routes (still under App)
      { path: 'reset-password', element: <ResetPassword /> },
      { path: 'verify-email', element: <VerifyEmail /> },
      { path: 'billing/verify', element: <BillingVerifyPage /> },
      { path: 'inventory-system-ghana', element: <InventorySystemGhana /> },
      { path: 'docs/integration-quickstart', element: <IntegrationQuickstartPage /> },
      { path: 'docs/wordpress-install-guide', element: <WordpressInstallGuidePage /> },

      // Legal pages
      { path: 'legal/privacy', element: <PrivacyPage /> },
      { path: 'legal/cookies', element: <CookiesPage /> },
      { path: 'legal/refund', element: <RefundPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'cookies', element: <CookiesPage /> },
      { path: 'refund', element: <RefundPage /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </React.StrictMode>,
)
