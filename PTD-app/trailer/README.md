# Vídeo de lanzamiento de PTD

Tráiler de ~50 s (1920×1080, 60 fps) hecho con [Remotion](https://remotion.dev). Las pantallas de la app están
recreadas en React a partir del código Compose (colores, tipografías e iconos de `app/src/main/res`).

```bash
npm install          # una vez
npm run music        # genera public/audio.wav (banda sonora sintetizada)
npm run studio       # previsualizar y retocar
npm run render       # → out/ptd-lanzamiento.mp4
node stills.mjs 600  # fotogramas sueltos → out/stills/
```

- `src/timeline.js` — escenas y momentos clave en pulsos (110 BPM); la música y el vídeo leen de aquí.
- `src/Launch.jsx` — las ocho escenas.
- `src/ui.jsx` — teléfono, logotipo animado y componentes de la app.
