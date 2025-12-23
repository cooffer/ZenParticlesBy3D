
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_PARTICLE_COUNT, generateShapePositions } from '../utils/geometry';
import { ShapeType, ColorMode, GestureState } from '../types';

interface ParticlesProps {
  shape: ShapeType;
  colorMode: ColorMode;
  baseColor: string;
  secondaryColor: string;
  gestureRef: React.MutableRefObject<GestureState>;
  scale: number;
  opacity: number;
  imageData: ImageData | null;
  customParticleTexture: THREE.Texture | null;
}

// -----------------------------------------------------------------------------
// SHADERS
// -----------------------------------------------------------------------------

const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uExpansion; // Added for Pinch/Spread gesture
  uniform float uPixelRatio;
  
  attribute vec3 color;      // Custom color attribute
  attribute float pSize;     // Random per-particle size multiplier
  attribute float pRotation; // Random initial rotation

  varying vec3 vColor;
  varying float vRotation;

  void main() {
    vColor = color;
    vRotation = pRotation;

    // 1. Base Position
    vec3 pos = position;

    // 2. Expansion (Explosion effect from center)
    // Push particles outward along their normal vector
    vec3 dir = normalize(pos);
    // If position is (0,0,0), avoid NaN
    if (length(pos) < 0.001) dir = vec3(0.0, 1.0, 0.0);
    
    // Increased multiplier from 5.0 to 8.0 for stronger gesture feedback
    pos += dir * uExpansion * 8.0; 

    // 3. Scale (UI Scale Slider)
    pos *= uScale;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation
    // uSize: Base Global Size (Reduced to 4.0 for basic particle look)
    // pSize: Per-particle random variation (0.5 to 2.5)
    // 20.0: Perspective multiplier constant
    // -mvPosition.z: Distance to camera
    float size = uSize * pSize * uPixelRatio * (20.0 / -mvPosition.z);
    gl_PointSize = max(size, 2.0); // Allow smaller particles for depth
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  uniform int uUseTexture;
  uniform sampler2D uTexture;

  varying vec3 vColor;
  varying float vRotation;

  // Constants
  #define PI 3.14159265359

  // Rotate UV coordinates
  vec2 rotate(vec2 uv, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c) * uv;
  }

  // --- Signed Distance Functions (SDF) ---
  
  // Circle
  float sdCircle(vec2 p, float r) {
      return length(p) - r;
  }

  void main() {
    // If using custom texture (user uploaded), skip procedural shapes
    if (uUseTexture == 1) {
        vec4 texColor = texture2D(uTexture, gl_PointCoord);
        if (texColor.a < 0.1) discard;
        gl_FragColor = vec4(vColor * texColor.rgb, uOpacity * texColor.a);
        return;
    }

    // Normalized coordinates (-0.5 to 0.5)
    vec2 uv = gl_PointCoord - 0.5;

    // Apply Rotation (Initial random + slow spin over time)
    // Spin speed varies slightly based on rotation seed
    float spinSpeed = 0.5 + 0.5 * sin(vRotation * 10.0); 
    
    vec2 rotatedUV = rotate(uv, vRotation + uTime * spinSpeed);

    // Basic Circle Shape (Basic Particle)
    float dist = sdCircle(rotatedUV, 0.4);
    
    // Smoothing factor for edges
    float smoothing = 0.05; 

    // Rendering
    // SDFs return < 0 inside the shape, > 0 outside.
    // We want 1.0 inside, 0.0 outside.
    float alpha = 1.0 - smoothstep(0.0, smoothing, dist);

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha * uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// COMPONENT
// -----------------------------------------------------------------------------

const Particles: React.FC<ParticlesProps> = ({ 
  shape, 
  colorMode, 
  baseColor, 
  secondaryColor, 
  scale, 
  opacity,
  gestureRef,
  imageData,
  customParticleTexture
}) => {
  const meshRef = useRef<THREE.Points>(null);
  
  // 1. Generate Static Random Attributes (Size, Rotation)
  // These do not change when shape morphs, giving particles persistent "identity"
  // Initialize to MAX_PARTICLE_COUNT
  const { randomSizes, rotations } = useMemo(() => {
    const randomSizes = new Float32Array(MAX_PARTICLE_COUNT);
    const rotations = new Float32Array(MAX_PARTICLE_COUNT);

    for (let i = 0; i < MAX_PARTICLE_COUNT; i++) {
      // Random Size: 0.5x to 2.5x
      randomSizes[i] = 0.5 + Math.random() * 2.0;
      
      // Random Rotation: 0 to 2PI
      rotations[i] = Math.random() * Math.PI * 2;
    }
    return { randomSizes, rotations };
  }, []);

  // 2. Generate Positions & Colors based on Shape/Mode
  // Also returns 'currentCount' which tells us how many particles are actually valid
  const { positions, colors: imageColors, currentCount } = useMemo(() => {
    return generateShapePositions(shape, imageData);
  }, [shape, imageData]);

  // 3. Update Geometry & Attributes
  useEffect(() => {
    if (!meshRef.current) return;
    const geometry = meshRef.current.geometry;
    
    // Dynamically set how many particles to draw
    geometry.setDrawRange(0, currentCount);

    // Position
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Color Handling
    // LOGIC FIX:
    // We prioritize imageColors (from geometry) ONLY if:
    // 1. It is a Flag (which returns specific procedural colors in the color buffer)
    // 2. The mode is explicitly set to IMAGE (e.g. user uploaded photo)
    // For TEXT shape, we usually want to use the Base/Secondary colors (Gradient/Mono), not the white pixels from the canvas.
    const useGeometryColors = imageColors && (shape === ShapeType.FLAG || colorMode === ColorMode.IMAGE);

    if (useGeometryColors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(imageColors, 3));
    } else {
       // Since the geometry buffer might be larger than currentCount, we fill what we need
       // We regenerate the color buffer for the active set.
       
       const generatedColors = new Float32Array(MAX_PARTICLE_COUNT * 3);
       const c1 = new THREE.Color(baseColor);
       const c2 = new THREE.Color(secondaryColor);
       
       for(let i=0; i<currentCount; i++) {
           let r = 0, g = 0, b = 0;

           if (colorMode === ColorMode.MONOCHROME) {
               r = c1.r; g = c1.g; b = c1.b;
           } else if (colorMode === ColorMode.RAINBOW) {
               const c = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);
               r = c.r; g = c.g; b = c.b;
           } else {
               // Gradient
               const ratio = i / currentCount;
               const c = c1.clone().lerp(c2, ratio);
               r = c.r; g = c.g; b = c.b;
           }
           generatedColors[i*3] = r;
           generatedColors[i*3+1] = g;
           generatedColors[i*3+2] = b;
       }
       geometry.setAttribute('color', new THREE.BufferAttribute(generatedColors, 3));
    }

    // Custom Attributes for Random Shapes
    // We already have these pre-calculated for MAX_COUNT, just attach them.
    geometry.setAttribute('pSize', new THREE.BufferAttribute(randomSizes, 1));
    geometry.setAttribute('pRotation', new THREE.BufferAttribute(rotations, 1));

    geometry.attributes.position.needsUpdate = true;
    if (geometry.attributes.color) geometry.attributes.color.needsUpdate = true;
    geometry.attributes.pSize.needsUpdate = true;
    geometry.attributes.pRotation.needsUpdate = true;

  }, [positions, imageColors, currentCount, randomSizes, rotations, colorMode, baseColor, secondaryColor, shape]);

  // 4. Render Loop
  useFrame((state) => {
    if (!meshRef.current) return;
    
    const { clock } = state;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    
    // Update Time & Uniforms
    material.uniforms.uTime.value = clock.getElapsedTime();
    material.uniforms.uScale.value = scale; 
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);

    // Gestures
    const gesture = gestureRef.current;
    
    // Expansion (Lerp for smoothness)
    material.uniforms.uExpansion.value = THREE.MathUtils.lerp(
        material.uniforms.uExpansion.value,
        gesture.expansion,
        0.1
    );

    // Zoom (Push/Pull): Map to Mesh Scale
    // WebcamHandler Zoom range: 0.2 to 5.0
    const targetScale = gesture.zoom;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

    // Rotation (Tilt)
    meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, gesture.rotation, 0.1);

    // Handle Custom Texture Toggle
    if (customParticleTexture) {
        material.uniforms.uUseTexture.value = 1;
        material.uniforms.uTexture.value = customParticleTexture;
    } else {
        material.uniforms.uUseTexture.value = 0;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry />
      <shaderMaterial 
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
            uTime: { value: 0 },
            uSize: { value: 4.0 }, // Basic small particles
            uScale: { value: 1.0 },
            uExpansion: { value: 0.0 },
            uOpacity: { value: 1.0 },
            uPixelRatio: { value: 1.0 },
            uUseTexture: { value: 0 },
            uTexture: { value: null }
        }}
      />
    </points>
  );
};

export default Particles;
