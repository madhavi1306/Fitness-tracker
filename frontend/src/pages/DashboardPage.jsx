import { lazy, Suspense, useEffect, useState } from 'react';
import { Activity, ArrowRight, Award, CalendarDays, Dumbbell, Flame, Layers3, Weight } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { apiRequest } from '../services/api.js';
import { displayWeight } from '../utils/units.js';

const charts = import('../components/ProgressCharts.jsx');
const WeeklyVolumeChart = lazy(() => charts.then((module) => ({ default: module.WeeklyVolumeChart })));
const StrengthChart = lazy(() => charts.then((module) => ({ default: module.StrengthChart })));
const MuscleSplitChart = lazy(() => charts.then((module) => ({ default: module.MuscleSplitChart })));
const chartFallback = <div className="chart-no-data">Loading chart...</div>;

const quickActions = [
  { title: 'Start workout', detail: 'Build your session', icon: Dumbbell, to: '/app/workouts', phase: '02' },
  { title: 'Create template', detail: 'Plan a routine', icon: Layers3, to: '/app/workouts', phase: '02' },
  { title: 'Add exercise', detail: 'Browse movements', icon: Activity, to: '/app/exercises', phase: '02' },
  { title: 'Diet plan', detail: 'Shape your nutrition', icon: Weight, to: '/app/diet', phase: '04' },
  { title: 'Overall progress', detail: 'See your trends', icon: Award, to: '/app/progress', phase: '03' },
];

const prLabels = {
  MAX_WEIGHT: 'Heaviest weight',
  ESTIMATED_1RM: 'Estimated 1RM',
  MAX_REPS_AT_WEIGHT: 'Most reps at weight',
  EXERCISE_VOLUME: 'Exercise volume',
};

function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min` : `${seconds} sec`;
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const { unit, range } = useUnits();
  const [dashboard, setDashboard] = useState(null);
  const [volume, setVolume] = useState([]);
  const [strength, setStrength] = useState({ exercises: [], points: [] });
  const [muscles, setMuscles] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'there';

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = `?range=${encodeURIComponent(range)}`;
    Promise.all([
      apiRequest(`/progress/dashboard${query}`, { token }),
      apiRequest(`/progress/weekly-volume${query}`, { token }),
      apiRequest(`/progress/strength${query}`, { token }),
      apiRequest(`/progress/muscle-split${query}`, { token }),
    ]).then(([overview, weekly, progression, split]) => {
      if (!active) return;
      setDashboard(overview);
      setVolume(weekly.days);
      setStrength(progression);
      setSelectedExercise(progression.selectedExercise || '');
      setMuscles(split.groups);
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, token]);

  async function changeExercise(event) {
    const value = event.target.value;
    setSelectedExercise(value);
    try {
      const progression = await apiRequest(`/progress/strength?range=${encodeURIComponent(range)}&exercise=${encodeURIComponent(value)}`, { token });
      setStrength(progression);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const stats = dashboard?.stats;
  const summary = dashboard?.weeklySummary;
  return (
    <div className="dashboard page-enter">
      <section className="welcome-row">
        <div><span className="eyebrow">YOUR TRAINING, IN FOCUS</span><h2>Good to see you, {firstName}.</h2><p>{stats?.workouts ? 'Every session adds up. Here is your training at a glance.' : 'Your training history begins with the next session.'}</p></div>
        <Link className="button welcome-button" to="/app/workouts"><Dumbbell size={17} /> Start a workout <ArrowRight size={16} /></Link>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="stats-grid" aria-label="Training statistics">
        <StatCard icon={Dumbbell} label="Total workouts" value={loading ? '…' : String(stats?.workouts || 0)} note="Completed workouts in selected range" />
        <StatCard icon={Weight} label="Total volume" value={loading ? '…' : (displayWeight(stats?.volumeKg || 0, unit)).toLocaleString(undefined, { maximumFractionDigits: 0 })} unit={` ${unit}·reps`} note="Weight × reps across completed sets" />
        <StatCard icon={Award} label="Total PRs" value={loading ? '…' : String(stats?.totalPRs || 0)} note="Records achieved in selected range" />
        <StatCard icon={Flame} label="Current streak" value={loading ? '…' : String(stats?.currentStreak || 0)} unit=" days" note={`Best streak: ${stats?.bestStreak || 0} days`} />
      </section>
      <div className="dashboard-main-grid">
        <section className="dashboard-section chart-section">
          <div className="section-heading"><div><span className="eyebrow">TRAINING VOLUME</span><h2>Volume by weekday</h2></div><CalendarDays size={18} /></div>
          <Suspense fallback={chartFallback}><WeeklyVolumeChart data={volume} unit={unit} /></Suspense>
        </section>
        <section className="dashboard-section actions-section">
          <div className="section-heading"><div><span className="eyebrow">MAKE YOUR NEXT MOVE</span><h2>Quick actions</h2></div></div>
          <div className="quick-action-list">{quickActions.map(({ title, detail, icon: Icon, to, phase }) => <Link className="quick-action" key={title} to={to}><span className="quick-action-icon"><Icon size={18} /></span><span className="quick-action-copy"><strong>{title}</strong><small>{detail}</small></span><span className="phase-chip">PHASE {phase}</span><ArrowRight className="quick-arrow" size={16} /></Link>)}</div>
        </section>
      </div>
      <div className="dashboard-progress-grid">
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">STRENGTH PROGRESSION</span><h2>Estimated 1RM over time</h2></div>
            <label className="chart-select"><span className="sr-only">Choose exercise</span><select value={selectedExercise} onChange={changeExercise} disabled={!strength.exercises.length}><option value="">Choose exercise</option>{strength.exercises.map((exercise) => <option key={exercise}>{exercise}</option>)}</select></label>
          </div>
          <Suspense fallback={chartFallback}><StrengthChart data={strength.points} unit={unit} compact /></Suspense>
        </section>
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">MUSCLE GROUP SPLIT</span><h2>Training balance</h2></div></div>
          <Suspense fallback={chartFallback}><MuscleSplitChart data={muscles} unit={unit} /></Suspense>
        </section>
      </div>
      <section className="weekly-summary-strip">
        <div><span className="eyebrow">THIS WEEK</span><strong>{summary?.workoutsCompleted || 0} workouts</strong></div>
        <div><span className="eyebrow">VOLUME</span><strong>{displayWeight(summary?.volumeKg || 0, unit).toLocaleString(undefined, { maximumFractionDigits: 0 })} {unit}·reps</strong></div>
        <div><span className="eyebrow">CONSISTENCY</span><strong>{summary?.consistencyPercent || 0}%</strong></div>
        <div><span className="eyebrow">WEIGHT CHANGE</span><strong>{summary?.weightChangeKg ? `${displayWeight(summary.weightChangeKg, unit).toFixed(1)} ${unit}` : '—'}</strong></div>
      </section>
      <div className="dashboard-bottom-grid">
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>{dashboard?.recentWorkouts?.length ? 'Last completed workouts' : 'Nothing logged yet'}</h2></div><Link className="quiet-link" to="/app/workouts/history">History <ArrowRight size={13} /></Link></div>
          {dashboard?.recentWorkouts?.length ? <div className="recent-progress-list">{dashboard.recentWorkouts.map((workout) => <Link className="recent-progress-row" to={`/app/workouts/history/${workout.id}`} key={workout.id}>
            <span className="quick-action-icon"><Dumbbell size={16} /></span><span><strong>{workout.name}</strong><small>{new Date(workout.startedAt).toLocaleDateString()} · {formatDuration(workout.durationSeconds)}</small></span><b>{displayWeight(workout.volumeKg, unit).toLocaleString(undefined, { maximumFractionDigits: 0 })} {unit}·reps</b>
          </Link>)}</div> : <div className="progress-empty-inline"><Activity size={19} /><span>Complete your first workout to see it here.</span><Link to="/app/workouts">Explore workouts <ArrowRight size={13} /></Link></div>}
        </section>
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">PERSONAL RECORDS</span><h2>{dashboard?.recentRecords?.length ? 'Recent achievements' : 'Room to grow'}</h2></div><Link className="quiet-link" to="/app/progress">All progress <ArrowRight size={13} /></Link></div>
          {dashboard?.recentRecords?.length ? <div className="recent-progress-list">{dashboard.recentRecords.map((record) => <article className="recent-progress-row" key={record.id}>
            <span className="pr-icon"><Award size={16} /></span><span><strong>{record.exerciseName}</strong><small>{prLabels[record.recordType] || record.recordType} · {new Date(record.achievedAt).toLocaleDateString()}</small></span><b>{record.recordType === 'MAX_REPS_AT_WEIGHT' ? `${record.value} reps` : `${displayWeight(record.value, unit).toFixed(1)} ${unit}`}</b>
          </article>)}</div> : <div className="progress-empty-inline"><Award size={19} /><span>Your personal records appear as you log sets.</span><Link to="/app/workouts">Start training <ArrowRight size={13} /></Link></div>}
        </section>
      </div>
    </div>
  );
}
