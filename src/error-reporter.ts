import { Notice } from 'obsidian';
import type { ConfigLoadMode } from './types';
import { WalrosError } from './errors';

export class WalrosErrorReporter {
  public reportMissingConfig(): void {
    console.info('Walros: no .walros.yaml found; no dynamic commands registered.');
  }

  public reportConfigFailure(mode: ConfigLoadMode, error: unknown): void {
    const message =
      mode === 'startup'
        ? 'Walros config failed to load; dynamic commands unavailable. See console for details.'
        : 'Walros config reload failed; keeping existing commands. See console for details.';

    new Notice(message);
    this.logError('Walros: config load failed', error);
  }

  public reportReloadSuccess(commandCount: number): void {
    const noun = commandCount === 1 ? 'command' : 'commands';
    new Notice(`Walros config reloaded: ${String(commandCount)} ${noun}.`);
  }

  public reportCommandFailure(commandName: string, error: unknown): void {
    const summary = error instanceof Error ? error.message : String(error);
    new Notice(`${commandName} failed: ${summary}`);
    this.logError(`Walros: command "${commandName}" failed`, error);
  }

  private logError(prefix: string, error: unknown): void {
    if (error instanceof WalrosError && error.details.length > 0) {
      console.error(prefix, error.message, error.details, error);
      return;
    }
    console.error(prefix, error);
  }
}
