import { Plugin } from 'obsidian';
import { WalrosCommandManager } from './command-manager';
import { WalrosErrorReporter } from './error-reporter';

export default class WalrosPlugin extends Plugin {
  private commandManager?: WalrosCommandManager;

  public async onload(): Promise<void> {
    const errorReporter = new WalrosErrorReporter();
    this.commandManager = new WalrosCommandManager(this, errorReporter);
    this.commandManager.registerStaticCommands();
    await this.commandManager.loadConfiguredCommands('startup');
  }

  public onunload(): void {
    this.commandManager?.unregisterDynamicCommands();
  }
}

export { WalrosPlugin };
