const states = [];
let hookIndex = 0;
let pendingEffects = [];
let mounted = false;

export function resetHooks() {
  states.length = 0;
  hookIndex = 0;
  pendingEffects = [];
  mounted = false;
}

export function renderHook(render) {
  hookIndex = 0;
  const result = render();
  if (!mounted) {
    mounted = true;
    for (const effect of pendingEffects) {
      effect();
    }
    pendingEffects = [];
  }
  return result;
}

export function useState(initial) {
  const index = hookIndex++;
  if (states.length === index) {
    states.push(initial);
  }
  return [
    states[index],
    (next) => {
      states[index] = typeof next === 'function' ? next(states[index]) : next;
    },
  ];
}

export function useEffect(effect) {
  if (!mounted) {
    pendingEffects.push(effect);
  }
}

export function useCallback(fn) {
  return fn;
}
