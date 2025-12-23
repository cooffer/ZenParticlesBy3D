import React, { useState, useRef, Suspense, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { 
  Heart,
  Globe,
  Flower2,
  Smile,
  Circle,
  Wind,
  Type,
  Eye,
  EyeOff,
  Camera,
  Image as ImageIcon,
  Aperture,
  Sparkles,
  Activity,
  Trees,      // Christmas
  Snowflake,  // Winter
  Ghost,      // Halloween
  Gift,       // Generic
  Flame,      // Lantern (closest)
  Triangle,   // Zongzi
  Egg,        // Egg
  Rabbit,      // Rabbit
  Flag,        // National Day
  Users,       // Qixi (Lovers)
  Target,      // Fu (Abstract for now, or just use Type)
  Trash2       // Clear Icon
} from 'lucide-react';

import Particles from './components/Particles';
import WebcamHandler from './components/WebcamHandler';
import { ShapeType, ColorMode, GestureState } from './types';

// Helper component to handle screen capture from within the Canvas context
const ScreenshotHelper = ({ trigger, onComplete }: { trigger: boolean, onComplete: () => void }) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (trigger) {
      gl.render(scene, camera);
      const data = gl.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.setAttribute('download', `zen-particles-${Date.now()}.png`);
      link.setAttribute('href', data);
      link.click();
      onComplete();
    }
  }, [trigger, gl, scene, camera, onComplete]);
  return null;
};

const App: React.FC = () => {
  // --- STATE ---
  const [shape, setShape] = useState<ShapeType>(ShapeType.HEART);
  const [colorMode, setColorMode] = useState<ColorMode>(ColorMode.GRADIENT);
  const [baseColor, setBaseColor] = useState<string>('#ff0055');
  const [secondaryColor, setSecondaryColor] = useState<string>('#4400ff');
  const [scale, setScale] = useState<number>(1.0);
  const [opacity, setOpacity] = useState<number>(0.6); // Default slightly transparent
  const [particleSize, setParticleSize] = useState<number>(1.0); // New Particle Size Multiplier
  const [customText, setCustomText] = useState<string>('ZEN');
  const [showUI, setShowUI] = useState<boolean>(true);
  const [takeScreenshot, setTakeScreenshot] = useState<boolean>(false);
  const [holidayMessage, setHolidayMessage] = useState<string | null>(null);
  
  // Custom Particle Textures (Array of Photos)
  const [particleTextures, setParticleTextures] = useState<THREE.Texture[]>([]);

  const gestureStateRef = useRef<GestureState>({
    expansion: 0,
    rotation: 0,
    zoom: 1.0,
    isPeaceSign: false,
    isNamaste: false
  });
  
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  
  const [photoData, setPhotoData] = useState<ImageData | null>(null);
  const [textData, setTextData] = useState<ImageData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null); // For Particle Texture
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  // Memoize which image data to use based on current shape
  const activeImageData = useMemo(() => {
    if (shape === ShapeType.IMAGE) return photoData;
    if (shape === ShapeType.TEXT) return textData;
    return null;
  }, [shape, photoData, textData]);

  // Helper to apply theme
  const applyTheme = (newShape: ShapeType, color1: string, color2: string, mode: ColorMode = ColorMode.GRADIENT, msg?: string, textOverride?: string) => {
      if (textOverride) {
          setCustomText(textOverride);
      }
      setShape(newShape);
      setBaseColor(color1);
      setSecondaryColor(color2);
      setColorMode(mode);
      if (msg) {
          setHolidayMessage(msg);
          setTimeout(() => setHolidayMessage(null), 4000);
      }
  };

  // Holiday Detection Logic
  useEffect(() => {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const day = today.getDate();

    let detectedHoliday = false;

    // 1. Christmas (Dec 20 - Dec 31)
    if (month === 12 && day >= 20) {
        applyTheme(ShapeType.TREE, '#2f5a2f', '#ff0000', ColorMode.GRADIENT, 'Merry Christmas! 🎄');
        detectedHoliday = true;
    }
    // 2. New Year (Jan 1)
    else if (month === 1 && day === 1) {
        applyTheme(ShapeType.FIREWORKS, '#ff0000', '#ffd700', ColorMode.RAINBOW, 'Happy New Year! 🎆');
        detectedHoliday = true;
    }
    // 3. Valentine's (Feb 12 - Feb 15) - ROSE
    else if (month === 2 && day >= 12 && day <= 15) {
        applyTheme(ShapeType.ROSE, '#ff0055', '#cc0000', ColorMode.GRADIENT, 'Happy Valentine\'s Day! 🌹');
        detectedHoliday = true;
    }
    // 4. Halloween (Oct 25 - Oct 31)
    else if (month === 10 && day >= 25) {
        applyTheme(ShapeType.PUMPKIN, '#ff6600', '#2a1a0a', ColorMode.GRADIENT, 'Spooky Season! 🎃');
        detectedHoliday = true;
    }
    // 5. Spring Festival / CNY (Rough check: Jan 20 - Feb 20)
    else if ((month === 1 && day >= 20) || (month === 2 && day <= 10)) {
         if (!detectedHoliday) {
            applyTheme(ShapeType.TEXT, '#DE2910', '#FF4D00', ColorMode.GRADIENT, 'Happy Chinese New Year! 🧧', '福');
            detectedHoliday = true;
         }
    }
    // 6. Dragon Boat (Rough check: June) - ZONGZI
    else if (month === 6 && day >= 1 && day <= 15) {
         applyTheme(ShapeType.ZONGZI, '#228b22', '#f5f5dc', ColorMode.GRADIENT, 'Dragon Boat Festival! 🛶');
         detectedHoliday = true;
    }
    // 7. Qixi (Chinese Valentine) (Rough check: Aug) - BRIDGE
    else if (month === 8 && day >= 1 && day <= 15) {
         applyTheme(ShapeType.BRIDGE, '#4b0082', '#00bfff', ColorMode.GRADIENT, 'Happy Qixi Festival! 🌉');
         detectedHoliday = true;
    }
    // 8. Mid-Autumn (Rough check: Sept/Oct) - RABBIT
    else if ((month === 9 && day >= 15) || (month === 10 && day <= 5)) {
         if (!detectedHoliday) { 
             applyTheme(ShapeType.RABBIT, '#000033', '#ffffe0', ColorMode.GRADIENT, 'Mid-Autumn Festival! 🐇');
             detectedHoliday = true;
         }
    }
    // 9. National Day (Oct 1) - FLAG
    else if (month === 10 && day === 1) {
         applyTheme(ShapeType.FLAG, '#ff0000', '#ffff00', ColorMode.GRADIENT, 'National Day! 🇨🇳');
         detectedHoliday = true;
    }
    
  }, []);

  const handleGestureUpdate = useCallback((newState: GestureState) => {
    gestureStateRef.current = newState;
  }, []);

  const handleCameraStatus = useCallback((ready: boolean) => {
    setCameraReady(ready);
  }, []);

  // Handle Image Upload for "Image Shape"
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = hiddenCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const maxSize = 300;
            let w = img.width;
            let h = img.height;
            if (w > h) {
               if (w > maxSize) { h *= maxSize / w; w = maxSize; }
            } else {
               if (h > maxSize) { w *= maxSize / h; h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h);
            setPhotoData(data);
            setShape(ShapeType.IMAGE);
            setColorMode(ColorMode.IMAGE);
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle Texture Upload for "Custom Particles"
  const handleTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (particleTextures.length >= 5) {
          alert("Max 5 photo particles allowed.");
          return;
      }

      const loader = new THREE.TextureLoader();
      loader.load(URL.createObjectURL(file), (tex) => {
          // IMPORTANT: Enable linear filtering for non-power-of-two images
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          
          setParticleTextures(prev => [...prev, tex]);
          
          // Reset file input so same file can be selected again if needed (though unlikely)
          if (textureInputRef.current) textureInputRef.current.value = '';
      });
  };

  // Process Text to Image Data
  useEffect(() => {
    if (shape !== ShapeType.TEXT) return;
    
    const canvas = hiddenCanvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const fontSize = 150; 
            ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
            const textMetrics = ctx.measureText(customText);
            const w = Math.ceil(textMetrics.width) || 100;
            const h = fontSize * 1.5;
            
            canvas.width = w;
            canvas.height = h;
            
            ctx.clearRect(0, 0, w, h);
            
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
            ctx.fillText(customText, w/2, h/2);
            
            const data = ctx.getImageData(0,0,w,h);
            setTextData(data);
        }
    }
  }, [customText, shape]);


  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
        {/* Hidden Canvas */}
        <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />

        {/* Holiday Toast */}
        {holidayMessage && (
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-full shadow-lg shadow-purple-500/30 animate-bounce flex items-center gap-2 font-semibold whitespace-nowrap">
                <Gift size={20} />
                {holidayMessage}
            </div>
        )}

        {/* 3D Scene */}
        <Canvas camera={{ position: [0, 0, 20], fov: 60 }} gl={{ preserveDrawingBuffer: true }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <Suspense fallback={null}>
                <Particles 
                    shape={shape}
                    colorMode={colorMode}
                    baseColor={baseColor}
                    secondaryColor={secondaryColor}
                    scale={scale}
                    opacity={opacity}
                    particleSize={particleSize}
                    gestureRef={gestureStateRef}
                    imageData={activeImageData}
                    customParticleTextures={particleTextures}
                />
            </Suspense>
            <OrbitControls enableDamping dampingFactor={0.05} />
            <ScreenshotHelper trigger={takeScreenshot} onComplete={() => setTakeScreenshot(false)} />
        </Canvas>

        {/* Webcam */}
        <WebcamHandler onGestureUpdate={handleGestureUpdate} onCameraStatus={handleCameraStatus} />

        {/* UI Controls */}
        <div className={`absolute top-0 right-0 h-full w-80 bg-slate-900/90 backdrop-blur-md border-l border-white/10 p-6 transition-transform duration-300 overflow-y-auto z-40 ${showUI ? 'translate-x-0' : 'translate-x-full'}`}>
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500 mb-6">ZenParticles</h1>

            {/* Particle Texture Upload (Prominent) */}
            <div className="mb-6 p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-pink-400 uppercase tracking-wider flex items-center gap-2">
                        <Aperture size={14} /> Add 3D Photos ({particleTextures.length}/5)
                    </label>
                    {particleTextures.length > 0 && (
                        <button onClick={() => setParticleTextures([])} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                            <Trash2 size={12} /> Clear
                        </button>
                    )}
                </div>
                <p className="text-[10px] text-slate-400 mb-2">Add up to 5 photos. They will float and spin in 3D among the particles.</p>
                
                <button 
                    onClick={() => textureInputRef.current?.click()} 
                    disabled={particleTextures.length >= 5}
                    className={`w-full py-2 rounded text-xs transition-colors flex items-center justify-center gap-2 ${particleTextures.length >= 5 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                >
                    {particleTextures.length >= 5 ? "Limit Reached" : "Add Photo"}
                </button>
                <input type="file" ref={textureInputRef} className="hidden" accept="image/*" onChange={handleTextureUpload} />
                
                {/* Thumbnails */}
                {particleTextures.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                        {particleTextures.map((tex, i) => (
                            <div key={i} className="w-10 h-10 shrink-0 rounded border border-white/20 overflow-hidden bg-black/50">
                                {/* We can't easily access the image URL from texture object in React standard flow without keeping separate state, 
                                    but we can just show a placeholder or try to render. For simplicity, just showing a numbered box. 
                                    Actually, we can use the source image if it's available, but texture.image is an ImageBitmap or Image.
                                    Let's just show a simple indicator. */}
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-white/50">{i+1}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Shape Selection */}
            <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Classic Shapes</h3>
                <div className="grid grid-cols-4 gap-2 mb-4">
                    <button onClick={() => setShape(ShapeType.SPHERE)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.SPHERE ? 'bg-white/20 text-white' : 'text-slate-400'}`} title="Sphere"><Circle size={20} /></button>
                    <button onClick={() => setShape(ShapeType.HEART)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.HEART ? 'bg-white/20 text-pink-400' : 'text-slate-400'}`} title="Heart"><Heart size={20} /></button>
                    <button onClick={() => setShape(ShapeType.FLOWER)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.FLOWER ? 'bg-white/20 text-yellow-400' : 'text-slate-400'}`} title="Flower"><Flower2 size={20} /></button>
                    <button onClick={() => setShape(ShapeType.SATURN)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.SATURN ? 'bg-white/20 text-orange-400' : 'text-slate-400'}`} title="Saturn"><Globe size={20} /></button>
                    <button onClick={() => setShape(ShapeType.BUDDHA)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.BUDDHA ? 'bg-white/20 text-emerald-400' : 'text-slate-400'}`} title="Meditate"><Smile size={20} /></button>
                    <button onClick={() => setShape(ShapeType.DNA)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.DNA ? 'bg-white/20 text-blue-400' : 'text-slate-400'}`} title="DNA"><Activity size={20} /></button>
                    <button onClick={() => setShape(ShapeType.SPIRAL)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.SPIRAL ? 'bg-white/20 text-purple-400' : 'text-slate-400'}`} title="Galaxy"><Wind size={20} /></button>
                    <button onClick={() => setShape(ShapeType.FIREWORKS)} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.FIREWORKS ? 'bg-white/20 text-red-400' : 'text-slate-400'}`} title="Fireworks"><Sparkles size={20} /></button>
                </div>
                
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Chinese Holidays</h3>
                <div className="grid grid-cols-4 gap-2 mb-4">
                    <button onClick={() => applyTheme(ShapeType.TEXT, '#DE2910', '#FF4D00', ColorMode.GRADIENT, 'Happy CNY!', '福')} className={`p-2 rounded hover:bg-white/10 ${customText === '福' && shape === ShapeType.TEXT ? 'bg-white/20 text-[#DE2910]' : 'text-slate-400'}`} title="CNY (Fu)"><Target size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.SNAKE, '#50c878', '#ffd700', ColorMode.GRADIENT, 'Year of Snake')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.SNAKE ? 'bg-white/20 text-green-500' : 'text-slate-400'}`} title="Zodiac (Snake)"><Activity size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.LANTERN, '#e60012', '#ff4500', ColorMode.GRADIENT, 'Lantern Festival')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.LANTERN ? 'bg-white/20 text-red-400' : 'text-slate-400'}`} title="Lantern"><Flame size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.ZONGZI, '#228b22', '#f5f5dc', ColorMode.GRADIENT, 'Dragon Boat')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.ZONGZI ? 'bg-white/20 text-green-600' : 'text-slate-400'}`} title="Zongzi"><Triangle size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.BRIDGE, '#4b0082', '#00bfff', ColorMode.GRADIENT, 'Qixi Bridge')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.BRIDGE ? 'bg-white/20 text-purple-400' : 'text-slate-400'}`} title="Qixi (Bridge)"><Users size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.RABBIT, '#000033', '#ffffe0', ColorMode.GRADIENT, 'Mid-Autumn')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.RABBIT ? 'bg-white/20 text-blue-300' : 'text-slate-400'}`} title="Rabbit"><Rabbit size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.FLAG, '#ff0000', '#ffff00', ColorMode.GRADIENT, 'National Day')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.FLAG ? 'bg-white/20 text-red-600' : 'text-slate-400'}`} title="National Flag"><Flag size={20} /></button>
                </div>

                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Global Holidays</h3>
                <div className="grid grid-cols-4 gap-2 mb-4">
                     <button onClick={() => applyTheme(ShapeType.ROSE, '#ff0055', '#880000', ColorMode.GRADIENT, 'Valentine\'s Day')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.ROSE ? 'bg-white/20 text-pink-500' : 'text-slate-400'}`} title="Valentine's (Rose)"><Flower2 size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.TREE, '#2f5a2f', '#ff0000', ColorMode.GRADIENT, 'Xmas Mode')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.TREE ? 'bg-white/20 text-green-500' : 'text-slate-400'}`} title="Christmas Tree"><Trees size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.PUMPKIN, '#ff6600', '#2a1a0a', ColorMode.GRADIENT, 'Halloween Mode')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.PUMPKIN ? 'bg-white/20 text-orange-500' : 'text-slate-400'}`} title="Halloween Pumpkin"><Ghost size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.EGG, '#ffb6c1', '#add8e6', ColorMode.GRADIENT, 'Easter Mode')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.EGG ? 'bg-white/20 text-pink-300' : 'text-slate-400'}`} title="Easter Egg"><Egg size={20} /></button>
                    <button onClick={() => applyTheme(ShapeType.SNOWFLAKE, '#aaddff', '#ffffff', ColorMode.GRADIENT, 'Winter Mode')} className={`p-2 rounded hover:bg-white/10 ${shape === ShapeType.SNOWFLAKE ? 'bg-white/20 text-cyan-200' : 'text-slate-400'}`} title="Winter Snowflake"><Snowflake size={20} /></button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShape(ShapeType.TEXT)} className={`p-2 rounded hover:bg-white/10 flex justify-center ${shape === ShapeType.TEXT ? 'bg-white/20 text-white' : 'text-slate-400'}`} title="Text"><Type size={20} /></button>
                    <button onClick={() => fileInputRef.current?.click()} className={`p-2 rounded hover:bg-white/10 flex justify-center ${shape === ShapeType.IMAGE ? 'bg-white/20 text-cyan-400' : 'text-slate-400'}`} title="Upload Shape Image"><ImageIcon size={20} /></button>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
            </div>

            {/* Text Input (Conditional) */}
            {shape === ShapeType.TEXT && (
                <div className="mb-6">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Text Content</label>
                    <input 
                        type="text" 
                        value={customText} 
                        onChange={(e) => setCustomText(e.target.value)} 
                        className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-pink-500 transition-colors"
                        maxLength={10}
                    />
                </div>
            )}

            {/* Colors */}
            <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Colors</h3>
                <div className="flex gap-2 mb-3">
                    <button onClick={() => setColorMode(ColorMode.MONOCHROME)} className={`flex-1 text-xs py-1 rounded border ${colorMode === ColorMode.MONOCHROME ? 'bg-pink-500 border-pink-500 text-white' : 'border-slate-600 text-slate-400'}`}>Mono</button>
                    <button onClick={() => setColorMode(ColorMode.GRADIENT)} className={`flex-1 text-xs py-1 rounded border ${colorMode === ColorMode.GRADIENT ? 'bg-pink-500 border-pink-500 text-white' : 'border-slate-600 text-slate-400'}`}>Grad</button>
                    <button onClick={() => setColorMode(ColorMode.RAINBOW)} className={`flex-1 text-xs py-1 rounded border ${colorMode === ColorMode.RAINBOW ? 'bg-pink-500 border-pink-500 text-white' : 'border-slate-600 text-slate-400'}`}>Rainbow</button>
                     <button onClick={() => setColorMode(ColorMode.IMAGE)} className={`flex-1 text-xs py-1 rounded border ${colorMode === ColorMode.IMAGE ? 'bg-pink-500 border-pink-500 text-white' : 'border-slate-600 text-slate-400'}`}>Img</button>
                </div>
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label className="text-[10px] text-slate-500 block mb-1">Base</label>
                        <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} className="w-full h-8 rounded cursor-pointer" />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] text-slate-500 block mb-1">Secondary</label>
                        <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-full h-8 rounded cursor-pointer" />
                    </div>
                </div>
            </div>

             {/* Appearance */}
             <div className="mb-6">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Appearance</h3>
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Particle Size</span><span>{particleSize.toFixed(1)}x</span></div>
                    <input type="range" min="0.1" max="5.0" step="0.1" value={particleSize} onChange={(e) => setParticleSize(parseFloat(e.target.value))} className="w-full accent-pink-500" />
                </div>
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Scale (Zoom)</span><span>{scale.toFixed(1)}</span></div>
                    <input type="range" min="0.1" max="3" step="0.1" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="w-full accent-pink-500" />
                </div>
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Opacity</span><span>{opacity.toFixed(1)}</span></div>
                    <input type="range" min="0.1" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full accent-pink-500" />
                </div>
            </div>
            
            {/* Screenshot */}
            <button onClick={() => setTakeScreenshot(true)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors">
                <Camera size={18} /> Take Screenshot
            </button>
        </div>

        {/* Toggle UI Button */}
        <button 
            onClick={() => setShowUI(!showUI)}
            className="absolute top-4 right-4 z-50 p-2 bg-slate-800/80 backdrop-blur text-white rounded-full hover:bg-pink-500 transition-colors"
        >
            {showUI ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
    </div>
  );
};

export default App;