import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Tamaño de píxel: la escena se pinta a menos resolución y se escala sin suavizar.
const PIXEL = 2
const TAP_SLOP = 6

const NORMALS = {
  '+y': [0, 1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function palette() {
  return {
    pink: cssColor('--pink'),
    roof: cssColor('--pink-deep'),
    gold: cssColor('--gold'),
    wood: cssColor('--gold-deep'),
    paper: cssColor('--paper-dim'),
    ink: cssColor('--ink'),
    ink2: cssColor('--ink-2'),
    glass: cssColor('--gold'),
  }
}

// Sombreado por bandas (cel shading) con tres tonos.
function toonRamp() {
  const data = new Uint8Array([90, 170, 255])
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

function gableGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(-2.5, 0)
  shape.lineTo(2.5, 0)
  shape.lineTo(0, 1.6)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false })
  geo.translate(0, 0, -0.1)
  return geo
}

function screwLocalPosition(part, screw) {
  const [a, b] = screw.at
  if (part.shape === 'gable') return [a, b, 0.1]
  const [sx, sy, sz] = part.size
  switch (screw.face) {
    case '+y':
      return [a, sy / 2, b]
    case '+z':
      return [a, b, sz / 2]
    case '-z':
      return [a, b, -sz / 2]
    case '+x':
      return [sx / 2, b, a]
    default:
      return [-sx / 2, b, a]
  }
}

const HouseScene = forwardRef(function HouseScene({ parts, onTapScrew, label }, ref) {
  const mountRef = useRef(null)
  const api = useRef({})
  const tapRef = useRef(onTapScrew)
  tapRef.current = onTapScrew

  useImperativeHandle(ref, () => ({
    unscrew: (id) => api.current.unscrew?.(id),
    drop: (id) => api.current.drop?.(id),
    shake: (id) => api.current.shake?.(id),
  }))

  useEffect(() => {
    const mount = mountRef.current
    const colors = palette()
    const ramp = toonRamp()
    const materials = {}
    const mat = (name) =>
      (materials[name] ??= new THREE.MeshToonMaterial({
        color: colors[name],
        gradientMap: ramp,
        emissive: name === 'glass' ? colors.gold : '#000000',
        emissiveIntensity: name === 'glass' ? 0.55 : 0,
      }))

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setClearColor(colors.ink)
    renderer.domElement.className = 'house__canvas'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(colors.gold, colors.roof, 1.4))
    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(5, 10, 7)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(8.5, 7.5, 10)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2, 0)
    controls.enablePan = false
    controls.enableDamping = true
    controls.minDistance = 8
    controls.maxDistance = 18
    controls.minPolarAngle = 0.05
    controls.maxPolarAngle = 1.5
    controls.update()

    // Construir piezas y tornillos.
    const screwObjects = {}
    const partObjects = {}
    const pickables = []
    const geoCache = {
      head: new THREE.CylinderGeometry(0.23, 0.23, 0.1, 12),
      rim: new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12),
      slot: new THREE.BoxGeometry(0.32, 0.03, 0.07),
      hit: new THREE.SphereGeometry(0.32, 8, 6),
      gable: gableGeometry(),
    }
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    const up = new THREE.Vector3(0, 1, 0)

    parts.forEach((part) => {
      if (part.removed) return
      const group = new THREE.Group()
      group.position.set(...part.pos)
      if (part.rot) group.rotation.set(...part.rot)
      const geo = part.shape === 'gable' ? geoCache.gable : new THREE.BoxGeometry(...part.size)
      const body = new THREE.Mesh(geo, mat(part.color))
      body.userData.partId = part.id
      group.add(body)
      pickables.push(body)
      ;(part.decor ?? []).forEach((d) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...d.size), mat(d.color))
        m.position.set(...d.pos)
        m.userData.partId = part.id
        group.add(m)
        pickables.push(m)
      })

      part.screws.forEach((screw) => {
        if (screw.removed) return
        const s = new THREE.Group()
        s.position.set(...screwLocalPosition(part, screw))
        s.quaternion.setFromUnitVectors(up, new THREE.Vector3(...NORMALS[screw.face]))
        const spin = new THREE.Group()
        s.add(spin)
        const rim = new THREE.Mesh(geoCache.rim, mat('ink'))
        rim.position.y = 0.015
        const head = new THREE.Mesh(geoCache.head, mat(screw.color))
        head.position.y = 0.08
        const slotA = new THREE.Mesh(geoCache.slot, mat('ink'))
        slotA.position.y = 0.13
        const slotB = slotA.clone()
        slotB.rotation.y = Math.PI / 2
        const hit = new THREE.Mesh(geoCache.hit, hitMat)
        hit.position.y = 0.08
        ;[rim, head, slotA, slotB, hit].forEach((m) => {
          m.userData.screwId = screw.id
          spin.add(m)
        })
        pickables.push(hit, head)
        group.add(s)
        screwObjects[screw.id] = { root: s, spin }
      })

      scene.add(group)
      partObjects[part.id] = group
    })

    // Animaciones simples por fotograma.
    const tweens = new Set()
    const tween = (duration, step, done) => {
      const t = { time: 0, duration, step, done }
      tweens.add(t)
    }

    api.current.unscrew = (id) => {
      const obj = screwObjects[id]
      if (!obj) return
      const start = obj.root.position.clone()
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.root.quaternion)
      tween(
        0.35,
        (k) => {
          obj.spin.rotation.y = k * 14
          obj.root.position.copy(start).addScaledVector(dir, k * 0.7)
          obj.root.scale.setScalar(1 - k * 0.6)
        },
        () => obj.root.parent?.remove(obj.root),
      )
      delete screwObjects[id]
    }

    api.current.shake = (id) => {
      const obj = screwObjects[id]
      if (!obj) return
      tween(
        0.3,
        (k) => {
          obj.spin.rotation.y = Math.sin(k * Math.PI * 6) * 0.5
        },
        () => (obj.spin.rotation.y = 0),
      )
    }

    api.current.drop = (id) => {
      const group = partObjects[id]
      if (!group) return
      delete partObjects[id]
      group.traverse((o) => (o.userData = {}))
      const out = new THREE.Vector3(group.position.x, 0, group.position.z)
      if (out.lengthSq() < 0.01) out.set(0, 0, 1)
      out.normalize()
      let vy = 1.5
      tween(
        1.4,
        (k, dt) => {
          vy -= 14 * dt
          group.position.y += vy * dt
          group.position.addScaledVector(out, 2.2 * dt)
          group.rotation.x += out.z * 1.6 * dt
          group.rotation.z -= out.x * 1.6 * dt
        },
        () => scene.remove(group),
      )
    }

    // Toque frente a giro: si el dedo apenas se mueve, es un toque.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down = null
    const onDown = (e) => (down = { x: e.clientX, y: e.clientY })
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) return
      down = null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(pickables, false).find((h) => h.object.userData.screwId || h.object.userData.partId)
      if (hit?.object.userData.screwId) tapRef.current(hit.object.userData.screwId)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(Math.round(width / PIXEL), Math.round(height / PIXEL), false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    // Para las pruebas automáticas: dónde cae cada tornillo en pantalla.
    mount.screwPoints = () => {
      const rect = renderer.domElement.getBoundingClientRect()
      const v = new THREE.Vector3()
      return parts.flatMap((p) =>
        p.screws
          .filter((s) => !s.removed && screwObjects[s.id])
          .map((s) => {
            screwObjects[s.id].root.getWorldPosition(v)
            v.project(camera)
            const free = !s.blockers.some((id) => !parts.find((q) => q.id === id).removed)
            return { id: s.id, color: s.color, free, x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
          }),
      )
    }

    const clock = new THREE.Clock()
    let frame
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const dt = Math.min(clock.getDelta(), 0.05)
      tweens.forEach((t) => {
        t.time += dt
        const k = Math.min(1, t.time / t.duration)
        t.step(k, dt)
        if (k >= 1) {
          tweens.delete(t)
          t.done?.()
        }
      })
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      scene.traverse((o) => o.geometry?.dispose())
      Object.values(materials).forEach((m) => m.dispose())
      ramp.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      api.current = {}
    }
  }, [parts])

  return <div ref={mountRef} className="house" role="img" aria-label={label} />
})

export default HouseScene
