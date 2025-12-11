import {App, Component} from 'obsidian';
import {Message} from './base-message';

/**
 * A message that displays a loading indicator while waiting for agent response.
 */
export class PendingMessage extends Message {
    constructor(app: App, id: string, component: Component) {
        super(app, id, component);
    }

    render(container: HTMLElement): HTMLElement {
        const messageEl = this.createMessageElement(container, 'acp-message-pending', 'Agent');
        const contentEl = messageEl.createDiv({cls: 'acp-message-content'});

        // Add loading dots
        const loadingEl = contentEl.createDiv({cls: 'acp-loading-dots'});
        loadingEl.createSpan({cls: 'acp-loading-dot'});
        loadingEl.createSpan({cls: 'acp-loading-dot'});
        loadingEl.createSpan({cls: 'acp-loading-dot'});

        return messageEl;
    }

    toMarkdown(): string {
        // Don't track pending messages in conversation history
        return '';
    }
}
