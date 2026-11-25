import { ArrowLeft, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function FeaturePage({ title, phase }) {
  return (
    <section className="feature-empty page-enter">
      <span className="feature-clock"><Clock3 size={22} /></span>
      <span className="eyebrow">COMING IN PHASE {phase}</span>
      <h2>{title} is on its way.</h2>
      <p>This part of your training space will be connected in a later development phase. Your account and profile are ready in the meantime.</p>
      <Link to="/app" className="text-link"><ArrowLeft size={16} /> Return to dashboard</Link>
    </section>
  );
}
