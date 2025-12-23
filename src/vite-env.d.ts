/// <reference types="vite/client" />
import 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Allow any element (div, span, points, etc.) to resolve TS errors
      [elementName: string]: any;
    }
  }
}