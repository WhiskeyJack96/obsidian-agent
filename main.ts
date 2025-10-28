import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ACPClient } from './acp-client';
import { AgentView, VIEW_TYPE_AGENT } from './agent-view';
import { PlanView, VIEW_TYPE_PLAN } from './plan-view';
import { DiffView, VIEW_TYPE_DIFF, DiffData } from './diff-view';
import { ACPClientSettingTab } from './settings-tab';
import { ACPClientSettings, DEFAULT_SETTINGS } from './settings';
import { Plan } from './types';
import { GitIntegration } from './git-integration';

export default class ACPClientPlugin extends Plugin {
	settings: ACPClientSettings;
	private client: ACPClient | null = null;
	private gitIntegration: GitIntegration | null = null;

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

		// Add command to open agent view
		this.addCommand({
			id: 'open-agent-view',
			name: 'Open Agent View',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to connect to agent
		this.addCommand({
			id: 'connect-to-agent',
			name: 'Connect to Agent',
			callback: async () => {
				const view = await this.getAgentView();
				if (view) {
					await view.connect();
				}
			}
		});

		// Add command to disconnect from agent
		this.addCommand({
			id: 'disconnect-from-agent',
			name: 'Disconnect from Agent',
			callback: async () => {
				const view = await this.getAgentView();
				if (view) {
					await view.disconnect();
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new ACPClientSettingTab(this.app, this));
	}

	async onunload() {
		// Clean up client
		if (this.client) {
			await this.client.cleanup();
		}
	}

	initializeExistingViews() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT);
		for (const leaf of leaves) {
			const view = leaf.view as AgentView;
			// Only initialize if view is fully loaded and has setClient method
			if (view && typeof view.setClient === 'function') {
				this.ensureClientForView(view);
			}
		}
	}

	ensureClientForView(view: AgentView) {
		if (!this.client) {
			this.client = new ACPClient(this.app, this.settings, this);
		}
		view.setClient(this.client);

		// Set git integration for auto-commit after agent turns
		if (this.gitIntegration) {
			view.setGitIntegration(this.gitIntegration);
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_AGENT);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_AGENT, active: true });
			}
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		if (leaf) {
			workspace.revealLeaf(leaf);
		}

		// Initialize client for the view
		if (leaf) {
			const view = leaf.view as AgentView;
			if (view) {
				this.ensureClientForView(view);
			}
		}
	}

	async getAgentView(): Promise<AgentView | null> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT);
		if (leaves.length > 0) {
			return leaves[0].view as AgentView;
		}
		return null;
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
}
