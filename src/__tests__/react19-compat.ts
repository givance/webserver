// React 19 compatibility layer for testing
import React from 'react';

// Mock React internals that are expected by testing library
const MockReactInternals = {
  ReactCurrentDispatcher: { current: null },
  ReactCurrentBatchConfig: { transition: null },
  ReactCurrentOwner: { current: null },
  ReactDebugCurrentFrame: { current: null },
  IsSomeRendererActing: { current: false },
};

// Ensure React internals are available for testing library
if (typeof React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED === 'undefined') {
  (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = MockReactInternals;
}

// Patch React hooks to work in test environment
const originalUseRef = React.useRef;
const originalUseState = React.useState;
const originalUseEffect = React.useEffect;

if (originalUseRef && typeof originalUseRef !== 'function') {
  React.useRef = function useRef<T>(initialValue: T): React.MutableRefObject<T> {
    return { current: initialValue };
  };
}

if (originalUseState && typeof originalUseState !== 'function') {
  React.useState = function useState<S>(initialState: S | (() => S)): [S, React.Dispatch<React.SetStateAction<S>>] {
    const value = typeof initialState === 'function' ? (initialState as () => S)() : initialState;
    return [value, () => {}];
  };
}

if (originalUseEffect && typeof originalUseEffect !== 'function') {
  React.useEffect = function useEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {
    // No-op in test environment
  };
}

export default React;