import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { InstallPrompt } from './components/InstallPrompt'
import { AppUpdatePrompt } from './components/AppUpdatePrompt'
import { OfflineBanner } from './components/OfflineBanner'
import { ProtectedRoute, PublicOnly } from './components/ProtectedRoute'
import { listenNativeLaunchPath, consumeNativeLaunchPath } from './lib/backgroundMonitor'
import { LoginPage } from './pages/LoginPage'
import { SetupAdminPage } from './pages/SetupAdminPage'
import { ClassDisplayPage } from './pages/display/ClassDisplayPage'
import { LobbyDisplayPage } from './pages/display/LobbyDisplayPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminRequestsPage } from './pages/admin/AdminRequestsPage'
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage'
import { AdminClassesPage } from './pages/admin/AdminClassesPage'
import { AdminImportPage } from './pages/admin/AdminImportPage'
import { AdminGuidePage } from './pages/admin/AdminGuidePage'
import { AdminGatePage } from './pages/admin/AdminGatePage'
import { GatePage } from './pages/gate/GatePage'

function NativeLaunchListener() {
  const navigate = useNavigate()
  useEffect(() => {
    const stop = listenNativeLaunchPath((path) => navigate(path))
    void consumeNativeLaunchPath().then((path) => {
      if (path) navigate(path)
    })
    return stop
  }, [navigate])
  return null
}

export default function App() {
  return (
    <>
      <NativeLaunchListener />
      <OfflineBanner />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route path="/setup" element={<SetupAdminPage />} />

        <Route
          path="/gate"
          element={
            <ProtectedRoute roles={['GATE_OFFICER']}>
              <GatePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/display/class"
          element={
            <ProtectedRoute roles={['CLASS_STAFF']}>
              <ClassDisplayPage />
            </ProtectedRoute>
          }
        />
        <Route path="/class" element={<Navigate to="/display/class" replace />} />
        <Route
          path="/display/lobby"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <LobbyDisplayPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="requests" element={<AdminRequestsPage />} />
          <Route path="students" element={<AdminStudentsPage />} />
          <Route path="classes" element={<AdminClassesPage />} />
          <Route path="import" element={<AdminImportPage />} />
          <Route path="guide" element={<AdminGuidePage />} />
          <Route path="gate" element={<AdminGatePage />} />
          <Route path="staff" element={<Navigate to="/admin/classes" replace />} />
          <Route path="whatsapp" element={<Navigate to="/admin/classes" replace />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <InstallPrompt />
      <AppUpdatePrompt />
    </>
  )
}
