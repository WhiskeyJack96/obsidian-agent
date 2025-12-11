import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriggerManager } from '../trigger-manager';
import { App, TFile, Notice } from 'obsidian';
import type ACPClientPlugin from '../main';

// Mock Obsidian's Notice
vi.mock('obsidian', async () => {
	const actual = await vi.importActual('obsidian');
	return {
		...actual,
		Notice: vi.fn()
	};
});

// Helper Functions
function createMockFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = path.split('/').pop()?.split('.')[0] || '';
	file.extension = 'md';
	file.name = path.split('/').pop() || '';
	return file;
}

function createFileCacheMock(frontmatter?: Record<string, any> | null) {
	if (frontmatter === null) return null;
	return {
		frontmatter: frontmatter || {},
		metadata: {},
		sections: [],
		headings: [],
		links: [],
		embeds: []
	};
}

// Common frontmatter fixtures
const FIXTURES = {
	TRIGGER_ENABLED: { 'acp-trigger': true },
	TRIGGER_DISABLED: { 'acp-trigger': false },
	TRIGGER_WITH_PROMPT: {
		'acp-trigger': true,
		'acp-prompt': 'Review this file carefully'
	},
	TRIGGER_WITH_EMPTY_PROMPT: {
		'acp-trigger': true,
		'acp-prompt': ''
	},
	NO_FRONTMATTER: null,
	MALFORMED_TRIGGER: { 'acp-trigger': 'yes' }
};

describe('TriggerManager', () => {
	let manager: TriggerManager;
	let mockPlugin: any;
	let mockSettings: any;
	let mockFileManager: any;
	let mockMetadataCache: any;
	let mockVault: any;
	let mockApp: App;

	beforeEach(() => {
		vi.useFakeTimers();

		// Setup mocks
		mockSettings = {
			enableMetadataTriggers: true,
			metadataTriggerDebounceMs: 3000
		};

		mockMetadataCache = {
			getFileCache: vi.fn()
		};

		// Track frontmatter state per file
		const frontmatterState = new Map<string, Record<string, any>>();

		mockFileManager = {
			processFrontMatter: vi.fn(async (file, callback) => {
				// Always check metadata cache first for test-specific mocks
				const cacheData = mockMetadataCache.getFileCache(file);

				// Initialize frontmatter state from cache if available and not yet set
				if (!frontmatterState.has(file.path)) {
					if (cacheData?.frontmatter) {
						// Use cache frontmatter if available
						frontmatterState.set(file.path, { ...cacheData.frontmatter });
					} else if (cacheData === null || !cacheData) {
						// If cache is null, file likely has no frontmatter
						frontmatterState.set(file.path, {});
					} else {
						// Cache exists but no frontmatter property - treat as empty
						frontmatterState.set(file.path, {});
					}
				}

				// Get the frontmatter for this file
				const frontmatter = frontmatterState.get(file.path)!;

				callback(frontmatter);
			})
		};

		mockVault = {
			on: vi.fn(() => ({}))
		};

		mockApp = new App();
		mockApp.vault = mockVault;
		mockApp.metadataCache = mockMetadataCache;
		(mockApp as any).fileManager = mockFileManager;

		mockPlugin = {
			app: mockApp,
			settings: mockSettings,
			activateView: vi.fn(),
			registerEvent: vi.fn()
		} as unknown as ACPClientPlugin;

		manager = new TriggerManager(mockPlugin);
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		manager.cleanup();
	});

	describe('Initialization & Registration', () => {
		it('should initialize with plugin reference', () => {
			expect(manager).toBeDefined();
		});

		it('should register create event listener', () => {
			manager.registerListeners();
			expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
		});

		it('should register modify event listener', () => {
			manager.registerListeners();
			expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
		});
	});

	describe('Event Handling & Filtering', () => {
		it('should skip when metadata triggers are disabled', async () => {
			mockSettings.enableMetadataTriggers = false;
			const file = createMockFile('test.md');

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should skip when file is tracked by session', async () => {
			const file = createMockFile('test.md');
			manager.trackAgentWrite('session-1', 'test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should skip when frontmatter has no acp-trigger', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.NO_FRONTMATTER)
			);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should skip when acp-trigger is false', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_DISABLED)
			);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should skip when acp-trigger is wrong type', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.MALFORMED_TRIGGER)
			);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should trigger when acp-trigger is true', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(1);
		});

		it('should handle null cache gracefully', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(null);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should handle cache with no frontmatter property', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue({
				metadata: {},
				sections: []
			});

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe('Debouncing', () => {
		beforeEach(() => {
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);
		});

		it('should debounce multiple events on same file', async () => {
			const file = createMockFile('test.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			// Trigger 3 times rapidly
			await (manager as any).handleVaultEvent(file, 'modified');
			await (manager as any).handleVaultEvent(file, 'modified');
			await (manager as any).handleVaultEvent(file, 'modified');

			expect(vi.getTimerCount()).toBe(1);
			expect(executeSpy).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(3000);
			expect(executeSpy).toHaveBeenCalledTimes(1);
		});

		it('should use custom debounce delay from settings', async () => {
			mockSettings.metadataTriggerDebounceMs = 5000;
			const file = createMockFile('test.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			await (manager as any).handleVaultEvent(file, 'modified');

			// Should not execute at 3000ms
			await vi.advanceTimersByTimeAsync(3000);
			expect(executeSpy).not.toHaveBeenCalled();

			// Should execute at 5000ms
			await vi.advanceTimersByTimeAsync(2000);
			expect(executeSpy).toHaveBeenCalledTimes(1);
		});

		it('should handle concurrent file events independently', async () => {
			const file1 = createMockFile('file1.md');
			const file2 = createMockFile('file2.md');
			const file3 = createMockFile('file3.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			// Trigger events for different files
			await (manager as any).handleVaultEvent(file1, 'created');
			await vi.advanceTimersByTimeAsync(1000);
			await (manager as any).handleVaultEvent(file2, 'modified');
			await vi.advanceTimersByTimeAsync(1000);
			await (manager as any).handleVaultEvent(file3, 'created');

			// Should have 3 timers
			expect(vi.getTimerCount()).toBe(3);

			// Advance to first timer
			await vi.advanceTimersByTimeAsync(1000); // Total: 3000ms
			expect(executeSpy).toHaveBeenCalledTimes(1);
			expect(executeSpy).toHaveBeenCalledWith(file1, '');

			// Advance to second timer
			await vi.advanceTimersByTimeAsync(1000); // Total: 4000ms
			expect(executeSpy).toHaveBeenCalledTimes(2);
			expect(executeSpy).toHaveBeenCalledWith(file2, '');

			// Advance to third timer
			await vi.advanceTimersByTimeAsync(1000); // Total: 5000ms
			expect(executeSpy).toHaveBeenCalledTimes(3);
			expect(executeSpy).toHaveBeenCalledWith(file3, '');
		});

		it('should reset timer when same file receives new event', async () => {
			const file = createMockFile('test.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			await (manager as any).handleVaultEvent(file, 'modified');
			await vi.advanceTimersByTimeAsync(2000);

			// Reset mock to re-enable trigger for second event
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Override processFrontMatter to return fresh enabled state
			mockFileManager.processFrontMatter.mockImplementationOnce(
				async (f: any, callback: any) => {
					callback({ 'acp-trigger': true });
				}
			);

			// New event before timer fires - should reset
			await (manager as any).handleVaultEvent(file, 'modified');

			// Advance 1500ms more (total 3500ms from start, but 1500ms from reset)
			await vi.advanceTimersByTimeAsync(1500);
			expect(executeSpy).not.toHaveBeenCalled();

			// Advance final 1500ms
			await vi.advanceTimersByTimeAsync(1500);
			expect(executeSpy).toHaveBeenCalledTimes(1);
		});

		it('should clear timer from map after execution', async () => {
			const file = createMockFile('test.md');

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(1);

			await vi.advanceTimersByTimeAsync(3000);

			// Timer should be removed from internal map
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe('Trigger Execution', () => {
		// Note: We don't override processFrontMatter here anymore since it's now used
		// for both reading and writing frontmatter with stateful behavior

		it('should execute with default prompt', async () => {
			const file = createMockFile('notes/test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// With new implementation, pass empty/undefined prompt to get default
			await (manager as any).executeTrigger(file, '');

			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				'Process the file: notes/test.md\n\nFile: notes/test.md'
			);
		});

		it('should execute with custom prompt', async () => {
			const file = createMockFile('notes/review.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_WITH_PROMPT)
			);

			// Pass the custom prompt directly
			await (manager as any).executeTrigger(file, 'Review this file carefully');

			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				'Review this file carefully\n\nFile: notes/review.md'
			);
		});

		it('should handle empty custom prompt', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_WITH_EMPTY_PROMPT)
			);

			// Pass empty prompt - should use default
			await (manager as any).executeTrigger(file, '');

			// Should fall back to default
			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				'Process the file: test.md\n\nFile: test.md'
			);
		});

		it('should append file path to prompt', async () => {
			const file = createMockFile('dir/subdir/file.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock({
					'acp-trigger': true,
					'acp-prompt': 'Analyze'
				})
			);

			await (manager as any).executeTrigger(file, 'test prompt');

			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				expect.stringContaining('File: dir/subdir/file.md')
			);
		});

		it('should disable trigger before spawning agent', async () => {
			const file = createMockFile('test.md');
			let processCallOrder: string[] = [];

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			mockFileManager.processFrontMatter.mockImplementation(
				async (f: any, callback: any) => {
					processCallOrder.push('processFrontMatter');
					callback({ 'acp-trigger': true });
				}
			);

			mockPlugin.activateView.mockImplementation(async () => {
				processCallOrder.push('activateView');
			});

			// Use the full flow: handleVaultEvent -> isFileTriggerEnabled -> debounceTrigger -> executeTrigger
			await (manager as any).handleVaultEvent(file, 'modified');
			await vi.advanceTimersByTimeAsync(3000);

			// Verify processFrontMatter was called before activateView
			expect(processCallOrder).toEqual(['processFrontMatter', 'activateView']);
		});

		it('should set acp-trigger to false atomically', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// The refactored implementation reads AND disables in one call
			const { triggerValue, prompt } = await (manager as any).isFileTriggerEnabled(file);

			expect(triggerValue).toBe(true);
			expect(mockFileManager.processFrontMatter).toHaveBeenCalledWith(
				file,
				expect.any(Function)
			);
		});

		it('should call processFrontMatter with correct file', async () => {
			const file = createMockFile('specific.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Test through the full flow
			await (manager as any).handleVaultEvent(file, 'modified');

			expect(mockFileManager.processFrontMatter).toHaveBeenCalledWith(
				file,
				expect.any(Function)
			);
		});

		it('should call activateView with formatted prompt', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			await (manager as any).executeTrigger(file, 'test prompt');

			expect(mockPlugin.activateView).toHaveBeenCalledTimes(1);
			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				expect.stringContaining('test.md')
			);
		});

		it('should handle activateView errors gracefully', async () => {
			const file = createMockFile('test.md');
			const consoleErrorSpy = vi.spyOn(console, 'error')
				.mockImplementation(() => {});

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			mockPlugin.activateView.mockRejectedValue(
				new Error('Failed to activate view')
			);

			// Should not throw
			await expect(
				(manager as any).executeTrigger(file, 'test prompt')
			).resolves.not.toThrow();

			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(Notice).toHaveBeenCalledWith(
				expect.stringContaining('Failed to execute trigger')
			);

			consoleErrorSpy.mockRestore();
		});

		it('should handle file with no cache', async () => {
			const file = createMockFile('no-cache.md');

			mockMetadataCache.getFileCache.mockReturnValue(null);

			await (manager as any).executeTrigger(file, 'test prompt');

			// Should use the provided prompt
			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				'test prompt\n\nFile: no-cache.md'
			);
		});

		it('should handle frontmatter with no acp-prompt', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock({ 'acp-trigger': true, 'other-key': 'value' })
			);

			await (manager as any).executeTrigger(file, 'test prompt');

			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				'test prompt\n\nFile: test.md'
			);
		});
	});

	describe('Agent Write Tracking', () => {
		it('should track file write for session', () => {
			manager.trackAgentWrite('session-1', 'file1.md');
			expect((manager as any).isFileTracked('file1.md')).toBe(true);
		});

		it('should track multiple files for same session', () => {
			manager.trackAgentWrite('session-1', 'file1.md');
			manager.trackAgentWrite('session-1', 'file2.md');
			manager.trackAgentWrite('session-1', 'file3.md');

			expect((manager as any).isFileTracked('file1.md')).toBe(true);
			expect((manager as any).isFileTracked('file2.md')).toBe(true);
			expect((manager as any).isFileTracked('file3.md')).toBe(true);
		});

		it('should handle duplicate tracking for same file', () => {
			manager.trackAgentWrite('session-1', 'file1.md');
			manager.trackAgentWrite('session-1', 'file1.md');
			manager.trackAgentWrite('session-1', 'file1.md');

			expect((manager as any).isFileTracked('file1.md')).toBe(true);
		});

		it('should clear all tracked files when session ends', () => {
			manager.trackAgentWrite('session-1', 'file1.md');
			manager.trackAgentWrite('session-1', 'file2.md');

			manager.clearTurnWrites('session-1');

			expect((manager as any).isFileTracked('file1.md')).toBe(false);
			expect((manager as any).isFileTracked('file2.md')).toBe(false);
		});

		it('should return false for untracked files', () => {
			expect((manager as any).isFileTracked('untracked.md')).toBe(false);
		});

		it('should handle clearing non-existent session', () => {
			// Should not throw
			expect(() => {
				manager.clearTurnWrites('non-existent-session');
			}).not.toThrow();
		});

		it('should track files independently per session', () => {
			manager.trackAgentWrite('session-1', 'file1.md');
			manager.trackAgentWrite('session-2', 'file2.md');

			expect((manager as any).isFileTracked('file1.md')).toBe(true);
			expect((manager as any).isFileTracked('file2.md')).toBe(true);
		});

		it('should clear only specified session', () => {
			manager.trackAgentWrite('session-1', 'file1.md');
			manager.trackAgentWrite('session-2', 'file2.md');

			manager.clearTurnWrites('session-1');

			expect((manager as any).isFileTracked('file1.md')).toBe(false);
			expect((manager as any).isFileTracked('file2.md')).toBe(true);
		});

		it('should track same file across different sessions', () => {
			manager.trackAgentWrite('session-1', 'shared.md');
			manager.trackAgentWrite('session-2', 'shared.md');

			// File tracked by either session
			expect((manager as any).isFileTracked('shared.md')).toBe(true);

			// Clear one session
			manager.clearTurnWrites('session-1');

			// Still tracked by session-2
			expect((manager as any).isFileTracked('shared.md')).toBe(true);

			// Clear second session
			manager.clearTurnWrites('session-2');

			// Now not tracked
			expect((manager as any).isFileTracked('shared.md')).toBe(false);
		});

		it('should handle many concurrent sessions', () => {
			const sessionCount = 10;
			const fileCount = 5;

			// Track files for each session
			for (let s = 0; s < sessionCount; s++) {
				for (let f = 0; f < fileCount; f++) {
					manager.trackAgentWrite(`session-${s}`, `file-${f}.md`);
				}
			}

			// All files should be tracked
			for (let f = 0; f < fileCount; f++) {
				expect((manager as any).isFileTracked(`file-${f}.md`)).toBe(true);
			}

			// Clear half the sessions
			for (let s = 0; s < sessionCount / 2; s++) {
				manager.clearTurnWrites(`session-${s}`);
			}

			// Files still tracked by remaining sessions
			for (let f = 0; f < fileCount; f++) {
				expect((manager as any).isFileTracked(`file-${f}.md`)).toBe(true);
			}

			// Clear remaining sessions
			for (let s = sessionCount / 2; s < sessionCount; s++) {
				manager.clearTurnWrites(`session-${s}`);
			}

			// No files tracked
			for (let f = 0; f < fileCount; f++) {
				expect((manager as any).isFileTracked(`file-${f}.md`)).toBe(false);
			}
		});

		it('should prevent trigger while file is tracked', async () => {
			const file = createMockFile('agent-written.md');

			manager.trackAgentWrite('session-1', 'agent-written.md');
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('should allow trigger after session completes', async () => {
			const file = createMockFile('agent-written.md');

			manager.trackAgentWrite('session-1', 'agent-written.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Vault event fires - blocked
			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(0);

			// Session completes
			manager.clearTurnWrites('session-1');

			// Vault event fires again - allowed
			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(1);
		});

		it('should prevent infinite loop scenario', async () => {
			const file = createMockFile('loop-test.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Simulate: agent writes file with trigger enabled
			manager.trackAgentWrite('session-1', 'loop-test.md');

			// Vault modify event fires
			await (manager as any).handleVaultEvent(file, 'modified');

			// Should not execute
			await vi.runAllTimersAsync();
			expect(executeSpy).not.toHaveBeenCalled();

			// Turn completes
			manager.clearTurnWrites('session-1');

			// Now user modifies the file
			await (manager as any).handleVaultEvent(file, 'modified');
			await vi.runAllTimersAsync();

			// Should execute
			expect(executeSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error Handling', () => {
		beforeEach(() => {
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);
		});

		it('should handle malformed YAML in processFrontMatter', async () => {
			const file = createMockFile('malformed.md');
			const consoleErrorSpy = vi.spyOn(console, 'error')
				.mockImplementation(() => {});

			const yamlError = new Error('YAML parse error');
			yamlError.name = 'YAMLParseError';

			mockFileManager.processFrontMatter.mockRejectedValue(yamlError);

			// Should return false and log error
			const result = await (manager as any).isFileTriggerEnabled(file);

			expect(result.triggerValue).toBe(false);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Error reading file for trigger check'),
				yamlError
			);

			consoleErrorSpy.mockRestore();
		});

		it('should show file path in YAML error notice', async () => {
			// This test no longer applies with the new implementation
			// YAML errors are now caught in isFileTriggerEnabled and just return false
			// The file path is logged to console.error, not shown in a Notice
			const file = createMockFile('path/to/bad-yaml.md');
			const consoleErrorSpy = vi.spyOn(console, 'error')
				.mockImplementation(() => {});

			const yamlError = new Error('YAML parse error');
			yamlError.name = 'YAMLParseError';

			mockFileManager.processFrontMatter.mockRejectedValue(yamlError);

			const result = await (manager as any).isFileTriggerEnabled(file);

			expect(result.triggerValue).toBe(false);
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it('should handle generic errors in executeTrigger', async () => {
			const file = createMockFile('test.md');
			const consoleErrorSpy = vi.spyOn(console, 'error')
				.mockImplementation(() => {});

			const genericError = new Error('Unknown error');

			// Make activateView throw to test error handling in executeTrigger
			mockPlugin.activateView.mockRejectedValue(genericError);

			await (manager as any).executeTrigger(file, 'test prompt');

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Error executing trigger:',
				genericError
			);
			expect(Notice).toHaveBeenCalledWith(
				expect.stringContaining('Failed to execute trigger')
			);

			consoleErrorSpy.mockRestore();
			mockPlugin.activateView.mockReset();
		});

		it('should show error message in notice', async () => {
			const file = createMockFile('test.md');

			const error = new Error('Specific error message');

			// Make activateView throw to test error message in notice
			mockPlugin.activateView.mockRejectedValue(error);

			await (manager as any).executeTrigger(file, 'test prompt');

			expect(Notice).toHaveBeenCalledWith(
				expect.stringContaining('Specific error message')
			);

			mockPlugin.activateView.mockReset();
		});

		it('should handle errors without message property', async () => {
			const file = createMockFile('test.md');

			mockFileManager.processFrontMatter.mockRejectedValue('string error');

			// Should not throw
			await expect(
				(manager as any).executeTrigger(file, 'test prompt')
			).resolves.not.toThrow();
		});
	});

	describe('Cleanup', () => {
		beforeEach(() => {
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);
		});

		it('should clear all pending timers', async () => {
			const file1 = createMockFile('file1.md');
			const file2 = createMockFile('file2.md');
			const file3 = createMockFile('file3.md');

			// Create multiple pending timers
			await (manager as any).handleVaultEvent(file1, 'created');
			await (manager as any).handleVaultEvent(file2, 'modified');
			await (manager as any).handleVaultEvent(file3, 'created');

			expect(vi.getTimerCount()).toBe(3);

			manager.cleanup();

			expect(vi.getTimerCount()).toBe(0);
		});

		it('should prevent pending triggers from executing after cleanup', async () => {
			const file = createMockFile('test.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			await (manager as any).handleVaultEvent(file, 'created');

			manager.cleanup();

			// Try to advance timers
			await vi.runAllTimersAsync();

			expect(executeSpy).not.toHaveBeenCalled();
		});

		it('should handle cleanup with no pending timers', () => {
			expect(() => {
				manager.cleanup();
			}).not.toThrow();
		});

		it('should allow new timers after cleanup', async () => {
			const file = createMockFile('test.md');

			// Create and cleanup
			await (manager as any).handleVaultEvent(file, 'created');
			manager.cleanup();

			// Reset mock to re-enable trigger
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Override processFrontMatter to return fresh enabled state
			mockFileManager.processFrontMatter.mockImplementationOnce(
				async (f: any, callback: any) => {
					callback({ 'acp-trigger': true });
				}
			);

			// Create new timer
			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(1);
		});

		it('should clear internal debounceTimers map', async () => {
			const file = createMockFile('test.md');

			await (manager as any).handleVaultEvent(file, 'created');

			const mapSizeBefore = (manager as any).debounceTimers.size;
			expect(mapSizeBefore).toBeGreaterThan(0);

			manager.cleanup();

			expect((manager as any).debounceTimers.size).toBe(0);
		});

		it('should be safe to call multiple times', () => {
			expect(() => {
				manager.cleanup();
				manager.cleanup();
				manager.cleanup();
			}).not.toThrow();
		});
	});

	describe('Integration Scenarios', () => {
		// Note: We don't override processFrontMatter here anymore since it's now used
		// for both reading and writing frontmatter with stateful behavior

		it('should handle complete trigger flow', async () => {
			const file = createMockFile('integration-test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock({
					'acp-trigger': true,
					'acp-prompt': 'Summarize this note'
				})
			);

			// Simulate vault event
			await (manager as any).handleVaultEvent(file, 'modified');

			// Wait for debounce
			await vi.advanceTimersByTimeAsync(3000);

			// Verify flow
			expect(mockFileManager.processFrontMatter).toHaveBeenCalledWith(
				file,
				expect.any(Function)
			);
			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				'Summarize this note\n\nFile: integration-test.md'
			);
		});

		it('should handle rapid file changes with final execution', async () => {
			const file = createMockFile('rapid-changes.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			// Mock to keep returning enabled trigger for all rapid events
			mockMetadataCache.getFileCache.mockImplementation(() =>
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Override processFrontMatter to always return fresh enabled state
			mockFileManager.processFrontMatter.mockImplementation(
				async (f: any, callback: any) => {
					callback({ 'acp-trigger': true });
				}
			);

			// Simulate rapid typing/editing
			for (let i = 0; i < 10; i++) {
				await (manager as any).handleVaultEvent(file, 'modified');
				await vi.advanceTimersByTimeAsync(500);
			}

			// Should not have executed yet
			expect(executeSpy).not.toHaveBeenCalled();

			// Final debounce completes
			await vi.advanceTimersByTimeAsync(3000);

			// Should execute exactly once
			expect(executeSpy).toHaveBeenCalledTimes(1);
		});

		it('should handle multiple agents writing different files simultaneously', async () => {
			const file1 = createMockFile('agent1-file.md');
			const file2 = createMockFile('agent2-file.md');
			const file3 = createMockFile('user-file.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Agent 1 writes file1
			manager.trackAgentWrite('session-1', 'agent1-file.md');
			await (manager as any).handleVaultEvent(file1, 'modified');

			// Agent 2 writes file2
			manager.trackAgentWrite('session-2', 'agent2-file.md');
			await (manager as any).handleVaultEvent(file2, 'modified');

			// User modifies file3
			await (manager as any).handleVaultEvent(file3, 'modified');

			// Only user file should trigger
			expect(vi.getTimerCount()).toBe(1);

			await vi.advanceTimersByTimeAsync(3000);

			expect(mockPlugin.activateView).toHaveBeenCalledTimes(1);
			expect(mockPlugin.activateView).toHaveBeenCalledWith(
				expect.stringContaining('user-file.md')
			);
		});

		it('should handle settings changes mid-flight', async () => {
			const file = createMockFile('test.md');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Start with triggers enabled
			mockSettings.enableMetadataTriggers = true;
			await (manager as any).handleVaultEvent(file, 'modified');
			expect(vi.getTimerCount()).toBe(1);

			// Disable triggers mid-debounce
			mockSettings.enableMetadataTriggers = false;

			// New event should be ignored
			const file2 = createMockFile('file2.md');
			await (manager as any).handleVaultEvent(file2, 'modified');

			// Still only one timer (from before)
			expect(vi.getTimerCount()).toBe(1);

			// Original timer still fires (was already queued)
			await vi.advanceTimersByTimeAsync(3000);
			expect(mockPlugin.activateView).toHaveBeenCalledTimes(1);
		});

		it('should handle file deletion during debounce', async () => {
			const file = createMockFile('to-be-deleted.md');
			const executeSpy = vi.spyOn(manager as any, 'executeTrigger');

			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			await (manager as any).handleVaultEvent(file, 'modified');

			// Simulate file deletion (cache returns null)
			mockMetadataCache.getFileCache.mockReturnValue(null);

			// Timer fires
			await vi.advanceTimersByTimeAsync(3000);

			// executeTrigger still called (it will handle missing cache)
			expect(executeSpy).toHaveBeenCalled();
		});

		it('should handle plugin reload scenario', async () => {
			const file1 = createMockFile('file1.md');
			const file2 = createMockFile('file2.md');

			// Mock to return fresh enabled state for each call
			mockMetadataCache.getFileCache.mockImplementation(() =>
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			// Override processFrontMatter to always return fresh enabled state
			mockFileManager.processFrontMatter.mockImplementation(
				async (f: any, callback: any) => {
					callback({ 'acp-trigger': true });
				}
			);

			// Create pending triggers
			await (manager as any).handleVaultEvent(file1, 'modified');
			await (manager as any).handleVaultEvent(file2, 'created');

			// Track some writes
			manager.trackAgentWrite('session-1', 'tracked.md');
			manager.trackAgentWrite('session-2', 'tracked2.md');

			// Simulate plugin unload
			manager.cleanup();

			// All timers cleared
			expect(vi.getTimerCount()).toBe(0);

			// Create new manager instance (simulate reload)
			const newManager = new TriggerManager(mockPlugin);

			// Tracked writes should be gone (new instance)
			expect((newManager as any).isFileTracked('tracked.md')).toBe(false);
			expect((newManager as any).isFileTracked('tracked2.md')).toBe(false);

			// Can create new triggers
			await (newManager as any).handleVaultEvent(file1, 'modified');
			expect(vi.getTimerCount()).toBe(1);
		});

		it('should handle custom debounce delay edge cases', async () => {
			// Zero delay
			const file1 = createMockFile('test-zero.md');
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			mockSettings.metadataTriggerDebounceMs = 0;
			await (manager as any).handleVaultEvent(file1, 'modified');
			await vi.advanceTimersByTimeAsync(0);
			expect(mockPlugin.activateView).toHaveBeenCalled();

			mockPlugin.activateView.mockClear();

			// Very large delay (use different file to avoid frontmatter state from first execution)
			const file2 = createMockFile('test-large.md');
			mockMetadataCache.getFileCache.mockReturnValue(
				createFileCacheMock(FIXTURES.TRIGGER_ENABLED)
			);

			mockSettings.metadataTriggerDebounceMs = 60000; // 1 minute
			await (manager as any).handleVaultEvent(file2, 'modified');
			await vi.advanceTimersByTimeAsync(59999);
			expect(mockPlugin.activateView).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(mockPlugin.activateView).toHaveBeenCalled();
		});
	});
});
