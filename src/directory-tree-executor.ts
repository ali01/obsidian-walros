import { TFile, TFolder } from 'obsidian';
import type { Vault } from 'obsidian';
import { CommandExecutionError } from './errors';
import type { CreationPlanItem, CreationSummary, DirectoryTree } from './types';
import { joinVaultPath, normalizeRootPath, validateTreeName } from './path-utils';

export class DirectoryTreeExecutor {
  private readonly vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  public async createDirectoryTree(
    rootPath: string,
    tree: DirectoryTree
  ): Promise<CreationSummary> {
    const normalizedRoot = rootPath === '' ? '' : normalizeRootPath(rootPath);
    this.validateRootExists(normalizedRoot);

    const plan = this.buildCreationPlan(normalizedRoot, tree);
    this.preflight(plan);

    let folders = 0;
    let files = 0;

    for (const item of plan) {
      if (item.type === 'directory') {
        await this.vault.createFolder(item.path);
        folders++;
      } else {
        await this.vault.create(item.path, '');
        files++;
      }
    }

    return { files, folders };
  }

  public buildCreationPlan(rootPath: string, tree: DirectoryTree): CreationPlanItem[] {
    const plan: CreationPlanItem[] = [];
    this.collectCreationPlan(rootPath, tree, 'tree', plan);
    return plan;
  }

  private collectCreationPlan(
    parentPath: string,
    tree: DirectoryTree,
    configPath: string,
    plan: CreationPlanItem[]
  ): void {
    for (const [name, child] of Object.entries(tree)) {
      validateTreeName(name, `${configPath}.${name}`);
      const itemPath = joinVaultPath(parentPath, name);
      if (child === null) {
        plan.push({ path: itemPath, type: 'file' });
        continue;
      }

      plan.push({ path: itemPath, type: 'directory' });
      this.collectCreationPlan(itemPath, child, `${configPath}.${name}`, plan);
    }
  }

  private validateRootExists(rootPath: string): void {
    const root =
      rootPath === '' ? this.vault.getRoot() : this.vault.getAbstractFileByPath(rootPath);
    if (!(root instanceof TFolder)) {
      const displayPath = rootPath === '' ? '/' : rootPath;
      throw new CommandExecutionError(`root folder not found: ${displayPath}`);
    }
  }

  private preflight(plan: CreationPlanItem[]): void {
    const conflicts: string[] = [];
    const seen = new Set<string>();

    for (const item of plan) {
      if (seen.has(item.path)) {
        conflicts.push(`duplicate target path: ${item.path}`);
        continue;
      }
      seen.add(item.path);

      const existing = this.vault.getAbstractFileByPath(item.path);
      if (existing instanceof TFolder || existing instanceof TFile) {
        conflicts.push(`path already exists: ${item.path}`);
      }
    }

    if (conflicts.length > 0) {
      throw new CommandExecutionError(conflicts[0], conflicts);
    }
  }
}
