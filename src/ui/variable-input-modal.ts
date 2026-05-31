import { Modal, Setting } from 'obsidian';
import type { App, ButtonComponent, TextComponent } from 'obsidian';
import type { VariableValues } from '../types';

export class VariableInputModal extends Modal {
  private readonly variables: string[];
  private readonly onSubmit: (values: VariableValues) => void;
  private readonly values: Map<string, string> = new Map();
  private createButton?: ButtonComponent;
  private firstInput?: TextComponent;

  constructor(app: App, variables: string[], onSubmit: (values: VariableValues) => void) {
    super(app);
    this.variables = variables;
    this.onSubmit = onSubmit;
  }

  public onOpen(): void {
    const { contentEl } = this;

    for (const variable of this.variables) {
      new Setting(contentEl).setName(variable).addText((text) => {
        if (this.firstInput === undefined) {
          this.firstInput = text;
        }

        text.setPlaceholder(variable).onChange((value: string) => {
          this.setValue(variable, value);
        });
        text.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.submit();
          }
        });
      });
    }

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText('Cancel').onClick(() => {
          this.close();
        });
      })
      .addButton((button) => {
        this.createButton = button;
        button
          .setButtonText('Create')
          .setCta()
          .setDisabled(true)
          .onClick(() => {
            this.submit();
          });
      });

    window.setTimeout(() => {
      this.firstInput?.inputEl.focus();
    }, 0);
  }

  public onClose(): void {
    this.contentEl.empty();
  }

  private setValue(variable: string, value: string): void {
    this.values.set(variable, value);
    this.updateCreateButton();
  }

  private submit(): boolean {
    if (!this.hasAllValues()) {
      this.updateCreateButton();
      return false;
    }

    const out: VariableValues = {};
    for (const variable of this.variables) {
      out[variable] = this.values.get(variable)?.trim() ?? '';
    }

    this.close();
    this.onSubmit(out);
    return true;
  }

  private hasAllValues(): boolean {
    return this.variables.every((variable) => {
      const value = this.values.get(variable);
      return value !== undefined && value.trim() !== '';
    });
  }

  private updateCreateButton(): void {
    this.createButton?.setDisabled(!this.hasAllValues());
  }
}

export const VariableInputModalTestUtils = {
  setValue: (modal: VariableInputModal, variable: string, value: string): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modal as any).setValue(variable, value);
  },
  submit: (modal: VariableInputModal): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (modal as any).submit();
  },
  hasAllValues: (modal: VariableInputModal): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (modal as any).hasAllValues();
  }
};
