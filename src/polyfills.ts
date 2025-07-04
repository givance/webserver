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

// Polyfill for MessagePort (needed for undici)
if (typeof global.MessagePort === "undefined") {
  global.MessagePort = class MessagePort {
    onmessage: any;
    onmessageerror: any;
    
    postMessage() {}
    close() {}
    start() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  } as any;
}

// Polyfill for MessageChannel
if (typeof global.MessageChannel === "undefined") {
  global.MessageChannel = class MessageChannel {
    port1: any;
    port2: any;
    
    constructor() {
      this.port1 = new (global as any).MessagePort();
      this.port2 = new (global as any).MessagePort();
    }
  } as any;
}

// Polyfill for whatwg-fetch in test environment
import "whatwg-fetch";

// React 19 compatibility for testing
if (typeof global.React === "undefined") {
  // Import React 19 compatibility layer
  const React = require("react");
  global.React = React;
  
  // Mock React internals that are expected by testing library
  const MockReactInternals = {
    ReactCurrentDispatcher: { current: null },
    ReactCurrentBatchConfig: { transition: null },
    ReactCurrentOwner: { current: null },
    ReactDebugCurrentFrame: { current: null },
    IsSomeRendererActing: { current: false },
  };

  // Ensure React internals are available
  if (!React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
    React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = MockReactInternals;
  }
  
  global.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
}
