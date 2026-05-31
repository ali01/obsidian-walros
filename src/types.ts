export const CREATE_DIRECTORY_TREE_TYPE = 'create_directory_tree';

export type DirectoryTree = {
  [name: string]: DirectoryTree | null;
};

export interface CreateDirectoryTreeCommand {
  id: string;
  name: string;
  type: typeof CREATE_DIRECTORY_TREE_TYPE;
  root?: string | string[];
  tree: DirectoryTree;
  open?: string;
}

export type WalrosCommand = CreateDirectoryTreeCommand;

export interface WalrosConfig {
  commands: WalrosCommand[];
}

export type ConfigLoadMode = 'startup' | 'manual';

export type CreationItemType = 'directory' | 'file';

export interface CreationPlanItem {
  path: string;
  type: CreationItemType;
}

export interface CreationSummary {
  files: number;
  folders: number;
}

export type VariableValues = Record<string, string>;
