import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ACPClient } from './acp-client';
import { AgentView, VIEW_TYPE_AGENT } from './agent-view';
import { ACPClientSettingTab } from './settings-tab';
import { ACPClientSettings, DEFAULT_SETTINGS } from './settings';

export default class ACPClientPlugin extends Plugin {
	settings: ACPClientSettings;
	private client: ACPClient | null = null;

	async onload() {
		await this.loadSettings();

		// Register the agent view
		this.registerView(
			VIEW_TYPE_AGENT,
			(leaf) => new AgentView(leaf)
		);

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
					view.disconnect();
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new ACPClientSettingTab(this.app, this));
	}

	async onunload() {
		// Clean up client
		if (this.client) {
			this.client.cleanup();
		}

		// Detach all agent views
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT);
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
			if (view && !this.client) {
				this.client = new ACPClient(this.app, this.settings);
				view.setClient(this.client);
			} else if (view && this.client) {
				view.setClient(this.client);
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

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
