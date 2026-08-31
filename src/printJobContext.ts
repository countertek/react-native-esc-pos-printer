export interface PrintJobContext {
  getStore(): object | undefined;
  run<R>(store: object, callback: () => R): R;
}

type ThenCallback = ((value: unknown) => unknown) | undefined | null;

type PromiseHooks = {
  createHook?: (hooks: {
    init?: (promise: object) => void;
    before?: (promise: object) => void;
    after?: (promise: object) => void;
  }) => () => void;
};

let thenableStore: object | undefined;
let thenablePatched = false;
let thenableContext: PrintJobContext | undefined;

function getBuiltin<T>(id: string): T | undefined {
  try {
    const getBuiltinModule = (
      globalThis as {
        process?: { getBuiltinModule?: (id: string) => unknown };
      }
    ).process?.getBuiltinModule;
    if (typeof getBuiltinModule !== 'function') {
      return undefined;
    }
    return getBuiltinModule(id) as T;
  } catch {
    return undefined;
  }
}

function bindThenableCallback(callback: ThenCallback, captured: object): ThenCallback {
  if (typeof callback !== 'function') {
    return callback;
  }

  return function boundCallback(this: unknown, value: unknown) {
    const previous = thenableStore;
    thenableStore = captured;
    try {
      return callback.call(this, value);
    } finally {
      thenableStore = previous;
    }
  };
}

function installPromiseThenPatch() {
  const originalThen = Promise.prototype.then;
  const descriptor = Object.getOwnPropertyDescriptor(Promise.prototype, 'then');
  Object.defineProperty(Promise.prototype, 'then', {
    configurable: descriptor?.configurable ?? true,
    enumerable: descriptor?.enumerable ?? false,
    writable: descriptor?.writable ?? true,
    value(this: Promise<unknown>, onFulfilled?: ThenCallback, onRejected?: ThenCallback) {
      const captured = thenableStore;
      if (captured === undefined) {
        return originalThen.call(this, onFulfilled, onRejected);
      }
      return originalThen.call(
        this,
        bindThenableCallback(onFulfilled, captured),
        bindThenableCallback(onRejected, captured)
      );
    },
  });
}

function installNodePromiseHooks() {
  const createHook = getBuiltin<{ promiseHooks?: PromiseHooks }>('v8')?.promiseHooks?.createHook;
  if (typeof createHook !== 'function') {
    return;
  }

  const stores = new WeakMap<object, object | undefined>();
  const previousStores: Array<object | undefined> = [];

  createHook({
    init(promise) {
      stores.set(promise, thenableStore);
    },
    before(promise) {
      previousStores.push(thenableStore);
      thenableStore = stores.get(promise);
    },
    after() {
      thenableStore = previousStores.pop();
    },
  });
}

function ensureContinuationPropagation() {
  if (thenablePatched) {
    return;
  }
  thenablePatched = true;
  installPromiseThenPatch();
  installNodePromiseHooks();
}

export function createThenablePrintJobContext(): PrintJobContext {
  if (thenableContext) {
    return thenableContext;
  }

  thenableContext = {
    getStore() {
      return thenableStore;
    },
    run<R>(next: object, callback: () => R): R {
      ensureContinuationPropagation();
      const previous = thenableStore;
      thenableStore = next;
      try {
        return callback();
      } finally {
        thenableStore = previous;
      }
    },
  };

  return thenableContext;
}

export function createPrintJobContext(): PrintJobContext {
  const asyncHooks = getBuiltin<{ AsyncLocalStorage?: new () => PrintJobContext }>('async_hooks');
  if (typeof asyncHooks?.AsyncLocalStorage === 'function') {
    return new asyncHooks.AsyncLocalStorage();
  }
  return createThenablePrintJobContext();
}
