import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ACPClient } from './acp-client';
import { AgentView, VIEW_TYPE_AGENT } from './agent-view';
import { PlanView, VIEW_TYPE_PLAN } from './plan-view';
import { DiffView, VIEW_TYPE_DIFF, DiffData } from './diff-view';
import { ACPClientSettingTab } from './settings-tab';
import { ACPClientSettings, DEFAULT_SETTINGS } from './settings';
import { Plan } from './types';
import { GitIntegration } from './git-integration';
import { ObsidianMCPServer } from './mcp-server';

export default class ACPClientPlugin extends Plugin {
	settings: ACPClientSettings;
	gitIntegration: GitIntegration | null = null;
	private mcpServer: ObsidianMCPServer | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize git integration
		this.gitIntegration = new GitIntegration(this.app);

		// Register the agent view
		this.registerView(
			VIEW_TYPE_AGENT,
			(leaf) => new AgentView(leaf, this)
		);

		// Register the plan view
		this.registerView(
			VIEW_TYPE_PLAN,
			(leaf) => new PlanView(leaf)
		);

		// Register the diff view
		this.registerView(
			VIEW_TYPE_DIFF,
			(leaf) => new DiffView(leaf, this)
		);

		// Initialize client for any existing agent views (from restored workspace)
		this.app.workspace.onLayoutReady(() => {
			this.initializeExistingViews();
		});

		// Add ribbon icon
		this.addRibbonIcon('bot', 'Open ACP Agent', () => {
			this.activateView();
		});

		// Add command to open agent view (creates new conversation)
		this.addCommand({
			id: 'open-agent-view',
			name: 'Open Agent View',
			callback: () => {
				this.activateView();
			}
		});

		// Add settings tab
		this.addSettingTab(new ACPClientSettingTab(this.app, this));

		// Start MCP server if enabled
		if (this.settings.enableMCPServer) {
			this.startMCPServer();
		}
	}

	async onunload() {
		// Stop MCP server
		if (this.mcpServer) {
			await this.stopMCPServer();
		}
	}

	initializeExistingViews() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT);
		for (const leaf of leaves) {
			const view = leaf.view as AgentView;
			// Each view creates its own client
			if (view && typeof view.initializeClient === 'function') {
				view.initializeClient();

				// Set git integration for auto-commit after agent turns
				if (this.gitIntegration) {
					view.setGitIntegration(this.gitIntegration);
				}
			}
		}
	}

	async activateView() {
		const { workspace } = this.app;

		// Always create a new conversation in the right sidebar
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_AGENT, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	async openPlanView(planData: Plan): Promise<void> {
		const { workspace } = this.app;
		const leaf = await workspace.ensureSideLeaf(VIEW_TYPE_PLAN, "right", {
			reveal: true,
			active: true,
			split: true
		});
		if (leaf) {
			const planView = leaf.view as PlanView;
			planView.updatePlan(planData);
		}
	}

	async openDiffView(diffData: DiffData): Promise<DiffView | null> {
		const { workspace } = this.app;

		// Get the active leaf or create a new one in the main editor area
		const leaf = workspace.getLeaf('tab');
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_DIFF,
				active: true
			});

			await workspace.revealLeaf(leaf);
			return leaf.view as DiffView;
		}
		return null;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async startMCPServer() {
		try {
			if (this.mcpServer) {
				await this.stopMCPServer();
			}

			this.mcpServer = new ObsidianMCPServer({
				app: this.app,
				port: this.settings.mcpServerPort
			});

			await this.mcpServer.start();
			new Notice(`MCP Server started on port ${this.settings.mcpServerPort}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to start MCP Server: ${errorMessage}`);
			console.error('Failed to start MCP Server:', error);
		}
	}

	async stopMCPServer() {
		if (this.mcpServer) {
			await this.mcpServer.stop();
			this.mcpServer = null;
			new Notice('MCP Server stopped');
		}
	}
}
