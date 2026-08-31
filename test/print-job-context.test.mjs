import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier);
  },
});

const { createThenablePrintJobContext } = await import('../src/printJobContext.ts');

function delay() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

test('thenable context keeps the store across Promise.then', async () => {
  const context = createThenablePrintJobContext();
  const store = {};

  await context.run(store, () =>
    Promise.resolve().then(() => {
      assert.equal(context.getStore(), store);
    })
  );

  assert.equal(context.getStore(), undefined);
});

test('thenable context keeps the store across await', async () => {
  const context = createThenablePrintJobContext();
  const store = {};

  await context.run(store, async () => {
    assert.equal(context.getStore(), store);
    await Promise.resolve();
    assert.equal(context.getStore(), store);
    await delay();
    assert.equal(context.getStore(), store);
  });

  assert.equal(context.getStore(), undefined);
});

test('thenable context hides the store from a sibling after run has started', async () => {
  const context = createThenablePrintJobContext();
  const store = {};
  let release = () => {};
  let notifyStarted = () => {};
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });

  const job = context.run(store, async () => {
    notifyStarted();
    await new Promise((resolve) => {
      release = resolve;
    });
    assert.equal(context.getStore(), store);
  });

  await started;
  assert.equal(context.getStore(), undefined);
  release();
  await job;
  assert.equal(context.getStore(), undefined);
});

test('thenable context isolates overlapping run calls', async () => {
  const context = createThenablePrintJobContext();
  const first = {};
  const second = {};
  let releaseFirst = () => {};
  let notifyStarted = () => {};
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });

  const firstJob = context.run(first, async () => {
    notifyStarted();
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    assert.equal(context.getStore(), first);
  });

  await started;
  assert.equal(context.getStore(), undefined);

  await context.run(second, async () => {
    assert.equal(context.getStore(), second);
    await Promise.resolve();
    assert.equal(context.getStore(), second);
  });

  releaseFirst();
  await firstJob;
  assert.equal(context.getStore(), undefined);
});

test('thenable job run can start again after a previous job settles', { timeout: 2000 }, async () => {
  const context = createThenablePrintJobContext();
  const printer = {};
  let sessionOp = Promise.resolve();

  function enqueue(operation) {
    const result = sessionOp.then(operation);
    sessionOp = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function run(job) {
    if (context.getStore() === printer) {
      const error = new Error('A Print Job is already running on this Printer.');
      error.status = 'ERR_ILLEGAL';
      throw error;
    }
    return enqueue(() => context.run(printer, job));
  }

  await run(async () => {
    await Promise.resolve();
  });
  await run(async () => {
    await Promise.resolve();
  });
});

test('thenable job run throws after await instead of deadlocking on the session queue', { timeout: 2000 }, async () => {
  const context = createThenablePrintJobContext();
  const printer = {};
  let sessionOp = Promise.resolve();

  function enqueue(operation) {
    const result = sessionOp.then(operation);
    sessionOp = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function run(job) {
    if (context.getStore() === printer) {
      const error = new Error('A Print Job is already running on this Printer.');
      error.status = 'ERR_ILLEGAL';
      throw error;
    }
    return enqueue(() => context.run(printer, job));
  }

  await run(async () => {
    await Promise.resolve();
    assert.throws(() => run(async () => 'nested'), { status: 'ERR_ILLEGAL' });
    await assert.rejects(async () => {
      await run(async () => 'nested-awaited');
    }, { status: 'ERR_ILLEGAL' });
  });
});
