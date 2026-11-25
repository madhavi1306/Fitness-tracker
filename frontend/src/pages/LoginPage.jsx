import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await login({ email: form.get('email'), password: form.get('password') });
      navigate('/app', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-brand"><Brand /></Link>
      <Link to="/" className="back-home"><ArrowLeft size={16} /> Back home</Link>
      <section className="auth-card">
        <div className="auth-icon"><LockKeyhole size={19} /></div>
        <span className="eyebrow">WELCOME BACK</span>
        <h1>Pick up where<br />you left off.</h1>
        <p className="auth-subtitle">Your next step is waiting.</p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
          <label className="field-label" htmlFor="password">Password<span className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button form-submit" type="submit" disabled={busy}>{busy ? 'Signing you in...' : 'Log in'} <ArrowLeft className="button-arrow" size={16} /></button>
        </form>
        <p className="auth-switch">New to Formline? <Link to="/register">Create an account</Link></p>
      </section>
      <p className="auth-footnote">A little progress adds up.</p>
    </main>
  );
}
