
import { Vector3, Color } from 'three';

export enum ShapeType {
  SPHERE = 'Sphere',
  HEART = 'Heart',
  FLOWER = 'Flower',
  SATURN = 'Saturn',
  BUDDHA = 'Buddha', // Simplified approximation
  DNA = 'DNA',       // Double Helix
  FIREWORKS = 'Fireworks',
  SPIRAL = 'Spiral', // Galaxy Spiral
  IMAGE = 'Image',   // Custom image upload
  TEXT = 'Text',      // Text to particles
  TREE = 'Tree',      // Christmas Tree
  SNOWFLAKE = 'Snowflake', // Winter
  PUMPKIN = 'Pumpkin', // Halloween
  LANTERN = 'Lantern', // Chinese New Year (Lantern Festival)
  ZONGZI = 'Zongzi',   // Dragon Boat Festival
  RABBIT = 'Rabbit',   // Mid-Autumn Festival
  EGG = 'Egg',          // Easter
  
  // New Additions
  ROSE = 'Rose',       // Valentine's Day
  BRIDGE = 'Bridge',   // Qixi Festival
  FLAG = 'Flag',       // National Day
  SNAKE = 'Snake'      // CNY Zodiac (2025)
}

export enum ColorMode {
  MONOCHROME = 'Monochrome',
  GRADIENT = 'Gradient',
  RAINBOW = 'Rainbow',
  IMAGE = 'ImageColor'
}

export interface GestureState {
  expansion: number; // 0 to 1 (Spread hands)
  rotation: number;  // Radians (Hand tilt)
  zoom: number;      // 0.5 to 2.5 (Push/Pull)
  isPeaceSign: boolean; // "V" gesture
  isNamaste: boolean;   // Hands together
}

export interface ParticleState {
  shape: ShapeType;
  colorMode: ColorMode;
  baseColor: string;
  secondaryColor: string;
  pointCount: number;
  scale: number;
  opacity: number;
  gesture: GestureState;
  mouseInteraction: boolean;
  uploadedImageContext: ImageData | null;
}

// Data structure for a generated shape
export interface ShapeData {
  positions: Float32Array;
  colors?: Float32Array; // Optional per-particle color
  currentCount: number;  // The actual number of active particles for this shape
}
