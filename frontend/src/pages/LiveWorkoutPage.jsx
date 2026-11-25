import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Award, Check, ChevronLeft, ChevronRight, Clock3, Dumbbell, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExerciseArt from '../components/ExerciseArt.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { apiRequest } from '../services/api.js';
import { displayWeight, weightFromDisplay } from '../utils/units.js';

const restChoices = ['30', '60', '90', '120'];

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

export default function LiveWorkoutPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { unit } = useUnits();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [restLeft, setRestLeft] = useState(0);
  const [restChoice, setRestChoice] = useState('planned');
  const [customRest, setCustomRest] = useState('60');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [newRecords, setNewRecords] = useState([]);
  const elapsedRef = useRef(0);
  const timerStartRef = useRef(0);
  const exercise = workout?.exercises?.[currentIndex];
  const completedSets = exercise?.sets?.length || 0;
  const nextSet = completedSets + 1;
  const plannedRest = exercise?.restSeconds ?? 60;
  const chosenRest = restChoice === 'planned' ? plannedRest : restChoice === 'custom' ? Number(customRest) : Number(restChoice);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest(`/workouts/${id}`, { token }),
      apiRequest('/workouts/history', { token }),
    ]).then(([{ workout: activeWorkout }, { workouts }]) => {
      if (!active) return;
      setWorkout(activeWorkout);
      setHistory(workouts);
      const currentElapsed = activeWorkout.finishedAt
        ? activeWorkout.durationSeconds || 0
        : Math.max(0, Math.floor((Date.now() - new Date(activeWorkout.startedAt).getTime()) / 1000));
      elapsedRef.current = currentElapsed;
      setElapsed(currentElapsed);
      if (activeWorkout.finishedAt) setFinished(true);
      else setRunning(true);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => { active = false; };
  }, [id, token]);

  useEffect(() => {
    if (!running || !workout || finished) return undefined;
    const timerStartedAt = Date.now() - elapsedRef.current * 1000;
    timerStartRef.current = timerStartedAt;
    const interval = window.setInterval(() => {
      const current = Math.floor((Date.now() - timerStartedAt) / 1000);
      elapsedRef.current = current;
      setElapsed(current);
    }, 250);
    return () => window.clearInterval(interval);
  }, [running, workout, finished]);

  useEffect(() => {
    if (restLeft <= 0) return undefined;
    const interval = window.setInterval(() => setRestLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [restLeft]);

  useEffect(() => {
    if (!exercise) return;
    const nextWeight = exercise.targetWeightKg == null ? '' : displayWeight(exercise.targetWeightKg, unit).toFixed(1);
    setWeight(nextWeight);
    setReps(String(exercise.targetReps));
  }, [exercise?.id, unit]);

  const previous = useMemo(() => {
    if (!exercise || !workout) return null;
    const previousWorkout = history.find((item) => new Date(item.startedAt) < new Date(workout.startedAt)
      && item.exercises.some((itemExercise) => itemExercise.name === exercise.name));
    const previousExercise = previousWorkout?.exercises.find((itemExercise) => itemExercise.name === exercise.name);
    return previousExercise ? { exercise: previousExercise, startedAt: previousWorkout.startedAt } : null;
  }, [exercise, history, workout]);

  function pauseTimer() {
    const current = Math.floor((Date.now() - timerStartRef.current) / 1000);
    elapsedRef.current = current;
    setElapsed(current);
    setRunning(false);
  }

  function resumeTimer() {
    setRunning(true);
  }

  async function completeSet(event) {
    event.preventDefault();
    if (!workout || !exercise || finished || restLeft > 0) return;
    setBusy(true);
    setError('');
    try {
      const { set, prs } = await apiRequest(`/workouts/${workout.id}/sets`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          exerciseId: exercise.id,
          setNumber: nextSet,
          reps: Number(reps),
          weightKg: weightFromDisplay(weight, unit),
        }),
      });
      setWorkout((current) => ({
        ...current,
        exercises: current.exercises.map((item) => item.id === exercise.id ? { ...item, sets: [...item.sets, set] } : item),
      }));
      if (prs?.length) setNewRecords((current) => [...prs, ...current]);
      setRestLeft(Math.max(0, chosenRest));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function nextExercise(direction = 1) {
    setCurrentIndex((index) => Math.max(0, Math.min(workout.exercises.length - 1, index + direction)));
    setRestLeft(0);
  }

  async function finishWorkout() {
    if (!workout) return;
    setBusy(true);
    setError('');
    try {
      const durationSeconds = running
        ? Math.floor((Date.now() - timerStartRef.current) / 1000)
        : elapsedRef.current;
      const { workout: saved } = await apiRequest(`/workouts/${workout.id}/finish`, {
        method: 'POST',
        token,
        body: JSON.stringify({ durationSeconds }),
      });
      setWorkout(saved);
      setElapsed(saved.durationSeconds || 0);
      elapsedRef.current = saved.durationSeconds || 0;
      setRunning(false);
      setRestLeft(0);
      setFinished(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!workout) {
    return <div className="workout-loading">{error ? <p className="form-error" role="alert">{error}</p> : <span className="loader-mark" />}</div>;
  }

  return (
    <div className="workout-page live-workout-page page-enter">
      <div className="live-topline"><Link to="/app/workouts" className="text-link"><ArrowLeft size={15} /> Workout templates</Link><span className={running ? 'timer-status status-running' : 'timer-status'}>{running ? 'WORKOUT IN PROGRESS' : finished ? 'WORKOUT FINISHED' : 'WORKOUT PAUSED'}</span></div>
      <section className="live-workout-heading">
        <div><span className="eyebrow">LIVE SESSION</span><h2>{workout.name}</h2><p>{new Date(workout.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
        <div className="live-timer"><Clock3 size={18} /><span>{formatTime(elapsed)}</span><small>DURATION</small></div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {newRecords.length > 0 && <section className="new-pr-notice" role="status">
        <Award size={20} /><div><strong>NEW PR!</strong>{newRecords.slice(0, 3).map((record) => <span key={record.id}>{record.exerciseName} · {record.recordType === 'MAX_REPS_AT_WEIGHT' ? `${record.value} reps` : `${displayWeight(record.value, unit).toFixed(1)} ${unit}`}</span>)}</div><button type="button" onClick={() => setNewRecords([])} aria-label="Dismiss personal record notification">×</button>
      </section>}
      {finished ? <section className="workout-finished-panel">
        <span className="finished-icon"><Check size={25} /></span><span className="eyebrow">SESSION SAVED</span><h2>Strong work.</h2><p>{workout.name} · {formatTime(workout.durationSeconds || 0)}</p><Link className="button" to={`/app/workouts/history/${workout.id}`}>View workout summary</Link>
      </section> : <div className="live-layout">
        <section className="live-exercise-panel">
          <div className="live-exercise-count">EXERCISE {String(currentIndex + 1).padStart(2, '0')} <span>/ {String(workout.exercises.length).padStart(2, '0')}</span></div>
          <ExerciseArt exercise={exercise} />
          <div className="live-exercise-title"><div><span className="eyebrow">{exercise.muscleGroup} · {exercise.equipment}</span><h2>{exercise.name}</h2><p>{exercise.description}</p></div></div>
          <div className="target-summary"><span><small>TARGET SETS</small><strong>{exercise.targetSets}</strong></span><span><small>TARGET REPS</small><strong>{exercise.targetReps}</strong></span><span><small>SET</small><strong>{Math.min(nextSet, exercise.targetSets)} <em>/ {exercise.targetSets}</em></strong></span></div>
          {previous && <div className="previous-workout-info"><span className="eyebrow">PREVIOUS WORKOUT</span><strong>{new Date(previous.startedAt).toLocaleDateString()}</strong><span>{previous.exercise.sets.map((set) => `${displayWeight(set.weightKg, unit).toFixed(1)} ${unit} × ${set.reps}`).join(' · ') || 'No sets recorded'}</span></div>}
          {exercise.notes && <p className="live-coach-note">{exercise.notes}</p>}
          <div className="live-exercise-navigation"><button type="button" className="button button-outline button-small" disabled={currentIndex === 0} onClick={() => nextExercise(-1)}><ChevronLeft size={15} /> Previous</button><button type="button" className="button button-outline button-small" disabled={currentIndex === workout.exercises.length - 1} onClick={() => nextExercise(1)}>Next exercise <ChevronRight size={15} /></button></div>
        </section>
        <section className="live-log-panel">
          <div className="section-heading"><div><span className="eyebrow">SET LOGGER</span><h2>Log your work</h2></div><Dumbbell size={18} /></div>
          <div className="live-set-progress">{Array.from({ length: exercise.targetSets }, (_, index) => <span className={index < completedSets ? 'set-progress-done' : ''} key={index}>{index < completedSets ? <Check size={13} /> : index + 1}</span>)}</div>
          {completedSets > 0 && <div className="completed-set-list"><strong>Completed sets</strong>{exercise.sets.map((set) => <div key={set.id}><span>Set {set.setNumber}</span><span>{set.reps} reps</span><b>{displayWeight(set.weightKg, unit).toFixed(1)} {unit}</b></div>)}</div>}
          {restLeft > 0 ? <div className="rest-timer">
            <span className="eyebrow">RESTING</span><strong>{formatTime(restLeft)}</strong>
            <button type="button" className="button button-outline" onClick={() => setRestLeft(0)}><SkipForward size={15} /> Skip rest</button>
          </div> : <form className="set-entry-form" onSubmit={completeSet}>
            <div className="set-entry-number"><span>SET {Math.min(nextSet, exercise.targetSets)}</span><small>OF {exercise.targetSets}</small></div>
            <label className="field-label">Reps<input type="number" min="1" max="1000" required value={reps} onChange={(event) => setReps(event.target.value)} /></label>
            <label className="field-label">Weight ({unit})<input type="number" min="0" max={unit === 'kg' ? 10000 : 22046} step="0.5" required value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
            <label className="field-label rest-choice-label">Rest after this set<select value={restChoice} onChange={(event) => setRestChoice(event.target.value)}><option value="planned">Template · {plannedRest}s</option>{restChoices.map((choice) => <option value={choice} key={choice}>{choice} seconds</option>)}<option value="custom">Custom</option></select></label>
            {restChoice === 'custom' && <label className="field-label rest-choice-label">Custom seconds<input type="number" min="1" max="3600" required value={customRest} onChange={(event) => setCustomRest(event.target.value)} /></label>}
            <button className="button complete-set-button" type="submit" disabled={busy || nextSet > exercise.targetSets}>{busy ? 'Saving set...' : nextSet > exercise.targetSets ? 'All sets complete' : 'Complete set'} <Check size={16} /></button>
          </form>}
          <div className="live-timer-controls">{running ? <button className="button button-outline" type="button" onClick={pauseTimer}><Pause size={15} /> Pause workout</button> : <button className="button button-outline" type="button" onClick={resumeTimer}><Play size={15} /> Resume workout</button>}<span>{running ? 'Timer running' : 'Timer paused'}</span></div>
          <button type="button" className="button finish-workout-button" disabled={busy} onClick={finishWorkout}><RotateCcw size={15} /> Finish workout</button>
        </section>
      </div>}
      {!finished && <div className="live-mobile-finish"><button className="button button-outline" type="button" onClick={finishWorkout} disabled={busy}>Finish workout</button></div>}
    </div>
  );
}
