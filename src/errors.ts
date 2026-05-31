export class WalrosError extends Error {
  public readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'WalrosError';
    this.details = details;
  }
}

export class ConfigError extends WalrosError {
  constructor(message: string, details: string[] = []) {
    super(message, details);
    this.name = 'ConfigError';
  }
}

export class CommandExecutionError extends WalrosError {
  constructor(message: string, details: string[] = []) {
    super(message, details);
    this.name = 'CommandExecutionError';
  }
}
