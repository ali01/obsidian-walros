import { load as parseYaml, YAMLException } from 'js-yaml';
import { ConfigError } from './errors';
import {
  CREATE_DIRECTORY_TREE_TYPE,
  type DirectoryTree,
  type WalrosCommand,
  type WalrosConfig
} from './types';
import { slugifyCommandName } from './slug';

export function parseWalrosConfig(yamlText: string): WalrosConfig {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (error) {
    throw yamlParseError(error);
  }

  const issues: string[] = [];
  if (!isPlainObject(raw)) {
    throw new ConfigError('.walros.yaml must be a YAML mapping.');
  }

  const rawCommands = raw.commands;
  if (!Array.isArray(rawCommands)) {
    throw new ConfigError('commands must be a list.', ['commands']);
  }

  const commands: WalrosCommand[] = [];
  const commandIds = new Set<string>();

  rawCommands.forEach((rawCommand, index) => {
    const command = parseCommand(rawCommand, index, issues);
    if (command === null) return;

    if (commandIds.has(command.id)) {
      issues.push(`commands[${String(index)}].name: duplicate command id "${command.id}"`);
      return;
    }

    commandIds.add(command.id);
    commands.push(command);
  });

  if (issues.length > 0) {
    throw new ConfigError('Walros config validation failed.', issues);
  }

  return { commands };
}

function parseCommand(raw: unknown, index: number, issues: string[]): WalrosCommand | null {
  const path = `commands[${String(index)}]`;
  if (!isPlainObject(raw)) {
    issues.push(`${path}: command must be a mapping`);
    return null;
  }

  const name = parseNonEmptyString(raw.name, `${path}.name`, issues);
  const type = parseNonEmptyString(raw.type, `${path}.type`, issues);
  if (name === null || type === null) return null;

  const id = slugifyCommandName(name);
  if (id === '') {
    issues.push(`${path}.name: command name must contain at least one letter or number`);
  }

  if (type !== CREATE_DIRECTORY_TREE_TYPE) {
    issues.push(`${path}.type: unsupported command type "${type}"`);
    return null;
  }

  const root = parseRoot(raw.root, `${path}.root`, issues);
  const tree = parseTree(raw.tree, `${path}.tree`, issues);
  const open = parseOpen(raw.open, `${path}.open`, issues);

  if (id === '' || root === null || tree === null || open === null) return null;

  return {
    id,
    name,
    type: CREATE_DIRECTORY_TREE_TYPE,
    ...(root === undefined ? {} : { root }),
    tree,
    ...(open === undefined ? {} : { open })
  };
}

function parseRoot(
  raw: unknown,
  path: string,
  issues: string[]
): string | string[] | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    return parseNonEmptyString(raw, path, issues);
  }
  if (!Array.isArray(raw)) {
    issues.push(`${path}: root must be a string or a list of strings`);
    return null;
  }
  if (raw.length === 0) {
    issues.push(`${path}: root list must not be empty`);
    return null;
  }

  const roots: string[] = [];
  raw.forEach((item, index) => {
    const root = parseNonEmptyString(item, `${path}[${String(index)}]`, issues);
    if (root !== null) roots.push(root);
  });

  return roots.length === raw.length ? roots : null;
}

function parseTree(raw: unknown, path: string, issues: string[]): DirectoryTree | null {
  if (!isPlainObject(raw)) {
    issues.push(`${path}: tree must be a mapping`);
    return null;
  }
  if (Object.keys(raw).length === 0) {
    issues.push(`${path}: tree must not be empty`);
    return null;
  }

  const tree: DirectoryTree = {};
  for (const [name, value] of Object.entries(raw)) {
    const childPath = `${path}.${name}`;
    if (value === null || value === undefined) {
      tree[name] = null;
      continue;
    }
    if (!isPlainObject(value)) {
      issues.push(`${childPath}: tree values must be mappings or empty file leaves`);
      continue;
    }
    tree[name] = parseChildTree(value, childPath, issues);
  }

  return tree;
}

function parseOpen(raw: unknown, path: string, issues: string[]): string | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  return parseNonEmptyString(raw, path, issues);
}

function parseChildTree(
  raw: Record<string, unknown>,
  path: string,
  issues: string[]
): DirectoryTree {
  const tree: DirectoryTree = {};
  for (const [name, value] of Object.entries(raw)) {
    const childPath = `${path}.${name}`;
    if (value === null || value === undefined) {
      tree[name] = null;
      continue;
    }
    if (!isPlainObject(value)) {
      issues.push(`${childPath}: tree values must be mappings or empty file leaves`);
      continue;
    }
    tree[name] = parseChildTree(value, childPath, issues);
  }
  return tree;
}

function parseNonEmptyString(raw: unknown, path: string, issues: string[]): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') {
    issues.push(`${path}: must be a non-empty string`);
    return null;
  }
  return raw.trim();
}

function yamlParseError(error: unknown): ConfigError {
  if (error instanceof YAMLException) {
    const details: string[] = [];
    const mark = error.mark as { line?: number; column?: number } | undefined;
    if (mark?.line !== undefined && mark.column !== undefined) {
      details.push(`line ${String(mark.line + 1)}, column ${String(mark.column + 1)}`);
    }
    return new ConfigError(`Failed to parse .walros.yaml: ${error.reason}`, details);
  }

  return new ConfigError(`Failed to parse .walros.yaml: ${String(error)}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
