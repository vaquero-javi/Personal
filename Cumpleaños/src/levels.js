import suegros from '../images/isi3.jpg'
import cunados from '../images/isi2.jpg'
import novio from '../images/isi1.jpg'

// Orden fijado por el autor: suegros, cuñados, novio.
export const LEVELS = [
  {
    id: 'suegros',
    number: 1,
    name: 'Nivel suegros',
    short: 'Suegros',
    game: 'sopa',
    winText: 'Ya puedes abrir sus regalos',
    // Palabras de la sopa de letras: cámbialas aquí (máx. 10 letras, sin espacios).
    words: ['SUEGROS', 'FAMILIA', 'REGALO', 'FIESTA', 'TARTA', 'VELAS', 'FELIZ', 'AMOR'],
    photo: suegros,
    focus: '52% 30%',
    alt: 'Ella con sus suegros, de noche en una terraza con guirnaldas de luces',
  },
  {
    id: 'cunados',
    number: 2,
    name: 'Nivel cuñados',
    short: 'Cuñados',
    game: 'blocks',
    // Puntos que hay que conseguir en el Block Blast para superar el nivel.
    target: 300,
    winText: 'Ya puedes abrir sus regalos',
    photo: cunados,
    focus: '50% 48%',
    alt: 'Ella con sus cuñados en una discoteca con luces rojas',
  },
  {
    id: 'novio',
    number: 3,
    name: 'Nivel novio',
    short: 'Novio',
    game: 'screws',
    // Se supera quitando todos los tornillos de la casa.
    winText: 'Ya puedes abrir sus regalos',
    photo: novio,
    focus: '48% 36%',
    alt: 'Ella y su novio con los peques de la familia, foto en el espejo',
  },
]

export const levelById = (id) => LEVELS.find((l) => l.id === id)

// Niveles superados, guardados en este navegador.
const DONE_KEY = 'cumple:superados'

export function completedLevels() {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY)) ?? []
  } catch {
    return []
  }
}

export function markCompleted(id) {
  try {
    const done = new Set(completedLevels()).add(id)
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]))
  } catch {
    /* sin almacenamiento: el nivel se puede repetir, no pasa nada */
  }
}
