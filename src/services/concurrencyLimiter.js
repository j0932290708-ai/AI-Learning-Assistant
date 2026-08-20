export class Semaphore {
  constructor(maxConcurrency = 2, maxQueue = 20) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error('maxConcurrency must be a positive integer');
    }

    if (!Number.isInteger(maxQueue) || maxQueue < 0) {
      throw new Error('maxQueue must be a non-negative integer');
    }

    this.maxConcurrency = maxConcurrency;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
  }

  acquire() {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return Promise.resolve(this.createPermit());
    }

    if (this.queue.length >= this.maxQueue) {
      const error = new Error('AI concurrency queue is full');
      error.statusCode = 503;
      error.code = 'AI_CONCURRENCY_LIMIT';

      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve,
        reject
      });
    });
  }

  createPermit() {
    let released = false;

    return {
      release: () => {
        if (released) {
          return;
        }

        released = true;
        this.active -= 1;
        this.processQueue();
      }
    };
  }

  processQueue() {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const item = this.queue.shift();

      this.active += 1;
      item.resolve(this.createPermit());
    }
  }

  getStats() {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueue: this.maxQueue
    };
  }
}