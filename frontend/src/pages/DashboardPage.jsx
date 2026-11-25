import { Activity, ArrowRight, Award, CalendarDays, Dumbbell, Flame, Layers3, Weight } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyPanel from '../components/EmptyPanel.jsx';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';

const quickActions = [
  { title: 'Start workout', detail: 'Build your session', icon: Dumbbell, to: '/app/workouts', phase: '02' },
  { title: 'Create template', detail: 'Plan a routine', icon: Layers3, to: '/app/workouts', phase: '02' },
  { title: 'Add exercise', detail: 'Browse movements', icon: Activity, to: '/app/exercises', phase: '02' },
  { title: 'Diet plan', detail: 'Shape your nutrition', icon: Weight, to: '/app/diet', phase: '04' },
  { title: 'Overall progress', detail: 'See your trends', icon: Award, to: '/app/progress', phase: '03' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { unit } = useUnits();
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'there';
  return (
    <div className="dashboard page-enter">
      <section className="welcome-row">
        <div><span className="eyebrow">A FRESH START</span><h2>Good to see you, {firstName}.</h2><p>Your training history begins with the next session.</p></div>
        <Link className="button welcome-button" to="/app/workouts"><Dumbbell size={17} /> Start a workout <ArrowRight size={16} /></Link>
      </section>
      <section className="stats-grid" aria-label="Training statistics">
        <StatCard icon={Dumbbell} label="Total workouts" value="0" note="Your first session is ahead" />
        <StatCard icon={Weight} label="Total volume" value="0" unit={` ${unit}`} note="Volume appears after training" />
        <StatCard icon={Award} label="Total PRs" value="0" note="Personal records are coming" />
        <StatCard icon={Flame} label="Current streak" value="0" unit=" days" note="Consistency starts today" />
      </section>
      <div className="dashboard-main-grid">
        <section className="dashboard-section chart-section">
          <div className="section-heading"><div><span className="eyebrow">YOUR TRAINING TRENDS</span><h2>Progress at a glance</h2></div><CalendarDays size={18} /></div>
          <div className="chart-empty-grid">
            <div className="chart-empty"><span className="chart-kicker">WEEKLY VOLUME</span><div className="chart-visual" aria-hidden="true" /><p>Log a few workouts to see your weekly volume.</p></div>
            <div className="chart-empty"><span className="chart-kicker">STRENGTH PROGRESSION</span><div className="chart-visual" aria-hidden="true" /><p>Your strength trends will appear after training.</p></div>
            <div className="chart-empty muscle-empty"><span className="chart-kicker">MUSCLE GROUP SPLIT</span><div className="muscle-visual" aria-hidden="true"><span /><span /><span /><span /></div><p>Muscle group balance will build over time.</p></div>
          </div>
        </section>
        <section className="dashboard-section actions-section">
          <div className="section-heading"><div><span className="eyebrow">MAKE YOUR NEXT MOVE</span><h2>Quick actions</h2></div></div>
          <div className="quick-action-list">{quickActions.map(({ title, detail, icon: Icon, to, phase }) => <Link className="quick-action" key={title} to={to}><span className="quick-action-icon"><Icon size={18} /></span><span className="quick-action-copy"><strong>{title}</strong><small>{detail}</small></span><span className="phase-chip">PHASE {phase}</span><ArrowRight className="quick-arrow" size={16} /></Link>)}</div>
        </section>
      </div>
      <div className="dashboard-bottom-grid">
        <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Nothing logged yet</h2></div></div><EmptyPanel icon={Activity} title="Your activity will live here" description="Once workout logging is available, your latest sessions will show up in this space." href="/app/workouts" actionLabel="Explore workouts" /></section>
        <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">PERSONAL RECORDS</span><h2>Room to grow</h2></div></div><EmptyPanel icon={Award} title="Your first PR is waiting" description="Personal records will be detected automatically when you log your training." href="/app/progress" actionLabel="About progress" /></section>
      </div>
    </div>
  );
}
