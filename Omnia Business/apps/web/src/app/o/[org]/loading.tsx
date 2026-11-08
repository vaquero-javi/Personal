export default function Loading() {
  const card = 'animate-pulse rounded-[var(--radius-card)] bg-sheet shadow-[var(--shadow-card)]';
  return (
    <div aria-busy="true" aria-label="Cargando" className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
      <div className="mb-1 h-9 w-48 animate-pulse rounded-lg bg-fill md:col-span-2 xl:col-span-4" />
      <div className={`h-[64px] md:col-span-2 xl:col-span-4 ${card}`} />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`h-[118px] ${card}`} />
      ))}
      <div className={`h-56 md:col-span-2 ${card}`} />
      <div className={`h-56 ${card}`} />
      <div className={`h-56 ${card}`} />
    </div>
  );
}
