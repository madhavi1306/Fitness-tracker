import { ArrowUpRight } from 'lucide-react';

export default function StatCard({ icon: Icon, label, value, unit, note }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon"><Icon size={18} /></span>
        <ArrowUpRight className="stat-arrow" size={17} aria-hidden="true" />
      </div>
      <p className="stat-label">{label}</p>
      <div className="stat-number">{value}<span>{unit}</span></div>
      <p className="stat-note">{note}</p>
    </article>
  );
}
