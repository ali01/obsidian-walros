import { Notice, TFile, TFolder } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { parseWalrosConfig } from './config-parser';
import { DirectoryTreeExecutor } from './directory-tree-executor';
import { WalrosErrorReporter } from './error-reporter';
import type {
  ConfigLoadMode,
  CreateDirectoryTreeCommand,
  VariableValues,
  WalrosCommand
} from './types';
import {
  extractTextVariables,
  extractTreeVariables,
  resolveTextVariables,
  resolveTreeVariables
} from './tree-variables';
import { FolderSuggestModal } from './ui/folder-modal';
import { VariableInputModal } from './ui/variable-input-modal';
import { CommandExecutionError, ConfigError } from './errors';
import { joinVaultPath, normalizeRootPath, normalizeRootRelativePath } from './path-utils';

const CONFIG_PATH = '.walros.yaml';
const RELOAD_COMMAND_ID = 'reload-walros-config';

interface OpenableModal {
  open(): void;
}

type VariablePromptFactory = (
  app: App,
  variables: string[],
  onSubmit: (values: VariableValues) => void
) => OpenableModal;

export class WalrosCommandManager {
  private readonly plugin: Plugin;
  private readonly errorReporter: WalrosErrorReporter;
  private readonly executor: DirectoryTreeExecutor;
  private readonly variablePromptFactory: VariablePromptFactory;
  private readonly dynamicCommandIds: Set<string> = new Set();

  constructor(
    plugin: Plugin,
    errorReporter: WalrosErrorReporter,
    variablePromptFactory: VariablePromptFactory = (
      app: App,
      variables: string[],
      onSubmit: (values: VariableValues) => void
    ) => new VariableInputModal(app, variables, onSubmit)
  ) {
    this.plugin = plugin;
    this.errorReporter = errorReporter;
    this.executor = new DirectoryTreeExecutor(plugin.app.vault);
    this.variablePromptFactory = variablePromptFactory;
  }

  public registerStaticCommands(): void {
    this.plugin.addCommand({
      id: RELOAD_COMMAND_ID,
      name: 'Reload config',
      callback: () => {
        this.loadConfiguredCommands('manual').catch((error: unknown) => {
          this.errorReporter.reportConfigFailure('manual', error);
        });
      }
    });
  }

  public async loadConfiguredCommands(mode: ConfigLoadMode): Promise<void> {
    const exists = await this.plugin.app.vault.adapter.exists(CONFIG_PATH);
    if (!exists) {
      this.replaceDynamicCommands([]);
      this.errorReporter.reportMissingConfig();
      return;
    }

    try {
      const yamlText = await this.plugin.app.vault.adapter.read(CONFIG_PATH);
      const config = parseWalrosConfig(yamlText);
      this.assertNoReservedCommandIds(config.commands);
      this.replaceDynamicCommands(config.commands);
      if (mode === 'manual') {
        this.errorReporter.reportReloadSuccess(config.commands.length);
      }
    } catch (error) {
      if (mode === 'startup') {
        this.unregisterDynamicCommands();
      }
      this.errorReporter.reportConfigFailure(mode, error);
    }
  }

  public unregisterDynamicCommands(): void {
    for (const commandId of this.dynamicCommandIds) {
      this.plugin.removeCommand(commandId);
    }
    this.dynamicCommandIds.clear();
  }

  private replaceDynamicCommands(commands: WalrosCommand[]): void {
    this.unregisterDynamicCommands();
    for (const command of commands) {
      this.registerConfiguredCommand(command);
    }
  }

  private registerConfiguredCommand(command: WalrosCommand): void {
    this.plugin.addCommand({
      id: command.id,
      name: command.name,
      callback: () => {
        try {
          this.runConfiguredCommand(command);
        } catch (error) {
          this.errorReporter.reportCommandFailure(command.name, error);
        }
      }
    });
    this.dynamicCommandIds.add(command.id);
  }

  private runConfiguredCommand(command: WalrosCommand): void {
    this.runCreateDirectoryTree(command);
  }

  private runCreateDirectoryTree(command: CreateDirectoryTreeCommand): void {
    const variables = extractTreeVariables(command.tree);
    this.validateOpenVariables(command, variables);

    if (command.root === undefined) {
      this.promptForRoot(command, this.getAllFolders(), variables);
      return;
    }

    if (Array.isArray(command.root)) {
      this.promptForRoot(command, this.getConfiguredRootFolders(command.root), variables);
      return;
    }

    const rootPath = normalizeRootPath(command.root);
    this.promptForVariablesOrExecute(command, rootPath, variables);
  }

  private promptForRoot(
    command: CreateDirectoryTreeCommand,
    folders: TFolder[],
    variables: string[]
  ): void {
    if (folders.length === 0) {
      throw new CommandExecutionError('no root folders available');
    }

    const modal = new FolderSuggestModal(this.plugin.app, folders, (folder: TFolder) => {
      this.promptForVariablesOrExecute(command, folder.path, variables);
    });
    modal.open();
  }

  private promptForVariablesOrExecute(
    command: CreateDirectoryTreeCommand,
    rootPath: string,
    variables: string[]
  ): void {
    if (variables.length === 0) {
      this.executeCreateDirectoryTree(command, rootPath, {}).catch((error: unknown) => {
        this.errorReporter.reportCommandFailure(command.name, error);
      });
      return;
    }

    const modal = this.variablePromptFactory(this.plugin.app, variables, (values) => {
      this.executeCreateDirectoryTree(command, rootPath, values).catch((error: unknown) => {
        this.errorReporter.reportCommandFailure(command.name, error);
      });
    });
    modal.open();
  }

  private async executeCreateDirectoryTree(
    command: CreateDirectoryTreeCommand,
    rootPath: string,
    values: VariableValues
  ): Promise<void> {
    const resolvedTree = resolveTreeVariables(command.tree, values);
    const openPath = this.resolveOpenPath(command, rootPath, values, resolvedTree);
    const summary = await this.executor.createDirectoryTree(rootPath, resolvedTree);
    if (openPath !== undefined) {
      await this.openFileInNewTab(openPath);
    }
    const folderNoun = summary.folders === 1 ? 'folder' : 'folders';
    const fileNoun = summary.files === 1 ? 'file' : 'files';
    new Notice(
      `${command.name}: created ${String(summary.folders)} ${folderNoun} and ` +
        `${String(summary.files)} ${fileNoun}.`
    );
  }

  private getConfiguredRootFolders(rootPaths: string[]): TFolder[] {
    return rootPaths.map((rootPath) => this.getRootFolder(rootPath));
  }

  private validateOpenVariables(
    command: CreateDirectoryTreeCommand,
    treeVariables: string[]
  ): void {
    if (command.open === undefined) return;

    const treeVariableSet = new Set(treeVariables);
    const unknownVariables = extractTextVariables(command.open).filter(
      (variable) => !treeVariableSet.has(variable)
    );

    if (unknownVariables.length > 0) {
      throw new CommandExecutionError(
        `open target uses variables not found in tree: ${unknownVariables.join(', ')}`
      );
    }
  }

  private resolveOpenPath(
    command: CreateDirectoryTreeCommand,
    rootPath: string,
    values: VariableValues,
    resolvedTree: ReturnType<typeof resolveTreeVariables>
  ): string | undefined {
    if (command.open === undefined) return undefined;

    const resolvedOpen = normalizeRootRelativePath(resolveTextVariables(command.open, values));
    const openPath = joinVaultPath(rootPath, resolvedOpen);
    const openPlanItem = this.executor
      .buildCreationPlan(rootPath, resolvedTree)
      .find((item) => item.path === openPath);

    if (openPlanItem === undefined) {
      throw new CommandExecutionError(`open target is not created by this command: ${openPath}`);
    }
    if (openPlanItem.type !== 'file') {
      throw new CommandExecutionError(`open target must be a file: ${openPath}`);
    }

    return openPath;
  }

  private async openFileInNewTab(path: string): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new CommandExecutionError(`open target file was not found after creation: ${path}`);
    }

    await this.plugin.app.workspace.getLeaf('tab').openFile(file);
  }

  private getRootFolder(rootPath: string): TFolder {
    const normalizedRoot = normalizeRootPath(rootPath);
    const folder = this.plugin.app.vault.getAbstractFileByPath(normalizedRoot);

    if (folder instanceof TFolder) {
      return folder;
    }

    throw new CommandExecutionError(`root folder not found: ${normalizedRoot}`);
  }

  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];
    const rootFolder = this.plugin.app.vault.getRoot();
    folders.push(rootFolder);

    const addFolders = (folder: TFolder): void => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          folders.push(child);
          addFolders(child);
        }
      }
    };

    addFolders(rootFolder);
    return folders;
  }

  private assertNoReservedCommandIds(commands: WalrosCommand[]): void {
    const conflicts = commands
      .filter((command) => command.id === RELOAD_COMMAND_ID)
      .map((command) => `command "${command.name}" generates reserved id "${RELOAD_COMMAND_ID}"`);

    if (conflicts.length > 0) {
      throw new ConfigError('Walros config validation failed.', conflicts);
    }
  }
}

export const WalrosCommandManagerTestUtils = {
  reloadCommandId: RELOAD_COMMAND_ID,
  configPath: CONFIG_PATH
};
