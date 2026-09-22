-- Apuntes a mano: trazos del lápiz y tipo de papel de cada nota.
-- { "version": 1, "paper": "ruled", "strokes": [ { tool, color, size, points: [[x, y, presión], …] } ] }
-- Las coordenadas van en unidades de página (ancho fijo, ver PAGE_WIDTH en src/features/notes/drawing.ts),
-- así una nota escrita en el iPad se ve igual en el ordenador.
alter table public.notes add column if not exists drawing jsonb;
