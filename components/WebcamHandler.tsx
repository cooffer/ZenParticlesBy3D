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
  // Use any to hold the Hands instance to avoid strict type checks against the mixed import
  const handsRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastDetectionTime, setLastDetectionTime] = useState(0);
  
  // Smoothing refs
  const prevRotation = useRef(0);
  const prevZoom = useRef(1.0);
  const prevExpansion = useRef(0);

  useEffect(() => {
    let isActive = true;
    const canvasElement = canvasRef.current;
    
    // Resolve the Hands class from the import, handling potential default export wrapping
    const HandsClass = (mpHands as any).Hands || (mpHands as any).default?.Hands;

    if (!HandsClass) {
        console.error("MediaPipe Hands library failed to load correctly.");
        setHasError(true);
        onCameraStatus(false);
        return;
    }

    // Initialize MediaPipe Hands
    const hands = new HandsClass({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 2,
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
            ctx.beginPath();
            const connections = [
                [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],
                [0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20]
            ];
            connections.forEach(([i, j]) => {
                const x1 = landmarks[i].x * canvasElement.width;
                const y1 = landmarks[i].y * canvasElement.height;
                const x2 = landmarks[j].x * canvasElement.width;
                const y2 = landmarks[j].y * canvasElement.height;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
            });
            ctx.stroke();
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
      let rotation = 0;
      let zoom = 1.0;
      let isPeaceSign = false;
      let isNamaste = false;

      const landmarks = results.multiHandLandmarks;

      if (landmarks && landmarks.length > 0) {
        // Primary Hand
        const hand1 = landmarks[0];
        const wrist1 = hand1[0];
        const thumbTip1 = hand1[4];
        const middleTip1 = hand1[12];
        const middleMCP1 = hand1[9]; // Knuckle
        const indexTip1 = hand1[8];
        const ringTip1 = hand1[16];
        const pinkyTip1 = hand1[20];

        // 1. Rotation (Tilt)
        const rotDx = middleMCP1.x - wrist1.x;
        const rotDy = middleMCP1.y - wrist1.y;
        rotation = -Math.atan2(rotDx, rotDy);

        // 2. Zoom (Push / Pull)
        // palmSize ~0.06 is standard distance.
        const palmSize = Math.sqrt(Math.pow(rotDx, 2) + Math.pow(rotDy, 2));
        
        // Multiplier 30.0 for high sensitivity
        zoom = 1.0 + (palmSize - 0.06) * 30.0;
        zoom = Math.max(0.2, Math.min(5.0, zoom));

        // 3. Peace Sign
        const getDist = (pt1: any, pt2: any) => Math.sqrt(Math.pow(pt1.x - pt2.x, 2) + Math.pow(pt1.y - pt2.y, 2));
        const dWristIndex = getDist(wrist1, indexTip1);
        const dWristMiddle = getDist(wrist1, middleTip1);
        const dWristRing = getDist(wrist1, ringTip1);
        const dWristPinky = getDist(wrist1, pinkyTip1);
        const dWristKnuckle = getDist(wrist1, middleMCP1); 

        const isExtended = (d: number) => d > dWristKnuckle * 1.8;
        const isCurled = (d: number) => d < dWristKnuckle * 1.5;

        if (isExtended(dWristIndex) && isExtended(dWristMiddle) && isCurled(dWristRing) && isCurled(dWristPinky)) {
             const dFingerSpread = getDist(indexTip1, middleTip1);
            if (dFingerSpread > dWristKnuckle * 0.3) isPeaceSign = true;
        }

        // 4. Expansion
        if (landmarks.length >= 2) {
            // Two Hands
            const hand2 = landmarks[1];
            const wrist2 = hand2[0];
            const wristDist = getDist(wrist1, wrist2);
            expansion = Math.max(0, (wristDist - 0.2) * 4.0);
            if (wristDist < 0.15) {
                isNamaste = true;
                expansion = 0; 
            }
        } else {
            // Single Hand
            const handSpread = getDist(thumbTip1, pinkyTip1);
            const spreadRatio = handSpread / (palmSize || 0.01);
            
            // Linear expansion mapping
            // Threshold 0.65 is a relaxed hand. 
            // > 0.65 -> Explode
            // < 0.65 -> Implode
            expansion = (spreadRatio - 0.65) * 6.0;
            expansion = Math.max(-1.5, Math.min(8.0, expansion));
            
            if (spreadRatio < 0.55) isNamaste = true; 
        }
      }

      // Smooth
      const alpha = 0.3; 
      rotation = prevRotation.current + (rotation - prevRotation.current) * alpha;
      zoom = prevZoom.current + (zoom - prevZoom.current) * alpha;
      expansion = prevExpansion.current + (expansion - prevExpansion.current) * alpha;

      prevRotation.current = rotation;
      prevZoom.current = zoom;
      prevExpansion.current = expansion;

      onGestureUpdate({ expansion, rotation, zoom, isPeaceSign, isNamaste });
    });

    handsRef.current = hands;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
        });
        if (isActive && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (isActive && videoRef.current) {
                videoRef.current.play().catch(() => {});
                requestRef.current = requestAnimationFrame(detectFrame);
            }
          };
        }
      } catch (e) {
        console.error("Camera failed to start:", e);
        if (isActive) {
            setHasError(true);
            onCameraStatus(false);
        }
      }
    };

    const detectFrame = async () => {
      if (!isActive) return;
      if (videoRef.current && videoRef.current.readyState >= 2 && handsRef.current) {
         if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
             try { 
                 await handsRef.current.send({ image: videoRef.current }); 
             } catch (e) {
                 // console.error("MediaPipe send error:", e);
             }
         }
      }
      if (isActive) requestRef.current = requestAnimationFrame(detectFrame);
    };

    startCamera();

    return () => {
      isActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handsRef.current) try { handsRef.current.close(); } catch(e) {}
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [onGestureUpdate, onCameraStatus]);

  const isTracking = Date.now() - lastDetectionTime < 1000 && isLoaded;

  // Status Text Logic
  let statusText = "LOADING...";
  let statusColor = "text-yellow-400 bg-black/70";
  
  if (hasError) {
      statusText = "CAMERA ERROR";
      statusColor = "text-red-500 bg-black/90";
  } else if (isLoaded) {
      if (isTracking) {
          statusText = "GESTURE ACTIVE";
          statusColor = "text-green-400 bg-black/50";
      } else {
          statusText = "SEARCHING...";
          statusColor = "text-yellow-400 bg-black/70";
      }
  }

  return (
    <div className="fixed bottom-2 left-2 z-50 rounded-lg overflow-hidden border-2 border-purple-500/50 shadow-2xl bg-black w-24 h-auto md:w-[320px]">
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