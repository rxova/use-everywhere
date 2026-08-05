import type { ReactNode } from 'react';

/** Every page: what it is, why it is hard, then the live thing. */
export function Page({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="page">
      <div className="page__kicker">{kicker}</div>
      <h1>{title}</h1>
      <p className="page__lede">{lede}</p>
      {children}
    </main>
  );
}

export function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="card__h">
        {title}
        {aside ? <em>{aside}</em> : null}
      </div>
      {children}
    </section>
  );
}
