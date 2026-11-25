import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Activity, Award, Check, Clock3, Dumbbell, Flame, Scale, Weight } from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { apiRequest } from '../services/api.js';
import { displayWeight, weightFromDisplay } from '../utils/units.js';

const charts = import('../components/ProgressCharts.jsx');
const StrengthChart = lazy(() => charts.then((module) => ({ default: module.StrengthChart })));
const BodyWeightChart = lazy(() => charts.then((module) => ({ default: module.BodyWeightChart })));
const chartFallback = <div className="chart-no-data">Loading chart...</div>;

const recordLabels = {
  MAX_WEIGHT: 'Maximum weight',
  ESTIMATED_1RM: 'Estimated 1RM',
  MAX_REPS_AT_WEIGHT: 'Most reps at weight',
  EXERCISE_VOLUME: 'Exercise volume',
};

function durationLabel(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
}

export default function ProgressPage() {
  const { token } = useAuth();
  const { unit, range } = useUnits();
  const [data, setData] = useState(null);
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadProgress() {
    const result = await apiRequest(`/progress/overall?range=${encodeURIComponent(range)}`, { token });
    setData(result);
    setWeight(displayWeight(result.bodyWeight.currentWeightKg, unit).toFixed(1));
    setExerciseName((current) => current || result.strength[0]?.exerciseName || '');
  }

  useEffect(() => {
    let active = true;
    apiRequest(`/progress/overall?range=${encodeURIComponent(range)}`, { token })
      .then((result) => {
        if (!active) return;
        setData(result);
        setWeight(displayWeight(result.bodyWeight.currentWeightKg, unit).toFixed(1));
        setExerciseName((current) => current || result.strength[0]?.exerciseName || '');
        setError('');
      })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [range, token, unit]);

  const exerciseOptions = useMemo(() => [...new Set((data?.strength || []).map((item) => item.exerciseName))].sort(), [data]);
  const strengthPoints = useMemo(() => (data?.strength || []).filter((item) => item.exerciseName === exerciseName), [data, exerciseName]);
  const exerciseVolumes = useMemo(() => Object.values((data?.strength || []).reduce((result, item) => {
    result[item.exerciseName] ||= { name: item.exerciseName, volumeKg: 0 };
    result[item.exerciseName].volumeKg += item.volumeKg;
    return result;
  }, {})).sort((a, b) => b.volumeKg - a.volumeKg), [data]);

  async function saveWeight(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/weight', {
        method: 'POST',
        token,
        body: JSON.stringify({ weightKg: weightFromDisplay(weight, unit), date: weightDate }),
      });
      await loadProgress();
      setNotice('Body weight saved for today.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const stats = data?.stats;
  const bodyWeight = data?.bodyWeight;
  return (
    <div className="progress-page page-enter">
      <section className="workout-page-intro">
        <div><span className="eyebrow">YOUR TRAINING DATA</span><h2>Progress, built over time.</h2><p>Real session records, strength trends, and body-weight history.</p></div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status"><Check size={16} />{notice}</p>}
      <section className="stats-grid progress-stats-grid" aria-label="Overall workout statistics">
        <StatCard icon={Dumbbell} label="Total workouts" value={stats?.workouts ?? '…'} note="Completed in selected range" />
        <StatCard icon={Weight} label="Total volume" value={displayWeight(stats?.volumeKg || 0, unit).toLocaleString(undefined, { maximumFractionDigits: 0 })} unit={` ${unit}·reps`} note="Sum of weight × reps" />
        <StatCard icon={Activity} label="Total sets · reps" value={`${stats?.sets ?? '…'} · ${stats?.reps ?? '…'}`} note="Completed work sets" />
        <StatCard icon={Clock3} label="Time trained" value={durationLabel(stats?.durationSeconds)} note="Combined workout duration" />
        <StatCard icon={Flame} label="Current streak" value={stats?.currentStreak ?? '…'} unit=" days" note={`Best streak: ${stats?.bestStreak ?? 0} days`} />
      </section>
      <div className="progress-main-grid">
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">STRENGTH PROGRESSION</span><h2>Estimated 1RM over time</h2></div>
            <label className="chart-select"><span className="sr-only">Choose exercise</span><select value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} disabled={!exerciseOptions.length}><option value="">Choose exercise</option>{exerciseOptions.map((name) => <option key={name}>{name}</option>)}</select></label>
          </div>
          <Suspense fallback={chartFallback}><StrengthChart data={strengthPoints} unit={unit} /></Suspense>
        </section>
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">BODY WEIGHT</span><h2>Track your trend</h2></div><Scale size={18} /></div>
          <div className="bodyweight-summary">
            <span><small>STARTING</small><strong>{displayWeight(bodyWeight?.startingWeightKg || 0, unit).toFixed(1)} {unit}</strong></span>
            <span><small>CURRENT</small><strong>{displayWeight(bodyWeight?.currentWeightKg || 0, unit).toFixed(1)} {unit}</strong></span>
            <span><small>TARGET</small><strong>{bodyWeight?.targetWeightKg == null ? '—' : `${displayWeight(bodyWeight.targetWeightKg, unit).toFixed(1)} ${unit}`}</strong></span>
            <span><small>CHANGE</small><strong>{displayWeight(bodyWeight?.changeKg || 0, unit).toFixed(1)} {unit}</strong></span>
          </div>
          <form className="weight-entry-form" onSubmit={saveWeight}>
            <label className="field-label">Date<input type="date" required value={weightDate} onChange={(event) => setWeightDate(event.target.value)} /></label>
            <label className="field-label">Body weight ({unit})<input type="number" min={unit === 'kg' ? 20 : 44} max={unit === 'kg' ? 500 : 1102} step="0.1" required value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
            <button className="button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save weight'} <Check size={15} /></button>
          </form>
          <Suspense fallback={chartFallback}><BodyWeightChart data={bodyWeight?.history || []} unit={unit} /></Suspense>
        </section>
      </div>
      <div className="dashboard-bottom-grid progress-bottom-grid">
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">EXERCISE VOLUME</span><h2>Work completed by exercise</h2></div><Dumbbell size={18} /></div>
          {exerciseVolumes.length ? <div className="weekly-summary-list">{exerciseVolumes.slice(0, 10).map((item) => <div key={item.name}><span>{item.name}</span><strong>{displayWeight(item.volumeKg, unit).toLocaleString(undefined, { maximumFractionDigits: 0 })} {unit}·reps</strong></div>)}</div> : <div className="progress-empty-inline"><Activity size={18} /><span>Exercise volume appears when you log completed sets.</span></div>}
        </section>
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">PERSONAL RECORDS</span><h2>Recent PRs</h2></div><Award size={18} /></div>
          {data?.records?.length ? <div className="record-list">{data.records.slice(0, 12).map((record) => <article className="record-row" key={record.id}>
            <span className="pr-icon"><Award size={15} /></span><span><strong>{record.exerciseName}</strong><small>{recordLabels[record.recordType] || record.recordType} · {new Date(record.achievedAt).toLocaleDateString()}</small></span><b>{record.recordType === 'MAX_REPS_AT_WEIGHT' ? `${record.value} reps @ ${displayWeight(record.weightKg, unit).toFixed(1)} ${unit}` : `${displayWeight(record.value, unit).toFixed(1)} ${unit}`}</b>
          </article>)}</div> : <div className="progress-empty-inline"><Award size={18} /><span>PRs are detected automatically when you log sets.</span></div>}
        </section>
        <section className="dashboard-section">
          <div className="section-heading"><div><span className="eyebrow">WEEKLY SUMMARY</span><h2>This week</h2></div><Activity size={18} /></div>
          <div className="weekly-summary-list">
            <div><span>Workouts completed</span><strong>{data?.weeklySummary?.workoutsCompleted || 0}</strong></div>
            <div><span>Total volume</span><strong>{displayWeight(data?.weeklySummary?.volumeKg || 0, unit).toLocaleString(undefined, { maximumFractionDigits: 0 })} {unit}·reps</strong></div>
            <div><span>Workout consistency</span><strong>{data?.weeklySummary?.consistencyPercent || 0}%</strong></div>
            <div><span>Weight change</span><strong>{displayWeight(data?.weeklySummary?.weightChangeKg || 0, unit).toFixed(1)} {unit}</strong></div>
            <div><span>New records</span><strong>{data?.weeklySummary?.prs?.length || 0}</strong></div>
            <div><span>Best exercise improvement</span><strong>{data?.weeklySummary?.bestExerciseImprovement ? `${data.weeklySummary.bestExerciseImprovement.exerciseName} +${displayWeight(data.weeklySummary.bestExerciseImprovement.improvementKg, unit).toFixed(1)} ${unit}` : '—'}</strong></div>
          </div>
          {(data?.weeklySummary?.prs || []).slice(0, 3).map((record) => <div className="weekly-pr-line" key={record.id}><Award size={14} /> {record.exerciseName}: {recordLabels[record.recordType] || record.recordType}</div>)}
        </section>
      </div>
    </div>
  );
}
