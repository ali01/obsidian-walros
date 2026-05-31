import { ConfigError, CommandExecutionError } from './errors';
import { WalrosErrorReporter } from './error-reporter';

describe('WalrosErrorReporter', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a startup config failure notice and logs details', () => {
    const reporter = new WalrosErrorReporter();
    const error = new ConfigError('bad config', ['commands[2].tree.Acme']);

    reporter.reportConfigFailure('startup', error);

    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      'Walros config failed to load; dynamic commands unavailable. See console for details.'
    );
    expect(console.error).toHaveBeenCalledWith(
      'Walros: config load failed',
      'bad config',
      ['commands[2].tree.Acme'],
      error
    );
  });

  it('shows a manual reload failure notice and logs details', () => {
    const reporter = new WalrosErrorReporter();
    const error = new ConfigError('bad reload', ['line 4, column 8']);

    reporter.reportConfigFailure('manual', error);

    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      'Walros config reload failed; keeping existing commands. See console for details.'
    );
    expect(console.error).toHaveBeenCalledWith(
      'Walros: config load failed',
      'bad reload',
      ['line 4, column 8'],
      error
    );
  });

  it('shows concise command failure notices and logs details', () => {
    const reporter = new WalrosErrorReporter();
    const error = new CommandExecutionError('path already exists: brain/invest/Acme', [
      'path already exists: brain/invest/Acme'
    ]);

    reporter.reportCommandFailure('Create Company Workspace', error);

    expect(console.log).toHaveBeenCalledWith(
      'Notice:',
      'Create Company Workspace failed: path already exists: brain/invest/Acme'
    );
    expect(console.error).toHaveBeenCalledWith(
      'Walros: command "Create Company Workspace" failed',
      'path already exists: brain/invest/Acme',
      ['path already exists: brain/invest/Acme'],
      error
    );
  });
});
