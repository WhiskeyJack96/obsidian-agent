import { App, Notice } from 'obsidian';

interface FileStatus {
	path: string;
	vaultPath: string;
	index: string;
	workingDir: string;
}

interface StatusResult {
	all: FileStatus[];
	changed: FileStatus[];
	staged: FileStatus[];
	conflicted: string[];
}

interface ObsidianGitPlugin {
	gitManager: {
		commit(params: { message: string }): Promise<void>;
		status(): Promise<StatusResult>;
	};
}

interface ObsidianPluginsRegistry {
	plugins: {
		[key: string]: any;
	};
}

export class GitIntegration {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Check if the obsidian-git plugin is installed and enabled
	 */
	private getObsidianGitPlugin(): ObsidianGitPlugin | null {
		const app = this.app as any;
		const plugins = app.plugins?.plugins;
		if (plugins && plugins['obsidian-git']) {
			return plugins['obsidian-git'] as ObsidianGitPlugin;
		}
		return null;
	}

	/**
	 * Automatically commit changes if obsidian-git plugin is available and there are changes
	 */
	async autoCommitIfNeeded(): Promise<void> {
		// Check if obsidian-git plugin is available
		const obsidianGit = this.getObsidianGitPlugin();
		if (!obsidianGit) {
			// Skip silently if obsidian-git is not available
			return;
		}

		try {
			// Check git status using obsidian-git's gitManager
			const status = await obsidianGit.gitManager.status();

			// Check if there are uncommitted changes
			if (status.changed.length === 0) {
				return;
			}

			// Auto-commit with default message
			const timestamp = new Date().toISOString();
			const commitMessage = `chore: auto-commit after agent turn at ${timestamp}`;

			await obsidianGit.gitManager.commit({ message: commitMessage });
			new Notice('Changes committed successfully');
		} catch (err) {
			new Notice(`Failed to commit: ${err.message}`);
			console.error('Git commit error:', err);
		}
	}
}
