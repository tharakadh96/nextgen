import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Station } from './types';

const YELLOW = '#ffcc00';

// ── Animated status LED ──────────────────────────────────────────────
function StatusLED({ color, isBusy, isCompleted, isWarning }: { color: string; isBusy: boolean; isCompleted: boolean; isWarning: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock: { elapsedTime: t } }) => {
    const mat = ref.current?.material as THREE.MeshStandardMaterial | undefined;
    if (!mat) return;
    if (isWarning) {
      const on = Math.sin(t * 8) > 0;
      mat.color.set(on ? YELLOW : '#553300');
      mat.emissive.set(on ? YELLOW : '#000000');
      mat.emissiveIntensity = on ? 1.2 : 0;
    } else {
      mat.color.set(color);
      mat.emissive.set(color);
      mat.emissiveIntensity = isCompleted ? 0.5 + Math.sin(t * 5) * 0.45 : isBusy ? 0.5 + Math.sin(t * 2) * 0.12 : 0.15;
    }
  });
  return (
    <mesh ref={ref} position={[-0.72, 0.13, 0.49]}>
      <sphereGeometry args={[0.032, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.2} />
    </mesh>
  );
}

// ── Animated monitor screen ──────────────────────────────────────────
function ScreenPanel({ color, isBusy, isCompleted, isWarning }: { color: string; isBusy: boolean; isCompleted: boolean; isWarning: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock: { elapsedTime: t } }) => {
    const mat = ref.current?.material as THREE.MeshStandardMaterial | undefined;
    if (!mat) return;
    if (isWarning) {
      const on = Math.sin(t * 8) > 0;
      mat.color.set(on ? '#332200' : '#001525');
      mat.emissive.set(on ? YELLOW : '#000000');
      mat.emissiveIntensity = on ? 0.7 : 0;
    } else if (isBusy) {
      mat.emissiveIntensity = 0.55 + Math.sin(t * 0.7) * 0.08;
    } else if (isCompleted) {
      mat.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.15;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0.87, -0.09]}>
      <boxGeometry args={[1.5, 0.82, 0.01]} />
      <meshStandardMaterial
        color={isBusy ? '#0a0e1a' : isCompleted ? '#300010' : '#080c18'}
        emissive={isBusy || isCompleted ? color : '#69daff'}
        emissiveIntensity={isBusy ? 0.55 : isCompleted ? 0.6 : 0.06}
        roughness={0.05}
        metalness={0.1}
      />
    </mesh>
  );
}

// ── Sitting person ───────────────────────────────────────────────────
function SittingPerson({ accent, visible }: { accent: string; visible: boolean }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!ref.current) return;
    // Drop in from above when session starts, float up when it ends
    const targetY = visible ? 0 : 2.5;
    ref.current.position.y += (targetY - ref.current.position.y) * 0.1;
    ref.current.visible = ref.current.position.y < 2.2;
  });

  const skin   = '#c8906a';
  const shirt  = accent;
  const pants  = '#1a2845';
  const shoes  = '#0a1020';

  return (
    <group ref={ref} position={[0, 2.5, 0]}>
      {/* Head */}
      <mesh position={[0, 0.68, 0.88]}>
        <boxGeometry args={[0.17, 0.19, 0.17]} />
        <meshStandardMaterial color={skin} roughness={0.75} />
      </mesh>

      {/* Torso — leaning forward slightly */}
      <mesh position={[0, 0.34, 0.95]} rotation={[0.28, 0, 0]}>
        <boxGeometry args={[0.27, 0.38, 0.17]} />
        <meshStandardMaterial color={shirt} roughness={0.65} />
      </mesh>

      {/* Thighs — horizontal, from hip to knee */}
      {([-0.1, 0.1] as const).map(x => (
        <mesh key={x} position={[x, 0.0, 0.80]}>
          <boxGeometry args={[0.09, 0.09, 0.46]} />
          <meshStandardMaterial color={pants} roughness={0.7} />
        </mesh>
      ))}

      {/* Lower legs — hanging down from knee */}
      {([-0.1, 0.1] as const).map(x => (
        <mesh key={x} position={[x, -0.28, 0.58]}>
          <boxGeometry args={[0.08, 0.44, 0.08]} />
          <meshStandardMaterial color={pants} roughness={0.7} />
        </mesh>
      ))}

      {/* Shoes */}
      {([-0.1, 0.1] as const).map(x => (
        <mesh key={x} position={[x, -0.51, 0.62]}>
          <boxGeometry args={[0.1, 0.06, 0.16]} />
          <meshStandardMaterial color={shoes} roughness={0.6} />
        </mesh>
      ))}

      {/* Upper arms */}
      {([-0.2, 0.2] as const).map(x => (
        <mesh key={x} position={[x, 0.28, 0.84]} rotation={[0.55, 0, x < 0 ? -0.1 : 0.1]}>
          <boxGeometry args={[0.07, 0.07, 0.26]} />
          <meshStandardMaterial color={shirt} roughness={0.65} />
        </mesh>
      ))}

      {/* Forearms — reaching to keyboard */}
      {([-0.2, 0.2] as const).map(x => (
        <mesh key={x} position={[x, 0.13, 0.52]} rotation={[1.1, 0, x < 0 ? -0.08 : 0.08]}>
          <boxGeometry args={[0.065, 0.065, 0.26]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ── Single gaming station ────────────────────────────────────────────
function GamingStation({
  station,
  position,
  onClick,
  isSelected,
}: {
  station: Station;
  position: [number, number, number];
  onClick: () => void;
  isSelected: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const deskRef = useRef<THREE.Mesh>(null);

  const isPS5 = station.type === 'PS5';
  const isBusy = station.status === 'busy';
  const isCompleted = station.status === 'completed';
  const isWarning = isBusy && (station.remainingSeconds ?? Infinity) <= 300;
  const accent = isCompleted ? '#ef4444' : isPS5 ? '#69daff' : '#8197ff';
  const lit = hovered || isSelected;

  const onOver = () => { document.body.style.cursor = 'pointer'; setHovered(true); };
  const onOut  = () => { document.body.style.cursor = 'default'; setHovered(false); };
  const interact = { onClick, onPointerOver: onOver, onPointerOut: onOut };

  useFrame(({ clock: { elapsedTime: t } }) => {
    const mat = deskRef.current?.material as THREE.MeshStandardMaterial | undefined;
    if (!mat) return;
    if (isWarning) {
      const on = Math.sin(t * 8) > 0;
      mat.color.set(on ? '#443300' : lit ? '#1c2d4a' : '#0e1a30');
      mat.emissive.set(on ? YELLOW : '#000000');
      mat.emissiveIntensity = on ? 0.35 : 0;
    } else {
      mat.color.set(lit ? '#1c2d4a' : '#0e1a30');
      mat.emissive.set('#000000');
      mat.emissiveIntensity = 0;
    }
  });

  return (
    <group position={position}>
      {/* Selection ring */}
      {lit && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.74, 0]}>
          <ringGeometry args={[1.25, 1.34, 40]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7}
            transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Desk surface */}
      <mesh ref={deskRef} position={[0, 0.04, 0]} castShadow receiveShadow {...interact}>
        <boxGeometry args={[2.2, 0.08, 1.1]} />
        <meshStandardMaterial color={lit ? '#1c2d4a' : '#0e1a30'} roughness={0.45} metalness={0.4} />
      </mesh>
      {([-0.95, 0.95] as const).flatMap(x =>
        ([-0.4, 0.4] as const).map(z => (
          <mesh key={`leg-${x}-${z}`} position={[x, -0.33, z]}>
            <boxGeometry args={[0.055, 0.74, 0.055]} />
            <meshStandardMaterial color="#040810" roughness={0.8} />
          </mesh>
        ))
      )}

      {/* Monitor stand base + column */}
      <mesh position={[0, 0.12, -0.15]}>
        <boxGeometry args={[0.28, 0.04, 0.22]} />
        <meshStandardMaterial color="#050a14" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.44, -0.15]}>
        <boxGeometry args={[0.055, 0.64, 0.055]} />
        <meshStandardMaterial color="#050a14" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Monitor bezel */}
      <mesh position={[0, 0.87, -0.15]} castShadow {...interact}>
        <boxGeometry args={[1.62, 0.93, 0.07]} />
        <meshStandardMaterial color="#030710" roughness={0.15} metalness={0.85} />
      </mesh>

      {/* Animated screen */}
      <ScreenPanel color={accent} isBusy={isBusy} isCompleted={isCompleted} isWarning={isWarning} />

      {/* Screen glow — yellow tinted when warning */}
      {(isBusy || isCompleted) && (
        <pointLight position={[0, 0.87, 0.35]} color={isWarning ? YELLOW : accent}
          intensity={isCompleted ? 2.0 : 1.4} distance={4.5} />
      )}

      {/* Extra yellow flood light while warning is active */}
      {isWarning && (
        <pointLight position={[0, 1.2, 0.5]} color={YELLOW} intensity={2.5} distance={5.5} />
      )}

      {/* Console — PS5 tower vs PS4 slab */}
      {isPS5 ? (
        // PS5: tall white-wing tower with black center spine and blue LED
        <group position={[0.74, 0.08, 0.08]}>
          {/* Center black spine */}
          <mesh position={[0, 0.24, 0]} castShadow>
            <boxGeometry args={[0.10, 0.48, 0.46]} />
            <meshStandardMaterial color="#07070f" roughness={0.2} metalness={0.55} />
          </mesh>
          {/* Left white wing panel */}
          <mesh position={[-0.09, 0.26, 0]} castShadow>
            <boxGeometry args={[0.07, 0.52, 0.48]} />
            <meshStandardMaterial color="#eaedf6" roughness={0.12} metalness={0.04} />
          </mesh>
          {/* Right white wing panel */}
          <mesh position={[0.09, 0.26, 0]} castShadow>
            <boxGeometry args={[0.07, 0.52, 0.48]} />
            <meshStandardMaterial color="#dde0ea" roughness={0.12} metalness={0.04} />
          </mesh>
          {/* Green vertical LED strip on front */}
          <mesh position={[0, 0.26, 0.235]}>
            <boxGeometry args={[0.007, 0.38, 0.003]} />
            <meshStandardMaterial color="#00ee88" emissive="#00ee88" emissiveIntensity={3.5} />
          </mesh>
          {/* Green point glow from LED */}
          <pointLight position={[0, 0.26, 0.28]} color="#00ee88" intensity={0.6} distance={1.2} />
          {/* Disc slot */}
          <mesh position={[0.03, 0.09, 0.236]}>
            <boxGeometry args={[0.085, 0.005, 0.003]} />
            <meshStandardMaterial color="#030305" />
          </mesh>
          {/* USB port */}
          <mesh position={[0, 0.36, 0.236]}>
            <boxGeometry args={[0.024, 0.011, 0.003]} />
            <meshStandardMaterial color="#0a0a18" roughness={0.4} />
          </mesh>
        </group>
      ) : (
        // PS4: wide flat dark parallelogram slab
        <group position={[0.74, 0.08, 0.1]}>
          {/* Lower body — thick matte base */}
          <mesh position={[0, 0.033, 0]} castShadow>
            <boxGeometry args={[0.46, 0.055, 0.32]} />
            <meshStandardMaterial color="#0f0f1a" roughness={0.6} metalness={0.25} />
          </mesh>
          {/* Upper body — thinner, offset to create the angled parallelogram look */}
          <mesh position={[0.018, 0.076, 0]} rotation={[0, 0, 0.09]} castShadow>
            <boxGeometry args={[0.44, 0.038, 0.30]} />
            <meshStandardMaterial color="#1c1c2e" roughness={0.3} metalness={0.5} />
          </mesh>
          {/* Disc slot line on front face */}
          <mesh position={[0.02, 0.068, 0.163]}>
            <boxGeometry args={[0.20, 0.005, 0.003]} />
            <meshStandardMaterial color="#050508" />
          </mesh>
          {/* Power LED — green dot */}
          <mesh position={[-0.17, 0.058, 0.163]}>
            <sphereGeometry args={[0.009, 8, 8]} />
            <meshStandardMaterial color="#33ee88" emissive="#33ee88" emissiveIntensity={1.8} />
          </mesh>
          {/* USB ports slot */}
          <mesh position={[0.16, 0.058, 0.163]}>
            <boxGeometry args={[0.038, 0.012, 0.003]} />
            <meshStandardMaterial color="#080810" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Keyboard */}
      <mesh position={[0, 0.1, 0.28]}>
        <boxGeometry args={[1.05, 0.024, 0.34]} />
        <meshStandardMaterial color="#050a14" roughness={0.65} metalness={0.3} />
      </mesh>

      {/* Chair — seat + back + legs */}
      <mesh position={[0, -0.07, 1.0]}>
        <boxGeometry args={[0.84, 0.06, 0.75]} />
        <meshStandardMaterial color="#182e52" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.38, 1.32]}>
        <boxGeometry args={[0.84, 0.84, 0.055]} />
        <meshStandardMaterial color="#182e52" roughness={0.7} />
      </mesh>
      {([-0.34, 0.34] as const).flatMap(x =>
        ([0.72, 1.24] as const).map(z => (
          <mesh key={`cleg-${x}-${z}`} position={[x, -0.43, z]}>
            <boxGeometry args={[0.04, 0.67, 0.04]} />
            <meshStandardMaterial color="#040810" />
          </mesh>
        ))
      )}

      {/* Sitting person */}
      <SittingPerson accent={accent} visible={isBusy || isCompleted} />

      {/* Status LED */}
      <StatusLED color={accent} isBusy={isBusy} isCompleted={isCompleted} isWarning={isWarning} />

      {/* Time-over warning popup (session completed, payment due) */}
      {isCompleted && (
        <Html position={[0, 2.3, -0.15]} center distanceFactor={9} zIndexRange={[50, 0]}>
          <div style={{
            background: 'rgba(55, 4, 4, 0.96)',
            border: '2px solid #ef4444',
            borderRadius: '3px',
            padding: '7px 16px',
            textAlign: 'center',
            boxShadow: '0 0 28px #ef444466',
            animation: 'warnpulse 0.85s ease-in-out infinite',
            pointerEvents: 'none',
          }}>
            <style>{`@keyframes warnpulse{0%,100%{opacity:1;box-shadow:0 0 28px #ef444466}50%{opacity:.72;box-shadow:0 0 48px #ef4444aa}}`}</style>
            <div style={{ fontSize: '22px', lineHeight: 1, filter: 'drop-shadow(0 0 6px #ef4444)' }}>⚠</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '8px', color: '#ff8888', letterSpacing: '0.14em', marginTop: '3px' }}>
              SESSION OVER
            </div>
          </div>
        </Html>
      )}

      {/* Floating HTML label */}
      <Html position={[0, 1.62, -0.15]} center distanceFactor={9} zIndexRange={[50, 0]}>
        <div
          onClick={onClick}
          style={{
            background: 'rgba(1, 8, 26, 0.92)',
            border: `1px solid ${isWarning ? YELLOW + '88' : accent + '55'}`,
            padding: '5px 11px',
            cursor: 'pointer',
            userSelect: 'none',
            textAlign: 'center',
            backdropFilter: 'blur(6px)',
            boxShadow: `0 0 16px ${isWarning ? YELLOW + '44' : accent + '28'}`,
            minWidth: '84px',
          }}
        >
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '10px', fontWeight: 700,
            color: isWarning ? YELLOW : accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {station.id}
          </div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '9px', fontWeight: 700, marginTop: '2px',
            color: isWarning ? YELLOW : (isBusy || isCompleted ? '#ef4444' : `${accent}80`) }}>
            {isWarning
              ? `⚡ ${station.remainingTime ?? 'ENDING'}`
              : isBusy ? (station.remainingTime ?? 'ACTIVE')
              : isCompleted ? 'PAY_DUE'
              : 'READY'}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ── Ceiling light fixture ────────────────────────────────────────────
function CeilingLight({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.5, 0.07, 0.5]} />
        <meshStandardMaterial color="#cccccc" emissive="#A7F2B8" emissiveIntensity={0.7} />
      </mesh>
      <pointLight color="#ffffff" intensity={10} distance={14} castShadow shadow-mapSize-width={512} shadow-mapSize-height={512} />
    </group>
  );
}

// ── Cafe room geometry ───────────────────────────────────────────────
function CafeRoom() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0]} receiveShadow>
        <planeGeometry args={[28, 24]} />
        <meshStandardMaterial color="#0d2214" roughness={0.8} metalness={0.15} />
      </mesh>
      <gridHelper args={[28, 28, '#1a3060', '#0e1a30']} position={[0, -0.745, 0]} />

      {/* Walls */}
      <mesh position={[0, 2.5, -9]} receiveShadow>
        <planeGeometry args={[28, 8]} />
        <meshStandardMaterial color="#0a1f0d" roughness={0.85} />
      </mesh>
      <mesh position={[-12, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[24, 8]} />
        <meshStandardMaterial color="#0a1f0d" roughness={0.85} />
      </mesh>
      <mesh position={[12, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[24, 8]} />
        <meshStandardMaterial color="#0a1f0d" roughness={0.85} />
      </mesh>

      {/* Neon accent strip on back wall */}
      <mesh position={[0, 4.3, -8.95]}>
        <boxGeometry args={[20, 0.06, 0.06]} />
        <meshStandardMaterial color="#A7F2B8" emissive="#A7F2B8" emissiveIntensity={2.0} />
      </mesh>
      <pointLight position={[0, 4.3, -8.7]} color="#A7F2B8" intensity={2.5} distance={10} />
    </>
  );
}

// ── Main scene ───────────────────────────────────────────────────────
export default function CafeScene({
  stations,
  onSelectStation,
  selectedStationId,
}: {
  stations: Station[];
  onSelectStation: (s: Station) => void;
  selectedStationId?: string | null;
}) {
  const ps5 = stations.filter(s => s.type === 'PS5');
  const ps4 = stations.filter(s => s.type === 'PS4');
  const other = stations.filter(s => s.type !== 'PS5' && s.type !== 'PS4');

  function row(list: Station[], z: number): { station: Station; pos: [number, number, number] }[] {
    const spacing = 3.2;
    const startX = -((list.length - 1) * spacing) / 2;
    return list.map((s, i) => ({ station: s, pos: [startX + i * spacing, 0, z] }));
  }

  const items = [
    ...row(ps5, -2.5),
    ...row(ps4, 2.3),
    ...row(other, 6.0),
  ];

  return (
    <Canvas shadows camera={{ position: [0, 9, 15], fov: 46 }} gl={{ antialias: true, alpha: false }}>
      <color attach="background" args={['#0c0e17']} />
      <ambientLight intensity={3.0} color="#ffffff" />
      <hemisphereLight args={['#69daff', '#1a3060', 1.5]} />
      <directionalLight position={[0, 12, 6]} intensity={2.0} color="#ffffff" castShadow />

      {[-5.5, 0, 5.5].flatMap(x =>
        [-1.5, 2.5].map(z => <CeilingLight key={`cl-${x}-${z}`} position={[x, 4.6, z]} />)
      )}

      <CafeRoom />

      {items.map(({ station, pos }) => (
        <GamingStation
          key={station.id}
          station={station}
          position={pos}
          onClick={() => onSelectStation(station)}
          isSelected={selectedStationId === station.id}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={7}
        maxDistance={24}
        target={[0, 0, 0]}
        makeDefault
      />
    </Canvas>
  );
}
