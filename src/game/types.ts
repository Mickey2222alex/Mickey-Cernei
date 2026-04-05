export enum Team {
  RED = 'RED',
  BLUE = 'BLUE'
}

export enum GameState {
  LANDING = 'LANDING',
  DEVICE_SELECTION = 'DEVICE_SELECTION',
  MENU = 'MENU',
  ROLE_SELECTION = 'ROLE_SELECTION',
  CUSTOMIZATION = 'CUSTOMIZATION',
  PLAYING = 'PLAYING',
  GOAL = 'GOAL',
  HALF_TIME = 'HALF_TIME',
  GAME_OVER = 'GAME_OVER',
  SKILL_TREE = 'SKILL_TREE'
}

export enum DeviceType {
  PC = 'PC',
  MOBILE = 'MOBILE',
  VR = 'VR'
}

export enum UserRole {
  PLAYER = 'PLAYER',
  MANAGER = 'MANAGER'
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
  type: 'OFFENSE' | 'DEFENSE' | 'ATHLETICISM' | 'TACTIC';
}

export interface Vector {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  team: Team;
  pos: Vector;
  vel: Vector;
  angle: number;
  isAI: boolean;
  isGK: boolean;
  stamina: number;
  isSprinting: boolean;
  hasBall: boolean;
  kickPower: number;
  playerRadius: number;
  customization?: {
    skinColor: string;
    hairColor: string;
    jerseyNumber: number;
    name: string;
  };
  skills: {
    powerShot: boolean;
    dribblingMaster: boolean;
    interception: boolean;
    strongTackle: boolean;
    speedBurst: boolean;
  };
}

export interface Ball {
  pos: Vector;
  vel: Vector;
  radius: number;
  lastTouchBy?: string;
  lastTouchTeam?: Team;
}

export interface GameConfig {
  playersPerTeam: number;
  fieldWidth: number;
  fieldHeight: number;
  goalWidth: number;
  playerRadius: number;
  ballRadius: number;
  friction: number;
  maxSpeed: number;
  sprintMultiplier: number;
  kickForce: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  playersPerTeam: 5,
  fieldWidth: 1800,
  fieldHeight: 1200,
  goalWidth: 300,
  playerRadius: 15,
  ballRadius: 8,
  friction: 0.985,
  maxSpeed: 5,
  sprintMultiplier: 2.2,
  kickForce: 15
};
