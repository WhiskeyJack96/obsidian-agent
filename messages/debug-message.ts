import { Component } from 'obsidian';
import { Message } from './base-message';

/**
 * A message that displays debug information as formatted JSON.
 */
export class DebugMessage extends Message {
	private data: unknown;

	constructor(id: string, data: unknown, component: Component) {
		super(id, component);
		this.data = data;
	}

	render(container: HTMLElement): HTMLElement {
		const messageEl = this.createMessageElement(container, 'acp-message-debug', 'Debug');
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		const pre = contentEl.createEl('pre', { cls: 'acp-debug-json' });
		pre.setText(JSON.stringify(this.data, null, 2));

		return messageEl;
	}
}
