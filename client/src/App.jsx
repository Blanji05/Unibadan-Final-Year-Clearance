import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/auth/Login.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import Overview from './pages/student/Overview.jsx';
import Stages from './pages/student/Stages.jsx';
import StageDetail from './pages/student/StageDetail.jsx';
import DocumentVault from './pages/student/DocumentVault.jsx';
import Payments from './pages/student/Payments.jsx';
import Profile from './pages/student/Profile.jsx';
import Certificate from './pages/student/Certificate.jsx';
import PaymentCallback from './pages/student/PaymentCallback.jsx';
import OfficerOverview from './pages/officer/OfficerOverview.jsx';
import ReviewQueue from './pages/officer/ReviewQueue.jsx';
import Requirements from './pages/officer/Requirements.jsx';
import OfficerHistory from './pages/officer/OfficerHistory.jsx';
import OfficerDirectory from './pages/officer/OfficerDirectory.jsx';
import StudentLookup from './pages/officer/StudentLookup.jsx';
import OfficerProfile from './pages/officer/OfficerProfile.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import ManageSections from './pages/admin/ManageSections.jsx';
import ManageStudents from './pages/admin/ManageStudents.jsx';
import ManageUsers from './pages/admin/ManageUsers.jsx';
import Reports from './pages/admin/Reports.jsx';

/** Route guard: requires a session, and optionally a specific role. */
function Protected({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

/** Sends each role to its own landing page. */
function RoleHome() {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const home = {
    student: '/student',
    officer: '/officer',
    admin: '/admin',
  }[user.role];

  return <Navigate to={home || '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<Layout />}>
        <Route path="/" element={<RoleHome />} />

        <Route
          path="/student"
          element={
            <Protected roles={['student']}>
              <Overview />
            </Protected>
          }
        />
        <Route
          path="/student/stages"
          element={
            <Protected roles={['student']}>
              <Stages />
            </Protected>
          }
        />
        <Route
          path="/student/stages/:stageId"
          element={
            <Protected roles={['student']}>
              <StageDetail />
            </Protected>
          }
        />
        <Route
          path="/student/documents"
          element={
            <Protected roles={['student']}>
              <DocumentVault />
            </Protected>
          }
        />
        <Route
          path="/student/payments"
          element={
            <Protected roles={['student']}>
              <Payments />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected roles={['student']}>
              <Profile />
            </Protected>
          }
        />
        <Route
          path="/student/certificate"
          element={
            <Protected roles={['student']}>
              <Certificate />
            </Protected>
          }
        />

        <Route
          path="/payment/callback"
          element={
            <Protected roles={['student']}>
              <PaymentCallback />
            </Protected>
          }
        />

        <Route
          path="/officer"
          element={
            <Protected roles={['officer', 'admin']}>
              <OfficerOverview />
            </Protected>
          }
        />
        <Route
          path="/officer/queue"
          element={
            <Protected roles={['officer', 'admin']}>
              <ReviewQueue />
            </Protected>
          }
        />
        <Route
          path="/officer/requirements"
          element={
            <Protected roles={['officer', 'admin']}>
              <Requirements />
            </Protected>
          }
        />
        <Route
          path="/officer/history"
          element={
            <Protected roles={['officer', 'admin']}>
              <OfficerHistory />
            </Protected>
          }
        />
        <Route
          path="/officer/directory"
          element={
            <Protected roles={['officer', 'admin']}>
              <OfficerDirectory />
            </Protected>
          }
        />
        <Route
          path="/officer/students"
          element={
            <Protected roles={['officer', 'admin']}>
              <StudentLookup />
            </Protected>
          }
        />
        <Route
          path="/officer/profile"
          element={
            <Protected roles={['officer', 'admin']}>
              <OfficerProfile />
            </Protected>
          }
        />

        <Route
          path="/admin"
          element={
            <Protected roles={['admin']}>
              <AdminOverview />
            </Protected>
          }
        />
        <Route
          path="/admin/sections"
          element={
            <Protected roles={['admin']}>
              <ManageSections />
            </Protected>
          }
        />
        <Route
          path="/admin/students"
          element={
            <Protected roles={['admin']}>
              <ManageStudents />
            </Protected>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Protected roles={['admin']}>
              <ManageUsers />
            </Protected>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <Protected roles={['admin']}>
              <Reports />
            </Protected>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
