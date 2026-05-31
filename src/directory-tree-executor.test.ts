import { TFile, TFolder, Vault } from 'obsidian';
import { DirectoryTreeExecutor } from './directory-tree-executor';

describe('DirectoryTreeExecutor', () => {
  interface MockVault extends Vault {
    files: Record<string, unknown>;
  }

  const MockVault = Vault as unknown as new () => MockVault;
  const MockTFolder = TFolder as unknown as new (data: Partial<TFolder>) => TFolder;

  function createVault(): MockVault {
    const vault = new MockVault();
    vault.files['brain'] = new MockTFolder({ path: 'brain', name: 'brain' });
    vault.files['brain/invest'] = new MockTFolder({ path: 'brain/invest', name: 'invest' });
    return vault;
  }

  it('creates nested folders before files', async () => {
    const vault = createVault();
    const executor = new DirectoryTreeExecutor(vault);

    const summary = await executor.createDirectoryTree('brain/invest', {
      Acme: {
        'Acme.md': null,
        'MEETINGS.md': null,
        research: {}
      }
    });

    expect(summary).toEqual({ folders: 2, files: 2 });
    expect(vault.files['brain/invest/Acme']).toBeInstanceOf(TFolder);
    expect(vault.files['brain/invest/Acme/research']).toBeInstanceOf(TFolder);
    expect(vault.files['brain/invest/Acme/Acme.md']).toBeInstanceOf(TFile);
    expect(vault.files['brain/invest/Acme/MEETINGS.md']).toBeInstanceOf(TFile);
  });

  it('fails preflight on existing paths and creates nothing', async () => {
    const vault = createVault();
    vault.files['brain/invest/Acme'] = new MockTFolder({
      path: 'brain/invest/Acme',
      name: 'Acme'
    });
    const executor = new DirectoryTreeExecutor(vault);

    await expect(
      executor.createDirectoryTree('brain/invest', {
        Acme: {
          'Acme.md': null
        }
      })
    ).rejects.toThrow('path already exists: brain/invest/Acme');

    expect(vault.files['brain/invest/Acme/Acme.md']).toBeUndefined();
  });

  it('rejects invalid tree path segments', async () => {
    const vault = createVault();
    const executor = new DirectoryTreeExecutor(vault);

    await expect(
      executor.createDirectoryTree('brain/invest', {
        'Bad/Name': {}
      })
    ).rejects.toThrow('path separators are not allowed');
  });

  it('rejects path traversal in roots', async () => {
    const vault = createVault();
    const executor = new DirectoryTreeExecutor(vault);

    await expect(
      executor.createDirectoryTree('../brain/invest', {
        File: null
      })
    ).rejects.toThrow('path traversal is not allowed');
  });

  it('rejects missing roots', async () => {
    const vault = createVault();
    const executor = new DirectoryTreeExecutor(vault);

    await expect(
      executor.createDirectoryTree('missing', {
        File: null
      })
    ).rejects.toThrow('root folder not found: missing');
  });
});
