import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
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
  particleSize: number; // User controlled multiplier
  imageData: ImageData | null;
  customParticleTextures: THREE.Texture[]; // Changed to array
}

// -----------------------------------------------------------------------------
// SHADERS
// -----------------------------------------------------------------------------

const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uExpansion; 
  uniform float uPixelRatio;
  
  attribute vec3 color;      // Custom color attribute
  attribute float pSize;     // Random per-particle size multiplier
  attribute float pRotation; // Random initial rotation
  attribute float pSizeOverride; // Override size from geometry
  attribute float pMixTexture;   // 0.0 = Force Circle, 1.0 = Allow Texture
  attribute float pIsPhoto;      // 0.0 = Standard, 1.0 = Photo Particle
  attribute float pTextureIndex; // Index of texture to use (0-4)

  varying vec3 vColor;
  varying float vRotation;
  varying float vMixTexture;
  varying float vIsPhoto;
  varying float vTextureIndex;

  void main() {
    vColor = color;
    vRotation = pRotation;
    vMixTexture = pMixTexture;
    vIsPhoto = pIsPhoto;
    vTextureIndex = pTextureIndex;

    // 1. Base Position
    vec3 pos = position;

    // 2. Expansion (Explosion effect from center)
    vec3 dir = normalize(pos);
    if (length(pos) < 0.001) dir = vec3(0.0, 1.0, 0.0);
    pos += dir * uExpansion * 8.0; 

    // 3. Scale 
    pos *= uScale;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation
    float finalSize = (pSizeOverride > 0.0) ? pSizeOverride : pSize;
    
    // Calculate final point size
    float size = uSize * finalSize * uPixelRatio * (20.0 / -mvPosition.z);
    gl_PointSize = max(size, 2.0); 
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  
  // Multiple texture samplers
  uniform sampler2D uTexture0;
  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform sampler2D uTexture3;
  uniform sampler2D uTexture4;
  
  uniform float uHasPhoto; // global flag to switch blending/logic

  varying vec3 vColor;
  varying float vRotation;
  varying float vMixTexture;
  varying float vIsPhoto;
  varying float vTextureIndex;

  #define PI 3.14159265359

  vec2 rotate(vec2 uv, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c) * uv;
  }

  // Circle SDF
  float sdCircle(vec2 p, float r) {
      return length(p) - r;
  }

  void main() {
    // 1. PHOTO PARTICLE MODE
    if (vIsPhoto > 0.5) {
        // Standard UV mapping for the point sprite (0.0 to 1.0)
        // Flip Y is needed for standard textures in WebGL usually
        vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);

        vec4 texColor = vec4(1.0, 1.0, 1.0, 1.0);
        int idx = int(vTextureIndex + 0.1); // Round safe

        if (idx == 0) texColor = texture2D(uTexture0, uv);
        else if (idx == 1) texColor = texture2D(uTexture1, uv);
        else if (idx == 2) texColor = texture2D(uTexture2, uv);
        else if (idx == 3) texColor = texture2D(uTexture3, uv);
        else if (idx == 4) texColor = texture2D(uTexture4, uv);

        if (texColor.a < 0.1) discard;
        
        // No darkening/shading, show original photo brightness
        gl_FragColor = vec4(vColor * texColor.rgb, texColor.a);
        return;
    }

    // 2. PROCEDURAL / MIXED MODE
    vec2 uv = gl_PointCoord - 0.5;

    float spinSpeed = 0.5 + 0.5 * sin(vRotation * 10.0); 
    vec2 rotatedUV = rotate(uv, vRotation + uTime * spinSpeed);

    float dist = sdCircle(rotatedUV, 0.4);
    float smoothing = 0.05; 
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
  particleSize = 1.0,
  gestureRef,
  imageData,
  customParticleTextures
}) => {
  const meshRef = useRef<THREE.Points>(null);
  
  // 1. Generate Static Random Attributes (Size, Rotation)
  const { randomSizes, rotations } = useMemo(() => {
    const randomSizes = new Float32Array(MAX_PARTICLE_COUNT);
    const rotations = new Float32Array(MAX_PARTICLE_COUNT);

    for (let i = 0; i < MAX_PARTICLE_COUNT; i++) {
      randomSizes[i] = 0.5 + Math.random() * 2.0;
      rotations[i] = Math.random() * Math.PI * 2;
    }
    return { randomSizes, rotations };
  }, []);

  // 2. Generate Base Shape Positions
  const { positions, colors: imageColors, currentCount: baseCount, sizes: overrideSizes, textureMix } = useMemo(() => {
    return generateShapePositions(shape, imageData);
  }, [shape, imageData]);

  // Determine photo count (max 5)
  const photoCount = Math.min(customParticleTextures.length, 5);
  // Total count = base shape particles + 1 particle per photo
  const currentCount = Math.min(baseCount + photoCount, MAX_PARTICLE_COUNT);

  // 3. Update Geometry & Attributes
  useEffect(() => {
    if (!meshRef.current) return;
    const geometry = meshRef.current.geometry;
    
    // Set Draw Range
    geometry.setDrawRange(0, currentCount);

    // --- POSITIONS ---
    // If we have photos, place them randomly in the center area
    if (photoCount > 0) {
        for(let i=0; i<photoCount; i++) {
             const idx = baseCount + i;
             const i3 = idx * 3;
             
             // Random position within a sphere of radius 6
             // This puts them "amongst" the cloud
             const r = 6.0 * Math.cbrt(Math.random());
             const theta = Math.random() * Math.PI * 2;
             const phi = Math.acos(2 * Math.random() - 1);
             
             positions[i3] = r * Math.sin(phi) * Math.cos(theta);
             positions[i3+1] = r * Math.sin(phi) * Math.sin(theta);
             positions[i3+2] = r * Math.cos(phi);
        }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // --- COLORS ---
    const colors = new Float32Array(MAX_PARTICLE_COUNT * 3);
    const useGeometryColors = imageColors && (
        shape === ShapeType.FLAG || 
        shape === ShapeType.TREE || 
        shape === ShapeType.IMAGE || 
        shape === ShapeType.TEXT ||
        colorMode === ColorMode.IMAGE
    );
    const effectiveUseGeometryColors = useGeometryColors || (shape === ShapeType.IMAGE || shape === ShapeType.TEXT);

    if (effectiveUseGeometryColors && imageColors) {
        colors.set(imageColors);
    } else {
       // Gradient / Mono Generation
       const c1 = new THREE.Color(baseColor);
       const c2 = new THREE.Color(secondaryColor);
       
       for(let i=0; i<baseCount; i++) {
           let r = 0, g = 0, b = 0;
           if (colorMode === ColorMode.MONOCHROME) {
               r = c1.r; g = c1.g; b = c1.b;
           } else if (colorMode === ColorMode.RAINBOW) {
               const c = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);
               r = c.r; g = c.g; b = c.b;
           } else {
               const ratio = i / baseCount;
               const c = c1.clone().lerp(c2, ratio);
               r = c.r; g = c.g; b = c.b;
           }
           colors[i*3] = r;
           colors[i*3+1] = g;
           colors[i*3+2] = b;
       }
    }

    // Photo Particles are White (to preserve texture colors)
    if (photoCount > 0) {
        for(let i=0; i<photoCount; i++) {
             const idx = baseCount + i;
             colors[idx*3] = 1.0;
             colors[idx*3+1] = 1.0;
             colors[idx*3+2] = 1.0;
        }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // --- SIZES ---
    const sizeBuffer = overrideSizes || new Float32Array(MAX_PARTICLE_COUNT);
    if (photoCount > 0) {
        for(let i=0; i<photoCount; i++) {
            // INCREASED SIZE from 2.5 to 6.0
            // This ensures they are visible (approx 24px) but not huge
            sizeBuffer[baseCount + i] = 6.0; 
        }
    }
    geometry.setAttribute('pSizeOverride', new THREE.BufferAttribute(sizeBuffer, 1));

    // --- TEXTURE MIX & INDEX ---
    const mixBuffer = textureMix || new Float32Array(MAX_PARTICLE_COUNT).fill(1.0);
    const isPhotoBuffer = new Float32Array(MAX_PARTICLE_COUNT);
    const textureIndexBuffer = new Float32Array(MAX_PARTICLE_COUNT);

    if (photoCount > 0) {
        for(let i=0; i<photoCount; i++) {
            const idx = baseCount + i;
            mixBuffer[idx] = 1.0;
            isPhotoBuffer[idx] = 1.0;
            textureIndexBuffer[idx] = i; // 0, 1, 2...
        }
    }
    
    geometry.setAttribute('pMixTexture', new THREE.BufferAttribute(mixBuffer, 1));
    geometry.setAttribute('pIsPhoto', new THREE.BufferAttribute(isPhotoBuffer, 1));
    geometry.setAttribute('pTextureIndex', new THREE.BufferAttribute(textureIndexBuffer, 1));

    // --- RANDOM ATTRIBUTES ---
    geometry.setAttribute('pSize', new THREE.BufferAttribute(randomSizes, 1));
    geometry.setAttribute('pRotation', new THREE.BufferAttribute(rotations, 1));
    
    // Updates
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.pSizeOverride.needsUpdate = true;
    geometry.attributes.pMixTexture.needsUpdate = true;
    geometry.attributes.pIsPhoto.needsUpdate = true;
    geometry.attributes.pTextureIndex.needsUpdate = true;
    geometry.attributes.pSize.needsUpdate = true;
    geometry.attributes.pRotation.needsUpdate = true;

  }, [positions, imageColors, currentCount, baseCount, randomSizes, rotations, overrideSizes, textureMix, colorMode, baseColor, secondaryColor, shape, photoCount]);

  // Memoize uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSize: { value: 4.0 }, 
    uScale: { value: 1.0 },
    uExpansion: { value: 0.0 },
    uOpacity: { value: 1.0 },
    uPixelRatio: { value: 1.0 },
    uHasPhoto: { value: 0.0 },
    // Slots for up to 5 photos
    uTexture0: { value: null },
    uTexture1: { value: null },
    uTexture2: { value: null },
    uTexture3: { value: null },
    uTexture4: { value: null },
  }), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const { clock } = state;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    
    material.uniforms.uTime.value = clock.getElapsedTime();
    material.uniforms.uScale.value = scale; 
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);

    let baseSize = 4.0;
    if (shape === ShapeType.IMAGE || shape === ShapeType.TEXT) {
        baseSize = 6.0; 
    }
    baseSize *= particleSize;
    material.uniforms.uSize.value = baseSize;

    const gesture = gestureRef.current;
    
    material.uniforms.uExpansion.value = THREE.MathUtils.lerp(
        material.uniforms.uExpansion.value,
        gesture.expansion,
        0.1
    );

    const targetScale = gesture.zoom;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

    // Bind Textures
    if (customParticleTextures.length > 0) {
        material.uniforms.uHasPhoto.value = 1.0;
        // Bind up to 5 textures
        if (customParticleTextures[0]) material.uniforms.uTexture0.value = customParticleTextures[0];
        if (customParticleTextures[1]) material.uniforms.uTexture1.value = customParticleTextures[1];
        if (customParticleTextures[2]) material.uniforms.uTexture2.value = customParticleTextures[2];
        if (customParticleTextures[3]) material.uniforms.uTexture3.value = customParticleTextures[3];
        if (customParticleTextures[4]) material.uniforms.uTexture4.value = customParticleTextures[4];
        
        // Use Normal blending for clearer photos
        material.blending = THREE.NormalBlending;
    } else {
        material.uniforms.uHasPhoto.value = 0.0;
        material.blending = THREE.AdditiveBlending;
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
        uniforms={uniforms}
      />
    </points>
  );
};

export default Particles;