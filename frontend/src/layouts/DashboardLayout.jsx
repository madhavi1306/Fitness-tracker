import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

const pageTitles = {
  '/app': 'Dashboard',
  '/app/profile': 'Your profile',
  '/app/workouts': 'Workout builder',
  '/app/workouts/history': 'Workout history',
  '/app/exercises': 'Exercise library',
  '/app/diet': 'Diet plan',
  '/app/progress': 'Overall progress',
};

export default function DashboardLayout() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-column">
        <Topbar title={pageTitles[pathname] || (pathname.startsWith('/app/workouts/live/') ? 'Live workout' : pathname.startsWith('/app/workouts/history/') ? 'Workout summary' : 'Training space')} />
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  );
}
