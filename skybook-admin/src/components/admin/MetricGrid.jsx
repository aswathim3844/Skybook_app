export function MetricGrid({ metrics }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-[24px] border border-white/10 bg-slate-950/30 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
          {metric.detail ? <p className="mt-2 text-sm text-slate-400">{metric.detail}</p> : null}
        </article>
      ))}
    </div>
  );
}
