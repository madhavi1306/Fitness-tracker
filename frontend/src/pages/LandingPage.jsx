import { ArrowDownRight, ArrowRight, BarChart3, Check, Dumbbell, Fingerprint, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand.jsx';

const highlights = [
  { icon: Dumbbell, title: 'Training that fits you', text: 'Start with your own goals, experience, and pace.' },
  { icon: BarChart3, title: 'Progress with a purpose', text: 'Build a clear picture of where you are headed.' },
  { icon: ShieldCheck, title: 'Your details, protected', text: 'A private account for your personal training data.' },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav"><Link to="/" aria-label="Formline home"><Brand /></Link><div><Link className="nav-login" to="/login">Log in</Link><Link className="button button-small" to="/register">Get started <ArrowRight size={16} /></Link></div></nav>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow hero-eyebrow"><Fingerprint size={15} /> YOUR TRAINING, ON YOUR TERMS</span>
          <h1>Stronger is<br />built <span>one day</span><br />at a time.</h1>
          <p>A calmer, clearer way to build a training habit that actually belongs to you.</p>
          <div className="hero-actions"><Link className="button" to="/register">Create your account <ArrowRight size={17} /></Link><Link className="text-link" to="/login">I already have an account <ArrowDownRight size={16} /></Link></div>
          <div className="hero-assurance"><Check size={14} /> Free to get started <span /> No equipment required</div>
        </div>
        <div className="hero-image-wrap">
          <img className="hero-image" src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1300&q=85" alt="A quiet, well-equipped strength training gym" />
          <div className="image-label"><span className="image-label-dot" /><span><b>YOUR PACE.</b><small>YOUR PROGRESS.</small></span></div>
          <div className="hero-index">01 <span>/</span> 05</div>
        </div>
        <a className="scroll-hint" href="#built-for-real-life"><span>SCROLL TO EXPLORE</span><ArrowDownRight size={15} /></a>
      </section>
      <section className="highlights-section" id="built-for-real-life">
        <div className="section-intro"><span className="eyebrow">A BETTER PLACE TO BEGIN</span><h2>Make room for<br /><em>your kind</em> of progress.</h2><p>No pressure to be perfect. Just a practical place to show up and keep going.</p></div>
        <div className="highlight-list">{highlights.map(({ icon: Icon, title, text }, index) => <article className="highlight-row" key={title}><span className="highlight-index">0{index + 1}</span><span className="highlight-icon"><Icon size={20} /></span><div><h3>{title}</h3><p>{text}</p></div><ArrowRight className="highlight-arrow" size={18} /></article>)}</div>
      </section>
      <footer className="landing-footer"><Brand compact /><span>Build consistency. Let strength follow.</span><Link to="/register">Start your account <ArrowRight size={15} /></Link></footer>
    </main>
  );
}
