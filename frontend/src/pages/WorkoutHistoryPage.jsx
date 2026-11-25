import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock3, Dumbbell, Weight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { apiRequest } from '../services/api.js';
import { displayWeight } from '../utils/units.js';

function durationLabel(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

export default function WorkoutHistoryPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { unit } = useUnits();
  const [workouts, setWorkouts] = useState([]);
  const [workout, setWorkout] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest(id ? `/workouts/${id}` : '/workouts/history', { token })
      .then((result) => {
        if (!active) return;
        if (id) setWorkout(result.workout);
        else setWorkouts(result.workouts);
        setError('');
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token]);

  if (loading) return <div className="workout-loading"><span className="loader-mark" /></div>;
  if (error) return <div className="workout-page page-enter"><p className="form-error" role="alert">{error}</p><Link className="text-link" to="/app/workouts/history"><ArrowLeft size={15} /> Workout history</Link></div>;

  if (id && workout) {
    const totalSets = workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    return <div className="workout-page history-detail-page page-enter">
      <Link to="/app/workouts/history" className="text-link"><ArrowLeft size={15} /> All workouts</Link>
      <section className="history-detail-heading"><div><span className="eyebrow">WORKOUT SUMMARY</span><h2>{workout.name}</h2><p><CalendarDays size={15} /> {new Date(workout.startedAt).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div><div className="history-summary-stats"><span><Clock3 size={15} /> {durationLabel(workout.durationSeconds)}</span><span><Dumbbell size={15} /> {totalSets} sets</span></div></section>
      {workout.exercises.map((exercise) => <section className="history-exercise-card" key={exercise.id}>
        <div className="history-exercise-heading"><div><span className="eyebrow">{exercise.muscleGroup} · {exercise.equipment}</span><h3>{exercise.name}</h3></div><span>{exercise.sets.length} / {exercise.targetSets} sets</span></div>
        {exercise.sets.length ? <div className="history-set-table"><div className="history-set-row history-set-header"><span>Set</span><span>Reps</span><span>Weight</span><span>Logged</span></div>{exercise.sets.map((set) => <div className="history-set-row" key={set.id}><span>{set.setNumber}</span><span>{set.reps}</span><span>{displayWeight(set.weightKg, unit).toFixed(1)} {unit}</span><span>{new Date(set.completedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></div>)}</div> : <p className="history-no-sets">No sets logged for this exercise.</p>}
      </section>)}
      {workout.exercises.length === 0 && <p className="history-no-sets">This session has no exercises.</p>}
    </div>;
  }

  return <div className="workout-page page-enter">
    <section className="workout-page-intro"><div><span className="eyebrow">YOUR TRAINING LOG</span><h2>Workout history.</h2><p>Every completed session, all in one place.</p></div><Link className="button button-outline" to="/app/workouts"><ArrowLeft size={15} /> Workout builder</Link></section>
    {workouts.length ? <div className="history-list">{workouts.map((item) => {
      const totalSets = item.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
      const totalReps = item.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.reps, 0), 0);
      const totalVolume = item.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0), 0);
      return <Link className="history-card" to={`/app/workouts/history/${item.id}`} key={item.id}>
        <span className="history-card-icon"><Dumbbell size={19} /></span><span className="history-card-main"><strong>{item.name}</strong><small><CalendarDays size={13} /> {new Date(item.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small><span className="history-exercise-preview">{item.exercises.map((exercise) => exercise.name).join(' · ')}</span></span>
        <span className="history-card-stat"><small><Clock3 size={13} /> Duration</small><strong>{durationLabel(item.durationSeconds)}</strong></span>
        <span className="history-card-stat"><small><Dumbbell size={13} /> Sets · reps</small><strong>{totalSets} · {totalReps}</strong></span>
        <span className="history-card-stat"><small><Weight size={13} /> Volume</small><strong>{displayWeight(totalVolume, unit).toFixed(0)} {unit}</strong></span>
      </Link>;
    })}</div> : <div className="workout-empty-state"><Dumbbell size={25} /><strong>Your workout history starts here.</strong><span>Complete your first session to see your progress.</span><Link className="text-link" to="/app/workouts"><ArrowLeft size={15} /> Browse templates</Link></div>}
  </div>;
}
