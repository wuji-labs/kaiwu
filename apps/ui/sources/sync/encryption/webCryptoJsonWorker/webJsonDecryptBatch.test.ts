import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    decryptAesGcmJsonBase64BatchWithWebWorker,
    resetWebJsonDecryptWorkerForTests,
} from './webJsonDecryptBatch';

describe('webJsonDecryptBatch', () => {
  beforeEach(() => {
    resetWebJsonDecryptWorkerForTests();
    vi.clearAllMocks();
  });

  describe('worker script selection', () => {
    it('attempts to load kaiwu worker first', async () => {
      // Mock the Worker constructor to track which script is being loaded
      const workerScripts: string[] = [];
      const originalWorker = globalThis.Worker;

      globalThis.Worker = class MockWorker {
        constructor(scriptUrl: string | URL) {
          workerScripts.push(scriptUrl instanceof URL ? scriptUrl.pathname : String(scriptUrl));
          // Simulate the worker receiving a message
          this.onmessage = null;
          this.onerror = null;
        }

        onmessage: ((event: MessageEvent) => void) | null;
        onerror: ((event: ErrorEvent) => void) | null;

        postMessage() {
          // Simulate successful response
          if (this.onmessage) {
            this.onmessage(new MessageEvent('message', {
              data: {
                id: 1,
                status: 'ok',
                items: [null],
              },
            }));
          }
        }

        terminate() {}
      } as any;

      try {
        await decryptAesGcmJsonBase64BatchWithWebWorker(['test'], 'key123', {
          requestTimeoutMs: 100,
        });

        // Verify kaiwu worker was attempted
        expect(workerScripts).toContain('/kaiwu-crypto-json-worker.js');
      } finally {
        globalThis.Worker = originalWorker;
        resetWebJsonDecryptWorkerForTests();
      }
    });

    it('falls back to happier worker if kaiwu worker fails', async () => {
      const workerScripts: string[] = [];
      let attemptCount = 0;
      const originalWorker = globalThis.Worker;

      globalThis.Worker = class MockWorker {
        constructor(scriptUrl: string | URL) {
          const script = scriptUrl instanceof URL ? scriptUrl.pathname : String(scriptUrl);
          workerScripts.push(script);
          attemptCount++;

          // Fail on first attempt (kaiwu), succeed on second (happier)
          if (attemptCount === 1 && script === '/kaiwu-crypto-json-worker.js') {
            throw new Error('Worker load failed');
          }

          this.onmessage = null;
          this.onerror = null;
        }

        onmessage: ((event: MessageEvent) => void) | null;
        onerror: ((event: ErrorEvent) => void) | null;

        postMessage() {
          if (this.onmessage) {
            this.onmessage(new MessageEvent('message', {
              data: {
                id: 1,
                status: 'ok',
                items: [null],
              },
            }));
          }
        }

        terminate() {}
      } as any;

      try {
        await decryptAesGcmJsonBase64BatchWithWebWorker(['test'], 'key123', {
          requestTimeoutMs: 100,
        });

        // Verify both workers were attempted
        expect(workerScripts).toContain('/kaiwu-crypto-json-worker.js');
        expect(workerScripts).toContain('/happier-crypto-json-worker.js');
      } finally {
        globalThis.Worker = originalWorker;
        resetWebJsonDecryptWorkerForTests();
      }
    });
  });

  it('returns empty array for empty input', async () => {
    const result = await decryptAesGcmJsonBase64BatchWithWebWorker([], 'key123');
    expect(result).toEqual([]);
  });

  it('returns null if Worker is not available', async () => {
    const originalWorker = globalThis.Worker;
    delete (globalThis as any).Worker;

    try {
      const result = await decryptAesGcmJsonBase64BatchWithWebWorker(['test'], 'key123');
      expect(result).toBeNull();
    } finally {
      globalThis.Worker = originalWorker;
      resetWebJsonDecryptWorkerForTests();
    }
  });

  it('times out pending requests', async () => {
    const originalWorker = globalThis.Worker;

    globalThis.Worker = class MockWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
      }

      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: ErrorEvent) => void) | null;

      postMessage() {
        // Don't send a response - let it timeout
      }

      terminate() {}
    } as any;

    try {
      const result = await decryptAesGcmJsonBase64BatchWithWebWorker(['test'], 'key123', {
        requestTimeoutMs: 50,
      });
      expect(result).toBeNull();
    } finally {
      globalThis.Worker = originalWorker;
      resetWebJsonDecryptWorkerForTests();
    }
  });
});
