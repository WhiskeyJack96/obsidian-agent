import { Component } from 'obsidian';
import { Message } from './base-message';
import { AvailableCommand } from '../types';

/**
 * A message that displays available commands.
 */
export class CommandsMessage extends Message {
	private commands: AvailableCommand[];

	constructor(id: string, commands: AvailableCommand[], component: Component) {
		super(id, component);
		this.commands = commands;
	}

	render(container: HTMLElement): HTMLElement {
		const messageEl = this.createMessageElement(container, 'acp-message-system');
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		this.renderCommandList(contentEl);

		return messageEl;
	}

	update(commands: AvailableCommand[]): void {
		this.commands = commands;

		if (this.element) {
			const contentEl = this.element.querySelector('.acp-message-content') as HTMLElement;
			if (contentEl) {
				contentEl.empty();
				this.renderCommandList(contentEl);
			}
		}
	}

	private renderCommandList(contentEl: HTMLElement): void {
		contentEl.createEl('strong', { text: 'Available Commands:' });
		const commandList = contentEl.createEl('ul', { cls: 'acp-command-list' });

		for (const cmd of this.commands) {
			const item = commandList.createEl('li');
			item.createEl('code', { text: `/${cmd.name}`, cls: 'acp-command-name' });
			if (cmd.description) {
				item.appendText(` - ${cmd.description}`);
			}
		}
	}
}
