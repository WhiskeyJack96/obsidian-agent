import { App, Notice, FileSystemAdapter } from 'obsidian';
import { ACPClient } from './acp-client';
import { CommitReviewModal, CommitReviewResult } from './commit-review-modal';
import { existsSync } from 'fs';
import { join } from 'path';

interface ObsidianGitPlugin {
	gitManager: {
		commit(params: { message: string }): Promise<void>;
	};
}

export class GitIntegration {
	private app: App;
	private client: ACPClient | null = null;

	constructor(app: App) {
		this.app = app;
	}

	setClient(client: ACPClient): void {
		this.client = client;
	}

	/**
	 * Check if the vault is a git repository by looking for .git directory
	 */
	private isGitRepository(): boolean {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return false;
		}

		const basePath = adapter.getBasePath();
		const gitPath = join(basePath, '.git');
		return existsSync(gitPath);
	}

	/**
	 * Check if the obsidian-git plugin is installed and enabled
	 */
	private getObsidianGitPlugin(): ObsidianGitPlugin | null {
		// @ts-ignore - accessing internal plugin registry
		const plugins = this.app.plugins.plugins;
		if (plugins && plugins['obsidian-git']) {
			return plugins['obsidian-git'] as ObsidianGitPlugin;
		}
		return null;
	}

	/**
	 * Prompt user to review and commit changes after an agent turn
	 */
	async promptCommit(): Promise<void> {
		// Check if this is a git repository
		if (!this.isGitRepository()) {
			new Notice('Not a git repository. Initialize git first (.git directory not found).');
			return;
		}

		// Check which method to use for committing
		const obsidianGit = this.getObsidianGitPlugin();

		if (obsidianGit) {
			await this.commitWithObsidianGit(obsidianGit);
		} else {
			await this.commitWithAgent();
		}
	}

	/**
	 * Commit using the obsidian-git plugin
	 */
	private async commitWithObsidianGit(plugin: ObsidianGitPlugin): Promise<void> {
		// Show modal and get commit message from user
		const result = await this.showCommitReviewModal();

		if (!result.approved || !result.message) {
			new Notice('Commit cancelled');
			return;
		}

		try {
			await plugin.gitManager.commit({ message: result.message });
			new Notice('Changes committed successfully via obsidian-git');
		} catch (err) {
			new Notice(`Failed to commit: ${err.message}`);
			console.error('Git commit error:', err);
		}
	}

	/**
	 * Commit using the agent in a separate session
	 */
	private async commitWithAgent(): Promise<void> {
		if (!this.client) {
			new Notice('Agent client not available for git commit');
			return;
		}

		// Show modal and get commit message from user
		const result = await this.showCommitReviewModal();

		if (!result.approved || !result.message) {
			new Notice('Commit cancelled');
			return;
		}

		try {
			// Send a prompt to the agent to commit changes
			await this.client.sendPrompt(`Please commit all changes with the message: "${result.message}"`);
			new Notice('Commit request sent to agent');
		} catch (err) {
			new Notice(`Failed to send commit request: ${err.message}`);
			console.error('Agent commit error:', err);
		}
	}

	/**
	 * Show the commit review modal and wait for user input
	 */
	private async showCommitReviewModal(): Promise<CommitReviewResult> {
		return new Promise((resolve) => {
			const modal = new CommitReviewModal(this.app, resolve);
			modal.open();
		});
	}
}
