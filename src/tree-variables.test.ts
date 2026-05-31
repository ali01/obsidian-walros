import {
  extractTextVariables,
  extractTreeVariables,
  resolveTextVariables,
  resolveTreeVariables
} from './tree-variables';

describe('tree variables', () => {
  it('extracts unique variables in traversal order', () => {
    const variables = extractTreeVariables({
      '{{company}}': {
        '{{company}}.md': null,
        '{{year}} - {{topic}}': {}
      },
      '{{company_name}} notes': null
    });

    expect(variables).toEqual(['company', 'year', 'topic', 'company_name']);
  });

  it('resolves repeated and partial placeholders with exact text', () => {
    const resolved = resolveTreeVariables(
      {
        '{{company}}': {
          '{{company}}.md': null,
          '{{year}} - {{topic}}': {}
        }
      },
      {
        company: 'Acme AI',
        year: '2026',
        topic: 'Seed Notes'
      }
    );

    expect(resolved).toEqual({
      'Acme AI': {
        'Acme AI.md': null,
        '2026 - Seed Notes': {}
      }
    });
  });

  it('rejects malformed placeholders', () => {
    expect(() =>
      extractTreeVariables({
        '{{company-name}}': {}
      })
    ).toThrow('malformed variable placeholder');
  });

  it('rejects missing variable values', () => {
    expect(() =>
      resolveTreeVariables(
        {
          '{{company}}': {}
        },
        {}
      )
    ).toThrow('missing value for variable: company');
  });

  it('rejects duplicate keys after interpolation', () => {
    expect(() =>
      resolveTreeVariables(
        {
          '{{company}}': {},
          Acme: {}
        },
        { company: 'Acme' }
      )
    ).toThrow('duplicate path segment after variable resolution: Acme');
  });

  it('extracts and resolves placeholders in open paths', () => {
    expect(extractTextVariables('{{ company }}/{{company}} - {{year}}.md')).toEqual([
      'company',
      'year'
    ]);
    expect(
      resolveTextVariables('{{ company }}/{{company}} - {{year}}.md', {
        company: 'Acme AI',
        year: '2026'
      })
    ).toBe('Acme AI/Acme AI - 2026.md');
  });

  it('rejects malformed placeholders in open paths', () => {
    expect(() => extractTextVariables('{{company-name}}/notes.md')).toThrow(
      'malformed variable placeholder'
    );
  });
});
