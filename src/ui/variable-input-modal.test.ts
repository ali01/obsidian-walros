import { VariableInputModal, VariableInputModalTestUtils } from './variable-input-modal';

describe('VariableInputModal', () => {
  it('blocks submission until all variables have values', () => {
    const onSubmit = jest.fn();
    const modal = new VariableInputModal({} as any, ['company', 'year'], onSubmit);

    expect(VariableInputModalTestUtils.hasAllValues(modal)).toBe(false);
    expect(VariableInputModalTestUtils.submit(modal)).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits trimmed values when every variable is filled', () => {
    const onSubmit = jest.fn();
    const modal = new VariableInputModal({} as any, ['company', 'year'], onSubmit);

    VariableInputModalTestUtils.setValue(modal, 'company', '  Acme AI  ');
    VariableInputModalTestUtils.setValue(modal, 'year', ' 2026 ');

    expect(VariableInputModalTestUtils.hasAllValues(modal)).toBe(true);
    expect(VariableInputModalTestUtils.submit(modal)).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith({ company: 'Acme AI', year: '2026' });
  });
});
