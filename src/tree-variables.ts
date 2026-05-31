import { CommandExecutionError } from './errors';
import type { DirectoryTree, VariableValues } from './types';

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const PLACEHOLDER_PATTERN = /^\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\}$/;

export function extractTreeVariables(tree: DirectoryTree): string[] {
  const variables: string[] = [];
  const seen = new Set<string>();

  walkTreeKeys(tree, (key) => {
    assertValidPlaceholders(key);
    for (const variable of extractVariablesFromKey(key)) {
      if (!seen.has(variable)) {
        seen.add(variable);
        variables.push(variable);
      }
    }
  });

  return variables;
}

export function extractTextVariables(text: string): string[] {
  assertValidPlaceholders(text);
  const variables: string[] = [];
  const seen = new Set<string>();

  for (const variable of extractVariablesFromKey(text)) {
    if (!seen.has(variable)) {
      seen.add(variable);
      variables.push(variable);
    }
  }

  return variables;
}

export function resolveTreeVariables(tree: DirectoryTree, values: VariableValues): DirectoryTree {
  const resolved: DirectoryTree = {};
  const seenKeys = new Set<string>();

  for (const [key, child] of Object.entries(tree)) {
    const resolvedKey = resolveTreeKey(key, values);
    if (seenKeys.has(resolvedKey)) {
      throw new CommandExecutionError(
        `duplicate path segment after variable resolution: ${resolvedKey}`
      );
    }
    seenKeys.add(resolvedKey);

    resolved[resolvedKey] = child === null ? null : resolveTreeVariables(child, values);
  }

  return resolved;
}

export function resolveTextVariables(text: string, values: VariableValues): string {
  return resolveTreeKey(text, values);
}

function walkTreeKeys(tree: DirectoryTree, visit: (key: string) => void): void {
  for (const [key, child] of Object.entries(tree)) {
    visit(key);
    if (child !== null) {
      walkTreeKeys(child, visit);
    }
  }
}

function extractVariablesFromKey(key: string): string[] {
  VARIABLE_PATTERN.lastIndex = 0;
  const variables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_PATTERN.exec(key)) !== null) {
    variables.push(match[1]);
  }
  return variables;
}

function resolveTreeKey(key: string, values: VariableValues): string {
  assertValidPlaceholders(key);
  VARIABLE_PATTERN.lastIndex = 0;
  return key.replace(VARIABLE_PATTERN, (_match, variableName: string) => {
    const value = values[variableName]?.trim();
    if (value === undefined || value === '') {
      throw new CommandExecutionError(`missing value for variable: ${variableName}`);
    }
    return value;
  });
}

function assertValidPlaceholders(key: string): void {
  let searchIndex = 0;

  while (true) {
    const start = key.indexOf('{{', searchIndex);
    if (start === -1) break;

    const end = key.indexOf('}}', start + 2);
    if (end === -1) {
      throw new CommandExecutionError(`malformed variable placeholder in tree key: ${key}`);
    }

    const placeholder = key.slice(start, end + 2);
    if (!PLACEHOLDER_PATTERN.test(placeholder)) {
      throw new CommandExecutionError(`malformed variable placeholder in tree key: ${key}`);
    }

    searchIndex = end + 2;
  }

  const strayClose = key.indexOf('}}', searchIndex);
  if (strayClose !== -1) {
    throw new CommandExecutionError(`malformed variable placeholder in tree key: ${key}`);
  }
}
