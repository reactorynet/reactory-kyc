import logger from '@reactory/server-core/logging';

/**
 * Rate Limiter Utility
 * 
 * Simple in-memory rate limiter for provider API calls
 */

interface RateLimitConfig {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
}

interface RateLimitState {
  requests: number[];
  lastCleanup: number;
}

export class RateLimiter {
  private limits: RateLimitConfig;
  private state: RateLimitState;
  private providerId: string;

  constructor(providerId: string, limits: RateLimitConfig) {
    this.providerId = providerId;
    this.limits = limits;
    this.state = {
      requests: [],
      lastCleanup: Date.now()
    };
  }

  /**
   * Check if request is allowed under current rate limits
   */
  async checkLimit(): Promise<boolean> {
    const now = Date.now();

    // Cleanup old requests (older than 24 hours)
    if (now - this.state.lastCleanup > 3600000) { // 1 hour
      this.cleanup(now);
    }

    // Check each time window
    if (this.limits.requestsPerSecond && !this.isAllowed(now, 1000, this.limits.requestsPerSecond)) {
      logger.warn(`[${this.providerId}] Rate limit exceeded: requests per second`);
      return false;
    }

    if (this.limits.requestsPerMinute && !this.isAllowed(now, 60000, this.limits.requestsPerMinute)) {
      logger.warn(`[${this.providerId}] Rate limit exceeded: requests per minute`);
      return false;
    }

    if (this.limits.requestsPerHour && !this.isAllowed(now, 3600000, this.limits.requestsPerHour)) {
      logger.warn(`[${this.providerId}] Rate limit exceeded: requests per hour`);
      return false;
    }

    if (this.limits.requestsPerDay && !this.isAllowed(now, 86400000, this.limits.requestsPerDay)) {
      logger.warn(`[${this.providerId}] Rate limit exceeded: requests per day`);
      return false;
    }

    return true;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.state.requests.push(Date.now());
  }

  /**
   * Check if request is allowed in a specific time window
   */
  private isAllowed(now: number, windowMs: number, maxRequests: number): boolean {
    const windowStart = now - windowMs;
    const recentRequests = this.state.requests.filter(time => time > windowStart);
    return recentRequests.length < maxRequests;
  }

  /**
   * Cleanup old requests from memory
   */
  private cleanup(now: number): void {
    const cutoff = now - 86400000; // 24 hours
    this.state.requests = this.state.requests.filter(time => time > cutoff);
    this.state.lastCleanup = now;
    
    logger.debug(`[${this.providerId}] Rate limiter cleanup: ${this.state.requests.length} requests in memory`);
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): {
    requestsLastSecond: number;
    requestsLastMinute: number;
    requestsLastHour: number;
    requestsLastDay: number;
  } {
    const now = Date.now();

    return {
      requestsLastSecond: this.countRequests(now, 1000),
      requestsLastMinute: this.countRequests(now, 60000),
      requestsLastHour: this.countRequests(now, 3600000),
      requestsLastDay: this.countRequests(now, 86400000)
    };
  }

  /**
   * Count requests in a time window
   */
  private countRequests(now: number, windowMs: number): number {
    const windowStart = now - windowMs;
    return this.state.requests.filter(time => time > windowStart).length;
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.state.requests = [];
    this.state.lastCleanup = Date.now();
    logger.info(`[${this.providerId}] Rate limiter reset`);
  }

  /**
   * Calculate time until next allowed request
   */
  getTimeUntilNextRequest(): number {
    const now = Date.now();

    let minWaitTime = 0;

    if (this.limits.requestsPerSecond) {
      const waitTime = this.getWaitTime(now, 1000, this.limits.requestsPerSecond);
      minWaitTime = Math.max(minWaitTime, waitTime);
    }

    if (this.limits.requestsPerMinute) {
      const waitTime = this.getWaitTime(now, 60000, this.limits.requestsPerMinute);
      minWaitTime = Math.max(minWaitTime, waitTime);
    }

    if (this.limits.requestsPerHour) {
      const waitTime = this.getWaitTime(now, 3600000, this.limits.requestsPerHour);
      minWaitTime = Math.max(minWaitTime, waitTime);
    }

    if (this.limits.requestsPerDay) {
      const waitTime = this.getWaitTime(now, 86400000, this.limits.requestsPerDay);
      minWaitTime = Math.max(minWaitTime, waitTime);
    }

    return minWaitTime;
  }

  /**
   * Calculate wait time for a specific time window
   */
  private getWaitTime(now: number, windowMs: number, maxRequests: number): number {
    const windowStart = now - windowMs;
    const recentRequests = this.state.requests.filter(time => time > windowStart);

    if (recentRequests.length < maxRequests) {
      return 0;
    }

    // Need to wait until the oldest request in this window expires
    const oldestRequest = recentRequests[0];
    return (oldestRequest + windowMs) - now;
  }
}

/**
 * Global rate limiter manager
 */
class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Get or create rate limiter for a provider
   */
  getLimiter(providerId: string, config: RateLimitConfig): RateLimiter {
    if (!this.limiters.has(providerId)) {
      this.limiters.set(providerId, new RateLimiter(providerId, config));
    }
    return this.limiters.get(providerId)!;
  }

  /**
   * Remove rate limiter for a provider
   */
  removeLimiter(providerId: string): void {
    this.limiters.delete(providerId);
  }

  /**
   * Clear all rate limiters
   */
  clear(): void {
    this.limiters.clear();
  }
}

export const rateLimiterManager = new RateLimiterManager();
export default RateLimiter;

