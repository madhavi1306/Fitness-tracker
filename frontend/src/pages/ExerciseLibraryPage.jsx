import { useEffect, useMemo, useState } from 'react';
import { Activity, Check, ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import ExerciseArt from '../components/ExerciseArt.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../services/api.js';

const muscleGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
const equipmentTypes = ['Barbell', 'Dumbbells', 'Machine', 'Cable', 'Bodyweight', 'Resistance Bands'];
const difficulties = ['Beginner', 'Intermediate', 'Advanced'];
const emptyExercise = {
  name: '', muscleGroup: 'Chest', equipment: 'Barbell', description: '',
  difficulty: 'Beginner', instructions: '', imageUrl: '',
};

export default function ExerciseLibraryPage() {
  const { token } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyExercise);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadExercises() {
    try {
      const { exercises: items } = await apiRequest('/exercises', { token });
      setExercises(items);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { loadExercises(); }, [token]);
  const filtered = useMemo(() => exercises.filter((exercise) => {
    const matchesText = `${exercise.name} ${exercise.description} ${exercise.muscleGroup}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesText && (!muscle || exercise.muscleGroup === muscle) && (!equipment || exercise.equipment === equipment);
  }), [exercises, search, muscle, equipment]);

  function openCreate() {
    setEditing(null);
    setForm(emptyExercise);
    setShowForm(true);
    setError('');
    setNotice('');
  }

  function openEdit(exercise) {
    setEditing(exercise);
    setForm({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      description: exercise.description,
      difficulty: exercise.difficulty,
      instructions: exercise.instructions.join('\n'),
      imageUrl: exercise.imageUrl || '',
    });
    setShowForm(true);
    setError('');
    setNotice('');
  }

  async function saveExercise(event) {
    event.preventDefault();
    const body = {
      name: form.name,
      muscleGroup: form.muscleGroup,
      equipment: form.equipment,
      description: form.description,
      difficulty: form.difficulty,
      instructions: form.instructions.split('\n').map((line) => line.trim()).filter(Boolean),
      imageUrl: form.imageUrl.trim() || null,
    };
    setBusy(true);
    setError('');
    try {
      await apiRequest(editing ? `/exercises/${editing.id}` : '/exercises', {
        method: editing ? 'PUT' : 'POST',
        token,
        body: JSON.stringify(body),
      });
      setShowForm(false);
      setNotice(editing ? 'Custom exercise updated.' : 'Custom exercise created.');
      await loadExercises();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteExercise(exercise) {
    if (!window.confirm(`Delete "${exercise.name}"?`)) return;
    setError('');
    setNotice('');
    try {
      await apiRequest(`/exercises/${exercise.id}`, { method: 'DELETE', token });
      setExercises((current) => current.filter((item) => item.id !== exercise.id));
      setNotice('Custom exercise deleted.');
      if (expanded === exercise.id) setExpanded(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="workout-page page-enter">
      <section className="workout-page-intro">
        <div><span className="eyebrow">MOVEMENT LIBRARY</span><h2>Find your next movement.</h2><p>Browse the library or add exercises that fit your training.</p></div>
        <button className="button" type="button" onClick={openCreate}><Plus size={17} /> Add custom exercise</button>
      </section>
      {notice && <p className="form-success" role="status"><Check size={16} />{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="exercise-filter-bar" aria-label="Exercise search and filters">
        <label className="exercise-search"><Search size={17} /><span className="sr-only">Search exercises</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises..." /></label>
        <label><span className="sr-only">Filter by muscle group</span><select value={muscle} onChange={(event) => setMuscle(event.target.value)}><option value="">All muscle groups</option>{muscleGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">Filter by equipment</span><select value={equipment} onChange={(event) => setEquipment(event.target.value)}><option value="">All equipment</option>{equipmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <span className="exercise-result-count">{filtered.length} movements</span>
      </section>
      {showForm && <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
        <section className="workout-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-dialog-title">
          <div className="dialog-heading"><div><span className="eyebrow">YOUR LIBRARY</span><h2 id="exercise-dialog-title">{editing ? 'Edit custom exercise' : 'Create exercise'}</h2></div><button className="icon-button" type="button" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button></div>
          <form onSubmit={saveExercise}>
            <div className="workout-form-grid">
              <label className="field-label">Exercise name<input required minLength="1" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="field-label">Muscle group<select value={form.muscleGroup} onChange={(event) => setForm({ ...form, muscleGroup: event.target.value })}>{muscleGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field-label">Equipment<select value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })}>{equipmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field-label">Difficulty<select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>{difficulties.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field-label form-span-all">Description<textarea required maxLength="1000" rows="2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <label className="field-label form-span-all">Instructions <small>One step per line</small><textarea required rows="4" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label>
              <label className="field-label form-span-all">Illustration URL <small>Optional image URL</small><input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} /></label>
            </div>
            <div className="dialog-actions"><button className="button button-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save exercise'} <Check size={16} /></button></div>
          </form>
        </section>
      </div>}
      {filtered.length ? <div className="exercise-grid">
        {filtered.map((exercise) => {
          const isExpanded = expanded === exercise.id;
          return <article className={`exercise-card${isExpanded ? ' exercise-card-expanded' : ''}`} key={exercise.id}>
            <button type="button" className="exercise-card-top" onClick={() => setExpanded(isExpanded ? null : exercise.id)} aria-expanded={isExpanded}>
              <ExerciseArt exercise={exercise} compact />
              <span className="exercise-card-heading"><strong>{exercise.name}</strong><small>{exercise.muscleGroup} <span>·</span> {exercise.equipment}</small></span>
              {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>
            <div className="exercise-card-meta"><span>{exercise.difficulty}</span>{exercise.isCustom && <span className="custom-badge">CUSTOM</span>}</div>
            {isExpanded && <div className="exercise-detail">
              <p>{exercise.description}</p><strong>Instructions</strong><ol>{exercise.instructions.map((step, index) => <li key={`${exercise.id}-${index}`}>{step}</li>)}</ol>
              {exercise.isCustom && <div className="exercise-card-actions"><button className="button button-outline button-small" type="button" onClick={() => openEdit(exercise)}><Pencil size={14} /> Edit</button><button className="quiet-danger" type="button" onClick={() => deleteExercise(exercise)}><Trash2 size={14} /> Delete</button></div>}
            </div>}
          </article>;
        })}
      </div> : <div className="workout-empty-state"><Activity size={25} /><strong>No movements match those filters.</strong><span>Try a different search or clear the filters.</span></div>}
    </div>
  );
}
