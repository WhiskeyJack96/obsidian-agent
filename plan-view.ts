import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Plan } from './types';

export const VIEW_TYPE_PLAN = 'acp-plan-view';

export class PlanView extends ItemView {
	private planContainer: HTMLElement;
	private planData: Plan | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_PLAN;
	}

	getDisplayText(): string {
		return 'Agent Plan';
	}

	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('acp-plan-view');

		const header = container.createDiv({ cls: 'acp-plan-header' });
		header.createEl('strong', { text: 'Agent Plan' });

		this.planContainer = container.createDiv({ cls: 'acp-plan-entries' });
		this.updatePlanDisplay();
	}

	updatePlan(planData: Plan): void {
		this.planData = planData;
		this.updatePlanDisplay();
	}

	private updatePlanDisplay(): void {
		if (!this.planContainer) return;

		// Clear existing content
		this.planContainer.empty();

		if ( !this.planData || !this.planData.entries) {
			return;
		}

		// Render each entry
		for (const entry of this.planData.entries) {
			const entryEl = this.planContainer.createDiv({
				cls: `acp-plan-entry acp-plan-entry-${entry.status}`
			});

			// Status icon
			const iconEl = entryEl.createSpan({ cls: 'acp-plan-entry-icon' });
			if (entry.status === 'completed') {
				iconEl.setText('✓');
			} else if (entry.status === 'in_progress') {
				iconEl.setText('⟳');
			} else {
				iconEl.setText('○');
			}

			// Content
			const contentEl = entryEl.createSpan({ cls: 'acp-plan-entry-content' });
			contentEl.setText(entry.content);

			// Priority badge (optional)
			if (entry.priority && entry.priority !== 'medium') {
				const priorityEl = entryEl.createSpan({
					cls: `acp-plan-entry-priority acp-priority-${entry.priority}`
				});
				priorityEl.setText(entry.priority);
			}
		}
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}
}
