import React, { useEffect, useRef, useState } from 'react';
import { Ball, GameConfig, GameState, UserRole, Player, Team, Vector, DEFAULT_CONFIG, DeviceType } from '../game/types';
import { updateBall, updatePlayer, getAIInput, dist } from '../game/engine';
import { Trophy, Play, Settings, RotateCcw, Home, Users, Zap, Shield, Target, Globe, Lock, Plus, LogIn, Share2, Copy, Check, Smartphone, Monitor, Glasses, Palette, User, ChevronRight, ChevronLeft, Download, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { io, Socket } from 'socket.io-client';
import SoccerField3D from './SoccerField3D';

const SoccerGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.LANDING);
  const [deviceType, setDeviceType] = useState<DeviceType>(DeviceType.PC);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.PLAYER);
  const [score, setScore] = useState({ [Team.RED]: 0, [Team.BLUE]: 0 });
  const [playersPerTeam, setPlayersPerTeam] = useState(5);
  const [isTwoPlayer, setIsTwoPlayer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [winner, setWinner] = useState<Team | null>(null);
  const [skillPoints, setSkillPoints] = useState(5);
  const [managerSkills, setManagerSkills] = useState({
    allOutAttack: false,
    parkTheBus: false,
    staminaBoost: false
  });

  // Customization State
  const [customization, setCustomization] = useState({
    name: "Player 1",
    skinColor: "#ffdbac",
    hairColor: "#4b2c20",
    jerseyNumber: 10
  });

  // Mobile Controls State
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isMobileSprinting, setIsMobileSprinting] = useState(false);
  const [isMobileKicking, setIsMobileKicking] = useState(false);

  // Multiplayer State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [playersInRoom, setPlayersInRoom] = useState<{ [sid: string]: { name: string; team: Team; playerId?: string; isReady: boolean } }>({});
  const [playerName, setPlayerName] = useState('Player ' + Math.floor(Math.random() * 1000));
  const [matchTime, setMatchTime] = useState(180);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showMultiplayerMenu, setShowMultiplayerMenu] = useState(false);
  const [lobbyState, setLobbyState] = useState<'JOINING' | 'LOBBY'>('JOINING');
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // PWA Installation State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallInfo, setShowInstallInfo] = useState(false);

  // CHANGE THIS to your real GitHub URL after you "Export to GitHub" in Settings
  const GITHUB_URL = "https://github.com/mickeycernei/rivals-soccer";

  // State for 3D rendering (to trigger re-renders if needed, though we use refs for performance)
  const [renderTrigger, setRenderTrigger] = useState(0);

  // Game state refs for the loop
  const ballRef = useRef<Ball>({ pos: { x: 600, y: 400 }, vel: { x: 0, y: 0 }, radius: 8 });
  const playersRef = useRef<Player[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const resetPositions = () => {
    const config = DEFAULT_CONFIG;
    const numPlayers = playersPerTeam;
    
    playersRef.current.forEach((p, i) => {
      const teamIndex = i % numPlayers;
      if (p.team === Team.RED) {
        p.pos = p.isGK ? { x: 50, y: config.fieldHeight / 2 } : { x: 200 + (teamIndex * 100), y: (config.fieldHeight / (numPlayers)) * teamIndex + 50 };
        p.angle = 0;
      } else {
        p.pos = p.isGK ? { x: config.fieldWidth - 50, y: config.fieldHeight / 2 } : { x: config.fieldWidth - 200 - (teamIndex * 100), y: (config.fieldHeight / (numPlayers)) * teamIndex + 50 };
        p.angle = Math.PI;
      }
      p.vel = { x: 0, y: 0 };
      p.hasBall = false;
    });
    ballRef.current = { pos: { x: config.fieldWidth / 2, y: config.fieldHeight / 2 }, vel: { x: 0, y: 0 }, radius: config.ballRadius };
  };

  const initGame = (numPlayers: number, role: UserRole) => {
    const config = { ...DEFAULT_CONFIG, playersPerTeam: numPlayers };
    const players: Player[] = [];

    // Init Red Team (Left)
    for (let i = 0; i < numPlayers; i++) {
      const isGK = i === 0;
      players.push({
        id: `red-${i}`,
        team: Team.RED,
        pos: isGK ? { x: 50, y: config.fieldHeight / 2 } : { x: 200 + (i * 100), y: (config.fieldHeight / (numPlayers)) * i + 50 },
        vel: { x: 0, y: 0 },
        angle: 0,
        isAI: true, // Default all to AI
        isGK,
        stamina: 100,
        isSprinting: false,
        hasBall: false,
        kickPower: 0,
        playerRadius: config.playerRadius,
        skills: {
          powerShot: false,
          dribblingMaster: false,
          interception: false,
          strongTackle: false,
          speedBurst: false
        }
      });
    }

    // Init Blue Team (Right)
    for (let i = 0; i < numPlayers; i++) {
      const isGK = i === 0;
      players.push({
        id: `blue-${i}`,
        team: Team.BLUE,
        pos: isGK ? { x: config.fieldWidth - 50, y: config.fieldHeight / 2 } : { x: config.fieldWidth - 200 - (i * 100), y: (config.fieldHeight / (numPlayers)) * i + 50 },
        vel: { x: 0, y: 0 },
        angle: Math.PI,
        isAI: true,
        isGK,
        stamina: 100,
        isSprinting: false,
        hasBall: false,
        kickPower: 0,
        playerRadius: config.playerRadius,
        skills: {
          powerShot: false,
          dribblingMaster: false,
          interception: false,
          strongTackle: false,
          speedBurst: false
        }
      });
    }

    // Assign user control if role is PLAYER
    if (role === UserRole.PLAYER) {
      const redPlayer = players.find(p => p.team === Team.RED && !p.isGK);
      if (redPlayer) {
        redPlayer.isAI = false;
        redPlayer.customization = { ...customization, name: playerName || customization.name };
      }
      
      if (isTwoPlayer) {
        const bluePlayer = players.find(p => p.team === Team.BLUE && !p.isGK);
        if (bluePlayer) {
          bluePlayer.isAI = false;
          bluePlayer.customization = { ...customization, name: "Player 2" };
        }
      }
    }

    playersRef.current = players;
    ballRef.current = { pos: { x: config.fieldWidth / 2, y: config.fieldHeight / 2 }, vel: { x: 0, y: 0 }, radius: config.ballRadius };
    setScore({ [Team.RED]: 0, [Team.BLUE]: 0 });
    setTimeLeft(180);
    setGameState(GameState.PLAYING);
  };

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('room-created', (room) => {
      setRoomId(room.id);
      setIsHost(true);
      setPlayersInRoom(room.players);
      setLobbyState('LOBBY');
      setPlayersPerTeam(room.playersPerTeam);
      setMatchTime(room.matchTime);
    });

    newSocket.on('room-joined', (room) => {
      setRoomId(room.id);
      setIsHost(false);
      setPlayersInRoom(room.players);
      setLobbyState('LOBBY');
      setPlayersPerTeam(room.playersPerTeam);
      setMatchTime(room.matchTime);
    });

    newSocket.on('player-joined', ({ players }) => {
      setPlayersInRoom(players);
    });

    newSocket.on('player-left', ({ players }) => {
      setPlayersInRoom(players);
    });

    newSocket.on('slots-updated', (players) => {
      setPlayersInRoom(players);
    });

    newSocket.on('game-started', (room) => {
      playersRef.current = room.pitchPlayers;
      ballRef.current = room.ball;
      setScore(room.score);
      setTimeLeft(room.timeLeft);
      setIsMultiplayer(true);
      setGameState(GameState.PLAYING);
      setShowMultiplayerMenu(false);
    });

    newSocket.on('game-state', (state) => {
      ballRef.current = state.ball;
      playersRef.current = state.players;
      setScore(state.score);
      setTimeLeft(state.timeLeft);
    });

    newSocket.on('goal', ({ team, score }) => {
      setScore(score);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { x: team === Team.RED ? 0.8 : 0.2, y: 0.5 }
      });
    });

    newSocket.on('game-over', ({ score }) => {
      setScore(score);
      setGameState(GameState.GAME_OVER);
    });

    newSocket.on('public-rooms-updated', (rooms) => {
      setPublicRooms(rooms);
    });

    newSocket.on('error', (msg) => {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    });

    return () => {
      newSocket.close();
    };
  }, []); // Run once on mount

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallInfo(true);
    }
  };

  const createRoom = () => {
    if (socket) {
      socket.emit('create-room', { name: playerName, matchTime, playersPerTeam, isPublic: isPublicRoom });
    }
  };

  const refreshPublicRooms = () => {
    if (socket) {
      socket.emit('get-public-rooms');
    }
  };

  const joinRoom = () => {
    if (socket && joinRoomId) {
      socket.emit('join-room', { roomId: joinRoomId.toUpperCase(), name: playerName });
    }
  };

  const selectSlot = (team: Team, playerId: string) => {
    if (socket && roomId) {
      socket.emit('select-slot', { roomId, team, playerId });
    }
  };

  const startMultiplayerGame = () => {
    if (socket && roomId && isHost) {
      socket.emit('start-game', { roomId });
    }
  };

  const copyGameLink = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSkill = (playerId: string, skillKey: keyof Player['skills']) => {
    if (skillPoints <= 0) return;
    playersRef.current = playersRef.current.map(p => {
      if (p.id === playerId && !p.skills[skillKey]) {
        setSkillPoints(prev => prev - 1);
        return { ...p, skills: { ...p.skills, [skillKey]: true } };
      }
      return p;
    });
  };

  const gameLoop = (time: number) => {
    if (gameState !== GameState.PLAYING) {
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const config = { ...DEFAULT_CONFIG, playersPerTeam };
    const ball = ballRef.current;
    const players = playersRef.current;

    // Update Ball
    const scoringTeam = updateBall(ball, config);
    if (scoringTeam) {
      setScore(prev => {
        const newScore = { ...prev, [scoringTeam]: prev[scoringTeam] + 1 };
        return newScore;
      });
      setSkillPoints(prev => prev + 1); // Reward for goal
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { x: scoringTeam === Team.RED ? 0.8 : 0.2, y: 0.5 }
      });
      resetPositions();
    }

    // Update Players
    if (isMultiplayer && socket && roomId) {
      // In multiplayer, the server handles the logic
      // We just send our input for the assigned player
      const me = playersInRoom[socket.id];
      if (me && me.playerId) {
        let targetVel: Vector = { x: 0, y: 0 };
        
        if (deviceType === DeviceType.MOBILE) {
          targetVel = { x: joystickPos.x, y: joystickPos.y };
        } else {
          if (keysRef.current['w'] || keysRef.current['ArrowUp']) targetVel.y -= 1;
          if (keysRef.current['s'] || keysRef.current['ArrowDown']) targetVel.y += 1;
          if (keysRef.current['a'] || keysRef.current['ArrowLeft']) targetVel.x -= 1;
          if (keysRef.current['d'] || keysRef.current['ArrowRight']) targetVel.x += 1;
        }
        
        if (targetVel.x !== 0 || targetVel.y !== 0) {
          const mag = Math.sqrt(targetVel.x ** 2 + targetVel.y ** 2);
          targetVel.x /= mag;
          targetVel.y /= mag;
        }

        socket.emit('player-input', {
          roomId,
          targetVel,
          isSprinting: deviceType === DeviceType.MOBILE ? isMobileSprinting : (!!keysRef.current['Shift'] || !!keysRef.current['Control']),
          isKicking: deviceType === DeviceType.MOBILE ? isMobileKicking : (!!keysRef.current[' '] || !!keysRef.current['Enter'])
        });
      }
    } else {
      // Local logic
      players.forEach(player => {
        let targetVel: Vector = { x: 0, y: 0 };
        let isKicking = false;

        if (player.isAI) {
          // ... AI logic ...
          const teammates = players.filter(p => p.team === player.team && p.id !== player.id);
          const opponents = players.filter(p => p.team !== player.team);
          
          // Manager Tactics
          let tacticBoost = { x: 0, y: 0 };
          if (player.team === Team.RED) {
            if (managerSkills.allOutAttack) tacticBoost.x += 0.2;
            if (managerSkills.parkTheBus) tacticBoost.x -= 0.2;
            if (managerSkills.staminaBoost) player.stamina = Math.min(100, player.stamina + 0.1); // Extra recovery
          }

          const aiInput = getAIInput(player, ball, config, teammates, opponents);
          targetVel = { x: aiInput.targetVel.x + tacticBoost.x, y: aiInput.targetVel.y + tacticBoost.y };
          isKicking = aiInput.isKicking;
        } else {
          // User Input
          if (player.team === Team.RED) {
            if (deviceType === DeviceType.MOBILE) {
              targetVel = { x: joystickPos.x, y: joystickPos.y };
              player.isSprinting = isMobileSprinting;
              isKicking = isMobileKicking;
            } else {
              // Player 1 (Red): WASD + Space (Shift: Sprint)
              if (keysRef.current['w']) targetVel.y -= 1;
              if (keysRef.current['s']) targetVel.y += 1;
              if (keysRef.current['a']) targetVel.x -= 1;
              if (keysRef.current['d']) targetVel.x += 1;
              player.isSprinting = !!keysRef.current['Shift'];
              isKicking = !!keysRef.current[' '];
            }
          } else {
            // Player 2 (Blue): Arrow Keys + Enter (Control: Sprint)
            if (keysRef.current['ArrowUp']) targetVel.y -= 1;
            if (keysRef.current['ArrowDown']) targetVel.y += 1;
            if (keysRef.current['ArrowLeft']) targetVel.x -= 1;
            if (keysRef.current['ArrowRight']) targetVel.x += 1;
            player.isSprinting = !!keysRef.current['Control'];
            isKicking = !!keysRef.current['Enter'];
          }
          
          if (targetVel.x !== 0 || targetVel.y !== 0) {
            const mag = Math.sqrt(targetVel.x ** 2 + targetVel.y ** 2);
            targetVel.x /= mag;
            targetVel.y /= mag;
          }
        }

        updatePlayer(player, ball, config, targetVel, isKicking);
      });

      // Resolve Player-Player collisions
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const p1 = players[i];
          const p2 = players[j];
          const d = dist(p1.pos, p2.pos);
          const minDist = config.playerRadius * 2;
          if (d < minDist) {
            const overlap = minDist - d;
            const dir = { x: (p1.pos.x - p2.pos.x) / d, y: (p1.pos.y - p2.pos.y) / d };
            p1.pos.x += dir.x * overlap / 2;
            p1.pos.y += dir.y * overlap / 2;
            p2.pos.x -= dir.x * overlap / 2;
            p2.pos.y -= dir.y * overlap / 2;
          }
        }
      }
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current[e.key] = true;
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    requestRef.current = requestAnimationFrame(gameLoop);

    const timer = setInterval(() => {
      if (gameState === GameState.PLAYING) {
        setTimeLeft(prev => {
          if (prev <= 0) {
            setGameState(GameState.GAME_OVER);
            setWinner(score[Team.RED] > score[Team.BLUE] ? Team.RED : Team.BLUE);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(requestRef.current);
      clearInterval(timer);
    };
  }, [gameState, score]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] flex flex-col items-center justify-center overflow-hidden font-sans text-white selection:bg-red-500/30">
      {/* Animated Background Gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-red-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse delay-1000" />
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-8 z-[100] bg-red-500/90 backdrop-blur-md border border-red-400/50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3"
          >
            <Shield className="w-5 h-5" />
            <span className="font-bold uppercase tracking-tight">{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD */}
      {gameState === GameState.PLAYING && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-4">
          <div className="flex items-center gap-8 bg-black/40 backdrop-blur-md px-8 py-3 rounded-full border border-white/10 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="w-4 h-4 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              <span className="text-3xl font-black tracking-tighter">{score[Team.RED]}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-widest opacity-50 font-bold">Time</span>
              <span className="text-2xl font-mono font-bold">{formatTime(timeLeft)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-3xl font-black tracking-tighter">{score[Team.BLUE]}</span>
              <div className="w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setGameState(GameState.SKILL_TREE)}
              className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/50 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2"
            >
              <Trophy className="w-3 h-3" />
              Skill Tree ({skillPoints} pts)
            </button>
            {userRole === UserRole.MANAGER && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setManagerSkills(prev => ({ ...prev, allOutAttack: !prev.allOutAttack, parkTheBus: false }))}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${managerSkills.allOutAttack ? 'bg-red-500 border-red-400' : 'bg-white/5 border-white/10'}`}
                >
                  All Out Attack
                </button>
                <button 
                  onClick={() => setManagerSkills(prev => ({ ...prev, parkTheBus: !prev.parkTheBus, allOutAttack: false }))}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${managerSkills.parkTheBus ? 'bg-blue-500 border-blue-400' : 'bg-white/5 border-white/10'}`}
                >
                  Park The Bus
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Stage */}
      <div className="relative w-full h-full group">
        {gameState === GameState.PLAYING ? (
          <SoccerField3D 
            ballRef={ballRef} 
            playersRef={playersRef} 
            score={score}
            timeLeft={timeLeft}
            controlledPlayerId={(() => {
              if (userRole === UserRole.MANAGER) return null;
              if (isMultiplayer) {
                return socket ? playersInRoom[socket.id]?.playerId || null : null;
              } else {
                return playersRef.current.find(p => !p.isAI && p.team === Team.RED)?.id || null;
              }
            })()}
          />
        ) : (
          <div className="w-full h-full bg-[#050505] flex items-center justify-center">
             <div className="text-white/10 text-9xl font-black italic uppercase tracking-tighter opacity-20">Rivals</div>
          </div>
        )}
        
        {gameState === GameState.PLAYING && (
          <>
            <div className="absolute bottom-10 left-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xl p-6 rounded-3xl border border-white/10 text-xs space-y-2">
              <div className="flex items-center gap-2 text-red-400 font-black uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                P1: {deviceType === DeviceType.PC ? 'WASD + Space' : 'Joystick + Buttons'}
              </div>
              {isTwoPlayer && (
                <div className="flex items-center gap-2 text-blue-400 font-black uppercase tracking-widest">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  P2: Arrows + Enter
                </div>
              )}
              {userRole === UserRole.MANAGER && <p className="text-white/40 font-bold uppercase tracking-tighter">Manager Mode Active: Direct Tactics Above</p>}
            </div>

            {/* Mobile Controls Overlay */}
            {deviceType === DeviceType.MOBILE && userRole === UserRole.PLAYER && (
              <div className="absolute inset-0 z-30 pointer-events-none">
                {/* Joystick Area */}
                <div className="absolute bottom-12 left-12 w-48 h-48 bg-white/5 backdrop-blur-md rounded-full border border-white/10 pointer-events-auto flex items-center justify-center">
                  <motion.div
                    drag
                    dragConstraints={{ left: -60, right: 60, top: -60, bottom: 60 }}
                    dragElastic={0}
                    onDrag={(_, info) => {
                      const x = info.offset.x / 60;
                      const y = info.offset.y / 60;
                      setJoystickPos({ x, y });
                    }}
                    onDragEnd={() => setJoystickPos({ x: 0, y: 0 })}
                    className="w-16 h-16 bg-red-500 rounded-full shadow-2xl shadow-red-500/50 cursor-grab active:cursor-grabbing"
                  />
                </div>

                {/* Action Buttons */}
                <div className="absolute bottom-12 right-12 flex flex-col gap-6 pointer-events-auto">
                   <button
                    onTouchStart={() => setIsMobileSprinting(true)}
                    onTouchEnd={() => setIsMobileSprinting(false)}
                    className={`w-24 h-24 rounded-full flex items-center justify-center border-2 transition-all ${isMobileSprinting ? 'bg-blue-500 border-blue-400 scale-90' : 'bg-white/10 border-white/20'}`}
                  >
                    <Zap className="w-10 h-10" />
                  </button>
                  <button
                    onTouchStart={() => setIsMobileKicking(true)}
                    onTouchEnd={() => setIsMobileKicking(false)}
                    className={`w-32 h-32 rounded-full flex items-center justify-center border-4 transition-all ${isMobileKicking ? 'bg-red-500 border-red-400 scale-90 shadow-2xl shadow-red-500/50' : 'bg-white/10 border-white/20'}`}
                  >
                    <Target className="w-12 h-12" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Menus */}
      <AnimatePresence mode="wait">
        {gameState === GameState.LANDING && (
          <motion.div
            key="landing-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/20 blur-[120px] rounded-full" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full" />
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
            </div>

            <div className="relative z-10 w-full max-w-6xl px-8 flex flex-col items-center text-center">
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-12"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white/60">Version 2.0 Live</span>
                </div>
                <h1 className="text-8xl md:text-[10rem] font-black italic tracking-tighter text-white uppercase leading-[0.8] mb-4">
                  Rivals<span className="text-red-500">.</span>
                </h1>
                <p className="text-xl md:text-2xl text-white/40 font-bold uppercase tracking-[0.2em] max-w-2xl mx-auto">
                  The Next Generation of Arcade Football
                </p>
              </motion.div>

              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl"
              >
                {/* Play Now */}
                <button
                  onClick={() => setGameState(GameState.DEVICE_SELECTION)}
                  className="group relative flex flex-col items-center justify-center p-10 bg-red-600 hover:bg-red-500 rounded-[2.5rem] transition-all hover:scale-[1.02] active:scale-95 shadow-2xl shadow-red-600/40"
                >
                  <Play className="w-12 h-12 mb-4 fill-white" />
                  <span className="text-2xl font-black italic uppercase tracking-tighter">Play Now</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold opacity-60 mt-1">Instant Access</span>
                </button>

                {/* Install App */}
                <button
                  onClick={handleInstall}
                  className="group relative flex flex-col items-center justify-center p-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[2.5rem] transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Smartphone className="w-12 h-12 mb-4 text-blue-500" />
                  <span className="text-2xl font-black italic uppercase tracking-tighter">Install App</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 mt-1">Mobile & Desktop</span>
                </button>

                {/* Download Source */}
                <button
                  onClick={() => window.open(GITHUB_URL, '_blank')}
                  className="group relative flex flex-col items-center justify-center p-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[2.5rem] transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Download className="w-12 h-12 mb-4 text-green-500" />
                  <span className="text-2xl font-black italic uppercase tracking-tighter">Get Source</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 mt-1">GitHub Repository</span>
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-16 flex items-center gap-12"
              >
                <div className="text-left">
                  <div className="text-3xl font-black italic tracking-tighter">3D</div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-white/20">Graphics</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-left">
                  <div className="text-3xl font-black italic tracking-tighter">ONLINE</div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-white/20">Multiplayer</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-left">
                  <div className="text-3xl font-black italic tracking-tighter">60 FPS</div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-white/20">Performance</div>
                </div>
              </motion.div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 text-[10px] uppercase tracking-[0.3em] font-black text-white/20">
              <span>Privacy Policy</span>
              <div className="w-1 h-1 rounded-full bg-white/10" />
              <span>Terms of Service</span>
              <div className="w-1 h-1 rounded-full bg-white/10" />
              <span>© 2026 Rivals Studio</span>
            </div>
          </motion.div>
        )}

        {gameState === GameState.DEVICE_SELECTION && (
          <motion.div
            key="device-selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-3xl p-8"
          >
            <div className="text-center mb-16">
              <h2 className="text-6xl font-black italic tracking-tighter text-white uppercase mb-4">Select Your Device</h2>
              <p className="text-white/40 tracking-[0.3em] uppercase text-sm font-bold">Optimizing Controls for your experience</p>
            </div>

            <div className="grid grid-cols-3 gap-8 w-full max-w-5xl">
              {[
                { type: DeviceType.PC, icon: Monitor, label: "Computer", desc: "WASD + Mouse" },
                { type: DeviceType.MOBILE, icon: Smartphone, label: "Mobile", desc: "Touch Controls" },
                { type: DeviceType.VR, icon: Glasses, label: "VR Mode", desc: "Immersive View" }
              ].map((device) => (
                <button
                  key={device.type}
                  onClick={() => {
                    setDeviceType(device.type);
                    setGameState(GameState.MENU);
                  }}
                  className="group relative flex flex-col items-center gap-8 p-12 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-[3rem] transition-all hover:-translate-y-4 hover:shadow-2xl hover:shadow-red-500/20"
                >
                  <div className="w-32 h-32 rounded-[2rem] bg-white/5 flex items-center justify-center group-hover:bg-red-500 transition-all duration-500 group-hover:rotate-6">
                    <device.icon className="w-16 h-16" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-4xl font-black italic uppercase tracking-tighter">{device.label}</h3>
                    <p className="text-white/30 text-xs uppercase tracking-[0.2em] font-bold mt-3">{device.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {gameState === GameState.MENU && (
          <motion.div
            key="main-menu"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-2xl p-8"
          >
            <div className="text-center mb-16 relative">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/20 blur-3xl rounded-full"
              />
              <motion.h1 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-9xl font-black italic tracking-tighter text-white uppercase leading-none"
              >
                Rivals
              </motion.h1>
              <div className="h-1 w-32 bg-red-500 mx-auto my-4 rounded-full" />
              <p className="text-white/40 tracking-[0.4em] uppercase text-xs font-black">The Ultimate Arcade Football Experience</p>
            </div>

            <div className="grid grid-cols-3 gap-8 w-full max-w-5xl px-4">
              {[4, 5, 6].map((num) => (
                <button
                  key={num}
                  onClick={() => {
                    setPlayersPerTeam(num);
                    setGameState(GameState.ROLE_SELECTION);
                  }}
                  className="group relative flex flex-col items-center gap-6 p-10 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-[2.5rem] transition-all hover:-translate-y-3 hover:shadow-2xl hover:shadow-red-500/10"
                >
                  <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center group-hover:bg-red-500 transition-all duration-500 group-hover:rotate-12">
                    <Users className="w-10 h-10" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-3xl font-black italic uppercase tracking-tighter">{num}v{num}</h3>
                    <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-bold mt-2">Match Mode</p>
                  </div>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-4 h-4 text-white/40" />
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap justify-center gap-4">
              <button
                onClick={() => {
                  setIsTwoPlayer(false);
                  setIsMultiplayer(false);
                }}
                className={`px-6 py-2 rounded-full font-bold transition-all ${(!isTwoPlayer && !isMultiplayer) ? 'bg-red-500 text-white' : 'bg-white/10 text-white/40'}`}
              >
                Solo (vs AI)
              </button>
              <button
                onClick={() => {
                  setIsTwoPlayer(true);
                  setIsMultiplayer(false);
                }}
                className={`px-6 py-2 rounded-full font-bold transition-all ${isTwoPlayer ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40'}`}
              >
                Local 1v1 (Same Screen)
              </button>
              <button
                onClick={() => {
                  setIsMultiplayer(true);
                  setShowMultiplayerMenu(true);
                }}
                className={`px-6 py-2 rounded-full font-bold transition-all flex items-center gap-2 ${isMultiplayer ? 'bg-green-500 text-white' : 'bg-white/10 text-white/40'}`}
              >
                <Globe className="w-4 h-4" />
                Multiplayer
              </button>
              <button
                onClick={() => setGameState(GameState.LANDING)}
                className="px-6 py-2 rounded-full font-bold bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-2 border border-white/10"
              >
                <Home className="w-4 h-4" />
                Landing Page
              </button>
              <button
                onClick={copyGameLink}
                className="px-6 py-2 rounded-full font-bold bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-2 border border-white/10"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Link Copied!' : 'Copy Game Link'}
              </button>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {showInstallInfo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstallInfo(false)}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] max-w-md w-full text-center"
                onClick={e => e.stopPropagation()}
              >
                <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Smartphone className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-4">How to Install</h3>
                <div className="space-y-6 text-left">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-bold text-sm shrink-0">1</div>
                    <p className="text-white/60 text-sm leading-relaxed">
                      On <span className="text-white font-bold">iOS (Safari)</span>: Tap the <span className="text-blue-400 font-bold">Share</span> button and select <span className="text-white font-bold">"Add to Home Screen"</span>.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                    <p className="text-white/60 text-sm leading-relaxed">
                      On <span className="text-white font-bold">Android (Chrome)</span>: Tap the <span className="text-blue-400 font-bold">three dots</span> and select <span className="text-white font-bold">"Install App"</span>.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-bold text-sm shrink-0">3</div>
                    <p className="text-white/60 text-sm leading-relaxed">
                      On <span className="text-white font-bold">Desktop</span>: Click the <span className="text-blue-400 font-bold">Install</span> icon in your browser's address bar.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowInstallInfo(false)}
                  className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-bold transition-all mt-8"
                >
                  Got it!
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {showMultiplayerMenu && (
          <motion.div
            key="multiplayer-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl p-8"
          >
            <div className="w-full max-w-4xl">
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-5xl font-black italic tracking-tighter text-white uppercase flex items-center gap-4">
                  <Globe className="w-12 h-12 text-green-500" />
                  Online Rivals
                </h2>
                <button 
                  onClick={() => setShowMultiplayerMenu(false)}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all"
                >
                  <RotateCcw className="w-6 h-6" />
                </button>
              </div>

              {lobbyState === 'JOINING' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <Plus className="w-6 h-6 text-green-500" />
                      Create Match
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">Your Name</label>
                        <input 
                          type="text" 
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-green-500 outline-none transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">Match Time</label>
                          <select 
                            value={matchTime}
                            onChange={(e) => setMatchTime(Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none"
                          >
                            <option value={60}>1 Minute</option>
                            <option value={180}>3 Minutes</option>
                            <option value={300}>5 Minutes</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">Team Size</label>
                          <select 
                            value={playersPerTeam}
                            onChange={(e) => setPlayersPerTeam(Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none"
                          >
                            <option value={1}>1v1</option>
                            <option value={2}>2v2</option>
                            <option value={3}>3v3</option>
                            <option value={4}>4v4</option>
                            <option value={5}>5v5</option>
                            <option value={6}>6v6</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
                        <button 
                          onClick={() => setIsPublicRoom(!isPublicRoom)}
                          className={`w-12 h-6 rounded-full transition-all relative ${isPublicRoom ? 'bg-green-500' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isPublicRoom ? 'left-7' : 'left-1'}`} />
                        </button>
                        <div>
                          <p className="text-sm font-bold uppercase tracking-tight">{isPublicRoom ? 'Public Match' : 'Private Match'}</p>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest">{isPublicRoom ? 'Strangers can join' : 'Invite only'}</p>
                        </div>
                      </div>
                      <button 
                        onClick={createRoom}
                        className="w-full py-4 bg-green-500 hover:bg-green-600 rounded-xl font-bold text-lg transition-all mt-4"
                      >
                        Create Room
                      </button>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-8 rounded-3xl flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-bold flex items-center gap-2">
                        <LogIn className="w-6 h-6 text-blue-500" />
                        Join Match
                      </h3>
                      <button 
                        onClick={refreshPublicRooms}
                        className="p-2 hover:bg-white/10 rounded-lg transition-all"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-4 flex-1">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="ROOM CODE"
                          value={joinRoomId}
                          onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-blue-500 outline-none transition-all font-mono tracking-widest"
                        />
                        <button 
                          onClick={joinRoom}
                          className="px-6 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold transition-all"
                        >
                          Join
                        </button>
                      </div>

                      <div className="mt-8">
                        <label className="text-xs uppercase tracking-widest text-white/40 mb-4 block">Public Lobbies</label>
                        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
                          {publicRooms.length === 0 ? (
                            <div key="no-rooms" className="text-center py-8 bg-white/5 rounded-xl border border-dashed border-white/10">
                              <p className="text-white/20 text-xs uppercase tracking-widest">No public matches found</p>
                            </div>
                          ) : (
                            publicRooms.map((room, idx) => (
                              <button
                                key={`${room.id}-${idx}`}
                                onClick={() => socket?.emit('join-room', { roomId: room.id, name: playerName })}
                                className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex justify-between items-center transition-all group"
                              >
                                <div className="text-left">
                                  <div className="font-bold text-sm group-hover:text-blue-400 transition-colors">{room.id}</div>
                                  <div className="text-[10px] text-white/40 uppercase tracking-widest">{room.playersPerTeam}v{room.playersPerTeam} • {room.matchTime/60}m</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold">{room.playersCount}/{room.maxPlayers}</div>
                                  <div className="text-[10px] text-green-500 uppercase tracking-widest">Join</div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="text-3xl font-black italic uppercase tracking-tighter">Lobby: {roomId}</h3>
                      <p className="text-white/40 uppercase tracking-widest text-xs mt-1">
                        {playersPerTeam}v{playersPerTeam} • {matchTime/60} Minutes
                      </p>
                    </div>
                    {isHost && (
                      <button 
                        onClick={startMultiplayerGame}
                        className="px-12 py-4 bg-red-500 hover:bg-red-600 rounded-xl font-bold text-xl transition-all shadow-lg shadow-red-500/20"
                      >
                        Start Match
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-12">
                    {/* Red Team Slots */}
                    <div className="space-y-4">
                      <h4 className="text-red-500 font-bold uppercase tracking-widest flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        Red Team
                      </h4>
                      <div className="grid gap-2">
                        {Array.from({ length: playersPerTeam }).map((_, i) => {
                          const playerId = `red-${i}`;
                          const occupant = Object.entries(playersInRoom).find(([_, p]) => (p as any).playerId === playerId);
                          return (
                            <button
                              key={playerId}
                              onClick={() => selectSlot(Team.RED, playerId)}
                              disabled={!!occupant && occupant[0] !== socket?.id}
                              className={`w-full p-4 rounded-xl border flex justify-between items-center transition-all ${
                                occupant 
                                  ? occupant[0] === socket?.id ? 'bg-red-500/20 border-red-500' : 'bg-white/5 border-white/10 opacity-50'
                                  : 'bg-white/5 border-white/10 hover:border-red-500/50'
                              }`}
                            >
                              <span className="font-bold uppercase text-sm">
                                {i === 0 ? 'Goalkeeper' : `Player ${i}`}
                              </span>
                              <span className="text-xs text-white/40 italic">
                                {occupant ? (occupant[1] as any).name : 'EMPTY'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Blue Team Slots */}
                    <div className="space-y-4">
                      <h4 className="text-blue-500 font-bold uppercase tracking-widest flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        Blue Team
                      </h4>
                      <div className="grid gap-2">
                        {Array.from({ length: playersPerTeam }).map((_, i) => {
                          const playerId = `blue-${i}`;
                          const occupant = Object.entries(playersInRoom).find(([_, p]) => (p as any).playerId === playerId);
                          return (
                            <button
                              key={playerId}
                              onClick={() => selectSlot(Team.BLUE, playerId)}
                              disabled={!!occupant && occupant[0] !== socket?.id}
                              className={`w-full p-4 rounded-xl border flex justify-between items-center transition-all ${
                                occupant 
                                  ? occupant[0] === socket?.id ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/10 opacity-50'
                                  : 'bg-white/5 border-white/10 hover:border-blue-500/50'
                              }`}
                            >
                              <span className="font-bold uppercase text-sm">
                                {i === 0 ? 'Goalkeeper' : `Player ${i}`}
                              </span>
                              <span className="text-xs text-white/40 italic">
                                {occupant ? (occupant[1] as any).name : 'EMPTY'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {gameState === GameState.ROLE_SELECTION && (
          <motion.div
            key="role-selection"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-2xl p-8"
          >
            <div className="text-center mb-16">
              <h2 className="text-7xl font-black italic tracking-tighter text-white uppercase leading-none">Choose Your Path</h2>
              <p className="text-white/40 tracking-[0.3em] uppercase text-xs font-black mt-4">Will you lead from the pitch or the bench?</p>
            </div>

            <div className="grid grid-cols-2 gap-12 w-full max-w-4xl">
              <button
                onClick={() => {
                  setUserRole(UserRole.PLAYER);
                  setGameState(GameState.CUSTOMIZATION);
                }}
                className="group relative flex flex-col items-center gap-8 p-12 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-[3rem] transition-all hover:-translate-y-4 hover:shadow-2xl hover:shadow-red-500/20"
              >
                <div className="w-32 h-32 rounded-[2rem] bg-white/5 flex items-center justify-center group-hover:bg-red-500 transition-all duration-500 group-hover:rotate-6">
                  <User className="w-16 h-16" />
                </div>
                <div className="text-center">
                  <h3 className="text-4xl font-black italic uppercase tracking-tighter">Pro Player</h3>
                  <p className="text-white/30 text-xs uppercase tracking-[0.2em] font-bold mt-3">Take control of the ball</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setUserRole(UserRole.MANAGER);
                  setGameState(GameState.PLAYING);
                  if (!isMultiplayer) initGame(playersPerTeam, UserRole.MANAGER);
                }}
                className="group relative flex flex-col items-center gap-8 p-12 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-[3rem] transition-all hover:-translate-y-4 hover:shadow-2xl hover:shadow-blue-500/20"
              >
                <div className="w-32 h-32 rounded-[2rem] bg-white/5 flex items-center justify-center group-hover:bg-blue-500 transition-all duration-500 group-hover:-rotate-6">
                  <Shield className="w-16 h-16" />
                </div>
                <div className="text-center">
                  <h3 className="text-4xl font-black italic uppercase tracking-tighter">Manager</h3>
                  <p className="text-white/30 text-xs uppercase tracking-[0.2em] font-bold mt-3">Direct tactics & strategy</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {gameState === GameState.CUSTOMIZATION && (
          <motion.div
            key="customization"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-3xl p-8 overflow-y-auto"
          >
            <div className="text-center mb-12">
              <h2 className="text-7xl font-black italic tracking-tighter text-white uppercase leading-none">Customize Rival</h2>
              <p className="text-white/40 tracking-[0.3em] uppercase text-xs font-black mt-4">Create your legend</p>
            </div>

            <div className="grid grid-cols-2 gap-16 w-full max-w-6xl items-center">
              {/* Preview */}
              <div className="flex flex-col items-center gap-8">
                <div className="relative w-64 h-96 bg-white/5 rounded-[3rem] border border-white/10 flex flex-col items-center justify-center overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent" />
                   {/* Simple Player Avatar Preview */}
                   <div className="relative z-10 flex flex-col items-center">
                      <div className="w-24 h-24 rounded-full mb-4 border-4 border-white/20" style={{ backgroundColor: customization.skinColor }} />
                      <div className="w-40 h-48 rounded-t-[2rem] bg-red-500 flex items-center justify-center relative">
                         <span className="text-7xl font-black italic opacity-30">{customization.jerseyNumber}</span>
                      </div>
                   </div>
                </div>
                <div className="text-center">
                   <h3 className="text-3xl font-black italic uppercase">{customization.name}</h3>
                   <p className="text-white/40 font-bold">#{customization.jerseyNumber}</p>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Player Name</label>
                  <input 
                    type="text" 
                    value={customization.name}
                    onChange={(e) => setCustomization(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 p-6 rounded-2xl text-2xl font-bold focus:border-red-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Skin Tone</label>
                  <div className="flex gap-4">
                    {["#ffdbac", "#f1c27d", "#e0ac69", "#8d5524", "#c68642"].map(color => (
                      <button
                        key={color}
                        onClick={() => setCustomization(prev => ({ ...prev, skinColor: color }))}
                        className={`w-12 h-12 rounded-full border-2 transition-all ${customization.skinColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Jersey Number</label>
                  <div className="flex items-center gap-6">
                    <button onClick={() => setCustomization(prev => ({ ...prev, jerseyNumber: Math.max(1, prev.jerseyNumber - 1) }))} className="p-4 bg-white/5 rounded-xl hover:bg-white/10"><ChevronLeft /></button>
                    <span className="text-4xl font-black italic w-16 text-center">{customization.jerseyNumber}</span>
                    <button onClick={() => setCustomization(prev => ({ ...prev, jerseyNumber: Math.min(99, prev.jerseyNumber + 1) }))} className="p-4 bg-white/5 rounded-xl hover:bg-white/10"><ChevronRight /></button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setGameState(GameState.PLAYING);
                    if (!isMultiplayer) initGame(playersPerTeam, UserRole.PLAYER);
                  }}
                  className="w-full py-8 bg-red-500 hover:bg-red-600 rounded-3xl text-2xl font-black italic uppercase tracking-tighter transition-all hover:scale-[1.02] active:scale-95 shadow-2xl shadow-red-500/30"
                >
                  Confirm Rival
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {gameState === GameState.SKILL_TREE && (
          <motion.div
            key="skill-tree"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl p-8"
          >
            <div className="w-full max-w-5xl">
              <div className="flex justify-between items-center mb-12">
                <div>
                  <h2 className="text-5xl font-black italic tracking-tighter text-white uppercase">Team Skill Tree</h2>
                  <p className="text-yellow-500 font-bold uppercase tracking-widest">Available Points: {skillPoints}</p>
                </div>
                <button 
                  onClick={() => setGameState(GameState.PLAYING)}
                  className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-all"
                >
                  Back to Game
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto max-h-[60vh] pr-4">
                <div className="bg-white/10 border-2 border-blue-500/50 p-6 rounded-2xl col-span-full mb-4">
                  <h3 className="text-2xl font-black italic tracking-tighter text-blue-400 uppercase mb-4 flex items-center gap-2">
                    <Settings className="w-6 h-6" />
                    Managerial Masterclass (Team Buffs)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { key: 'allOutAttack', label: 'All Out Attack', desc: 'Team pushes forward' },
                      { key: 'parkTheBus', label: 'Park The Bus', desc: 'Team stays defensive' },
                      { key: 'staminaBoost', label: 'Stamina Boost', desc: 'Faster recovery' },
                    ].map((skill) => (
                      <button
                        key={skill.key}
                        disabled={managerSkills[skill.key as keyof typeof managerSkills] || skillPoints <= 0}
                        onClick={() => {
                          if (skillPoints > 0) {
                            setSkillPoints(prev => prev - 1);
                            setManagerSkills(prev => ({ ...prev, [skill.key]: true }));
                          }
                        }}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          managerSkills[skill.key as keyof typeof managerSkills] 
                            ? 'bg-blue-500/20 border-blue-500/50 opacity-100' 
                            : skillPoints > 0 ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/5 border-white/10 opacity-50'
                        }`}
                      >
                        <div className="text-sm font-bold uppercase tracking-tight">{skill.label}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{skill.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {playersRef.current
                  .filter(p => p.team === Team.RED || (isTwoPlayer && p.team === Team.BLUE))
                  .filter((p, index, self) => self.findIndex(t => t.id === p.id) === index) // Ensure unique IDs
                  .map((player) => (
                  <div key={player.id} className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-3 h-3 rounded-full ${player.team === Team.RED ? 'bg-red-500' : 'bg-blue-500'}`} />
                      <h3 className="text-xl font-bold uppercase italic">
                        {player.isGK ? 'Goalkeeper' : player.isAI ? `Teammate ${player.id.split('-')[1]}` : `Player ${player.team === Team.RED ? '1' : '2'}`}
                      </h3>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'powerShot', label: 'Power Shot', desc: '+50% Kick Force', icon: <Zap className="w-3 h-3" /> },
                        { key: 'dribblingMaster', label: 'Dribble Master', desc: 'Better Control', icon: <Target className="w-3 h-3" /> },
                        { key: 'interception', label: 'Interception', desc: 'Larger Reach', icon: <Shield className="w-3 h-3" /> },
                        { key: 'strongTackle', label: 'Strong Tackle', desc: 'Better Defense', icon: <Shield className="w-3 h-3" /> },
                        { key: 'speedBurst', label: 'Speed Burst', desc: '+20% Sprint', icon: <Zap className="w-3 h-3" /> },
                      ].map((skill) => (
                        <button
                          key={skill.key}
                          disabled={player.skills[skill.key as keyof Player['skills']] || skillPoints <= 0}
                          onClick={() => toggleSkill(player.id, skill.key as keyof Player['skills'])}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            player.skills[skill.key as keyof Player['skills']] 
                              ? 'bg-green-500/20 border-green-500/50 opacity-100' 
                              : skillPoints > 0 ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/5 border-white/10 opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {skill.icon}
                            <div className="text-sm font-bold uppercase tracking-tight">{skill.label}</div>
                          </div>
                          <div className="text-[10px] text-white/40 uppercase tracking-widest">{skill.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {gameState === GameState.GAME_OVER && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl"
          >
            <Trophy className="w-24 h-24 text-yellow-500 mb-6" />
            <h2 className="text-6xl font-black uppercase italic mb-2">
              {winner === Team.RED ? 'Victory!' : 'Defeat!'}
            </h2>
            <p className="text-2xl text-white/60 mb-12">Final Score: {score[Team.RED]} - {score[Team.BLUE]}</p>
            
            <div className="flex gap-4">
              <button
                onClick={() => setGameState(GameState.MENU)}
                className="flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-all"
              >
                <Home className="w-5 h-5" />
                Main Menu
              </button>
              <button
                onClick={() => initGame(playersPerTeam, userRole)}
                className="flex items-center gap-2 px-8 py-4 bg-red-500 hover:bg-red-600 rounded-full font-bold transition-all shadow-lg shadow-red-500/20"
              >
                <RotateCcw className="w-5 h-5" />
                Rematch
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SoccerGame;
