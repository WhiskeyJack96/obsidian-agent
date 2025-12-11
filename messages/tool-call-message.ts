import {App, Component} from 'obsidian';
import { Message } from './base-message';
import { ToolCallUpdate } from '../types';

/**
 * A message representing a tool call with status updates.
 */
export class ToolCallMessage extends Message {
	private data: ToolCallUpdate;
	private contentEl: HTMLElement | null = null;
	private permissionsEl: HTMLElement | null = null;
	private messageEl: HTMLElement | null = null;

    constructor(app:App, id: string, data: ToolCallUpdate, component: Component) {
		super(app, id, component);
		this.data = data;
	}

	render(container: HTMLElement): HTMLElement {
		this.messageEl = this.createMessageElement(container, 'acp-message-tool');
		this.contentEl = this.messageEl.createDiv({ cls: 'acp-message-content' });
		this.renderContent();
		return this.messageEl;
	}

	update(newData: Partial<ToolCallUpdate>): void {
		// Merge new data with existing data
		this.data = {
			...this.data,
			...newData,
			// Preserve rawInput if not provided in update
			rawInput: newData.rawInput || this.data.rawInput
		};

		this.renderContent();
	}

	private renderContent(): void {
		if (!this.contentEl) {
			return;
		}

		// Clear and rebuild content
		this.contentEl.empty();

		// Compact header with tool info and status
		const toolHeader = this.contentEl.createDiv({ cls: 'acp-tool-compact-header' });

		// Generate descriptive title
		const titleText = this.generateToolTitle();
		toolHeader.createSpan({ text: titleText, cls: 'acp-tool-title' });

		// Show tool status badge if available
		if (this.data.status) {
			toolHeader.createEl('span', { cls: `acp-tool-status-badge acp-tool-status-${this.data.status}` });
		}

		// Show rawInput as JSON
		if (this.data.rawInput) {
			this.renderRawInputJson(this.contentEl, this.data.rawInput);
		}

		// Show content/output if available (only when completed)
		if (this.data.status === 'completed' && this.data.content && Array.isArray(this.data.content) && this.data.content.length > 0) {
			for (const block of this.data.content) {
				if (block.type === 'content' && block.content.type === 'text') {
					const outputEl = this.contentEl.createDiv({ cls: 'acp-tool-output-compact' });
					this.renderTextContent(block.content.text, outputEl);
				}
			}
		}
	}

	private generateToolTitle(): string {
		// If title is provided, use it
		if (this.data.title) {
			return this.data.title;
		}

		// Try to extract meaningful info from rawInput
		const kind = this.data.kind;

		if (this.data.rawInput) {
			// Parse rawInput safely
			let parsedInput: unknown;
			try {
				parsedInput = typeof this.data.rawInput === 'string' ? JSON.parse(this.data.rawInput) : this.data.rawInput;
			} catch {
				parsedInput = this.data.rawInput;
			}

			// File operations
			if (typeof parsedInput === 'object' && parsedInput !== null && 'path' in parsedInput && typeof parsedInput.path === 'string') {
				const fileName = parsedInput.path.split('/').pop() || parsedInput.path;
				if (kind === 'read') {
					return `Read file "${fileName}"`;
				} else if (kind === 'edit') {
					return `Write file "${fileName}"`;
				}
			}

			// Terminal commands
			if (typeof parsedInput === 'object' && parsedInput !== null && 'command' in parsedInput && typeof parsedInput.command === 'string') {
				const command = parsedInput.command;
				const args = Array.isArray((parsedInput as Record<string, unknown>).args) ? ` ${(parsedInput as Record<string, string[]>).args.join(' ')}` : '';
				return `Run: ${command}${args}`;
			}

			// Generic description if available
			if (typeof parsedInput === 'object' && parsedInput !== null && 'description' in parsedInput && typeof parsedInput.description === 'string') {
				return parsedInput.description;
			}
		}

		// Fallback to kind or generic text
		return kind || 'Tool Call';
	}

	private renderTextContent(text: string, container: HTMLElement): void {
		// Check if text contains markdown code blocks
		const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
		let lastIndex = 0;
		let match;

		while ((match = codeBlockRegex.exec(text)) !== null) {
			// Add text before code block
			if (match.index > lastIndex) {
				const textBefore = text.substring(lastIndex, match.index);
				if (textBefore.trim()) {
					container.appendText(textBefore);
				}
			}

			// Add code block
			const language = match[1] || '';
			const code = match[2];
			const pre = container.createEl('pre');
			const codeEl = pre.createEl('code');
			if (language) {
				codeEl.addClass(`language-${language}`);
			}
			codeEl.setText(code);

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			const remainingText = text.substring(lastIndex);
			if (remainingText.trim()) {
				container.appendText(remainingText);
			}
		}

		// If no code blocks were found, just set the text
		if (lastIndex === 0) {
			container.setText(text);
		}
	}

	getData(): ToolCallUpdate {
		return this.data;
	}

	/**
	 * Add inline permission buttons to this tool call message.
	 */
	addPermissionUI(options: Array<{ kind: string; name: string; optionId: string }>, resolve: (optionId: string) => void): void {
		if (!this.contentEl || !this.messageEl) {
			return;
		}

		this.messageEl.addClass('acp-message-tool-pending-permission');

		// Remove existing permissions element if present
		if (this.permissionsEl) {
			this.permissionsEl.remove();
		}

		// Create permissions container inline at the bottom of content
		this.permissionsEl = this.contentEl.createDiv({ cls: 'acp-tool-permission-buttons' });

		// Add buttons directly (no header, no wrapper section)
		for (const option of options) {
			const button = this.permissionsEl.createEl('button', {
				cls: `acp-tool-permission-btn acp-tool-permission-${option.kind}`,
				text: option.name
			});

			button.addEventListener('click', () => {
				// Remove permissions UI and reset styling
				if (this.permissionsEl) {
					this.permissionsEl.remove();
					this.permissionsEl = null;
				}
				if (this.messageEl) {
					this.messageEl.removeClass('acp-message-tool-pending-permission');
				}

				// Resolve with selected option
				resolve(option.optionId);
			});
		}
	}

	toMarkdown(): string {
		const timestamp = this.timestamp.toLocaleTimeString();
		const title = this.generateToolTitle();
		const parts: string[] = [];

		parts.push(`## Tool Call: ${title} (${timestamp})`);
		parts.push('');

		// Add status
		if (this.data.status) {
			parts.push(`**Status:** ${this.data.status}`);
			parts.push('');
		}

		// Add raw input as JSON if available
		if (this.data.rawInput) {
			parts.push('**Input:**');
			parts.push('```json');
			parts.push(JSON.stringify(this.data.rawInput, null, 2));
			parts.push('```');
			parts.push('');
		}

		// Add output if available and completed
		if (this.data.status === 'completed' && this.data.content && Array.isArray(this.data.content) && this.data.content.length > 0) {
			parts.push('**Output:**');
			for (const block of this.data.content) {
				if (block.type === 'content' && block.content.type === 'text') {
					parts.push('```');
					parts.push(block.content.text);
					parts.push('```');
				}
			}
			parts.push('');
		}

		return parts.join('\n');
	}
}
