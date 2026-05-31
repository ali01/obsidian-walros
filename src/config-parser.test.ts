import { parseWalrosConfig } from './config-parser';
import { ConfigError } from './errors';

describe('parseWalrosConfig', () => {
  it('parses a command with a singleton root and nested tree', () => {
    const config = parseWalrosConfig(`
commands:
  - name: Create Company Workspace
    type: create_directory_tree
    root: brain/invest
    tree:
      Acme:
        Acme.md:
        MEETINGS.md:
        research: {}
    open: Acme/Acme.md
`);

    expect(config.commands).toEqual([
      {
        id: 'create-company-workspace',
        name: 'Create Company Workspace',
        type: 'create_directory_tree',
        root: 'brain/invest',
        tree: {
          Acme: {
            'Acme.md': null,
            'MEETINGS.md': null,
            research: {}
          }
        },
        open: 'Acme/Acme.md'
      }
    ]);
  });

  it('accepts placeholders inside tree keys', () => {
    const config = parseWalrosConfig(`
commands:
  - name: Create Company Workspace
    type: create_directory_tree
    tree:
      "{{ company }}":
        "{{company}}.md":
`);

    expect(config.commands[0].tree).toEqual({
      '{{ company }}': {
        '{{company}}.md': null
      }
    });
  });

  it('parses root lists and missing roots', () => {
    const config = parseWalrosConfig(`
commands:
  - name: Choose Root
    type: create_directory_tree
    root: [brain/invest, memex]
    tree:
      Folder: {}
  - name: Any Root
    type: create_directory_tree
    tree:
      inbox.md:
`);

    expect(config.commands[0].root).toEqual(['brain/invest', 'memex']);
    expect(config.commands[1].root).toBeUndefined();
  });

  it('keeps open optional', () => {
    const config = parseWalrosConfig(`
commands:
  - name: No Open
    type: create_directory_tree
    tree:
      File.md:
`);

    expect(config.commands[0].open).toBeUndefined();
  });

  it('rejects invalid open values', () => {
    expect(() =>
      parseWalrosConfig(`
commands:
  - name: Empty Open
    type: create_directory_tree
    tree:
      File.md:
    open: ""
  - name: List Open
    type: create_directory_tree
    tree:
      File.md:
    open:
      - File.md
`)
    ).toThrowErrorMatchingInlineSnapshot(`"Walros config validation failed."`);
  });

  it('reports malformed YAML with parse details', () => {
    expect(() =>
      parseWalrosConfig(`
commands:
  - name: Broken
    type: create_directory_tree
    tree:
      Bad: [
`)
    ).toThrow(ConfigError);
  });

  it('rejects unknown command types and missing fields', () => {
    expect(() =>
      parseWalrosConfig(`
commands:
  - name: Broken
    type: make_tea
  - type: create_directory_tree
    tree:
      File.md:
`)
    ).toThrowErrorMatchingInlineSnapshot(`"Walros config validation failed."`);
  });

  it('rejects duplicate slugified command ids', () => {
    expect(() =>
      parseWalrosConfig(`
commands:
  - name: Create Thing
    type: create_directory_tree
    tree:
      One: {}
  - name: create thing
    type: create_directory_tree
    tree:
      Two: {}
`)
    ).toThrowErrorMatchingInlineSnapshot(`"Walros config validation failed."`);
  });

  it('rejects malformed tree values', () => {
    expect(() =>
      parseWalrosConfig(`
commands:
  - name: Bad Tree
    type: create_directory_tree
    tree:
      File.md: contents are out of scope
`)
    ).toThrowErrorMatchingInlineSnapshot(`"Walros config validation failed."`);
  });
});
