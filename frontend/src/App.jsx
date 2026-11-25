import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import NutritionPage from './pages/NutritionPage.jsx';
import ExerciseLibraryPage from './pages/ExerciseLibraryPage.jsx';
import WorkoutBuilderPage from './pages/WorkoutBuilderPage.jsx';
import LiveWorkoutPage from './pages/LiveWorkoutPage.jsx';
import WorkoutHistoryPage from './pages/WorkoutHistoryPage.jsx';
import ProgressPage from './pages/ProgressPage.jsx';

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
        <Route path="workouts" element={<WorkoutBuilderPage />} />
        <Route path="workouts/live/:id" element={<LiveWorkoutPage />} />
        <Route path="workouts/history" element={<WorkoutHistoryPage />} />
        <Route path="workouts/history/:id" element={<WorkoutHistoryPage />} />
        <Route path="exercises" element={<ExerciseLibraryPage />} />
        <Route path="diet" element={<NutritionPage />} />
        <Route path="progress" element={<ProgressPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
