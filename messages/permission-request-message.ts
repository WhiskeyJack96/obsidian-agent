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
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Permission required" is already in sentence case
		headerEl.createEl('strong', { text: '🔐 Permission required' });

		if (this.params.toolCall && this.params.toolCall.title) {
			const titleEl = contentEl.createDiv({ cls: 'acp-permission-tool-title' });
			titleEl.setText(this.params.toolCall.title);
		}

		// Show rawInput as JSON
		if (this.params.toolCall && this.params.toolCall.rawInput) {
			this.renderRawInputJson(contentEl, this.params.toolCall.rawInput);
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

	toMarkdown(): string {
		// Don't track permission requests in conversation history
		return '';
	}
}
