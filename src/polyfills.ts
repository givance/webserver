// Polyfills for Node.js test environment
import { TextEncoder, TextDecoder } from "util";

// Ensure TextEncoder and TextDecoder are available globally
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder as any;
}

if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder as any;
}

// Polyfill for ReadableStream (needed for undici/fetch)
if (typeof global.ReadableStream === "undefined") {
  // Simple mock for ReadableStream
  global.ReadableStream = class ReadableStream {
    constructor() {}
    cancel() { return Promise.resolve(); }
    getReader() { 
      return {
        read: () => Promise.resolve({ done: true, value: undefined }),
        cancel: () => Promise.resolve(),
        releaseLock: () => {},
      };
    }
    pipeThrough() { return this; }
    pipeTo() { return Promise.resolve(); }
    tee() { return [this, this]; }
    locked = false;
  } as any;
}

// Polyfill for TransformStream (needed for eventsource-parser)
if (typeof global.TransformStream === "undefined") {
  // Simple mock for TransformStream
  global.TransformStream = class TransformStream {
    readable: any;
    writable: any;
    
    constructor() {
      this.readable = {};
      this.writable = {};
    }
  } as any;
}

// Polyfill for whatwg-fetch in test environment
import "whatwg-fetch";
