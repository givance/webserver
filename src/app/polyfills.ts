/**
 * Polyfills for server-side environment to fix build issues
 */

// Fix "self is not defined" error in server environments
if (typeof globalThis !== "undefined" && typeof globalThis.self === "undefined") {
  globalThis.self = globalThis as any;
}

if (typeof global !== "undefined" && typeof (global as any).self === "undefined") {
  (global as any).self = global;
}

// Node.js environment check
if (typeof window === "undefined" && typeof self === "undefined") {
  (globalThis as any).self = globalThis;
}

export {};
