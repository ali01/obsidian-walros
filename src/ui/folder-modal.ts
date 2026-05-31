import { FuzzySuggestModal, TFolder } from 'obsidian';
import type { App } from 'obsidian';

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private readonly folders: TFolder[];
  private readonly onChoose: (folder: TFolder) => void;

  constructor(app: App, folders: TFolder[], onChoose: (folder: TFolder) => void) {
    super(app);
    this.folders = folders;
    this.onChoose = onChoose;
  }

  public getItems(): TFolder[] {
    return this.folders;
  }

  public getItemText(folder: TFolder): string {
    return folder.path || '/';
  }

  public onChooseItem(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(folder);
  }
}
