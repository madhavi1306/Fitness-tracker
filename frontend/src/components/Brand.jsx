import { Activity } from 'lucide-react';

export default function Brand({ compact = false }) {
  return (
    <span className={`brand-lockup${compact ? ' brand-compact' : ''}`}>
      <span className="brand-icon"><Activity size={19} strokeWidth={2.5} /></span>
      <span>formline<span className="brand-period">.</span></span>
    </span>
  );
}
