import type { ComponentType } from 'react'
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
import { PageGate } from './components/PageGate'
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
import { NotFoundPage } from './pages/NotFoundPage'
import { UpdateRequiredDialog } from './components/UpdateRequiredDialog'
import { ChurchSettingsRedirect } from './pages/ChurchSettingsRedirect'

/*
 * Each page's code arrives when the page is first opened, not with the
 * app. Everything used to ship as one 1.4 MB file before the first screen
 * could draw — the inventory's QR scanner included, for somebody who only
 * ever opens Availability on a phone. Sign-in and the Dashboard stay in
 * the first download, because they are where everybody lands.
 */
function PageLoading() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background text-body-sm text-on-surface-variant">
      Loading…
    </div>
  )
}

function page<M>(load: () => Promise<M>, name: keyof M) {
  return async () => ({ Component: (await load())[name] as ComponentType })
}

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
    // Shown while a page opened straight from a link fetches its code.
    <Route hydrateFallbackElement={<PageLoading />}>
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
          <Route path="/settings" lazy={page(() => import('./pages/SettingsPage'), 'SettingsPage')}>
            {/* The index is the hall: every room, grouped. */}
            <Route index element={null} />
            <Route path="profile" lazy={page(() => import('./pages/ProfilePage'), 'ProfilePage')} />
            <Route path="appearance" lazy={page(() => import('./pages/SettingsPage'), 'AppearanceSettingsPane')} />
            <Route path="timings" lazy={page(() => import('./pages/SettingsPage'), 'TimingsSettingsPane')} />
            <Route path="retention" lazy={page(() => import('./pages/SettingsPage'), 'RetentionSettingsPane')} />
            <Route path="display" lazy={page(() => import('./pages/SettingsPage'), 'DisplaySettingsPane')} />
            <Route path="rota" lazy={page(() => import('./pages/SettingsPage'), 'RotaSettingsPane')} />
            <Route path="giving" lazy={page(() => import('./pages/SettingsPage'), 'GivingSettingsPane')} />
            <Route path="menu" lazy={page(() => import('./pages/SettingsPage'), 'MenuSettingsPane')} />
            <Route path="access" lazy={page(() => import('./pages/SettingsPage'), 'AccessSettingsPane')} />
            <Route path="alerts" lazy={page(() => import('./pages/SettingsPage'), 'SendAlertPane')} />
            <Route path="logo" lazy={page(() => import('./pages/SettingsPage'), 'AppLogoPane')} />
            <Route path="data" lazy={page(() => import('./pages/SettingsPage'), 'EraseDataPane')} />
            {/* App settings was one room holding four. Its old address,
                and its old anchors, still land somewhere sensible. */}
            <Route path="church" element={<ChurchSettingsRedirect />} />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Route>
          {/* Issues decides for itself: teams always, everybody when the
              church lets everybody raise one (Settings › Timings). */}
          <Route path="/issues" lazy={page(() => import('./pages/IssuesPage'), 'IssuesPage')} />
          {/* Every other page a church can open or close to some of its
              people (Settings › Access & privileges, lib/pageAccess).
              Somebody a page is closed to goes back to the dashboard rather
              than meeting an empty room — and wherever it can, the database
              refuses the rows too (0123). */}
          <Route element={<PageGate />}>
            <Route path="/service-planner" lazy={page(() => import('./pages/ServicePlannerIndexPage'), 'ServicePlannerIndexPage')} />
            <Route path="/service-planner/templates" lazy={page(() => import('./pages/ServiceTemplatesPage'), 'ServiceTemplatesPage')} />
            <Route path="/service-planner/:serviceId" lazy={page(() => import('./pages/ServicePlannerPage'), 'ServicePlannerPage')} />
            <Route path="/set-lists" lazy={page(() => import('./pages/SetListsPage'), 'SetListsPage')} />
            <Route path="/events" lazy={page(() => import('./pages/EventsPage'), 'EventsPage')} />
            <Route path="/giving" lazy={page(() => import('./pages/GivingPage'), 'GivingPage')} />
            <Route path="/updates" lazy={page(() => import('./pages/ChurchUpdatesPage'), 'ChurchUpdatesPage')} />
            <Route path="/polls" lazy={page(() => import('./pages/PollsPage'), 'PollsPage')} />
            <Route path="/departments" lazy={page(() => import('./pages/DepartmentsPage'), 'DepartmentsPage')} />
            <Route path="/departments/:id" lazy={page(() => import('./pages/DepartmentDetailPage'), 'DepartmentDetailPage')} />
            <Route path="/volunteers" lazy={page(() => import('./pages/VolunteersPage'), 'VolunteersPage')} />
            <Route path="/checklists" lazy={page(() => import('./pages/ChecklistsIndexPage'), 'ChecklistsIndexPage')} />
            <Route path="/checklists/:departmentId/:serviceId" lazy={page(() => import('./pages/DepartmentPrepPage'), 'DepartmentPrepPage')} />
            <Route path="/availability" lazy={page(() => import('./pages/AvailabilityPage'), 'AvailabilityPage')} />
            <Route path="/rota" lazy={page(() => import('./pages/TeamRotaPage'), 'TeamRotaPage')} />
            <Route path="/inventory" lazy={page(() => import('./pages/InventoryIndexPage'), 'InventoryIndexPage')} />
            <Route path="/inventory/:id" lazy={page(() => import('./pages/InventoryPage'), 'InventoryPage')} />
            {/* Where a scanned label lands; it forwards to the item's own team. */}
            <Route path="/inventory/scan/:itemId" lazy={page(() => import('./pages/InventoryScanPage'), 'InventoryScanPage')} />
            <Route path="/messages" lazy={page(() => import('./pages/MessageBoardPage'), 'MessageBoardPage')} />
            <Route path="/team-chat" lazy={page(() => import('./pages/TeamChatPage'), 'TeamChatPage')} />
            {/* A team's notes on its own Sunday (0109 closes the rows too). */}
            <Route path="/debriefs" lazy={page(() => import('./pages/DebriefsPage'), 'DebriefsPage')} />
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
          {/* Above the router rather than inside the shell: a build that
              has gone stale is stale on the sign-in page too, and this is
              the one thing in the app that outranks whatever route you
              are on. */}
          <UpdateRequiredDialog />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
