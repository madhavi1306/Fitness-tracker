import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Clock3, Dumbbell, History, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { apiRequest } from '../services/api.js';
import { displayWeight, weightFromDisplay } from '../utils/units.js';

const blankItem = () => ({ exerciseId: '', sets: '3', targetReps: '10', targetWeight: '', restSeconds: '60', notes: '' });

export default function WorkoutBuilderPage() {
  const { token } = useAuth();
  const { unit } = useUnits();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([blankItem()]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadTemplates() {
    try {
      const [{ templates: saved }, { exercises: library }] = await Promise.all([
        apiRequest('/templates', { token }),
        apiRequest('/exercises', { token }),
      ]);
      setTemplates(saved);
      setExercises(library);
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  useEffect(() => { loadTemplates(); }, [token]);

  function startCreate() {
    setEditing(null);
    setEditorOpen(true);
    setName('');
    setNotes('');
    setItems([blankItem()]);
    setError('');
  }

  function startEdit(template) {
    setEditing(template);
    setEditorOpen(true);
    setName(template.name);
    setNotes(template.notes || '');
    setItems(template.exercises.map((item) => ({
      exerciseId: item.exerciseId,
      sets: String(item.sets),
      targetReps: String(item.targetReps),
      targetWeight: item.targetWeightKg == null ? '' : String(displayWeight(item.targetWeightKg, unit).toFixed(1)),
      restSeconds: String(item.restSeconds),
      notes: item.notes || '',
    })));
    setError('');
  }

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function moveItem(index, direction) {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return;
    setItems((current) => {
      const moved = [...current];
      [moved[index], moved[destination]] = [moved[destination], moved[index]];
      return moved;
    });
  }

  async function saveTemplate(event) {
    event.preventDefault();
    if (!items.length || items.some((item) => !item.exerciseId)) {
      setError('Add an exercise to every row before saving.');
      return;
    }
    const body = {
      name,
      notes: notes.trim() || null,
      exercises: items.map((item) => ({
        exerciseId: item.exerciseId,
        sets: Number(item.sets),
        targetReps: Number(item.targetReps),
        targetWeightKg: item.targetWeight === '' ? null : weightFromDisplay(item.targetWeight, unit),
        restSeconds: Number(item.restSeconds),
        notes: item.notes.trim() || null,
      })),
    };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(editing ? `/templates/${editing.id}` : '/templates', {
        method: editing ? 'PUT' : 'POST',
        token,
        body: JSON.stringify(body),
      });
      setNotice(editing ? 'Workout template updated.' : 'Workout template created.');
      setEditing(null);
      setEditorOpen(false);
      setName('');
      await loadTemplates();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(template) {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    setError('');
    setNotice('');
    try {
      await apiRequest(`/templates/${template.id}`, { method: 'DELETE', token });
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice('Workout template deleted.');
      if (editing?.id === template.id) {
        setEditing(null);
        setEditorOpen(false);
        setName('');
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function beginWorkout(template) {
    setError('');
    setBusy(true);
    try {
      const { workout } = await apiRequest('/workouts/start', {
        method: 'POST',
        token,
        body: JSON.stringify({ templateId: template.id }),
      });
      navigate(`/app/workouts/live/${workout.id}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workout-page page-enter">
      <section className="workout-page-intro">
        <div><span className="eyebrow">YOUR TRAINING PLAN</span><h2>Make a plan. Then show up.</h2><p>Build reusable routines and track each session as you go.</p></div>
        <div className="workout-intro-actions"><Link className="button button-outline" to="/app/workouts/history"><History size={16} /> Workout history</Link><button className="button" type="button" onClick={startCreate}><Plus size={17} /> New template</button></div>
      </section>
      {notice && <p className="form-success" role="status"><Check size={16} />{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {editorOpen ? <section className="template-editor">
        <div className="template-editor-heading"><div><span className="eyebrow">{editing ? 'EDIT ROUTINE' : 'NEW ROUTINE'}</span><h2>{editing ? 'Update your template' : 'Create a workout template'}</h2></div><button className="icon-button" type="button" onClick={() => { setEditing(null); setEditorOpen(false); setName(''); setError(''); }} aria-label="Close editor"><X size={18} /></button></div>
        <form onSubmit={saveTemplate}>
          <div className="workout-form-grid">
            <label className="field-label">Workout name<input required minLength="1" maxLength="100" placeholder="e.g. Push Day" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="field-label">Workout notes<input maxLength="1000" placeholder="Optional notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          <div className="template-exercise-heading"><div><span className="eyebrow">ROUTINE ORDER</span><strong>Exercises and targets</strong></div><button type="button" className="button button-outline button-small" onClick={() => setItems([...items, blankItem()])}><Plus size={14} /> Add exercise</button></div>
          <div className="template-builder-list">
            {items.map((item, index) => <article className="template-builder-row" key={`builder-${index}`}>
              <div className="template-order-controls"><span>{String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Move exercise up"><ArrowUp size={14} /></button><button type="button" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} aria-label="Move exercise down"><ArrowDown size={14} /></button></div>
              <div className="workout-form-grid">
                <label className="field-label form-span-all">Exercise<select required value={item.exerciseId} onChange={(event) => updateItem(index, 'exerciseId', event.target.value)}><option value="">Choose an exercise</option>{exercises.map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name} · {exercise.muscleGroup}</option>)}</select></label>
                <label className="field-label">Sets<input type="number" min="1" max="20" required value={item.sets} onChange={(event) => updateItem(index, 'sets', event.target.value)} /></label>
                <label className="field-label">Target reps<input type="number" min="1" max="100" required value={item.targetReps} onChange={(event) => updateItem(index, 'targetReps', event.target.value)} /></label>
                <label className="field-label">Target weight ({unit})<input type="number" min="0" step="0.5" value={item.targetWeight} onChange={(event) => updateItem(index, 'targetWeight', event.target.value)} placeholder="Optional" /></label>
                <label className="field-label">Rest (seconds)<input type="number" min="0" max="3600" value={item.restSeconds} onChange={(event) => updateItem(index, 'restSeconds', event.target.value)} /></label>
                <label className="field-label form-span-all">Exercise notes<input maxLength="1000" value={item.notes} onChange={(event) => updateItem(index, 'notes', event.target.value)} placeholder="Optional cues" /></label>
              </div>
              <button type="button" className="quiet-danger remove-exercise-button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove exercise"><Trash2 size={16} /></button>
            </article>)}
          </div>
          <div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => { setEditing(null); setEditorOpen(false); setName(''); setError(''); }}>Cancel</button><button className="button" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save template'} <Check size={16} /></button></div>
        </form>
      </section> : null}
      <div className="template-list-heading"><div><span className="eyebrow">SAVED TEMPLATES</span><h2>Your workouts</h2></div><span>{templates.length} {templates.length === 1 ? 'routine' : 'routines'}</span></div>
      {templates.length ? <div className="template-grid">
        {templates.map((template) => <article className="template-card" key={template.id}>
          <div className="template-card-top"><span className="template-icon"><Dumbbell size={19} /></span><span className="template-exercise-count">{template.exercises.length} exercises</span></div>
          <h3>{template.name}</h3>{template.notes && <p className="template-notes">{template.notes}</p>}
          <ol className="template-exercise-list">{template.exercises.map((item) => <li key={item.id}><span>{item.exercise.name}</span><small>{item.sets} × {item.targetReps}</small></li>)}</ol>
          <div className="template-card-footer"><span><Clock3 size={14} /> {Math.round(template.exercises.reduce((total, item) => total + item.sets * item.restSeconds, 0) / 60)} min rest</span><button className="button" type="button" disabled={busy} onClick={() => beginWorkout(template)}><Play size={15} fill="currentColor" /> Start</button></div>
          <div className="template-card-actions"><button type="button" onClick={() => startEdit(template)}><Pencil size={14} /> Edit</button><button type="button" className="quiet-danger" onClick={() => deleteTemplate(template)}><Trash2 size={14} /> Delete</button></div>
        </article>)}
      </div> : <div className="workout-empty-state"><Dumbbell size={25} /><strong>Your first routine is waiting.</strong><span>Build a template to start logging your training.</span><button className="text-link" type="button" onClick={startCreate}><ArrowLeft size={15} /> Create a workout template</button></div>}
    </div>
  );
}
