'use client';

import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei';
import { OPEN_END, TURN_END } from './mac-timeline';

/*
 * MacBook en 3D (modelo glTF de pmndrs/examples, licencia MIT) con las
 * capturas de Omnia como textura de la pantalla. Todo lo mueve el progreso
 * del scroll (0–1) que llega por `progress`; aquí solo se interpola.
 */

const MODEL = '/landing/mac.glb';
export const SCREENS = ['/landing/boot.webp', '/landing/inicio.webp', '/landing/facturacion.webp', '/landing/turnos.webp', '/landing/estadisticas.webp'];


const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const LID_CLOSED = 1.575;
const LID_OPEN = -0.425;

type Nodes = Record<string, THREE.Mesh>;
type Materials = Record<string, THREE.MeshStandardMaterial>;

/** Pantalla: mezcla dos texturas para pasar de una captura a otra sin saltos. */
function useScreenMaterial(screen: number) {
  const maps = useTexture(SCREENS);
  const material = useMemo(() => {
    for (const t of maps) {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
    return new THREE.ShaderMaterial({
      uniforms: { a: { value: maps[0] }, b: { value: maps[0] }, mixAB: { value: 1 }, glow: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform sampler2D a;\nuniform sampler2D b;\nuniform float mixAB;\nuniform float glow;\nvarying vec2 vUv;\nvoid main() {\n  vec4 c = mix(texture2D(a, vUv), texture2D(b, vUv), mixAB);\n  gl_FragColor = vec4(c.rgb * glow, 1.0);\n  #include <colorspace_fragment>\n}',
      toneMapped: false,
    });
  }, [maps]);

  const shown = useRef(0);
  useEffect(() => {
    if (shown.current === screen) return;
    material.uniforms.a!.value = maps[shown.current];
    material.uniforms.b!.value = maps[screen];
    material.uniforms.mixAB!.value = 0;
    shown.current = screen;
  }, [screen, maps, material]);

  useFrame((_, dt) => {
    const u = material.uniforms.mixAB!;
    if (u.value < 1) u.value = Math.min(1, u.value + dt * 3);
  });
  return material;
}

function Laptop({ progress, screen }: { progress: MutableRefObject<number>; screen: number }) {
  const { nodes, materials } = useGLTF(MODEL) as unknown as { nodes: Nodes; materials: Materials };
  const screenMaterial = useScreenMaterial(screen);
  // Aluminio plateado de verdad: metal pulido que refleja el entorno de luces.
  useMemo(() => {
    const al = materials.aluminium;
    if (al) {
      al.color.set('#d9dbdf');
      al.metalness = 0.9;
      al.roughness = 0.3;
      al.envMapIntensity = 1.4;
    }
    if (materials.keys) {
      materials.keys.color.set('#0e0e10');
      materials.keys.roughness = 0.6;
    }
    if (materials.trackpad) {
      materials.trackpad.color.set('#cfd1d5');
      materials.trackpad.metalness = 0.6;
      materials.trackpad.roughness = 0.35;
    }
  }, [materials]);
  const turn = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const p = progress.current;
    const open = ease(clamp(p / OPEN_END));
    const t = ease(clamp((p - OPEN_END) / (TURN_END - OPEN_END)));
    const k = 1 - Math.pow(0.0005, dt); // amortiguado, independiente de los fps
    if (lid.current) lid.current.rotation.x = THREE.MathUtils.lerp(lid.current.rotation.x, LID_CLOSED + (LID_OPEN - LID_CLOSED) * open, k);
    if (turn.current) {
      const g = turn.current;
      const idle = Math.sin(state.clock.elapsedTime / 2) * 0.015;
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, (Math.PI / 4) * (1 - t) + idle, k);
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0.42 - 0.3 * t, k);
      g.position.y = THREE.MathUtils.lerp(g.position.y, -0.9 - 1 * t, k);
      const s = 0.9 + 0.1 * t + 0.14 * ease(clamp((p - TURN_END) / (1 - TURN_END)));
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, s, k));
    }
    // La pantalla se enciende al abrirse la tapa.
    screenMaterial.uniforms.glow!.value = 0.15 + 0.85 * open;
  });

  return (
    <group rotation={[0, Math.PI, 0]}>
      <group ref={turn} dispose={null}>
        <group ref={lid} rotation-x={LID_CLOSED} position={[0, -0.04, 0.41]}>
          <group position={[0, 2.96, -0.13]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={materials.aluminium} geometry={nodes.Cube008!.geometry} />
            <mesh material={materials['matte.001']} geometry={nodes.Cube008_1!.geometry} />
            <mesh material={screenMaterial} geometry={nodes.Cube008_2!.geometry} />
          </group>
        </group>
        <mesh material={materials.keys} geometry={nodes.keyboard!.geometry} position={[1.79, 0, 3.45]} />
        <group position={[0, -0.1, 3.39]}>
          <mesh material={materials.aluminium} geometry={nodes.Cube002!.geometry} />
          <mesh material={materials.trackpad} geometry={nodes.Cube002_1!.geometry} />
        </group>
        <mesh material={materials.touchbar} geometry={nodes.touchbar!.geometry} position={[0, -0.03, 1.2]} />
      </group>
    </group>
  );
}

/** En pantallas estrechas la cámara se aleja para que el portátil quepa a lo ancho. */
function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    camera.position.set(0, 0, -Math.max(21, 24 / aspect));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

/** Lienzo WebGL. Solo pinta mientras la sección está en pantalla. */
export default function Mac3D({ progress, screen, active }: { progress: MutableRefObject<number>; screen: number; active: boolean }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, -21], fov: 30 }} frameloop={active ? 'always' : 'never'} gl={{ antialias: true, alpha: true }} aria-hidden>
      <CameraRig />
      <ambientLight intensity={0.6} />
      <spotLight position={[-10, 14, -12]} angle={0.45} penumbra={1} intensity={120} />
      <spotLight position={[12, 8, -10]} angle={0.5} penumbra={1} intensity={60} color="#cfe1ff" />
      <Suspense fallback={null}>
        <Laptop progress={progress} screen={screen} />
        <Environment resolution={256}>
          <color attach="background" args={['#1a1c22']} />
          <Lightformer form="rect" intensity={6} position={[0, 8, -6]} rotation-x={Math.PI / 2} scale={[20, 8, 1]} />
          <Lightformer form="rect" intensity={4} position={[0, 2, -12]} scale={[18, 6, 1]} />
          <Lightformer form="rect" intensity={3} position={[-10, 2, 0]} rotation-y={Math.PI / 2} scale={[14, 6, 1]} />
          <Lightformer form="rect" intensity={3} position={[10, 2, 0]} rotation-y={-Math.PI / 2} scale={[14, 6, 1]} color="#cfe1ff" />
          <Lightformer form="rect" intensity={2} position={[0, 4, 10]} scale={[18, 6, 1]} />
        </Environment>
      </Suspense>
      <ContactShadows position={[0, -4.3, 0]} opacity={0.55} scale={22} blur={2.2} far={6} />
    </Canvas>
  );
}

useGLTF.preload(MODEL);
