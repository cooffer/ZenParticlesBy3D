/// <reference types="react" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      pointLight: any;
      points: any;
      bufferGeometry: any;
      shaderMaterial: any;
    }
  }
}

export {};