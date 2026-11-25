import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import FeaturePage from './pages/FeaturePage.jsx';

function LoadingScreen() {
  return <main className="screen-loader" aria-label="Loading your account"><span className="loader-mark" /></main>;
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
      <Route path="/app" element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="workouts" element={<FeaturePage title="Workout builder" phase="2" />} />
        <Route path="exercises" element={<FeaturePage title="Exercise library" phase="2" />} />
        <Route path="diet" element={<FeaturePage title="Nutrition" phase="4" />} />
        <Route path="progress" element={<FeaturePage title="Progress" phase="3" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
