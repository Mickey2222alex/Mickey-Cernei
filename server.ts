import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { Team, GameState, Player, Ball, DEFAULT_CONFIG, Vector } from './src/game/types';
import { updateBall, updatePlayer, getAIInput, dist } from './src/game/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Game State Management
  interface Room {
    id: string;
    hostId: string;
    players: { [socketId: string]: { name: string; team: Team; playerId?: string; isReady: boolean } };
    gameState: GameState;
    matchTime: number; // in seconds
    timeLeft: number;
    playersPerTeam: number;
    isPublic: boolean;
    score: { [Team.RED]: number; [Team.BLUE]: number };
    ball: Ball;
    pitchPlayers: Player[];
    lastUpdate: number;
    isPaused: boolean;
  }

  const rooms: { [roomId: string]: Room } = {};

  const getPublicRooms = () => {
    return Object.values(rooms)
      .filter(r => r.isPublic && r.gameState === GameState.MENU)
      .map(r => ({
        id: r.id,
        playersCount: Object.keys(r.players).length,
        maxPlayers: r.playersPerTeam * 2,
        playersPerTeam: r.playersPerTeam,
        matchTime: r.matchTime
      }));
  };

  const initPitchPlayers = (room: Room) => {
    const config = { ...DEFAULT_CONFIG, playersPerTeam: room.playersPerTeam };
    const players: Player[] = [];

    // Red Team
    for (let i = 0; i < room.playersPerTeam; i++) {
      const isGK = i === 0;
      players.push({
        id: `red-${i}`,
        team: Team.RED,
        pos: isGK ? { x: 50, y: config.fieldHeight / 2 } : { x: 200 + (i * 100), y: (config.fieldHeight / (room.playersPerTeam)) * i + 50 },
        vel: { x: 0, y: 0 },
        angle: 0,
        isAI: true,
        isGK,
        stamina: 100,
        isSprinting: false,
        hasBall: false,
        kickPower: 0,
        playerRadius: config.playerRadius,
        skills: { powerShot: false, dribblingMaster: false, interception: false, strongTackle: false, speedBurst: false }
      });
    }

    // Blue Team
    for (let i = 0; i < room.playersPerTeam; i++) {
      const isGK = i === 0;
      players.push({
        id: `blue-${i}`,
        team: Team.BLUE,
        pos: isGK ? { x: config.fieldWidth - 50, y: config.fieldHeight / 2 } : { x: config.fieldWidth - 200 - (i * 100), y: (config.fieldHeight / (room.playersPerTeam)) * i + 50 },
        vel: { x: 0, y: 0 },
        angle: Math.PI,
        isAI: true,
        isGK,
        stamina: 100,
        isSprinting: false,
        hasBall: false,
        kickPower: 0,
        playerRadius: config.playerRadius,
        skills: { powerShot: false, dribblingMaster: false, interception: false, strongTackle: false, speedBurst: false }
      });
    }

    return players;
  };

  const resetPositions = (room: Room) => {
    const config = DEFAULT_CONFIG;
    room.pitchPlayers.forEach((p, i) => {
      const teamIndex = i % room.playersPerTeam;
      if (p.team === Team.RED) {
        p.pos = p.isGK ? { x: 50, y: config.fieldHeight / 2 } : { x: 200 + (teamIndex * 100), y: (config.fieldHeight / room.playersPerTeam) * teamIndex + 50 };
        p.angle = 0;
      } else {
        p.pos = p.isGK ? { x: config.fieldWidth - 50, y: config.fieldHeight / 2 } : { x: config.fieldWidth - 200 - (teamIndex * 100), y: (config.fieldHeight / room.playersPerTeam) * teamIndex + 50 };
        p.angle = Math.PI;
      }
      p.vel = { x: 0, y: 0 };
      p.hasBall = false;
    });
    room.ball = { pos: { x: config.fieldWidth / 2, y: config.fieldHeight / 2 }, vel: { x: 0, y: 0 }, radius: config.ballRadius };
  };

  // Game Loop
  setInterval(() => {
    Object.values(rooms).forEach(room => {
      if (room.gameState !== GameState.PLAYING || room.isPaused) return;

      const config = { ...DEFAULT_CONFIG, playersPerTeam: room.playersPerTeam };
      
      // Update Ball
      const scoringTeam = updateBall(room.ball, config);
      if (scoringTeam) {
        room.score[scoringTeam]++;
        resetPositions(room);
        io.to(room.id).emit('goal', { team: scoringTeam, score: room.score });
      }

      // Update Players
      room.pitchPlayers.forEach(player => {
        let targetVel: Vector = { x: 0, y: 0 };
        let isKicking = false;

        // Check if a human player is controlling this pitch player
        const controllingSocketId = Object.keys(room.players).find(sid => room.players[sid].playerId === player.id);
        
        if (controllingSocketId) {
          // Input is handled via events, so we just use the current player state
          // which is updated by 'player-input' event
          // But we need to normalize targetVel if it's coming from keys
          // For now, we'll assume the client sends the desired targetVel
        } else if (player.isAI) {
          const teammates = room.pitchPlayers.filter(p => p.team === player.team && p.id !== player.id);
          const opponents = room.pitchPlayers.filter(p => p.team !== player.team);
          const aiInput = getAIInput(player, room.ball, config, teammates, opponents);
          targetVel = aiInput.targetVel;
          isKicking = aiInput.isKicking;
          updatePlayer(player, room.ball, config, targetVel, isKicking);
        }
      });

      // Resolve Player-Player collisions
      for (let i = 0; i < room.pitchPlayers.length; i++) {
        for (let j = i + 1; j < room.pitchPlayers.length; j++) {
          const p1 = room.pitchPlayers[i];
          const p2 = room.pitchPlayers[j];
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

      // Timer
      room.timeLeft -= 1/60;
      if (room.timeLeft <= 0) {
        room.gameState = GameState.GAME_OVER;
        io.to(room.id).emit('game-over', { score: room.score });
      }

      // Broadcast state
      io.to(room.id).emit('game-state', {
        ball: room.ball,
        players: room.pitchPlayers,
        score: room.score,
        timeLeft: Math.ceil(room.timeLeft)
      });
    });
  }, 1000 / 60);

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ name, matchTime, playersPerTeam, isPublic }) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = {
        id: roomId,
        hostId: socket.id,
        players: { [socket.id]: { name, team: Team.RED, isReady: false } },
        gameState: GameState.MENU,
        matchTime: matchTime || 180,
        timeLeft: matchTime || 180,
        playersPerTeam: playersPerTeam || 5,
        isPublic: !!isPublic,
        score: { [Team.RED]: 0, [Team.BLUE]: 0 },
        ball: { pos: { x: 600, y: 400 }, vel: { x: 0, y: 0 }, radius: 8 },
        pitchPlayers: [],
        lastUpdate: Date.now(),
        isPaused: false
      };
      socket.join(roomId);
      socket.emit('room-created', rooms[roomId]);
      if (isPublic) {
        io.emit('public-rooms-updated', getPublicRooms());
      }
    });

    socket.on('get-public-rooms', () => {
      socket.emit('public-rooms-updated', getPublicRooms());
    });

    socket.on('join-room', ({ roomId, name }) => {
      const room = rooms[roomId];
      if (room) {
        room.players[socket.id] = { name, team: Team.BLUE, isReady: false };
        socket.join(roomId);
        io.to(roomId).emit('player-joined', { roomId, players: room.players });
        socket.emit('room-joined', room);
      } else {
        socket.emit('error', 'Room not found');
      }
    });

    socket.on('select-slot', ({ roomId, team, playerId }) => {
      const room = rooms[roomId];
      if (room && room.players[socket.id]) {
        // Clear previous slot if any
        Object.values(room.players).forEach(p => {
          if (p.playerId === playerId) p.playerId = undefined;
        });
        room.players[socket.id].team = team;
        room.players[socket.id].playerId = playerId;
        io.to(roomId).emit('slots-updated', room.players);
      }
    });

    socket.on('start-game', ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.hostId === socket.id) {
        room.pitchPlayers = initPitchPlayers(room);
        room.gameState = GameState.PLAYING;
        room.timeLeft = room.matchTime;
        room.score = { [Team.RED]: 0, [Team.BLUE]: 0 };
        io.to(roomId).emit('game-started', room);
      }
    });

    socket.on('player-input', ({ roomId, targetVel, isSprinting, isKicking }) => {
      const room = rooms[roomId];
      if (room && room.gameState === GameState.PLAYING) {
        const playerInfo = room.players[socket.id];
        if (playerInfo && playerInfo.playerId) {
          const pitchPlayer = room.pitchPlayers.find(p => p.id === playerInfo.playerId);
          if (pitchPlayer) {
            pitchPlayer.isSprinting = isSprinting;
            updatePlayer(pitchPlayer, room.ball, DEFAULT_CONFIG, targetVel, isKicking);
          }
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      Object.keys(rooms).forEach(roomId => {
        if (rooms[roomId].players[socket.id]) {
          delete rooms[roomId].players[socket.id];
          if (Object.keys(rooms[roomId].players).length === 0) {
            delete rooms[roomId];
          } else {
            if (rooms[roomId].hostId === socket.id) {
              rooms[roomId].hostId = Object.keys(rooms[roomId].players)[0];
            }
            io.to(roomId).emit('player-left', { socketId: socket.id, players: rooms[roomId].players });
          }
        }
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
