import { ArrowUpRight } from 'lucide-react';

export default function EmptyPanel({ title, description, href, actionLabel, icon: Icon }) {
  return (
    <section className="empty-panel">
      <div className="empty-symbol">{Icon && <Icon size={20} />}</div>
      <div className="empty-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {href && <a className="quiet-link" href={href}>{actionLabel}<ArrowUpRight size={15} /></a>}
    </section>
  );
}
