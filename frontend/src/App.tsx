import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { ConfigErrorPage } from './pages/ConfigErrorPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { DepartmentDetailPage } from './pages/DepartmentDetailPage'
import { ChecklistsIndexPage } from './pages/ChecklistsIndexPage'
import { DepartmentPrepPage } from './pages/DepartmentPrepPage'
import { NotFoundPage } from './pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  if (!isSupabaseConfigured) {
    return <ConfigErrorPage />
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/departments" element={<DepartmentsPage />} />
                  <Route path="/departments/:id" element={<DepartmentDetailPage />} />
                  <Route path="/checklists" element={<ChecklistsIndexPage />} />
                  <Route path="/checklists/:departmentId/:serviceId" element={<DepartmentPrepPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
