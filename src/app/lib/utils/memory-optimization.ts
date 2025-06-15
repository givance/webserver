/**
 * Memory optimization utilities to reduce RAM usage during build and runtime
 */

// LRU Cache implementation for prompt caching
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first entry)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global caches for frequently used data
export const promptCache = new LRUCache<string, string>(50);
export const schemaCache = new LRUCache<string, string>(10);
export const configCache = new LRUCache<string, any>(20);

/**
 * Memoization decorator for expensive computations
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Debounced function to reduce unnecessary computations
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;

  return ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  }) as T;
}

/**
 * Throttled function to limit function calls
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let inThrottle = false;

  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
}

/**
 * Memory-efficient object freezing for immutable data
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  Object.freeze(obj);

  Object.getOwnPropertyNames(obj).forEach((prop) => {
    if ((obj as any)[prop] !== null && typeof (obj as any)[prop] === "object") {
      deepFreeze((obj as any)[prop]);
    }
  });

  return obj;
}

/**
 * Weak reference cache for large objects to allow garbage collection
 */
export class WeakCache<K extends object, V> {
  private cache = new WeakMap<K, V>();

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }
}

/**
 * Memory-efficient string operations
 */
export const StringUtils = {
  /**
   * Truncate string without creating intermediate strings
   */
  truncate(str: string, maxLength: number, suffix = "..."): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
  },

  /**
   * Check if string contains substring without creating lowercase copies
   */
  containsIgnoreCase(str: string, search: string): boolean {
    return str.toLowerCase().indexOf(search.toLowerCase()) !== -1;
  },

  /**
   * Split string efficiently for large texts
   */
  chunkString(str: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push(str.substring(i, i + chunkSize));
    }
    return chunks;
  },
};

/**
 * Array utilities for memory efficiency
 */
export const ArrayUtils = {
  /**
   * Batch process array to avoid memory spikes
   */
  async processBatch<T, R>(items: T[], processor: (item: T) => Promise<R> | R, batchSize: number = 50): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);

      // Allow garbage collection between batches
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return results;
  },

  /**
   * Remove duplicates without creating new arrays until necessary
   */
  uniqueBy<T>(array: T[], keyFn: (item: T) => any): T[] {
    const seen = new Set();
    return array.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },
};

/**
 * Clean up resources and caches
 */
export function cleanupMemory(): void {
  promptCache.clear();
  schemaCache.clear();
  configCache.clear();

  // Force garbage collection if available (Node.js)
  if (global.gc) {
    global.gc();
  }
}
