export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:px-[22px] md:py-5 xl:grid-cols-4">
      <div className="h-[58px] animate-pulse rounded-md bg-sheet-head md:col-span-2 xl:col-span-4" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[118px] animate-pulse rounded-md bg-sheet-head" />
      ))}
      <div className="h-56 animate-pulse rounded-md bg-sheet-head md:col-span-2" />
      <div className="h-56 animate-pulse rounded-md bg-sheet-head" />
      <div className="h-56 animate-pulse rounded-md bg-sheet-head" />
    </div>
  );
}
