/**
 * Behavior Registry
 *
 * Manages and provides access to all domain behavior handlers.
 * Automatically discovers and registers handlers.
 */

import type { DomainBehavior } from "./base";
import { ClimateBehavior } from "./climate";
import { CoverBehavior } from "./cover";
import { LightBehavior } from "./light";
import { LockBehavior } from "./lock";
import { MediaPlayerBehavior } from "./media_player";
import { SwitchBehavior } from "./switch";

/**
 * Central registry of all domain behavior handlers
 */
export class BehaviorRegistry {
  private handlers: Map<string, DomainBehavior> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register all built-in domain handlers
   */
  private registerDefaultHandlers(): void {
    this.register(new LightBehavior());
    this.register(new SwitchBehavior());
    this.register(new CoverBehavior());
    this.register(new ClimateBehavior());
    this.register(new MediaPlayerBehavior());
    this.register(new LockBehavior());
  }

  /**
   * Register a domain behavior handler
   */
  register(handler: DomainBehavior): void {
    this.handlers.set(handler.domain, handler);
  }

  /**
   * Get handler for a specific domain
   */
  getHandler(domain: string): DomainBehavior | undefined {
    return this.handlers.get(domain);
  }

  /**
   * Check if a domain has a registered handler
   */
  hasHandler(domain: string): boolean {
    return this.handlers.has(domain);
  }

  /**
   * Get all registered domains
   */
  getRegisteredDomains(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Reset to default handlers
   */
  reset(): void {
    this.clear();
    this.registerDefaultHandlers();
  }
}

/**
 * Global behavior registry instance
 */
export const behaviorRegistry: BehaviorRegistry = new BehaviorRegistry();

/**
 * Get behavior handler for a domain
 */
export function getBehaviorHandler(domain: string): DomainBehavior | undefined {
  return behaviorRegistry.getHandler(domain);
}

/**
 * Register a custom behavior handler
 * Useful for tests or custom mock scenarios
 */
export function registerBehaviorHandler(handler: DomainBehavior): void {
  behaviorRegistry.register(handler);
}
