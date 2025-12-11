import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type ACPClientPlugin from './main';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

export const VIEW_TYPE_DIFF = 'acp-diff-view';

export interface DiffData {
	oldText: string;
	newText: string;
	path: string;
	toolCallId: string;
}

export interface DiffResult {
	approved: boolean;
	editedText?: string;
}

export class DiffView extends ItemView {
	private plugin: ACPClientPlugin;
	private diffContainer: HTMLElement;
	private diffData: DiffData | null = null;
	private resolveCallback: ((result: DiffResult) => void) | null = null;
	private editorView: EditorView | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ACPClientPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_DIFF;
	}

	getDisplayText(): string {
		return this.diffData ? `Diff: ${this.getFileName()}` : 'Diff View';
	}

	getIcon(): string {
		return 'file-diff';
	}

	private getFileName(): string {
		if (!this.diffData) return '';
		const parts = this.diffData.path.split('/');
		return parts[parts.length - 1] || this.diffData.path;
	}

	// eslint-disable-next-line @typescript-eslint/require-await -- Obsidian API requires Promise<void> return type, but onOpen only does synchronous DOM setup
	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('acp-diff-view');

		// Create header
		const header = container.createDiv({ cls: 'acp-diff-header' });
		const titleContainer = header.createDiv({ cls: 'acp-diff-title-container' });
		titleContainer.createEl('strong', { text: 'Review edit request' });

		if (this.diffData) {
			const pathEl = titleContainer.createDiv({ cls: 'acp-diff-file-path' });
			pathEl.setText(this.diffData.path);
		}

		// Create action buttons in header
		const actions = header.createDiv({ cls: 'acp-diff-actions' });

		const acceptBtn = actions.createEl('button', {
			cls: 'acp-diff-btn acp-diff-accept',
			text: 'Accept'
		});
		acceptBtn.addEventListener('click', () => this.handleAccept());

		const rejectBtn = actions.createEl('button', {
			cls: 'acp-diff-btn acp-diff-reject',
			text: 'Reject'
		});
		rejectBtn.addEventListener('click', () => this.handleReject());

		// Create diff container
		this.diffContainer = container.createDiv({ cls: 'acp-diff-content' });

		// Render diff if data available
		if (this.diffData) {
			this.renderDiff();
		}
	}

	setDiffData(data: DiffData, resolve: (result: DiffResult) => void): void {
		this.diffData = data;
		this.resolveCallback = resolve;

		// Update the view's display text (updates tab title)
		this.leaf.setEphemeralState({ diffPath: data.path });

		// Render if view is already open
		if (this.diffContainer) {
			this.renderDiff();
			// Update header with file path
			const headerTitleContainer = this.containerEl.querySelector('.acp-diff-title-container');
			if (headerTitleContainer) {
				const pathEl = headerTitleContainer.querySelector('.acp-diff-file-path') as HTMLElement;
				if (pathEl) {
					pathEl.setText(data.path);
				} else {
					headerTitleContainer.createDiv({ cls: 'acp-diff-file-path', text: data.path });
				}
			}
		}
	}

	private renderDiff(): void {
		if (!this.diffData || !this.diffContainer) {
			return;
		}

		// Clear existing content
		this.diffContainer.empty();

		// Destroy previous editor view if it exists
		if (this.editorView) {
			this.editorView.destroy();
			this.editorView = null;
		}

		try {
			// Create the unified merge view
			this.editorView = new EditorView({
				parent: this.diffContainer,
				extensions: [
					unifiedMergeView({
						original: this.diffData.oldText,
						mergeControls: false, // Disable per-hunk accept/reject buttons
						// The merge view will show changes and allow editing
					}),
					EditorState.tabSize.of(4),
				],
				doc: this.diffData.newText,
			});

		} catch (err) {
			console.error('Error rendering diff:', err);
			const errorEl = this.diffContainer.createDiv({ cls: 'acp-diff-error' });
			errorEl.setText(`Error rendering diff: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private handleAccept(): void {
		if (this.resolveCallback) {
			// Get the edited text from the editor view
			const editedText = this.editorView?.state.doc.toString() || this.diffData?.newText || '';
			this.resolveCallback({
				approved: true,
				editedText: editedText
			});
			this.resolveCallback = null;
		}
		new Notice('Edit accepted');
		// Close only this view, not all diff views
		this.leaf.detach();
	}

	private handleReject(): void {
		if (this.resolveCallback) {
			this.resolveCallback({
				approved: false
			});
			this.resolveCallback = null;
		}
		new Notice('Edit rejected');
		// Close only this view, not all diff views
		this.leaf.detach();
	}

    // eslint-disable-next-line @typescript-eslint/require-await -- Obsidian's ItemView requires async signature even though cleanup is synchronous
	async onClose(): Promise<void> {
		// Destroy editor view
		if (this.editorView) {
			this.editorView.destroy();
			this.editorView = null;
		}

		// If user closes without accepting/rejecting, treat as reject
		if (this.resolveCallback) {
			this.resolveCallback({
				approved: false
			});
			this.resolveCallback = null;
		}
	}
}
