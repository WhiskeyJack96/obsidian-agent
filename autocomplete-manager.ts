import { App } from 'obsidian';

interface AutocompleteItem {
	type: 'command' | 'file';
	name: string;
	description?: string;
	path?: string;
	insertText: string;
	triggerPos: number;
}

export class AutocompleteManager {
	private app: App;
	private inputField: HTMLTextAreaElement;
	private autocompleteContainer: HTMLElement;
	private availableCommands: Array<{name: string; description?: string}> = [];
	private autocompleteSelectedIndex: number = -1;

	constructor(app: App, inputField: HTMLTextAreaElement, autocompleteContainer: HTMLElement) {
		this.app = app;
		this.inputField = inputField;
		this.autocompleteContainer = autocompleteContainer;
	}

	setAvailableCommands(commands: Array<{name: string; description?: string}>): void {
		this.availableCommands = commands;
	}

	handleInput(): void {
		const cursorPos = this.inputField.selectionStart;
		const textBeforeCursor = this.inputField.value.substring(0, cursorPos);

		// Find the last trigger character (/ or @) before the cursor
		const slashMatch = textBeforeCursor.lastIndexOf('/');
		const atMatch = textBeforeCursor.lastIndexOf('@');

		let triggerType: 'command' | 'file' | null = null;
		let triggerPos = -1;
		let query = '';

		// Determine which trigger is most recent
		if (slashMatch > atMatch && slashMatch !== -1) {
			// Check if this is the start of the line or preceded by whitespace
			if (slashMatch === 0 || /\s/.test(textBeforeCursor[slashMatch - 1])) {
				triggerType = 'command';
				triggerPos = slashMatch;
				query = textBeforeCursor.substring(slashMatch + 1);
			}
		} else if (atMatch !== -1 && atMatch > slashMatch) {
			// Check if this is the start of the line or preceded by whitespace
			if (atMatch === 0 || /\s/.test(textBeforeCursor[atMatch - 1])) {
				triggerType = 'file';
				triggerPos = atMatch;
				query = textBeforeCursor.substring(atMatch + 1);
			}
		}

		// If we found a trigger and the query doesn't contain whitespace, show autocomplete
		if (triggerType && triggerPos !== -1 && !/\s/.test(query)) {
			if (triggerType === 'command') {
				this.showCommandAutocomplete(query, triggerPos);
			} else if (triggerType === 'file') {
				this.showFileAutocomplete(query, triggerPos);
			}
		} else {
			this.hide();
		}
	}

	handleKeyDown(e: KeyboardEvent): boolean {
		// Return true if event was handled and should be prevented
		if (this.autocompleteContainer.style.display !== 'none') {
			if (e.key === 'ArrowDown') {
				this.moveSelection(1);
				return true;
			} else if (e.key === 'ArrowUp') {
				this.moveSelection(-1);
				return true;
			} else if (e.key === 'Enter' || e.key === 'Tab') {
				this.selectCurrentItem();
				return true;
			} else if (e.key === 'Escape') {
				this.hide();
				return true;
			}
		}
		return false;
	}

	private showCommandAutocomplete(query: string, triggerPos: number): void {
		const filtered = this.availableCommands.filter(cmd =>
			cmd.name.toLowerCase().includes(query.toLowerCase())
		);

		if (filtered.length === 0) {
			this.hide();
			return;
		}

		this.render(filtered.map(cmd => ({
			type: 'command',
			name: cmd.name,
			description: cmd.description,
			insertText: cmd.name,
			triggerPos: triggerPos
		})));
	}

	private showFileAutocomplete(query: string, triggerPos: number): void {
		// Get all files from vault
		const files = this.app.vault.getMarkdownFiles();

		const filtered = files
			.filter(file =>
				file.path.toLowerCase().includes(query.toLowerCase()) ||
				file.basename.toLowerCase().includes(query.toLowerCase())
			)
			.slice(0, 50); // Limit to 50 results

		if (filtered.length === 0) {
			this.hide();
			return;
		}

		this.render(filtered.map(file => ({
			type: 'file',
			name: file.basename,
			path: file.path,
			insertText: file.path,
			triggerPos: triggerPos
		})));
	}

	private render(items: AutocompleteItem[]): void {
		if (!this.autocompleteContainer) return;

		this.autocompleteContainer.empty();
		this.autocompleteSelectedIndex = 0;

		items.forEach((item, index) => {
			const itemEl = this.autocompleteContainer.createDiv({ cls: 'acp-autocomplete-item' });

			if (index === 0) {
				itemEl.addClass('selected');
			}

			const nameEl = itemEl.createDiv({ cls: 'acp-autocomplete-item-name' });
			if (item.type === 'command') {
				nameEl.setText(`/${item.name}`);
			} else {
				nameEl.setText(item.name);
			}

			if (item.description) {
				const descEl = itemEl.createDiv({ cls: 'acp-autocomplete-item-description' });
				descEl.setText(item.description);
			}

			if (item.path) {
				const pathEl = itemEl.createDiv({ cls: 'acp-autocomplete-item-path' });
				pathEl.setText(item.path);
			}

			// Handle click
			itemEl.addEventListener('click', () => {
				this.selectItem(item);
			});

			// Store item data on element for keyboard navigation
			(itemEl as any)._acpItem = item;
		});

		this.autocompleteContainer.style.display = 'block';
		// Reset scroll position to top when showing new autocomplete
		this.autocompleteContainer.scrollTop = 0;

		// Adjust container height to show complete items only
		// Wait for next frame to ensure items are rendered
		requestAnimationFrame(() => {
			if (!this.autocompleteContainer) return;

			const firstItem = this.autocompleteContainer.querySelector('.acp-autocomplete-item') as HTMLElement;
			if (firstItem) {
				const itemHeight = firstItem.offsetHeight;
				const maxVisibleItems = 5; // Show up to 5 items at once
				const itemsToShow = Math.min(items.length, maxVisibleItems);
				const containerHeight = itemHeight * itemsToShow;

				this.autocompleteContainer.style.maxHeight = `${containerHeight}px`;
			}
		});
	}

	hide(): void {
		if (this.autocompleteContainer) {
			this.autocompleteContainer.style.display = 'none';
			this.autocompleteSelectedIndex = -1;
		}
	}

	private selectItem(item: AutocompleteItem): void {
		const cursorPos = this.inputField.selectionStart;
		const value = this.inputField.value;

		// Find the end of the current query (up to cursor or next whitespace)
		let queryEnd = cursorPos;
		while (queryEnd < value.length && !/\s/.test(value[queryEnd])) {
			queryEnd++;
		}

		// Replace from trigger position to end of query with the selected item
		const before = value.substring(0, item.triggerPos);
		const after = value.substring(queryEnd);
		const triggerChar = item.type === 'command' ? '/' : '';

		this.inputField.value = before + triggerChar + item.insertText + ' ' + after;

		// Set cursor after the inserted text
		const newCursorPos = before.length + 1 + item.insertText.length + 1;
		this.inputField.setSelectionRange(newCursorPos, newCursorPos);

		this.hide();
		this.inputField.focus();
	}

	private moveSelection(direction: number): void {
		if (!this.autocompleteContainer) return;

		const items = this.autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
		if (items.length === 0) return;

		// Remove current selection
		items[this.autocompleteSelectedIndex]?.removeClass('selected');

		// Update index
		this.autocompleteSelectedIndex += direction;

		// Wrap around
		if (this.autocompleteSelectedIndex < 0) {
			this.autocompleteSelectedIndex = items.length - 1;
		} else if (this.autocompleteSelectedIndex >= items.length) {
			this.autocompleteSelectedIndex = 0;
		}

		// Add new selection
		const selectedItem = items[this.autocompleteSelectedIndex] as HTMLElement;
		selectedItem?.addClass('selected');

		// Scroll with one-item lookahead so user can see the next item
		if (selectedItem) {
			const container = this.autocompleteContainer;
			const itemHeight = selectedItem.offsetHeight;
			const lookaheadPadding = itemHeight; // Reserve space for one more item
			const itemTop = selectedItem.offsetTop;
			const itemBottom = itemTop + selectedItem.offsetHeight;
			const containerScrollTop = container.scrollTop;
			const containerHeight = container.clientHeight;
			const containerScrollBottom = containerScrollTop + containerHeight;

			// If item is near top boundary, scroll up to show previous item
			if (itemTop < containerScrollTop + lookaheadPadding) {
				container.scrollTop = Math.max(0, itemTop - lookaheadPadding);
			}
			// If item is near bottom boundary, scroll down to show next item
			else if (itemBottom > containerScrollBottom - lookaheadPadding) {
				container.scrollTop = itemBottom - containerHeight + lookaheadPadding;
			}
		}
	}

	private selectCurrentItem(): void {
		if (!this.autocompleteContainer) return;

		const items = this.autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
		const selectedItem = items[this.autocompleteSelectedIndex] as HTMLElement;

		if (selectedItem && (selectedItem as any)._acpItem) {
			this.selectItem((selectedItem as any)._acpItem);
		}
	}
}
