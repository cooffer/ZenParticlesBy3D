
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
  uniform float uExpansion; 
  uniform float uPixelRatio;
  
  attribute vec3 color;      // Custom color attribute
  attribute float pSize;     // Random per-particle size multiplier
  attribute float pRotation; // Random initial rotation
  attribute float pSizeOverride; // Override size from geometry
  attribute float pMixTexture;   // 0.0 = Force Circle, 1.0 = Allow Texture

  varying vec3 vColor;
  varying float vRotation;
  varying float vMixTexture;

  void main() {
    vColor = color;
    vRotation = pRotation;
    vMixTexture = pMixTexture;

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
    
    float size = uSize * finalSize * uPixelRatio * (20.0 / -mvPosition.z);
    gl_PointSize = max(size, 2.0); 
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  uniform int uUseTexture;
  uniform sampler2D uTexture;

  varying vec3 vColor;
  varying float vRotation;
  varying float vMixTexture;

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
    // Logic: Use texture ONLY if uUseTexture is active AND the specific particle allows it (vMixTexture > 0.5)
    // For Tree: Leaves have vMixTexture=0, Ornaments have vMixTexture=1
    // For Other shapes: Default vMixTexture=1
    if (uUseTexture == 1 && vMixTexture > 0.5) {
        vec2 rotatedUV = rotate(gl_PointCoord - 0.5, vRotation) + 0.5;
        vec4 texColor = texture2D(uTexture, rotatedUV);
        
        if (texColor.a < 0.1) discard;
        
        // Multiply by vColor to tint the texture
        // This preserves the "Gold/Red" assignment from geometry.ts while showing the photo
        gl_FragColor = vec4(vColor * texColor.rgb, uOpacity * texColor.a);
        return;
    }

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
  gestureRef,
  imageData,
  customParticleTexture
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

  // 2. Generate Positions, Colors, Specific Sizes & TextureMix
  const { positions, colors: imageColors, currentCount, sizes: overrideSizes, textureMix } = useMemo(() => {
    return generateShapePositions(shape, imageData);
  }, [shape, imageData]);

  // 3. Update Geometry & Attributes
  useEffect(() => {
    if (!meshRef.current) return;
    const geometry = meshRef.current.geometry;
    
    geometry.setDrawRange(0, currentCount);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Color Priority Logic
    const useGeometryColors = imageColors && (
        shape === ShapeType.FLAG || 
        shape === ShapeType.TREE || 
        colorMode === ColorMode.IMAGE
    );

    if (useGeometryColors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(imageColors, 3));
    } else {
       // Gradient / Mono Generation
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

    // Custom Attributes
    geometry.setAttribute('pSize', new THREE.BufferAttribute(randomSizes, 1));
    geometry.setAttribute('pRotation', new THREE.BufferAttribute(rotations, 1));
    
    const sizeBuffer = overrideSizes || new Float32Array(MAX_PARTICLE_COUNT);
    geometry.setAttribute('pSizeOverride', new THREE.BufferAttribute(sizeBuffer, 1));

    // Texture Mix Attribute (New)
    // If textureMix is provided by geometry (Tree), use it. Else default to 1.0s.
    const mixBuffer = textureMix || new Float32Array(MAX_PARTICLE_COUNT).fill(1.0);
    geometry.setAttribute('pMixTexture', new THREE.BufferAttribute(mixBuffer, 1));

    geometry.attributes.position.needsUpdate = true;
    if (geometry.attributes.color) geometry.attributes.color.needsUpdate = true;
    geometry.attributes.pSize.needsUpdate = true;
    geometry.attributes.pRotation.needsUpdate = true;
    geometry.attributes.pSizeOverride.needsUpdate = true;
    geometry.attributes.pMixTexture.needsUpdate = true;

  }, [positions, imageColors, currentCount, randomSizes, rotations, overrideSizes, textureMix, colorMode, baseColor, secondaryColor, shape]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const { clock } = state;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    
    material.uniforms.uTime.value = clock.getElapsedTime();
    material.uniforms.uScale.value = scale; 
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);

    const gesture = gestureRef.current;
    
    material.uniforms.uExpansion.value = THREE.MathUtils.lerp(
        material.uniforms.uExpansion.value,
        gesture.expansion,
        0.1
    );

    const targetScale = gesture.zoom;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, gesture.rotation, 0.1);

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
            uSize: { value: 4.0 }, 
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
