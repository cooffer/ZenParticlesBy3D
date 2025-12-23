import React, { useEffect, useRef, useState } from 'react';
import * as mpHands from '@mediapipe/hands';
import type { Results } from '@mediapipe/hands';
import { GestureState } from '../types';

interface WebcamHandlerProps {
  onGestureUpdate: (state: GestureState) => void;
  onCameraStatus: (ready: boolean) => void;
}

const WebcamHandler: React.FC<WebcamHandlerProps> = ({ onGestureUpdate, onCameraStatus }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastDetectionTime, setLastDetectionTime] = useState(0);
  
  // Smoothing refs
  const prevZoom = useRef(1.0);
  const prevExpansion = useRef(0);

  useEffect(() => {
    let isActive = true;
    const canvasElement = canvasRef.current;
    
    // Resolve Hands class
    const HandsClass = (mpHands as any).Hands || (mpHands as any).default?.Hands;

    if (!HandsClass) {
        console.error("MediaPipe Hands library failed to load.");
        setHasError(true);
        onCameraStatus(false);
        return;
    }

    // Initialize MediaPipe Hands
    // Using generic CDN path to ensure assets are found.
    const hands = new HandsClass({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 1, // Focus on single hand for better control stability
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results: Results) => {
      if (!isActive) return;
      if (!isLoaded) setIsLoaded(true);
      setLastDetectionTime(Date.now());
      onCameraStatus(true);
      
      const ctx = canvasElement?.getContext('2d');
      if (ctx && canvasElement) {
        ctx.save();
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // Debug Draw
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          for (const landmarks of results.multiHandLandmarks) {
            ctx.fillStyle = '#FF0055';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            
            // Draw connections
            const connections = (mpHands as any).HAND_CONNECTIONS || [
                [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
                [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]
            ];
            
            ctx.beginPath();
            for (const [i, j] of connections) {
                const x1 = landmarks[i].x * canvasElement.width;
                const y1 = landmarks[i].y * canvasElement.height;
                const x2 = landmarks[j].x * canvasElement.width;
                const y2 = landmarks[j].y * canvasElement.height;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
            }
            ctx.stroke();

            // Draw landmarks
            for (let i = 0; i < landmarks.length; i++) {
              ctx.beginPath();
              ctx.arc(landmarks[i].x * canvasElement.width, landmarks[i].y * canvasElement.height, 3, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }

      // --- GESTURE LOGIC ---
      let expansion = 0;
      let rotation = 0; // Disabled
      let zoom = 1.0;
      let isPeaceSign = false;
      let isNamaste = false;

      const landmarks = results.multiHandLandmarks;

      if (landmarks && landmarks.length > 0) {
        const hand = landmarks[0];
        const wrist = hand[0];
        
        // Key landmarks for calculations
        const indexTip = hand[8];
        const middleMCP = hand[9]; 
        const middleTip = hand[12];
        const ringTip = hand[16];
        const pinkyTip = hand[20];
        const thumbTip = hand[4];

        const getDist = (p1: any, p2: any) => {
            return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        };

        // 1. ZOOM (Palm Size)
        const palmSize = getDist(wrist, middleMCP);
        // Tuning: 0.05 (Far) to 0.2 (Close) -> Zoom 0.5 to 3.0
        zoom = (palmSize - 0.02) * 12.0; 
        zoom = Math.max(0.5, Math.min(3.5, zoom));

        // 2. EXPANSION (Openness)
        // Average distance of tips from wrist
        const tips = [indexTip, middleTip, ringTip, pinkyTip, thumbTip];
        let totalTipDist = 0;
        tips.forEach(tip => totalTipDist += getDist(wrist, tip));
        const avgTipDist = totalTipDist / 5;
        
        // Ratio of Tip Distance to Palm Size
        // Fist: ~1.0 | Open: ~2.0+
        const opennessRatio = avgTipDist / (palmSize || 0.001);

        // Tuning:
        // < 1.3 -> Contract (-1.0)
        // > 1.8 -> Expand (1.0)
        // Range 1.3 - 1.8 -> Neutral
        expansion = (opennessRatio - 1.5) * 4.0;
        expansion = Math.max(-1.5, Math.min(2.0, expansion));
      }

      // Smooth values
      const alpha = 0.2; // Slightly faster response
      zoom = prevZoom.current + (zoom - prevZoom.current) * alpha;
      expansion = prevExpansion.current + (expansion - prevExpansion.current) * alpha;

      prevZoom.current = zoom;
      prevExpansion.current = expansion;

      onGestureUpdate({ expansion, rotation, zoom, isPeaceSign, isNamaste });
    });

    handsRef.current = hands;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 320, height: 240 } // Lower resolution for better performance
        });
        if (isActive && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
             if (isActive && videoRef.current) {
                videoRef.current.play().then(() => {
                    requestRef.current = requestAnimationFrame(detectFrame);
                }).catch(e => console.error("Video play error:", e));
             }
          };
        }
      } catch (e) {
        console.error("Camera failed:", e);
        if (isActive) {
            setHasError(true);
            onCameraStatus(false);
        }
      }
    };

    const detectFrame = async () => {
      if (!isActive) return;
      const video = videoRef.current;
      const hands = handsRef.current;

      if (video && video.readyState >= 2 && hands) {
         if (video.videoWidth > 0 && video.videoHeight > 0) {
             try { 
                 await hands.send({ image: video }); 
             } catch (e) {
                 // console.error(e);
             }
         }
      }
      if (isActive) requestRef.current = requestAnimationFrame(detectFrame);
    };

    startCamera();

    return () => {
      isActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handsRef.current) {
          try { handsRef.current.close(); } catch(e) {}
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [onGestureUpdate, onCameraStatus]);

  const isTracking = Date.now() - lastDetectionTime < 1000 && isLoaded;

  let statusText = "LOADING...";
  let statusColor = "text-yellow-400 bg-black/70";
  
  if (hasError) {
      statusText = "CAMERA ERROR";
      statusColor = "text-red-500 bg-black/90";
  } else if (isLoaded) {
      if (isTracking) {
          statusText = "ACTIVE";
          statusColor = "text-green-400 bg-black/50";
      } else {
          statusText = "SEARCHING...";
          statusColor = "text-yellow-400 bg-black/70";
      }
  }

  return (
    <div className="fixed bottom-2 left-2 z-50 rounded-lg overflow-hidden border-2 border-purple-500/50 shadow-2xl bg-black w-24 h-auto md:w-[240px]">
      <div className="relative aspect-[4/3]">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" playsInline muted />
        <canvas ref={canvasRef} width={320} height={240} className="absolute inset-0 w-full h-full transform scale-x-[-1]" />
        <div className={`hidden md:block absolute bottom-2 left-2 text-[10px] font-mono px-2 rounded backdrop-blur-sm pointer-events-none transition-colors ${statusColor}`}>
          {statusText}
        </div>
      </div>
    </div>
  );
};

export default WebcamHandler;