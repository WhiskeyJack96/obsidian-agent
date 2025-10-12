import { Component } from 'obsidian';
import { Message } from './base-message';
import { RequestPermissionRequest, RequestPermissionResponse } from '../types';

/**
 * A message that displays a permission request with action buttons.
 */
export class PermissionRequestMessage extends Message {
	private params: RequestPermissionRequest;
	private resolve: (response: RequestPermissionResponse) => void;

	constructor(
		id: string,
		params: RequestPermissionRequest,
		resolve: (response: RequestPermissionResponse) => void,
		component: Component
	) {
		super(id, component);
		this.params = params;
		this.resolve = resolve;
	}

	render(container: HTMLElement): HTMLElement {
		const messageEl = this.createMessageElement(container, 'acp-message-permission');
		const contentEl = messageEl.createDiv({ cls: 'acp-message-content' });

		// Show what permission is being requested
		const headerEl = contentEl.createDiv({ cls: 'acp-permission-header' });
		headerEl.createEl('strong', { text: '🔐 Permission Required' });

		if (this.params.toolCall && this.params.toolCall.title) {
			const titleEl = contentEl.createDiv({ cls: 'acp-permission-tool-title' });
			titleEl.setText(this.params.toolCall.title);
		}

		// Show compact input info
		if (this.params.toolCall && this.params.toolCall.rawInput) {
			const inputEl = contentEl.createDiv({ cls: 'acp-permission-input-compact' });
			const rawInput = this.params.toolCall.rawInput;
			const cmd = typeof rawInput.command === 'string' ? rawInput.command : undefined;
			const desc = typeof rawInput.description === 'string' ? rawInput.description : undefined;
			if (cmd) {
				inputEl.createEl('code', { text: cmd });
			} else if (desc) {
				inputEl.setText(desc);
			}
		}

		// Create action buttons
		const actionsEl = contentEl.createDiv({ cls: 'acp-permission-actions' });

		for (const option of this.params.options) {
			const button = actionsEl.createEl('button', {
				cls: `acp-permission-btn acp-permission-${option.kind}`,
				text: option.name
			});

			button.addEventListener('click', () => {
				// Remove the permission request message
				this.remove();

				// Resolve with selected option
				this.resolve({
					outcome: {
						outcome: 'selected',
						optionId: option.optionId
					}
				});
			});
		}

		return messageEl;
	}
}
