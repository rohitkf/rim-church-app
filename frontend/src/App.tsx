import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { ConfigErrorPage } from './pages/ConfigErrorPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { VolunteersPage } from './pages/VolunteersPage'
import { DepartmentDetailPage } from './pages/DepartmentDetailPage'
import { ChecklistsIndexPage } from './pages/ChecklistsIndexPage'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { TeamRotaPage } from './pages/TeamRotaPage'
import { DepartmentPrepPage } from './pages/DepartmentPrepPage'
import { ServicePlannerIndexPage } from './pages/ServicePlannerIndexPage'
import { ServicePlannerPage } from './pages/ServicePlannerPage'
import { ServiceTemplatesPage } from './pages/ServiceTemplatesPage'
import { InventoryIndexPage } from './pages/InventoryIndexPage'
import { InventoryPage } from './pages/InventoryPage'
import { MessageBoardPage } from './pages/MessageBoardPage'
import { TeamChatPage } from './pages/TeamChatPage'
import { NotFoundPage } from './pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Kept on: it's what recovers a query whose in-flight fetch was
      // killed by a navigation (see the pageshow handler below).
      refetchOnWindowFocus: true,
    },
  },
})

// Mobile browsers restore pages from the back/forward cache with their JS
// state frozen mid-flight: a fetch that was pending when the user
// navigated away is dead on arrival, leaving queries stuck in "Loading…"
// forever. On a bfcache restore (event.persisted), reset any still-
// "fetching" queries so they re-run instead of waiting on a corpse.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      queryClient.cancelQueries()
      queryClient.invalidateQueries()
    }
  })
}

// A data router (rather than <BrowserRouter>) is what makes useBlocker
// available, which the unsaved-changes guard on the template and service
// forms relies on to intercept an in-app navigation.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/volunteers" element={<VolunteersPage />} />
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
          <Route path="/checklists" element={<ChecklistsIndexPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/rota" element={<TeamRotaPage />} />
          <Route path="/checklists/:departmentId/:serviceId" element={<DepartmentPrepPage />} />
          <Route path="/service-planner" element={<ServicePlannerIndexPage />} />
          <Route path="/service-planner/templates" element={<ServiceTemplatesPage />} />
          <Route path="/service-planner/:serviceId" element={<ServicePlannerPage />} />
          <Route path="/inventory" element={<InventoryIndexPage />} />
          <Route path="/inventory/:id" element={<InventoryPage />} />
          <Route path="/messages" element={<MessageBoardPage />} />
          <Route path="/team-chat" element={<TeamChatPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route>,
  ),
)

function App() {
  if (!isSupabaseConfigured) {
    return <ConfigErrorPage />
  }

  // AuthProvider sits outside the router: it uses no router hooks, only
  // Supabase's session, so it doesn't need route context.
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
