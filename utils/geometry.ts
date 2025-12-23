
import * as THREE from 'three';
import { ShapeType } from '../types';

// Increased max limit to allow for high-detail images
export const MAX_PARTICLE_COUNT = 40000;
// Default count for procedural 3D shapes
const PROCEDURAL_COUNT = 15000;

// Helper to get random point in sphere
const randomInSphere = (radius: number, center?: THREE.Vector3) => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  const sinPhi = Math.sin(phi);
  const vec = new THREE.Vector3(
    r * sinPhi * Math.cos(theta),
    r * sinPhi * Math.sin(theta),
    r * Math.cos(phi)
  );
  if (center) vec.add(center);
  return vec;
};

// Helper for Lantern shape
const getLanternPoint = () => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u; 
  const phi = Math.PI * (v - 0.5); 

  const ridges = 1.0 + 0.1 * Math.sin(theta * 8); 
  
  const rBase = 4;
  const scaleY = 1.3;
  
  const r = rBase * ridges * Math.sqrt(Math.random()); 
  
  const x = r * Math.cos(phi) * Math.cos(theta);
  const z = r * Math.cos(phi) * Math.sin(theta);
  const y = r * Math.sin(phi) * scaleY;
  
  if (Math.abs(y) > 4.5) return getLanternPoint(); 

  return new THREE.Vector3(x, y, z);
};

// Fisher-Yates Shuffle
const shuffleArray = (array: any[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};

export const generateShapePositions = (type: ShapeType, imageData?: ImageData | null): { positions: Float32Array, colors?: Float32Array, currentCount: number } => {
  const positions = new Float32Array(MAX_PARTICLE_COUNT * 3);
  let colors: Float32Array | undefined;
  
  // Default to PROCEDURAL_COUNT for standard shapes, but can be overridden by Image/Text logic
  let activeCount = PROCEDURAL_COUNT;

  // --- IMAGE / TEXT PROCESSING (Grid Sampling) ---
  if ((type === ShapeType.IMAGE || type === ShapeType.TEXT) && imageData && imageData.width > 0) {
      colors = new Float32Array(MAX_PARTICLE_COUNT * 3);
      
      const width = imageData.width;
      const height = imageData.height;
      const data = imageData.data;
      
      // Store all valid pixels
      const validPixels: {x: number, y: number, r: number, g: number, b: number}[] = [];
      
      // Calculate visual bounds
      const aspect = width / height;
      let drawW = 14; // Wider spread for better detail
      let drawH = 14;
      if (aspect > 1) drawH = 14 / aspect;
      else drawW = 14 * aspect;

      // Scan parameters
      const step = 1; 
      
      for (let py = 0; py < height; py += step) {
          for (let px = 0; px < width; px += step) {
              const idx = (py * width + px) * 4;
              const alpha = data[idx + 3];
              
              // Threshold for visibility
              if (alpha > 20) {
                  validPixels.push({
                      x: (px / width - 0.5) * drawW,
                      // Flip Y because canvas is top-left, 3D is bottom-left usually
                      y: -(py / height - 0.5) * drawH, 
                      r: data[idx] / 255,
                      g: data[idx+1] / 255,
                      b: data[idx+2] / 255
                  });
              }
          }
      }

      if (validPixels.length > MAX_PARTICLE_COUNT) {
          shuffleArray(validPixels);
          activeCount = MAX_PARTICLE_COUNT;
      } else {
          activeCount = validPixels.length;
      }

      // Fill buffers
      for (let i = 0; i < activeCount; i++) {
          const p = validPixels[i];
          const i3 = i * 3;
          positions[i3] = p.x;
          positions[i3+1] = p.y;
          // Add slight Z-depth for 3D feel even on 2D images
          positions[i3+2] = (Math.random() - 0.5) * 0.5;
          
          colors[i3] = p.r;
          colors[i3+1] = p.g;
          colors[i3+2] = p.b;
      }
      
      return { positions, colors, currentCount: activeCount };
  }

  // --- PROCEDURAL SHAPES ---
  
  // Initialize colors buffer only for FLAG (to support the 5-stars logic procedural coloring)
  if (type === ShapeType.FLAG) {
      colors = new Float32Array(MAX_PARTICLE_COUNT * 3);
  }

  for (let i = 0; i < activeCount; i++) {
    let x = 0, y = 0, z = 0;
    const i3 = i * 3;

    switch (type) {
      case ShapeType.SPHERE:
      case ShapeType.IMAGE: // Fallback if no image
      case ShapeType.TEXT:  // Fallback if no text
      {
        const p = randomInSphere(5);
        x = p.x; y = p.y; z = p.z;
        break;
      }
      case ShapeType.HEART: {
        const t = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()); 
        x = 16 * Math.pow(Math.sin(t), 3);
        y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        x *= r * 0.25; 
        y *= r * 0.25;
        z = (Math.random() - 0.5) * 3 * r; 
        break;
      }
      case ShapeType.ROSE: {
        // Parametric Rose-ish shape
        // Based on spherical coords modulation
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const rBase = 4;
        
        // Modulate radius to create petals
        // k=4 gives 8 petalsish look
        const k = 3; 
        const petal = 1 + 0.3 * Math.sin(k * theta) * Math.sin(phi * 4);
        
        const r = Math.cbrt(Math.random()) * rBase * petal;
        
        x = r * Math.sin(phi) * Math.cos(theta);
        z = r * Math.sin(phi) * Math.sin(theta);
        y = r * Math.cos(phi) * 0.8; 
        
        // Flatten bottom slightly
        if (y < -1) y *= 0.5;
        break;
      }
      case ShapeType.FLOWER: {
        const u = Math.random() * Math.PI * 2;
        const k = 4;
        const rBase = 4 * Math.cos(k * u) + 1;
        const R = rBase * Math.random(); 
        x = R * Math.cos(u);
        y = R * Math.sin(u);
        z = (Math.random() - 0.5) * 2;
        z += Math.pow(x*x + y*y, 0.5) * 0.3;
        break;
      }
      case ShapeType.SATURN: {
        if (Math.random() > 0.4) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 6 + Math.random() * 3;
          x = Math.cos(angle) * dist;
          z = Math.sin(angle) * dist;
          y = (Math.random() - 0.5) * 0.2;
        } else {
          const p = randomInSphere(3.5);
          x = p.x; y = p.y; z = p.z;
        }
        const tilt = Math.PI / 6;
        const ty = y * Math.cos(tilt) - z * Math.sin(tilt);
        const tz = y * Math.sin(tilt) + z * Math.cos(tilt);
        y = ty; z = tz;
        break;
      }
      case ShapeType.BUDDHA: {
        const r = Math.random();
        let p = new THREE.Vector3();
        if (r < 0.4) {
          p = randomInSphere(3.0);
          p.y *= 0.4; p.y -= 2.0;
          if (p.y < -2.5) p.y = -2.5;
        } else if (r < 0.75) {
          p = randomInSphere(2.0);
          p.y = (Math.random() - 0.5) * 3.0; 
          p.x *= 0.8 * (1 - (p.y + 1.5)/5);
          p.z *= 0.7;
          p.y -= 0.5;
        } else {
          p = randomInSphere(1.2);
          p.y += 1.8;
        }
        x = p.x; y = p.y; z = p.z;
        break;
      }
      case ShapeType.DNA: {
        const t = (i / activeCount) * Math.PI * 30; // More twists for higher count
        const height = 12;
        const yPos = ((i / activeCount) - 0.5) * height;
        const radius = 2.5;
        const strandOffset = (i % 2 === 0) ? 0 : Math.PI;
        x = Math.cos(t + strandOffset) * radius;
        y = yPos;
        z = Math.sin(t + strandOffset) * radius;
        const noise = 0.2;
        x += (Math.random() - 0.5) * noise;
        y += (Math.random() - 0.5) * noise;
        z += (Math.random() - 0.5) * noise;
        break;
      }
      case ShapeType.SPIRAL: {
        const armCount = 3;
        const armIndex = i % armCount;
        const t = Math.random();
        const angleOffset = (armIndex / armCount) * Math.PI * 2;
        const rotation = t * Math.PI * 5;
        const distance = t * 8;
        x = Math.cos(rotation + angleOffset) * distance;
        z = Math.sin(rotation + angleOffset) * distance;
        const thickness = Math.max(0.2, 1.5 * (1 - t));
        y = (Math.random() - 0.5) * thickness;
        x += (Math.random() - 0.5) * 0.3;
        z += (Math.random() - 0.5) * 0.3;
        break;
      }
      case ShapeType.FIREWORKS: {
        const p = randomInSphere(1);
        const dist = 1 + Math.pow(Math.random(), 0.3) * 9; 
        x = p.x * dist; y = p.y * dist; z = p.z * dist;
        break;
      }
      case ShapeType.TREE: {
        const t = i / activeCount; 
        const turns = 16 * t; 
        const angle = turns * Math.PI * 2;
        const height = 13;
        const bottomRadius = 5.5;
        y = (0.5 - t) * height; 
        const currentRadius = t * bottomRadius; 
        const rRandom = Math.random();
        const rOffset = currentRadius * (0.8 + 0.2 * rRandom);
        x = Math.cos(angle) * rOffset;
        z = Math.sin(angle) * rOffset;
        x += (Math.random()-0.5) * 0.5;
        z += (Math.random()-0.5) * 0.5;
        y += (Math.random()-0.5) * 0.5;
        break;
      }
      case ShapeType.SNOWFLAKE: {
        const branchIndex = i % 6;
        const angle = (branchIndex / 6) * Math.PI * 2;
        const t = Math.random(); 
        const length = 7;
        const armX = Math.cos(angle);
        const armY = Math.sin(angle);
        const dist = Math.pow(t, 0.7) * length;
        x = armX * dist;
        y = armY * dist;
        z = (Math.random() - 0.5) * 0.5; 
        if (Math.random() > 0.4) {
            const branchAngle = Math.PI / 3; 
            const branchLen = (1.0 - t) * 2.0;
            const side = Math.random() > 0.5 ? 1 : -1;
            x += Math.cos(angle + side * branchAngle) * Math.random() * branchLen;
            y += Math.sin(angle + side * branchAngle) * Math.random() * branchLen;
        }
        x += (Math.random() - 0.5) * 0.2;
        y += (Math.random() - 0.5) * 0.2;
        break;
      }
      case ShapeType.PUMPKIN: {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u; 
        const phi = Math.acos(2 * v - 1); 
        const rBase = 5;
        const ridges = 1 + 0.15 * Math.cos(8 * theta);
        const r = Math.cbrt(Math.random()) * rBase * ridges;
        const sinPhi = Math.sin(phi);
        x = r * sinPhi * Math.cos(theta);
        z = r * sinPhi * Math.sin(theta);
        y = r * Math.cos(phi) * 0.75; 
        // Stem
        if (Math.random() > 0.96 && y > 2.5) {
             x *= 0.1; z *= 0.1; y += 1.5 * Math.random();
        }
        break;
      }
      case ShapeType.LANTERN: {
        const p = getLanternPoint();
        x = p.x; y = p.y; z = p.z;
        // Tassel
        if (Math.random() > 0.92) {
           y = -4.5 - Math.random() * 3.5;
           x *= 0.15; z *= 0.15;
        }
        // String
        if (Math.random() > 0.985) {
           y = 4.5 + Math.random() * 2.5;
           x *= 0.05; z *= 0.05;
        }
        break;
      }
      case ShapeType.ZONGZI: {
        const scale = 5.0;
        const v1 = new THREE.Vector3(1, 1, 1).multiplyScalar(scale);
        const v2 = new THREE.Vector3(1, -1, -1).multiplyScalar(scale);
        const v3 = new THREE.Vector3(-1, 1, -1).multiplyScalar(scale);
        const v4 = new THREE.Vector3(-1, -1, 1).multiplyScalar(scale);
        
        let w1 = Math.random();
        let w2 = Math.random();
        let w3 = Math.random();
        let w4 = Math.random();
        const sum = w1 + w2 + w3 + w4;
        w1 /= sum; w2 /= sum; w3 /= sum; w4 /= sum;

        x = v1.x * w1 + v2.x * w2 + v3.x * w3 + v4.x * w4;
        y = v1.y * w1 + v2.y * w2 + v3.y * w3 + v4.y * w4;
        z = v1.z * w1 + v2.z * w2 + v3.z * w3 + v4.z * w4;
        
        const noise = 0.15;
        x += (Math.random() - 0.5) * noise;
        y += (Math.random() - 0.5) * noise;
        z += (Math.random() - 0.5) * noise;
        break;
      }
      case ShapeType.EGG: {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const rBase = 4.5;
        const r = Math.cbrt(Math.random()) * rBase;
        const sinPhi = Math.sin(phi);
        x = r * sinPhi * Math.cos(theta);
        z = r * sinPhi * Math.sin(theta);
        let yRaw = Math.cos(phi);
        if (yRaw > 0) yRaw *= 1.35; 
        y = r * yRaw;
        break;
      }
      case ShapeType.RABBIT: {
        const r = Math.random();
        let center = new THREE.Vector3(0,0,0);
        let rad = 1;
        
        if (r < 0.4) { center.set(0, -1, 0); rad = 2.5; } // Body
        else if (r < 0.65) { center.set(0, 2.5, 0.5); rad = 1.6; } // Head
        else if (r < 0.82) { // Ear L
             const t = Math.random(); 
             center.set(-0.8 - t * 0.5, 3.5 + t * 3.5, 0.5 - t * 0.2);
             rad = 0.5;
        } else if (r < 0.99) { // Ear R
             const t = Math.random();
             center.set(0.8 + t * 0.5, 3.5 + t * 3.5, 0.5 - t * 0.2);
             rad = 0.5;
        } else { center.set(0, -2.5, -2.0); rad = 0.6; } // Tail
        
        const p = randomInSphere(rad, center);
        x = p.x; y = p.y; z = p.z;
        break;
      }
      case ShapeType.SNAKE: {
          // Coiled Snake
          const t = i / activeCount; // 0 to 1
          const coils = 4;
          const height = 10;
          
          // Spiral parameters
          const angle = t * Math.PI * 2 * coils;
          const yPos = (t - 0.5) * height;
          
          // Tapered radius (thicker body, thinner tail/head)
          const baseRadius = 3.5;
          const bodyThickness = 0.8 * Math.sin(t * Math.PI); // Thicker in middle
          
          // Main spine
          const spineX = Math.cos(angle) * (baseRadius - t * 1.5); // Taper spiral inwards slightly at top
          const spineZ = Math.sin(angle) * (baseRadius - t * 1.5);
          
          // Volume around spine
          const volR = Math.random() * bodyThickness + 0.1;
          const volTheta = Math.random() * Math.PI * 2;
          const volPhi = Math.random() * Math.PI;
          
          x = spineX + volR * Math.sin(volPhi) * Math.cos(volTheta);
          z = spineZ + volR * Math.sin(volPhi) * Math.sin(volTheta);
          y = yPos + volR * Math.cos(volPhi);
          
          // Head area details (top of spiral)
          if (t > 0.98) {
             x += (Math.random()-0.5) * 0.5; 
             z += (Math.random()-0.5) * 0.5;
          }
          break;
      }
      case ShapeType.BRIDGE: {
          // Qixi Magpie Bridge
          // Arc: y = -x^2
          const t = (Math.random() - 0.5) * 2; // -1 to 1
          const width = 12;
          x = t * width;
          // Arch equation
          y = Math.cos(t * 1.4) * 4 - 2; 
          z = (Math.random() - 0.5) * 3; // Bridge width
          
          // Add thickness to bridge
          y += (Math.random() - 0.5) * 0.5;
          
          // Lovers (Two clusters at the peak x~0)
          if (Math.random() > 0.95) {
             const side = Math.random() > 0.5 ? 1.5 : -1.5;
             x = side + (Math.random() - 0.5);
             y = 2 + Math.random() * 2; // Standing on top
             z = (Math.random() - 0.5);
          }
          break;
      }
      case ShapeType.FLAG: {
          // National Flag
          // Plane with wave: z = sin(x)
          const w = 16;
          const h = 10;
          
          const u = Math.random(); // 0-1 X
          const v = Math.random(); // 0-1 Y
          
          x = (u - 0.5) * w;
          y = (v - 0.5) * h;
          
          // Wave
          z = Math.sin(x * 0.5) * 1.5 + (Math.random() - 0.5) * 0.1;
          
          // Color Logic (Five Star Flag)
          // Top Left Corner (x < -0.3*w/2, y > 0) roughly
          // We need to set the color buffer here manually since we aren't using the standard gradient
          // Red: 1, 0, 0
          // Yellow: 1, 1, 0
          
          if (colors) {
              const inStarArea = (u < 0.4 && v > 0.5);
              if (inStarArea) {
                  // Simple approximation: Random scattered stars in the top left
                  // To make stars visible, we make points yellow if they fall into specific circle areas
                  // Large star center: u=0.15, v=0.75
                  // Small stars around
                  
                  // Coordinate relative to top-left
                  // Let's just make the top-left quadrant have yellow stars scattered
                  const isStar = Math.random() > 0.85; 
                  if (isStar) {
                    colors[i3] = 1.0; colors[i3+1] = 1.0; colors[i3+2] = 0.0; // Yellow
                  } else {
                    colors[i3] = 0.9; colors[i3+1] = 0.0; colors[i3+2] = 0.0; // Red
                  }
              } else {
                  colors[i3] = 0.9; colors[i3+1] = 0.0; colors[i3+2] = 0.0; // Red
              }
          }
          break;
      }
    }

    positions[i3] = x;
    positions[i3+1] = y;
    positions[i3+2] = z;
  }

  return { positions, colors, currentCount: activeCount };
};
