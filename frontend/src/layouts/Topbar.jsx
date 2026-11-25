import { CalendarDays, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';

export default function Topbar({ title = 'Dashboard' }) {
  const { unit, setUnit, range, setRange } = useUnits();
  const { logout } = useAuth();
  return (
    <header className="topbar">
      <div className="topbar-heading"><span className="eyebrow">YOUR TRAINING SPACE</span><h1>{title}</h1></div>
      <div className="topbar-controls">
        <label className="date-filter"><CalendarDays size={16} /><span className="sr-only">Date range</span><select value={range} onChange={(event) => setRange(event.target.value)}><option value="thisWeek">This Week</option><option value="thisMonth">This Month</option><option value="last30Days">Last 30 Days</option><option value="allTime">All Time</option></select><ChevronDown size={14} /></label>
        <div className="unit-switch" role="group" aria-label="Weight unit">
          <button className={unit === 'kg' ? 'unit-active' : ''} onClick={() => setUnit('kg')} aria-pressed={unit === 'kg'}>kg</button>
          <button className={unit === 'lbs' ? 'unit-active' : ''} onClick={() => setUnit('lbs')} aria-pressed={unit === 'lbs'}>lbs</button>
        </div>
        <button className="topbar-logout icon-button" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
