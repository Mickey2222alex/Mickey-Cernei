import { Ball, GameConfig, Player, Team, Vector } from './types';

export const dist = (v1: Vector, v2: Vector) => Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);

export const normalize = (v: Vector): Vector => {
  const d = Math.sqrt(v.x * v.x + v.y * v.y);
  return d === 0 ? { x: 0, y: 0 } : { x: v.x / d, y: v.y / d };
};

export const limit = (v: Vector, max: number): Vector => {
  const d = Math.sqrt(v.x * v.x + v.y * v.y);
  if (d > max) {
    return { x: (v.x / d) * max, y: (v.y / d) * max };
  }
  return v;
};

export const updateBall = (ball: Ball, config: GameConfig) => {
  ball.pos.x += ball.vel.x;
  ball.pos.y += ball.vel.y;
  ball.vel.x *= config.friction;
  ball.vel.y *= config.friction;

  // Wall collisions
  if (ball.pos.y < ball.radius || ball.pos.y > config.fieldHeight - ball.radius) {
    ball.vel.y *= -0.8;
    ball.pos.y = ball.pos.y < ball.radius ? ball.radius : config.fieldHeight - ball.radius;
  }

  // Goal check
  const inGoalY = ball.pos.y > (config.fieldHeight - config.goalWidth) / 2 && 
                  ball.pos.y < (config.fieldHeight + config.goalWidth) / 2;

  if (ball.pos.x < ball.radius) {
    if (inGoalY) {
      return Team.BLUE; // Blue scored
    }
    ball.vel.x *= -0.8;
    ball.pos.x = ball.radius;
  }

  if (ball.pos.x > config.fieldWidth - ball.radius) {
    if (inGoalY) {
      return Team.RED; // Red scored
    }
    ball.vel.x *= -0.8;
    ball.pos.x = config.fieldWidth - ball.radius;
  }

  return null;
};

export const updatePlayer = (player: Player, ball: Ball, config: GameConfig, targetVel: Vector, isKicking: boolean) => {
  let speed = player.isSprinting ? config.maxSpeed * config.sprintMultiplier : config.maxSpeed;
  
  // Skill: Speed Burst
  if (player.isSprinting && player.skills.speedBurst) {
    speed *= 1.2;
  }

  // Stamina logic
  if (player.isSprinting && (targetVel.x !== 0 || targetVel.y !== 0)) {
    player.stamina = Math.max(0, player.stamina - 0.2);
    if (player.stamina === 0) speed = config.maxSpeed; // Force slow down
  } else {
    player.stamina = Math.min(100, player.stamina + 0.1);
  }

  player.vel.x += (targetVel.x * speed - player.vel.x) * 0.1;
  player.vel.y += (targetVel.y * speed - player.vel.y) * 0.1;

  player.pos.x += player.vel.x;
  player.pos.y += player.vel.y;

  // Keep in bounds
  player.pos.x = Math.max(player.playerRadius, Math.min(config.fieldWidth - player.playerRadius, player.pos.x));
  player.pos.y = Math.max(player.playerRadius, Math.min(config.fieldHeight - player.playerRadius, player.pos.y));

  // Update angle based on movement
  if (targetVel.x !== 0 || targetVel.y !== 0) {
    player.angle = Math.atan2(targetVel.y, targetVel.x);
  }

  // Ball interaction
  const d = dist(player.pos, ball.pos);
  
  // Skill: Interception (larger touch radius)
  const baseTouchDist = player.playerRadius + ball.radius + 2;
  const touchDist = player.skills.interception ? baseTouchDist + 10 : baseTouchDist;

  if (d < touchDist) {
    const pushDir = normalize({ x: ball.pos.x - player.pos.x, y: ball.pos.y - player.pos.y });
    
    if (isKicking) {
      // Skill: Power Shot
      const force = player.skills.powerShot ? config.kickForce * 1.5 : config.kickForce;
      ball.vel.x = pushDir.x * force;
      ball.vel.y = pushDir.y * force;
      ball.lastTouchBy = player.id;
      ball.lastTouchTeam = player.team;
    } else {
      // Skill: Dribbling Master (ball sticks more)
      const dribbleFactor = player.skills.dribblingMaster ? 0.9 : 2;
      ball.vel.x = player.vel.x + pushDir.x * dribbleFactor;
      ball.vel.y = player.vel.y + pushDir.y * dribbleFactor;
      ball.lastTouchBy = player.id;
      ball.lastTouchTeam = player.team;
    }
  }
};

export const getAIInput = (player: Player, ball: Ball, config: GameConfig, teammates: Player[], opponents: Player[]) => {
  const targetGoalX = player.team === Team.RED ? config.fieldWidth : 0;
  const homeGoalX = player.team === Team.RED ? 0 : config.fieldWidth;
  const goalCenterY = config.fieldHeight / 2;

  // Goalkeeper logic
  if (player.isGK) {
    const gkX = player.team === Team.RED ? 40 : config.fieldWidth - 40;
    const targetY = Math.max(goalCenterY - config.goalWidth/2, Math.min(goalCenterY + config.goalWidth/2, ball.pos.y));
    
    // If ball is very close, try to clear it
    if (dist(player.pos, ball.pos) < 100) {
      return {
        targetVel: normalize({ x: ball.pos.x - player.pos.x, y: ball.pos.y - player.pos.y }),
        isKicking: true
      };
    }

    return {
      targetVel: normalize({ x: gkX - player.pos.x, y: targetY - player.pos.y }),
      isKicking: false
    };
  }

  // Find nearest teammate to the ball (who should chase)
  const distToBall = dist(player.pos, ball.pos);
  const nearestTeammate = teammates.reduce((prev, curr) => {
    return dist(curr.pos, ball.pos) < dist(prev.pos, ball.pos) ? curr : prev;
  }, teammates[0]);

  const isChaser = nearestTeammate.id === player.id;

  if (isChaser) {
    // Chase ball
    const toBall = normalize({ x: ball.pos.x - player.pos.x, y: ball.pos.y - player.pos.y });
    
    // If close to ball, decide whether to shoot or pass
    if (distToBall < 50) {
      const toGoal = normalize({ x: targetGoalX - player.pos.x, y: goalCenterY - player.pos.y });
      return {
        targetVel: toGoal,
        isKicking: true
      };
    }

    return {
      targetVel: toBall,
      isKicking: false
    };
  } else {
    // Positioning
    // Simple: stay at a percentage of the field length
    const playerIndex = teammates.filter(t => !t.isGK).findIndex(t => t.id === player.id);
    const totalFieldPlayers = teammates.length - 1;
    
    // Spread out vertically and horizontally
    const targetX = homeGoalX + (targetGoalX - homeGoalX) * (0.3 + (playerIndex / totalFieldPlayers) * 0.4);
    const targetY = (config.fieldHeight / (totalFieldPlayers + 1)) * (playerIndex + 1);

    return {
      targetVel: normalize({ x: targetX - player.pos.x, y: targetY - player.pos.y }),
      isKicking: false
    };
  }
};
