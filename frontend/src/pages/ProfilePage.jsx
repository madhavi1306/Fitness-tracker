import { useEffect, useState } from 'react';
import { Check, Pencil, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { displayWeight, weightFromDisplay } from '../utils/units.js';

export default function ProfilePage() {
  const { user, token, refreshUser } = useAuth();
  const { unit } = useUnits();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [nutritionTarget, setNutritionTarget] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetValue = form.get('targetWeight');
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await apiRequest('/profile', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          fullName: form.get('fullName'),
          age: Number(form.get('age')),
          heightCm: Number(form.get('heightCm')),
          currentWeightKg: weightFromDisplay(form.get('currentWeight'), unit),
          targetWeightKg: targetValue === '' ? null : weightFromDisplay(targetValue, unit),
          fitnessGoal: form.get('fitnessGoal'),
          activityLevel: form.get('activityLevel'),
          dietaryPreference: form.get('dietaryPreference'),
        }),
      });
      await refreshUser();
      setEditing(false);
      setNotice('Your profile has been updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const weightBounds = unit === 'kg' ? { min: 25, max: 400 } : { min: 56, max: 880 };
  useEffect(() => {
    let active = true;
    apiRequest('/nutrition/targets', { token })
      .then(({ target }) => { if (active) setNutritionTarget(target); })
      .catch(() => { if (active) setNutritionTarget(null); });
    return () => { active = false; };
  }, [token, user?.updatedAt]);

  return (
    <div className="profile-page page-enter">
      <section className="profile-intro"><div className="profile-large-avatar">{user?.fullName?.slice(0, 1).toUpperCase()}<span><UserRound size={15} /></span></div><div><span className="eyebrow">YOUR ACCOUNT</span><h2>{user?.fullName}</h2><p>{user?.email}</p></div><button className="button button-outline profile-edit-button" type="button" onClick={() => { setEditing(!editing); setError(''); setNotice(''); }}><Pencil size={15} />{editing ? 'Cancel editing' : 'Edit profile'}</button></section>
      {notice && <p className="form-success" role="status"><Check size={16} />{notice}</p>}
      {error && <p className="form-error profile-error" role="alert">{error}</p>}
      <form className="profile-form" key={`${unit}-${editing}-${user?.updatedAt}`} onSubmit={handleSubmit}>
        <div className="profile-form-heading"><div><span className="eyebrow">PERSONAL DETAILS</span><h3>About you</h3></div>{editing && <span className="required-note">All measurements stay private</span>}</div>
        <div className="profile-fields">
          <label className="field-label" htmlFor="fullName">Full name<input id="fullName" name="fullName" defaultValue={user?.fullName} readOnly={!editing} required minLength={2} maxLength={80} /></label>
          <label className="field-label" htmlFor="profileEmail">Email address<input id="profileEmail" value={user?.email || ''} readOnly disabled /></label>
          <label className="field-label" htmlFor="age">Age<input id="age" name="age" type="number" min="13" max="100" defaultValue={user?.age} readOnly={!editing} required /></label>
          <label className="field-label" htmlFor="heightCm">Height (cm)<input id="heightCm" name="heightCm" type="number" min="100" max="250" step="0.1" defaultValue={user?.heightCm} readOnly={!editing} required /></label>
          <label className="field-label" htmlFor="currentWeight">Current weight ({unit})<input id="currentWeight" name="currentWeight" type="number" min={weightBounds.min} max={weightBounds.max} step="0.1" defaultValue={displayWeight(user?.currentWeightKg, unit).toFixed(1)} readOnly={!editing} required /></label>
          <label className="field-label" htmlFor="targetWeight">Target weight ({unit})<input id="targetWeight" name="targetWeight" type="number" min={weightBounds.min} max={weightBounds.max} step="0.1" defaultValue={user?.targetWeightKg == null ? '' : displayWeight(user.targetWeightKg, unit).toFixed(1)} readOnly={!editing} placeholder="Optional" /></label>
          <label className="field-label" htmlFor="fitnessGoal">Fitness goal<select id="fitnessGoal" name="fitnessGoal" defaultValue={user?.fitnessGoal} disabled={!editing} required><option value="WEIGHT_GAIN">Weight gain</option><option value="WEIGHT_LOSS">Weight loss</option><option value="MAINTAIN_WEIGHT">Maintain weight</option><option value="BUILD_STRENGTH">Build strength</option></select></label>
          <label className="field-label" htmlFor="activityLevel">Activity level<select id="activityLevel" name="activityLevel" defaultValue={user?.activityLevel || 'MODERATELY_ACTIVE'} disabled={!editing}><option value="SEDENTARY">Mostly sitting</option><option value="LIGHTLY_ACTIVE">Lightly active</option><option value="MODERATELY_ACTIVE">Moderately active</option><option value="VERY_ACTIVE">Very active</option><option value="EXTRA_ACTIVE">Extremely active</option></select></label>
          <label className="field-label" htmlFor="dietaryPreference">Dietary preference<select id="dietaryPreference" name="dietaryPreference" defaultValue={user?.dietaryPreference || 'NONE'} disabled={!editing}><option value="NONE">No preference</option><option value="VEGETARIAN">Vegetarian</option><option value="VEGAN">Vegan</option><option value="PESCATARIAN">Pescatarian</option><option value="OTHER">Other</option></select></label>
        </div>
        {editing && <div className="profile-form-actions"><span>Weight is stored in kilograms in your account.</span><button className="button" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save changes'} <Check size={16} /></button></div>}
      </form>
      <section className="dashboard-section profile-nutrition-target">
        <div className="section-heading"><div><span className="eyebrow">GOAL SUPPORT</span><h3>Nutrition estimates</h3></div><Link className="quiet-link" to="/app/diet">Open nutrition <span aria-hidden="true">→</span></Link></div>
        {nutritionTarget ? <div className="profile-nutrition-values">
          <span><small>DAILY CALORIES</small><strong>{nutritionTarget.dailyCalories.toLocaleString()} kcal</strong></span>
          <span><small>PROTEIN</small><strong>{Math.round(nutritionTarget.proteinGrams)} g</strong></span>
          <span><small>MAINTENANCE ESTIMATE</small><strong>{nutritionTarget.maintenanceCalories.toLocaleString()} kcal</strong></span>
          <p>{nutritionTarget.estimateDisclaimer}</p>
        </div> : <p className="nutrition-empty-small">Nutrition estimates will appear after the database migration is applied.</p>}
      </section>
      <div className="profile-account-note"><span className="account-note-dot" /><p>Account created {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</p></div>
    </div>
  );
}
