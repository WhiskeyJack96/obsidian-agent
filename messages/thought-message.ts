import { Component, MarkdownRenderer } from 'obsidian';
import { Message } from './base-message';

/**
 * A thought message representing the agent's internal reasoning.
 * Displays with a thought bubble icon and is collapsible to save space.
 */
export class ThoughtMessage extends Message {
	private content: string;
	private contentEl: HTMLElement | null = null;
	private isCollapsed: boolean = true; // Start collapsed by default
	private headerEl: HTMLElement | null = null;

	constructor(id: string, content: string, component: Component) {
		super(id, component);
		this.content = content;
	}

	async render(container: HTMLElement): Promise<HTMLElement> {
		const messageEl = this.createMessageElement(container, 'acp-message-agent-thought');

		// Create header with icon and toggle
		this.headerEl = messageEl.createDiv({ cls: 'acp-thought-header' });

		// Thought bubble icon
		const iconEl = this.headerEl.createSpan({ cls: 'acp-thought-icon' });
		iconEl.setText('💭');

		// Label
		const labelEl = this.headerEl.createSpan({ cls: 'acp-thought-label' });
		labelEl.setText('Agent thought');

		// Toggle button
		const toggleEl = this.headerEl.createSpan({ cls: 'acp-thought-toggle' });
		toggleEl.setText(this.isCollapsed ? '▸' : '▾');

		// Make header clickable
		this.headerEl.addClass('acp-thought-header-clickable');
		this.headerEl.addEventListener('click', () => this.toggle());

		// Create content container
		this.contentEl = messageEl.createDiv({ cls: 'acp-thought-content' });

		// Render markdown content
		await MarkdownRenderer.renderMarkdown(this.content, this.contentEl, '/', this.component);

		// Apply initial collapsed state
		this.updateCollapsedState();

		this.element = messageEl;
		return messageEl;
	}

	/**
	 * Toggle the collapsed state of the thought message.
	 */
	private toggle(): void {
		this.isCollapsed = !this.isCollapsed;
		this.updateCollapsedState();
	}

	/**
	 * Update the DOM to reflect the current collapsed state.
	 */
	private updateCollapsedState(): void {
		if (!this.contentEl || !this.headerEl) return;

		const toggleEl = this.headerEl.querySelector('.acp-thought-toggle');
		if (toggleEl) {
			toggleEl.setText(this.isCollapsed ? '▸' : '▾');
		}

		if (this.isCollapsed) {
			this.contentEl.addClass('acp-collapsed');
		} else {
			this.contentEl.removeClass('acp-collapsed');
		}
	}

	/**
	 * Update the message content (useful for streaming thoughts).
	 */
	async update(newContent: string): Promise<void> {
		this.content = newContent;

		if (this.contentEl) {
			this.contentEl.empty();
			await MarkdownRenderer.renderMarkdown(this.content, this.contentEl, '/', this.component);
			this.updateCollapsedState();
		}
	}

	getContent(): string {
		return this.content;
	}

	toMarkdown(): string {
		const timestamp = this.timestamp.toLocaleTimeString();
		return `## Agent Thought (${timestamp})\n\n${this.content}`;
	}
}
