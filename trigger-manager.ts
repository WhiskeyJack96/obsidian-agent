import { TFile, Vault, Notice, MetadataCache } from 'obsidian';
import type ACPClientPlugin from './main';

export class TriggerManager {
	private plugin: ACPClientPlugin;
	private vault: Vault;
	private metadataCache: MetadataCache;
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
		this.metadataCache = plugin.app.metadataCache;
	}

	/**
	 * Register vault event listeners for create and modify events
	 */
	registerListeners() {
		this.plugin.registerEvent(
			this.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleVaultEvent(file, 'created');
				}
			})
		);
		this.plugin.registerEvent(
			this.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleVaultEvent(file, 'modified');
				}
			})
		);
	}

	/**
	 * Handle vault events with debouncing
	 */
	private async handleVaultEvent(file: TFile, event: 'created' | 'modified') {
		const filePath = file.path;

		// Skip if metadata triggers are disabled
		if (!this.plugin.settings.enableMetadataTriggers) {
			return;
		}

		// Skip if this file was written by an agent during any active turn
		if (this.isFileTracked(filePath)) {
			return;
		}

		// Check if file has acp-trigger metadata set to true
		const cache = this.metadataCache.getFileCache(file);
		const shouldTrigger = cache?.frontmatter?.['acp-trigger'] === true;

		if (!shouldTrigger) {
			return;
		}

		// Debounce trigger execution
		this.debounceTrigger(file, event);
	}

	/**
	 * Debounce trigger execution per file path
	 */
	private debounceTrigger(file: TFile, event: 'created' | 'modified') {
		const debounceKey = file.path;

		// Clear existing timer for this file
		if (this.debounceTimers.has(debounceKey)) {
			clearTimeout(this.debounceTimers.get(debounceKey)!);
		}

		// Set new timer
		const timer = setTimeout(() => {
			this.executeTrigger(file, event);
			this.debounceTimers.delete(debounceKey);
		}, this.plugin.settings.metadataTriggerDebounceMs);

		this.debounceTimers.set(debounceKey, timer);
	}

	/**
	 * Execute a trigger: read metadata, set acp-trigger to false, spawn agent
	 */
	private async executeTrigger(file: TFile, event: 'created' | 'modified') {
		try {
			const cache = this.metadataCache.getFileCache(file);

			// Get custom prompt from frontmatter
			let prompt = cache?.frontmatter?.['acp-prompt'] as string | undefined;

			if (!prompt) {
				prompt = `Process the file: ${file.path}`;
			}

			// Set acp-trigger to false BEFORE spawning agent to prevent race conditions
			await this.disableTrigger(file);

			// Add file context to prompt
			const fullPrompt = `${prompt}\n\nFile: ${file.path}`;

			// Spawn agent view
			await this.plugin.activateView(fullPrompt);

		} catch (error) {
			console.error('Error executing trigger:', error);
			new Notice(`Failed to execute trigger: ${error.message}`);
		}
	}

	/**
	 * Disable trigger by setting acp-trigger to false in frontmatter
	 */
	private async disableTrigger(file: TFile): Promise<void> {
		try {
			await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter['acp-trigger'] = false;
			});
		} catch (error) {
			// Handle malformed YAML gracefully
			if (error.name === 'YAMLParseError') {
				console.error('Failed to parse frontmatter for trigger disable:', error);
				new Notice(`Could not disable trigger for ${file.path}: Invalid YAML format`);
				throw error;
			}
			throw error;
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
