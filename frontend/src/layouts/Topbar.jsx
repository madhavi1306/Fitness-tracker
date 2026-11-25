import { CalendarDays, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';

export default function Topbar({ title = 'Dashboard' }) {
  const { unit, setUnit } = useUnits();
  const { logout } = useAuth();
  return (
    <header className="topbar">
      <div className="topbar-heading"><span className="eyebrow">YOUR TRAINING SPACE</span><h1>{title}</h1></div>
      <div className="topbar-controls">
        <label className="date-filter"><CalendarDays size={16} /><span className="sr-only">Date range</span><select defaultValue="7"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><ChevronDown size={14} /></label>
        <div className="unit-switch" role="group" aria-label="Weight unit">
          <button className={unit === 'kg' ? 'unit-active' : ''} onClick={() => setUnit('kg')} aria-pressed={unit === 'kg'}>kg</button>
          <button className={unit === 'lbs' ? 'unit-active' : ''} onClick={() => setUnit('lbs')} aria-pressed={unit === 'lbs'}>lbs</button>
        </div>
        <button className="topbar-logout icon-button" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
