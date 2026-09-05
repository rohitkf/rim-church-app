import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from 'react-router-dom'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { TeamOnlyRoute } from './components/TeamOnlyRoute'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { handleAccountRemoved, isAccountRemoved } from './lib/accountRemoved'
import { ConfigErrorPage } from './pages/ConfigErrorPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import {
  AccessSettingsPane,
  ChurchSettingsPane,
  EraseDataPane,
  SendAlertPane,
  SettingsPage,
} from './pages/SettingsPage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { VolunteersPage } from './pages/VolunteersPage'
import { EventsPage } from './pages/EventsPage'
import { DepartmentDetailPage } from './pages/DepartmentDetailPage'
import { ChecklistsIndexPage } from './pages/ChecklistsIndexPage'
import { AvailabilityPage } from './pages/AvailabilityPage'
import { TeamRotaPage } from './pages/TeamRotaPage'
import { SetListsPage } from './pages/SetListsPage'
import { DepartmentPrepPage } from './pages/DepartmentPrepPage'
import { ServicePlannerIndexPage } from './pages/ServicePlannerIndexPage'
import { ServicePlannerPage } from './pages/ServicePlannerPage'
import { ServiceTemplatesPage } from './pages/ServiceTemplatesPage'
import { InventoryIndexPage } from './pages/InventoryIndexPage'
import { InventoryPage } from './pages/InventoryPage'
import { InventoryScanPage } from './pages/InventoryScanPage'
import { MessageBoardPage } from './pages/MessageBoardPage'
import { TeamChatPage } from './pages/TeamChatPage'
import { NotFoundPage } from './pages/NotFoundPage'

const queryClient = new QueryClient({
  // Every read in the app comes through here, which makes it the one place
  // that sees a session the database has stopped accepting. Somebody
  // removed while they had the app open is signed out rather than left
  // staring at a page where nothing loads and nothing says why.
  queryCache: new QueryCache({
    onError: (error) => {
      if (isAccountRemoved(error)) void handleAccountRemoved()
    },
  }),
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
          {/* Settings became four unrelated jobs on one scroll. Each is a
              page now, so a section can be linked to rather than described.
              /profile kept working: it is in the account menu, the search
              and whatever anybody has bookmarked. */}
          <Route path="/profile" element={<Navigate to="/settings/profile" replace />} />
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="access" element={<AccessSettingsPane />} />
            <Route path="alerts" element={<SendAlertPane />} />
            <Route path="church" element={<ChurchSettingsPane />} />
            <Route path="data" element={<EraseDataPane />} />
          </Route>
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/volunteers" element={<VolunteersPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
          <Route path="/set-lists" element={<SetListsPage />} />
          <Route path="/service-planner" element={<ServicePlannerIndexPage />} />
          <Route path="/service-planner/templates" element={<ServiceTemplatesPage />} />
          <Route path="/service-planner/:serviceId" element={<ServicePlannerPage />} />
          {/* The teams' own pages. Somebody who has signed up but has not
              been put on a team yet has nothing in any of them, so they go
              back to the dashboard rather than meeting three empty rooms —
              and the database refuses the rows regardless (0080). */}
          <Route element={<TeamOnlyRoute />}>
            {/* A rota, an availability answer and a checklist are all
                somebody's team's. On no team they are three empty pages. */}
            <Route path="/checklists" element={<ChecklistsIndexPage />} />
            <Route path="/checklists/:departmentId/:serviceId" element={<DepartmentPrepPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/rota" element={<TeamRotaPage />} />
            <Route path="/inventory" element={<InventoryIndexPage />} />
            <Route path="/inventory/:id" element={<InventoryPage />} />
            {/* Where a scanned label lands; it forwards to the item's own team. */}
            <Route path="/inventory/scan/:itemId" element={<InventoryScanPage />} />
            <Route path="/messages" element={<MessageBoardPage />} />
            <Route path="/team-chat" element={<TeamChatPage />} />
          </Route>
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
