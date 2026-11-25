import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, Apple, BarChart3, Dumbbell, History, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import Brand from '../components/Brand.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const links = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/workouts', label: 'Workout', icon: Dumbbell, end: true },
  { to: '/app/workouts/history', label: 'Workout history', icon: History },
  { to: '/app/exercises', label: 'Exercise library', icon: Activity },
  { to: '/app/diet', label: 'Diet plan', icon: Apple },
  { to: '/app/progress', label: 'Overall progress', icon: BarChart3 },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  return (
    <>
      <button className="mobile-menu-button icon-button" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand"><Brand /></div>
        <p className="nav-caption">TRAINING SPACE</p>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label !== 'Dashboard' && <span className="nav-phase">{label === 'Diet plan' ? '04' : label === 'Overall progress' ? '03' : '02'}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-coach">
          <span className="coach-spark">✳</span>
          <div><strong>One rep at a time.</strong><span>Your training starts here.</span></div>
        </div>
        <NavLink to="/app/profile" onClick={() => setOpen(false)} className={({ isActive }) => `profile-shortcut${isActive ? ' profile-shortcut-active' : ''}`}>
          <span className="avatar">{user?.fullName?.slice(0, 1).toUpperCase() || 'U'}</span>
          <span className="profile-shortcut-name"><strong>{user?.fullName}</strong><small>View profile</small></span>
        </NavLink>
        <button className="logout-link" onClick={logout}><LogOut size={17} /><span>Log out</span></button>
      </aside>
    </>
  );
}
