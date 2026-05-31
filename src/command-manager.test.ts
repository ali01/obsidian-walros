import { Plugin, TFolder, Vault } from 'obsidian';
import { WalrosCommandManager, WalrosCommandManagerTestUtils } from './command-manager';
import { WalrosErrorReporter } from './error-reporter';
import type { VariableValues } from './types';

describe('WalrosCommandManager', () => {
  interface MockPlugin extends Plugin {
    commands: Record<string, unknown>;
  }

  interface MockVault extends Vault {
    adapter: any;
    files: Record<string, unknown>;
  }

  interface MockWorkspace {
    getLeaf: jest.Mock;
    openFile: jest.Mock;
  }

  const MockPlugin = Plugin as unknown as new () => MockPlugin;
  const MockVault = Vault as unknown as new () => MockVault;
  const MockTFolder = TFolder as unknown as new (data: Partial<TFolder>) => TFolder;

  function createPlugin(yamlText: string | null): MockPlugin {
    const plugin = new MockPlugin();
    const vault = new MockVault();
    const openFile = jest.fn(async () => undefined);
    vault.adapter = {
      exists: jest.fn(async () => yamlText !== null),
      read: jest.fn(async () => yamlText ?? '')
    };
    plugin.app = {
      vault,
      workspace: {
        getLeaf: jest.fn(() => ({ openFile })),
        openFile
      }
    } as any;
    return plugin;
  }

  function createManager(
    plugin: MockPlugin,
    variablePromptFactory?: ConstructorParameters<typeof WalrosCommandManager>[2]
  ): WalrosCommandManager {
    return new WalrosCommandManager(plugin, new WalrosErrorReporter(), variablePromptFactory);
  }

  function addFolder(plugin: MockPlugin, path: string): void {
    getMockVault(plugin).files[path] = new MockTFolder({
      path,
      name: path.split('/').pop() ?? path
    });
  }

  function getMockVault(plugin: MockPlugin): MockVault {
    return plugin.app.vault as MockVault;
  }

  function getMockWorkspace(plugin: MockPlugin): MockWorkspace {
    return plugin.app.workspace as unknown as MockWorkspace;
  }

  async function waitForAsyncCommand(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers static and dynamic commands on startup', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Thing
    type: create_directory_tree
    tree:
      Thing: {}
`);
    const manager = createManager(plugin);

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');

    expect(Object.keys(plugin.commands).sort()).toEqual([
      'create-thing',
      WalrosCommandManagerTestUtils.reloadCommandId
    ]);
  });

  it('manual reload removes stale dynamic commands and adds new ones', async () => {
    const plugin = createPlugin(`
commands:
  - name: First
    type: create_directory_tree
    tree:
      First: {}
`);
    const manager = createManager(plugin);
    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');

    plugin.app.vault.adapter.read = jest.fn(
      async () => `
commands:
  - name: Second
    type: create_directory_tree
    tree:
      Second: {}
`
    );

    await manager.loadConfiguredCommands('manual');

    expect(plugin.commands.first).toBeUndefined();
    expect(plugin.commands.second).toBeDefined();
    expect(plugin.commands[WalrosCommandManagerTestUtils.reloadCommandId]).toBeDefined();
  });

  it('manual reload failure preserves existing dynamic commands', async () => {
    const plugin = createPlugin(`
commands:
  - name: Stable
    type: create_directory_tree
    tree:
      Stable: {}
`);
    const manager = createManager(plugin);
    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');

    plugin.app.vault.adapter.read = jest.fn(
      async () => `
commands:
  - name: Broken
    type: unknown
`
    );

    await manager.loadConfiguredCommands('manual');

    expect(plugin.commands.stable).toBeDefined();
  });

  it('missing config registers no dynamic commands', async () => {
    const plugin = createPlugin(null);
    const manager = createManager(plugin);
    manager.registerStaticCommands();

    await manager.loadConfiguredCommands('startup');

    expect(Object.keys(plugin.commands)).toEqual([WalrosCommandManagerTestUtils.reloadCommandId]);
    expect(console.info).toHaveBeenCalledWith(
      'Walros: no .walros.yaml found; no dynamic commands registered.'
    );
  });

  it('opens a single variable modal before creating a tree with variables', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}":
        "{{company}}.md":
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const prompts: Array<{ variables: string[]; open: jest.Mock }> = [];
    const manager = createManager(plugin, (_app, variables, _onSubmit) => {
      const prompt = { variables, open: jest.fn() };
      prompts.push(prompt);
      return { open: prompt.open };
    });

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();

    expect(prompts).toHaveLength(1);
    expect(prompts[0].variables).toEqual(['company']);
    expect(prompts[0].open).toHaveBeenCalled();
    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();
  });

  it('opens one modal for all variables and creates after submit', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}":
        "{{year}} - notes.md":
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const prompts: Array<{
      variables: string[];
      open: jest.Mock;
      onSubmit: (values: VariableValues) => void;
    }> = [];
    const manager = createManager(plugin, (_app, variables, onSubmit) => {
      const prompt = { variables, open: jest.fn(), onSubmit };
      prompts.push(prompt);
      return { open: prompt.open };
    });

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();

    expect(prompts).toHaveLength(1);
    expect(prompts[0].variables).toEqual(['company', 'year']);
    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();

    prompts[0].onSubmit({ company: 'Acme', year: '2026' });
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeDefined();
    expect(getMockVault(plugin).files['brain/invest/Acme/2026 - notes.md']).toBeDefined();
  });

  it('submitting variable values creates the interpolated tree', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}":
        "{{company}}.md":
        MEETINGS.md:
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    let submitVariables: ((values: VariableValues) => void) | undefined;
    const manager = createManager(plugin, (_app, _variables, onSubmit) => {
      submitVariables = onSubmit;
      return { open: jest.fn() };
    });

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    submitVariables?.({ company: 'Acme AI' });
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme AI']).toBeDefined();
    expect(getMockVault(plugin).files['brain/invest/Acme AI/Acme AI.md']).toBeDefined();
    expect(getMockVault(plugin).files['brain/invest/Acme AI/MEETINGS.md']).toBeDefined();
  });

  it('creates the tree and opens the configured file in a new tab', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}":
        "{{company}}.md":
        MEETINGS.md:
    open: "{{company}}/{{company}}.md"
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    let submitVariables: ((values: VariableValues) => void) | undefined;
    const manager = createManager(plugin, (_app, _variables, onSubmit) => {
      submitVariables = onSubmit;
      return { open: jest.fn() };
    });

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    submitVariables?.({ company: 'Acme AI' });
    await waitForAsyncCommand();

    const createdFile = getMockVault(plugin).files['brain/invest/Acme AI/Acme AI.md'];
    expect(createdFile).toBeDefined();
    expect(getMockWorkspace(plugin).getLeaf).toHaveBeenCalledWith('tab');
    expect(getMockWorkspace(plugin).openFile).toHaveBeenCalledWith(createdFile);
  });

  it('does not open a tab when open is omitted', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      Acme:
        Acme.md:
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const manager = createManager(plugin);

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme/Acme.md']).toBeDefined();
    expect(getMockWorkspace(plugin).getLeaf).not.toHaveBeenCalled();
    expect(getMockWorkspace(plugin).openFile).not.toHaveBeenCalled();
  });

  it('rejects open variables not present in the tree without creating anything', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      Acme:
        Acme.md:
    open: "{{company}}/Acme.md"
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const promptFactory = jest.fn(() => ({ open: jest.fn() }));
    const manager = createManager(plugin, promptFactory);

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    await waitForAsyncCommand();

    expect(promptFactory).not.toHaveBeenCalled();
    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();
    expect(getMockWorkspace(plugin).openFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      expect.stringContaining('open target uses variables not found in tree: company')
    );
  });

  it('fails before creation when open targets a directory', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      Acme:
        Acme.md:
    open: Acme
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const manager = createManager(plugin);

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();
    expect(getMockWorkspace(plugin).openFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      expect.stringContaining('open target must be a file: brain/invest/Acme')
    );
  });

  it('fails before creation when open targets a missing file', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      Acme:
        Acme.md:
    open: Acme/MISSING.md
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const manager = createManager(plugin);

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();
    expect(getMockVault(plugin).files['brain/invest/Acme/Acme.md']).toBeUndefined();
    expect(getMockWorkspace(plugin).openFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      expect.stringContaining(
        'open target is not created by this command: brain/invest/Acme/MISSING.md'
      )
    );
  });

  it('does not create anything when the variable modal is cancelled', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}": {}
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const manager = createManager(plugin, () => ({ open: jest.fn() }));

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();
  });

  it('rejects invalid variable values atomically after interpolation', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}":
        "{{company}}.md":
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    let submitVariables: ((values: VariableValues) => void) | undefined;
    const manager = createManager(plugin, (_app, _variables, onSubmit) => {
      submitVariables = onSubmit;
      return { open: jest.fn() };
    });

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    submitVariables?.({ company: 'Bad/Name' });
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Bad']).toBeUndefined();
    expect(getMockVault(plugin).files['brain/invest/Bad/Name']).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      expect.stringContaining('path separators are not allowed')
    );
  });

  it('rejects conflicts after interpolation without creating children', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company}}":
        "{{company}}.md":
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');
    addFolder(plugin, 'brain/invest/Acme');

    let submitVariables: ((values: VariableValues) => void) | undefined;
    const manager = createManager(plugin, (_app, _variables, onSubmit) => {
      submitVariables = onSubmit;
      return { open: jest.fn() };
    });

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    submitVariables?.({ company: 'Acme' });
    await waitForAsyncCommand();

    expect(getMockVault(plugin).files['brain/invest/Acme/Acme.md']).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      expect.stringContaining('path already exists: brain/invest/Acme')
    );
  });

  it('rejects malformed placeholders during execution without prompting', async () => {
    const plugin = createPlugin(`
commands:
  - name: Create Company
    type: create_directory_tree
    root: brain/invest
    tree:
      "{{company-name}}": {}
`);
    addFolder(plugin, 'brain');
    addFolder(plugin, 'brain/invest');

    const promptFactory = jest.fn(() => ({ open: jest.fn() }));
    const manager = createManager(plugin, promptFactory);

    manager.registerStaticCommands();
    await manager.loadConfiguredCommands('startup');
    (plugin.commands['create-company'] as { callback: () => void }).callback();
    await waitForAsyncCommand();

    expect(promptFactory).not.toHaveBeenCalled();
    expect(getMockVault(plugin).files['brain/invest/Acme']).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      expect.stringContaining('malformed variable placeholder')
    );
  });
});
