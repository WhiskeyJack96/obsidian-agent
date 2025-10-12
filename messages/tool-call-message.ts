import { Component } from 'obsidian';
import { Message } from './base-message';
import { ToolCallCache } from '../types';

/**
 * A message representing a tool call with status updates.
 */
export class ToolCallMessage extends Message {
	private data: ToolCallCache;
	private contentEl: HTMLElement | null = null;

	constructor(id: string, data: ToolCallCache, component: Component) {
		super(id, component);
		this.data = data;
	}

	render(container: HTMLElement): HTMLElement {
		const messageEl = this.createMessageElement(container, 'acp-message-tool');
		this.contentEl = messageEl.createDiv({ cls: 'acp-message-content' });
		this.renderContent();
		return messageEl;
	}

	update(newData: Partial<ToolCallCache>): void {
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
		const rawInput = this.data.rawInput;
		const kind = this.data.kind;

		if (rawInput) {
			// File operations
			if (typeof rawInput.path === 'string') {
				const fileName = rawInput.path.split('/').pop() || rawInput.path;
				if (kind === 'read') {
					return `Read file "${fileName}"`;
				} else if (kind === 'edit') {
					return `Write file "${fileName}"`;
				}
			}

			// Terminal commands
			if (typeof rawInput.command === 'string') {
				const command = rawInput.command;
				const args = Array.isArray(rawInput.args) ? ` ${rawInput.args.join(' ')}` : '';
				return `Run: ${command}${args}`;
			}

			// Generic description if available
			if (typeof rawInput.description === 'string') {
				return rawInput.description;
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

	getData(): ToolCallCache {
		return this.data;
	}
}
