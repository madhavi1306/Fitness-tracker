import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { weightFromDisplay } from '../utils/units.js';

export default function RegisterPage() {
  const { register } = useAuth();
  const { unit } = useUnits();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmPassword')) {
      setError('Those passwords do not match yet.');
      return;
    }
    setBusy(true);
    try {
      await register({
        fullName: form.get('fullName'),
        email: form.get('email'),
        password: form.get('password'),
        age: Number(form.get('age')),
        heightCm: Number(form.get('heightCm')),
        currentWeightKg: weightFromDisplay(form.get('currentWeight'), unit),
        fitnessGoal: form.get('fitnessGoal'),
      });
      navigate('/app', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-page-register">
      <Link to="/" className="auth-brand"><Brand /></Link>
      <Link to="/" className="back-home"><ArrowRight className="back-arrow" size={16} /> Back home</Link>
      <section className="auth-card register-card">
        <span className="eyebrow">YOUR FIRST REP</span>
        <h1>Start where<br />you are.</h1>
        <p className="auth-subtitle">A few details help us make this space yours.</p>
        <form className="form-stack register-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="fullName">Full name<input id="fullName" name="fullName" autoComplete="name" placeholder="Your name" required minLength={2} maxLength={80} /></label>
          <label className="field-label" htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
          <div className="field-row">
            <label className="field-label" htmlFor="age">Age<input id="age" name="age" type="number" inputMode="numeric" min="13" max="100" placeholder="Years" required /></label>
            <label className="field-label" htmlFor="heightCm">Height (cm)<input id="heightCm" name="heightCm" type="number" inputMode="decimal" min="100" max="250" step="0.1" placeholder="170" required /></label>
          </div>
          <label className="field-label" htmlFor="currentWeight">Current weight ({unit})<input id="currentWeight" name="currentWeight" type="number" inputMode="decimal" min={unit === 'kg' ? '25' : '56'} max={unit === 'kg' ? '400' : '880'} step="0.1" placeholder={unit === 'kg' ? '70' : '154'} required /></label>
          <label className="field-label" htmlFor="fitnessGoal">Fitness goal<select id="fitnessGoal" name="fitnessGoal" defaultValue="" required><option value="" disabled>Choose your focus</option><option value="WEIGHT_GAIN">Weight gain</option><option value="WEIGHT_LOSS">Weight loss</option><option value="MAINTAIN_WEIGHT">Maintain weight</option><option value="BUILD_STRENGTH">Build strength</option></select></label>
          <label className="field-label" htmlFor="password">Password<span className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} maxLength={72} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          <label className="field-label" htmlFor="confirmPassword">Confirm password<input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Type it one more time" minLength={8} maxLength={72} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button form-submit" type="submit" disabled={busy}>{busy ? 'Creating your account...' : 'Create account'} <ArrowRight size={16} /></button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
      </section>
      <p className="auth-footnote">Your information stays personal.</p>
    </main>
  );
}
