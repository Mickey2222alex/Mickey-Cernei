import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, Float, Text, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Ball, Player, Team, DEFAULT_CONFIG } from '../game/types';

interface SoccerField3DProps {
  ballRef: React.RefObject<Ball>;
  playersRef: React.RefObject<Player[]>;
  score: { [key in Team]: number };
  timeLeft: number;
  controlledPlayerId: string | null;
}

const CameraFollow: React.FC<{ ballRef: React.RefObject<Ball>; controlledPlayerId: string | null; playersRef: React.RefObject<Player[]> }> = ({ ballRef, controlledPlayerId, playersRef }) => {
  const { camera } = useThree();
  const vec = new THREE.Vector3();
  const targetVec = new THREE.Vector3();

  useFrame((state) => {
    const ball = ballRef.current;
    if (!ball) return;

    // Broadcast Camera Style (FIFA/FC26)
    // Follows the ball's X position, but stays on the side (Z axis)
    const ballX = (ball.pos.x - DEFAULT_CONFIG.fieldWidth / 2) / 10;
    const ballZ = (ball.pos.y - DEFAULT_CONFIG.fieldHeight / 2) / 10;

    // Camera stays at a fixed height and Z distance, but slides along X
    const camHeight = 50;
    const camZDist = 70;
    
    // Smoothly follow ball X with some damping
    const targetX = ballX * 0.7; 
    const targetZ = camZDist + Math.abs(ballX) * 0.05; 
    
    vec.set(targetX, camHeight, targetZ);
    camera.position.lerp(vec, 0.05);

    // Look at a point between the ball and the center to keep perspective
    targetVec.set(ballX, 0, ballZ * 0.5);
    camera.lookAt(targetVec);
  });

  return null;
};

const Ball3D: React.FC<{ ballRef: React.RefObject<Ball> }> = ({ ballRef }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const ball = ballRef.current;
    if (meshRef.current && ball) {
      const x = ball.pos.x - DEFAULT_CONFIG.fieldWidth / 2;
      const z = ball.pos.y - DEFAULT_CONFIG.fieldHeight / 2;
      meshRef.current.position.set(x / 10, 0.8, z / 10);
      
      meshRef.current.rotation.x += ball.vel.y / 10;
      meshRef.current.rotation.z -= ball.vel.x / 10;

      if (shadowRef.current) {
        shadowRef.current.position.set(x / 10, 0.01, z / 10);
      }
    }
  });

  return (
    <group>
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial color="white" roughness={0.1} metalness={0.1} />
      </mesh>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshStandardMaterial color="black" transparent opacity={0.2} />
      </mesh>
    </group>
  );
};

const Player3D: React.FC<{ player: Player; playersRef: React.RefObject<Player[]> }> = ({ player, playersRef }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const players = playersRef.current;
    if (groupRef.current && players) {
      const p = players.find(pl => pl.id === player.id);
      if (p) {
        const x = p.pos.x - DEFAULT_CONFIG.fieldWidth / 2;
        const z = p.pos.y - DEFAULT_CONFIG.fieldHeight / 2;
        groupRef.current.position.set(x / 10, 1.5, z / 10);
        groupRef.current.rotation.y = -p.angle;
      }
    }
  });

  const bodyColor = player.team === Team.RED ? '#ef4444' : '#3b82f6';
  const skinColor = player.customization?.skinColor || "#ffdbac";
  const isUser = !player.isAI;

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[1.2, 2, 4, 8]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      
      {/* Player Name */}
      <Text
        position={[0, 5, 0]}
        fontSize={1}
        color="white"
        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf"
      >
        {player.customization?.name || (player.isGK ? 'GK' : 'Player')}
      </Text>
      
      {/* Jersey Number Text */}
      {player.customization?.jerseyNumber && (
        <Text
          position={[0, 1.5, 1.3]}
          fontSize={0.8}
          color="white"
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf"
        >
          {player.customization.jerseyNumber}
        </Text>
      )}

      {/* Direction Indicator (Eyes/Face) */}
      <mesh position={[0.5, 2.3, 0.4]} rotation={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0.5, 2.3, -0.4]} rotation={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>

      {/* User Indicator */}
      {isUser && (
        <Float speed={5} rotationIntensity={0.5} floatIntensity={0.5}>
          <mesh position={[0, 4, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.5, 1, 4]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2} />
          </mesh>
        </Float>
      )}

      {/* Stamina Bar in 3D */}
      <group position={[0, 3.5, 0]}>
        <mesh>
          <planeGeometry args={[2, 0.2]} />
          <meshBasicMaterial color="black" transparent opacity={0.5} />
        </mesh>
        <mesh position={[-(1 - player.stamina / 100), 0, 0.01]}>
          <planeGeometry args={[(player.stamina / 100) * 2, 0.2]} />
          <meshBasicMaterial color={player.stamina > 30 ? "#22c55e" : "#ef4444"} />
        </mesh>
      </group>
    </group>
  );
};

const Stadium: React.FC = () => {
  const width = DEFAULT_CONFIG.fieldWidth / 10;
  const height = DEFAULT_CONFIG.fieldHeight / 10;

  return (
    <group>
      {/* Stands - North */}
      <mesh position={[0, 10, -height / 2 - 25]}>
        <boxGeometry args={[width + 60, 30, 20]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Crowd - North */}
      <mesh position={[0, 15, -height / 2 - 16]} rotation={[-Math.PI / 4, 0, 0]}>
        <planeGeometry args={[width + 50, 20]} />
        <meshStandardMaterial color="#333" roughness={1} />
      </mesh>

      {/* Stands - South */}
      <mesh position={[0, 10, height / 2 + 25]}>
        <boxGeometry args={[width + 60, 30, 20]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Crowd - South */}
      <mesh position={[0, 15, height / 2 + 16]} rotation={[Math.PI / 4, 0, 0]}>
        <planeGeometry args={[width + 50, 20]} />
        <meshStandardMaterial color="#333" roughness={1} />
      </mesh>

      {/* Stands - East */}
      <mesh position={[width / 2 + 25, 10, 0]}>
        <boxGeometry args={[20, 30, height + 60]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Stands - West */}
      <mesh position={[-width / 2 - 25, 10, 0]}>
        <boxGeometry args={[20, 30, height + 60]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* Floodlights */}
      <Floodlight position={[-width / 2 - 20, 0, -height / 2 - 20]} />
      <Floodlight position={[width / 2 + 20, 0, -height / 2 - 20]} />
      <Floodlight position={[-width / 2 - 20, 0, height / 2 + 20]} />
      <Floodlight position={[width / 2 + 20, 0, height / 2 + 20]} />
    </group>
  );
};

const Floodlight: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      <mesh position={[0, 25, 0]}>
        <cylinderGeometry args={[0.5, 0.8, 50]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[0, 50, 0]}>
        <boxGeometry args={[5, 3, 2]} />
        <meshStandardMaterial color="#444" emissive="#fff" emissiveIntensity={2} />
      </mesh>
      <spotLight 
        position={[0, 50, 0]} 
        target-position={[0, 0, 0]} 
        intensity={5} 
        angle={0.6} 
        penumbra={0.5} 
        castShadow 
      />
    </group>
  );
};

const Field: React.FC = () => {
  const width = DEFAULT_CONFIG.fieldWidth / 10;
  const height = DEFAULT_CONFIG.fieldHeight / 10;

  return (
    <group>
      {/* Grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 100, height + 100]} />
        <meshStandardMaterial color="#1a3a16" />
      </mesh>
      
      {/* Pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>

      {/* Pitch Lines (Manual) */}
      {/* Outer Boundary */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0, 0.5, 4]} />
        <meshBasicMaterial color="white" />
      </mesh>
      
      {/* Center Line */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, height]} />
        <meshBasicMaterial color="white" />
      </mesh>

      {/* Sidelines */}
      <mesh position={[0, 0.02, height / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.5]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[0, 0.02, -height / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.5]} />
        <meshBasicMaterial color="white" />
      </mesh>

      {/* Endlines */}
      <mesh position={[width / 2, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, height]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[-width / 2, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, height]} />
        <meshBasicMaterial color="white" />
      </mesh>
      
      {/* Center Circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[15.5, 16, 64]} />
        <meshBasicMaterial color="white" transparent opacity={0.8} />
      </mesh>

      {/* Penalty Areas */}
      <PenaltyArea side="left" />
      <PenaltyArea side="right" />

      {/* Goals */}
      <Goal side="left" />
      <Goal side="right" />
    </group>
  );
};

const PenaltyArea: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const width = 30;
  const height = 60;
  const x = side === 'left' ? -DEFAULT_CONFIG.fieldWidth / 20 + width / 2 : DEFAULT_CONFIG.fieldWidth / 20 - width / 2;

  return (
    <group position={[x, 0.02, 0]}>
       <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0, 0.5, 4]} />
          <meshBasicMaterial color="white" />
       </mesh>
       {/* Box Lines */}
       <mesh position={[side === 'left' ? width / 2 : -width / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, height]} />
          <meshBasicMaterial color="white" />
       </mesh>
       <mesh position={[0, 0, height / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, 0.5]} />
          <meshBasicMaterial color="white" />
       </mesh>
       <mesh position={[0, 0, -height / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, 0.5]} />
          <meshBasicMaterial color="white" />
       </mesh>
    </group>
  );
};

const Goal: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const x = side === 'left' ? -DEFAULT_CONFIG.fieldWidth / 20 : DEFAULT_CONFIG.fieldWidth / 20;
  const goalWidth = DEFAULT_CONFIG.goalWidth / 10;
  
  return (
    <group position={[x, 0, 0]}>
      {/* Posts */}
      <mesh position={[0, 5, -goalWidth / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 10]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0, 5, goalWidth / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 10]} />
        <meshStandardMaterial color="white" />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, 10, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, goalWidth]} />
        <meshStandardMaterial color="white" />
      </mesh>
      {/* Net (simplified) */}
      <mesh position={[side === 'left' ? -2.5 : 2.5, 5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[goalWidth, 10]} />
        <meshStandardMaterial color="white" transparent opacity={0.2} side={THREE.DoubleSide} wireframe />
      </mesh>
    </group>
  );
};

const HUD: React.FC<{ score: { [key in Team]: number }; timeLeft: number }> = ({ score, timeLeft }) => {
  return (
    <div className="absolute top-10 left-10 pointer-events-none">
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-6 rounded-3xl">
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-500 font-black mb-1">RED TEAM</div>
            <div className="text-6xl font-black italic tracking-tighter">{score[Team.RED]}</div>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-black mb-1">TIME</div>
            <div className="text-4xl font-mono font-bold">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-blue-500 font-black mb-1">BLUE TEAM</div>
            <div className="text-6xl font-black italic tracking-tighter">{score[Team.BLUE]}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SoccerField3D: React.FC<SoccerField3DProps> = ({ ballRef, playersRef, score, timeLeft, controlledPlayerId }) => {
  // Memoize the 3D scene so it doesn't re-render when score/time changes
  const scene = React.useMemo(() => (
    <Canvas shadows dpr={[1, 2]}>
      <PerspectiveCamera makeDefault position={[0, 60, 80]} fov={45} />
      
      <CameraFollow ballRef={ballRef} controlledPlayerId={controlledPlayerId} playersRef={playersRef} />
      
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Environment preset="night" />
      
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 40, 0]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
      <spotLight 
        position={[0, 100, 0]} 
        angle={0.5} 
        penumbra={1} 
        intensity={2} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
      />

      <Field />
      <Stadium />
      <Ball3D ballRef={ballRef} />
      {playersRef.current?.map(player => (
        <Player3D key={player.id} player={player} playersRef={playersRef} />
      ))}

      <ContactShadows 
        position={[0, 0, 0]} 
        opacity={0.4} 
        scale={150} 
        blur={2} 
        far={10} 
        resolution={256} 
        color="#000000" 
      />
    </Canvas>
  ), [ballRef, playersRef, controlledPlayerId]);

  return (
    <div className="w-full h-full bg-black">
      {scene}
      <HUD score={score} timeLeft={timeLeft} />
    </div>
  );
};

export default SoccerField3D;
