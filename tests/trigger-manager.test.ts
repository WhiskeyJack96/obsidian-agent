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

// Mock the plugin
const mockPlugin = {
    app: new App(),
    registerEvent: vi.fn(),
    settings: {
        triggers: []
    },
    activateView: vi.fn(),
} as unknown as ACPClientPlugin;

describe('TriggerManager', () => {
    let triggerManager: TriggerManager;

    beforeEach(() => {
        vi.useFakeTimers();
        // Reset plugin mocks
        mockPlugin.settings.triggers = [];
        (mockPlugin.activateView as any).mockClear();
        (mockPlugin.registerEvent as any).mockClear();
        
        triggerManager = new TriggerManager(mockPlugin);
    });

    afterEach(() => {
        vi.useRealTimers();
        triggerManager.cleanup();
    });

    it('should be defined', () => {
        expect(triggerManager).toBeDefined();
    });

    it('should track agent writes', () => {
        const sessionId = 'session-1';
        const filePath = 'path/to/file.md';
        
        // Access private method for testing or check behavior
        triggerManager.trackAgentWrite(sessionId, filePath);
        
        // Since isFileTracked is private, we can check via behavior or cast to any
        expect((triggerManager as any).isFileTracked(filePath)).toBe(true);
    });

    it('should not track files for other sessions', () => {
        const sessionId = 'session-1';
        const filePath = 'path/to/file.md';
        const otherSessionId = 'session-2';
        const otherFilePath = 'path/to/other.md';
        
        triggerManager.trackAgentWrite(sessionId, filePath);
        triggerManager.trackAgentWrite(otherSessionId, otherFilePath);
        
        expect((triggerManager as any).isFileTracked(filePath)).toBe(true);
        expect((triggerManager as any).isFileTracked(otherFilePath)).toBe(true);
        
        // Clearing one session shouldn't clear the other
        triggerManager.clearTurnWrites(sessionId);
        expect((triggerManager as any).isFileTracked(filePath)).toBe(false);
        expect((triggerManager as any).isFileTracked(otherFilePath)).toBe(true);
    });

    it('should clear turn writes', () => {
        const sessionId = 'session-1';
        const filePath = 'path/to/file.md';
        
        triggerManager.trackAgentWrite(sessionId, filePath);
        triggerManager.clearTurnWrites(sessionId);
        
        expect((triggerManager as any).isFileTracked(filePath)).toBe(false);
    });

    describe('registerListeners', () => {
        it('should register create and modify listeners', () => {
            // Setup vault.on mock to capture callbacks
            const onMock = vi.fn();
            mockPlugin.app.vault.on = onMock;

            triggerManager.registerListeners();

            expect(onMock).toHaveBeenCalledTimes(2);
            expect(onMock).toHaveBeenCalledWith('create', expect.any(Function));
            expect(onMock).toHaveBeenCalledWith('modify', expect.any(Function));
            expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
        });
    });

    describe('handleVaultEvent', () => {
        it('should ignore events for tracked files', async () => {
            const file = new TFile();
            file.path = 'tracked.md';
            
            triggerManager.trackAgentWrite('session-1', 'tracked.md');
            
            // Mock triggers to ensure we don't reach filtering logic if tracked
            mockPlugin.settings.triggers = [{
                id: '1',
                folder: '.',
                prompt: 'test',
                enabled: true,
                debounceMs: 0
            }];

            // Call private method
            await (triggerManager as any).handleVaultEvent(file, 'modified');
            
            // Should not proceed to debounce/execute
            expect(mockPlugin.activateView).not.toHaveBeenCalled();
        });

        it('should match triggers by folder', async () => {
            const file = new TFile();
            file.path = 'folder/test.md';
            
            mockPlugin.settings.triggers = [
                {
                    id: '1',
                    folder: 'folder/',
                    prompt: 'test',
                    enabled: true,
                    debounceMs: 100
                },
                {
                    id: '2',
                    folder: 'other/',
                    prompt: 'test',
                    enabled: true,
                    debounceMs: 100
                }
            ];

            await (triggerManager as any).handleVaultEvent(file, 'created');
            
            // Should only trigger first one
            // Move time forward to trigger debounce
            vi.advanceTimersByTime(150);
            
            // Wait for async execution of executeTrigger
            await new Promise(resolve => resolve(true));

            expect(mockPlugin.activateView).toHaveBeenCalledTimes(1);
        });

        it('should ignore disabled triggers', async () => {
             const file = new TFile();
            file.path = 'test.md';
            
            mockPlugin.settings.triggers = [{
                id: '1',
                folder: '.',
                prompt: 'test',
                enabled: false,
                debounceMs: 100
            }];

            await (triggerManager as any).handleVaultEvent(file, 'modified');
            
            vi.advanceTimersByTime(150);
            expect(mockPlugin.activateView).not.toHaveBeenCalled();
        });
    });

    describe('executeTrigger', () => {
        it('should replace placeholders and activate view', async () => {
             const file = new TFile();
            file.path = 'test.md';
            
            // Mock vault read
            vi.spyOn(mockPlugin.app.vault, 'read').mockResolvedValue('File Content');

            const trigger = {
                id: '1',
                folder: '.',
                prompt: 'Analyze {file} with {content} on {event}',
                enabled: true,
                debounceMs: 0
            };

            await (triggerManager as any).executeTrigger(trigger, file, 'modified');

            expect(mockPlugin.activateView).toHaveBeenCalledWith('Analyze test.md with File Content on modified');
            expect(Notice).toHaveBeenCalled();
        });

        it('should handle errors during execution', async () => {
            const file = new TFile();
            file.path = 'test.md';
            
            vi.spyOn(mockPlugin.app.vault, 'read').mockRejectedValue(new Error('Read failed'));
            
            // Spy on console.error to suppress output
            vi.spyOn(console, 'error').mockImplementation(() => {});

            const trigger = {
                id: '1',
                folder: '.',
                prompt: 'test',
                enabled: true,
                debounceMs: 0
            };

            await (triggerManager as any).executeTrigger(trigger, file, 'modified');

            expect(mockPlugin.activateView).not.toHaveBeenCalled();
            // Should show error notice
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Failed to execute trigger'));
        });
    });

    describe('debouncing', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        });

        it('should debounce repeated events', async () => {
            const file = new TFile();
            file.path = 'test.md';
            
            mockPlugin.settings.triggers = [{
                id: '1',
                folder: '.',
                prompt: 'test',
                enabled: true,
                debounceMs: 1000
            }];

             // Mock vault read to work
            vi.spyOn(mockPlugin.app.vault, 'read').mockResolvedValue('content');
            
            // Let's try a simpler test case:
            (mockPlugin.activateView as any).mockClear();
            
            // Call once
            await (triggerManager as any).handleVaultEvent(file, 'modified');
            
            // Call again immediately
            await (triggerManager as any).handleVaultEvent(file, 'modified');
            
            // Advance time
            await vi.advanceTimersByTimeAsync(1000);
            
            // Should be 1 call
            expect(mockPlugin.activateView).toHaveBeenCalledTimes(1);
        });
    });
});

