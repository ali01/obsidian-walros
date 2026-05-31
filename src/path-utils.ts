import { normalizePath } from 'obsidian';
import { CommandExecutionError } from './errors';

export function normalizeRootPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === '') {
    throw new CommandExecutionError('root path is empty');
  }
  if (trimmed.startsWith('/')) {
    throw new CommandExecutionError(`absolute paths are not allowed: ${trimmed}`);
  }
  if (trimmed.includes('\\')) {
    throw new CommandExecutionError(`backslashes are not allowed in paths: ${trimmed}`);
  }
  return normalizeVaultRelativePath(trimmed);
}

export function joinVaultPath(rootPath: string, relativePath: string): string {
  if (rootPath === '') return normalizeVaultRelativePath(relativePath);
  return normalizeVaultRelativePath(`${rootPath}/${relativePath}`);
}

export function normalizeRootRelativePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === '') {
    throw new CommandExecutionError('relative path is empty');
  }
  if (trimmed.startsWith('/')) {
    throw new CommandExecutionError(`absolute paths are not allowed: ${trimmed}`);
  }
  if (trimmed.includes('\\')) {
    throw new CommandExecutionError(`backslashes are not allowed in paths: ${trimmed}`);
  }
  return normalizeVaultRelativePath(trimmed);
}

export function validateTreeName(name: string, configPath: string): void {
  if (name.trim() === '') {
    throw new CommandExecutionError(`empty path segment at ${configPath}`);
  }
  if (name === '.' || name === '..') {
    throw new CommandExecutionError(`invalid path segment "${name}" at ${configPath}`);
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new CommandExecutionError(
      `path separators are not allowed in tree keys at ${configPath}: ${name}`
    );
  }
}

function normalizeVaultRelativePath(path: string): string {
  const rawSegments = path.split('/');
  if (rawSegments.some((segment) => segment === '..' || segment === '.')) {
    throw new CommandExecutionError(`path traversal is not allowed: ${path}`);
  }

  const normalized = normalizePath(path);
  const segments = normalized.split('/');

  if (normalized === '' || normalized.startsWith('/')) {
    throw new CommandExecutionError(`invalid vault-relative path: ${path}`);
  }
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new CommandExecutionError(`path traversal is not allowed: ${path}`);
  }

  return normalized;
}
