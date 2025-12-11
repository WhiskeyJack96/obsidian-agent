import { TFile, Vault, Notice } from 'obsidian';
import type ACPClientPlugin from './main';

export class TriggerManager {
	private plugin: ACPClientPlugin;
	private vault: Vault;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	// Per-session tracking: sessionId → Set<filePath>
	private turnWrittenFiles: Map<string, Set<string>> = new Map();

	/**
	 * Track a file written by an agent during the current turn.
	 * Files tracked by any session will not trigger until that session's turn completes.
	 */
	trackAgentWrite(sessionId: string, filePath: string) {
		if (!this.turnWrittenFiles.has(sessionId)) {
			this.turnWrittenFiles.set(sessionId, new Set());
		}
		this.turnWrittenFiles.get(sessionId)!.add(filePath);
	}

	/**
	 * Clear tracked agent writes for a specific session.
	 * Call this when an agent turn completes.
	 */
	clearTurnWrites(sessionId: string) {
		this.turnWrittenFiles.delete(sessionId);
	}

	/**
	 * Check if a file is being tracked by any active session.
	 */
	private isFileTracked(filePath: string): boolean {
		for (const files of this.turnWrittenFiles.values()) {
			if (files.has(filePath)) {
				return true;
			}
		}
		return false;
	}

	constructor(plugin: ACPClientPlugin) {
		this.plugin = plugin;
		this.vault = plugin.app.vault;
	}

	/**
	 * Register vault event listeners for create and modify events
	 */
	registerListeners() {
		this.plugin.registerEvent(
			this.vault.on('create', (file) => {
				if (file instanceof TFile) {
					void this.handleVaultEvent(file);
				}
			})
		);
		this.plugin.registerEvent(
			this.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					void this.handleVaultEvent(file);
				}
			})
		);
	}

	/**
	 * Handle vault events with debouncing
	 */
	private async handleVaultEvent(file: TFile) {
		const filePath = file.path;

		// Skip if metadata triggers are disabled
		if (!this.plugin.settings.enableMetadataTriggers) {
			return;
		}

		// Skip if this file was written by an agent during any active turn
		if (this.isFileTracked(filePath)) {
			return;
		}

		// Check if file has acp-trigger set to true by reading file directly, and if so update it to false
		// This bypasses metadata cache to avoid race conditions
		const triggerArgs = await this.isFileTriggerEnabled(file);

		if (!triggerArgs.triggerValue) {
			return;
		}

		// Debounce trigger execution
		this.debounceTrigger(file, triggerArgs.prompt);
	}

	/**
	 * Debounce trigger execution per file path
	 */
	private debounceTrigger(file: TFile, prompt: string) {
		const debounceKey = file.path;

		// Clear existing timer for this file
		if (this.debounceTimers.has(debounceKey)) {
			clearTimeout(this.debounceTimers.get(debounceKey));
		}

		// Set new timer
		const timer = setTimeout(() => {
			void this.executeTrigger(file, prompt );
			this.debounceTimers.delete(debounceKey);
		}, this.plugin.settings.metadataTriggerDebounceMs);

		this.debounceTimers.set(debounceKey, timer);
	}

	/**
	 * Execute a trigger: read metadata, set acp-trigger to false, spawn agent
	 */
	private async executeTrigger(file: TFile, prompt: string) {
		try {
			if (!prompt) {
				prompt = `Process the file: ${file.path}`;
			}

			// Add file context to prompt
			const fullPrompt = `${prompt}\n\nFile: ${file.path}`;

			// Spawn agent view
			await this.plugin.activateView(fullPrompt);

		} catch (error) {
			console.error('Error executing trigger:', error);
			new Notice(`Failed to execute trigger: ${(error instanceof Error ? error.message : String(error))}`);
		}
	}

	/**
	 * Read acp-trigger value directly from file, bypassing metadata cache.
	 * This prevents race conditions when the cache hasn't updated yet.
	 * Uses processFrontMatter in read-only mode (doesn't modify, so no file write).
	 */
	private async isFileTriggerEnabled(file: TFile): Promise<{ triggerValue: boolean, prompt: string }> {
		try {
			let triggerValue: boolean = false;
            let prompt: string = "";

			// Use processFrontMatter to read the current value
			// Since we don't modify the frontmatter object, this won't trigger a file write
			await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				const trigger = frontmatter['acp-trigger'];
				triggerValue = trigger === true;

				const promptValue = frontmatter['acp-prompt'];
				prompt = typeof promptValue === 'string' ? promptValue : '';

				if (triggerValue) {
					frontmatter['acp-trigger'] = false;
				}
			});

			return {triggerValue, prompt};
		} catch (err) {
			console.error('Error reading file for trigger check:', err);
			return {triggerValue: false,prompt: ""};
		}
	}

	/**
	 * Clean up all pending debounce timers
	 */
	cleanup() {
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}
}
