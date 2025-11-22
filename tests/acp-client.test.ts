import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACPClient } from '../acp-client';
import { App, TFile } from 'obsidian';
import { EventEmitter } from 'events';

// Hoist mock function so it's accessible in factory and tests
const mocks = vi.hoisted(() => ({
    spawn: vi.fn()
}));

// Mock child_process
vi.mock('child_process', () => ({
    spawn: mocks.spawn,
    default: { spawn: mocks.spawn }
}));

import { spawn } from 'child_process';

describe('ACPClient', () => {
    let app: App;
    let client: ACPClient;
    let mockPlugin: any;
    let mockSettings: any;

    beforeEach(() => {
        app = new App();
        mockPlugin = {
            openDiffView: vi.fn(),
            triggerManager: {
                trackAgentWrite: vi.fn(),
                clearTurnWrites: vi.fn()
            }
        };
        mockSettings = {
            agentCommand: 'echo',
            agentArgs: [],
            autoApproveWritePermission: true
        };

        client = new ACPClient(app, mockSettings, mockPlugin);
        
        // Mock getVaultPath (private method, but we can mock the adapter)
        vi.spyOn(app.vault.adapter, 'getBasePath').mockReturnValue('/vault/root');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(client).toBeDefined();
    });

    describe('handleReadTextFile', () => {
        it('should read a file successfully', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            
            vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(mockFile);
            vi.spyOn(app.vault, 'read').mockResolvedValue('file content');
            
            // Access private method
            const result = await (client as any).handleReadTextFile({ path: '/vault/root/test.md' });
            
            expect(result).toEqual({ content: 'file content' });
            expect(app.vault.getFileByPath).toHaveBeenCalledWith('test.md');
        });

        it('should handle file not found', async () => {
            vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(null);
            vi.spyOn(app.vault.adapter, 'exists').mockResolvedValue(false);
            
            await expect((client as any).handleReadTextFile({ path: '/vault/root/missing.md' }))
                .rejects.toThrow('Failed to read file: File not found: missing.md');
        });
    });

    describe('handleWriteTextFile', () => {
        it('should write file directly when autoApprove is true', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            
            vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(mockFile);
            vi.spyOn(app.vault, 'modify').mockResolvedValue(undefined);
            
            await (client as any).handleWriteTextFile({ 
                path: '/vault/root/test.md',
                content: 'new content'
            });
            
            expect(app.vault.modify).toHaveBeenCalledWith(mockFile, 'new content');
        });

        it('should create file if it does not exist', async () => {
            vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(null);
            vi.spyOn(app.vault, 'create').mockResolvedValue(new TFile());
            
            await (client as any).handleWriteTextFile({ 
                path: '/vault/root/new.md',
                content: 'new content'
            });
            
            expect(app.vault.create).toHaveBeenCalledWith('new.md', 'new content');
        });

        it('should request approval when autoApprove is false', async () => {
            mockSettings.autoApproveWritePermission = false;
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            
            vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(mockFile);
            vi.spyOn(app.vault, 'read').mockResolvedValue('old content');
            
            mockPlugin.openDiffView.mockResolvedValue({
                setDiffData: (data: any, resolve: any) => {
                    resolve({ approved: true, editedText: 'approved content' });
                }
            });
            
            vi.spyOn(app.vault, 'modify').mockResolvedValue(undefined);
            
            await (client as any).handleWriteTextFile({ 
                path: '/vault/root/test.md',
                content: 'new content'
            });
            
            expect(app.vault.modify).toHaveBeenCalledWith(mockFile, 'approved content');
        });
    });

    describe('Terminal Handlers', () => {
        let mockProcess: any;

        beforeEach(() => {
            mockProcess = new EventEmitter();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();
            mockProcess.kill = vi.fn();
            mockProcess.exitCode = null;

            mocks.spawn.mockReturnValue(mockProcess);
        });

        it('should create a terminal', async () => {
            const result = await (client as any).handleTerminalCreate({
                command: 'echo',
                args: ['hello']
            });

            expect(mocks.spawn).toHaveBeenCalledWith('echo', ['hello'], expect.any(Object));
            expect(result).toHaveProperty('terminalId');
            expect(typeof result.terminalId).toBe('string');
        });

        it('should capture terminal output', async () => {
            const { terminalId } = await (client as any).handleTerminalCreate({
                command: 'echo',
                args: ['hello']
            });

            // Emit output
            mockProcess.stdout.emit('data', Buffer.from('hello '));
            mockProcess.stderr.emit('data', Buffer.from('world'));

            const output = await (client as any).handleTerminalOutput({ terminalId });

            expect(output.output).toBe('hello world');
        });

        it('should handle invalid terminal id', async () => {
            await expect((client as any).handleTerminalOutput({ terminalId: 'invalid' }))
                .rejects.toThrow('Terminal not found');
        });

        it('should kill terminal', async () => {
            const { terminalId } = await (client as any).handleTerminalCreate({
                command: 'sleep',
                args: ['10']
            });

            await (client as any).handleTerminalKill({ terminalId });

            expect(mockProcess.kill).toHaveBeenCalled();
        });

        it('should wait for terminal exit', async () => {
            const { terminalId } = await (client as any).handleTerminalCreate({
                command: 'sleep',
                args: ['1']
            });

            const waitPromise = (client as any).handleTerminalWaitForExit({ terminalId });
            
            // Simulate exit
            mockProcess.emit('exit', 0);

            const result = await waitPromise;
            expect(result.exitCode).toBe(0);
        });
    });

    describe('handleRequestPermission', () => {
        it('should delegate to updateCallback if present', async () => {
            const updateCallback = vi.fn();
            client.setUpdateCallback(updateCallback);

            const promise = (client as any).handleRequestPermission({
                options: ['yes', 'no'],
                message: 'Allow?'
            });

            expect(updateCallback).toHaveBeenCalledWith(expect.objectContaining({
                type: 'permission_request'
            }));

            // Simulate UI resolving the request
            const callArgs = updateCallback.mock.calls[0][0];
            callArgs.data.resolve({ outcome: 'accepted' });

            const result = await promise;
            expect(result).toEqual({ outcome: 'accepted' });
        });

        it('should return cancelled if no callback', async () => {
            const result = await (client as any).handleRequestPermission({
                options: ['yes', 'no']
            });
            
            expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
        });
    });

    describe('cleanup', () => {
        it('should kill all terminals and agent process', async () => {
            // Setup some terminals
            mocks.spawn.mockReturnValue({
                 stdout: new EventEmitter(),
                 stderr: new EventEmitter(),
                 on: vi.fn(),
                 kill: vi.fn()
            });
            
            await (client as any).handleTerminalCreate({ command: 't1' });
            
            // Mock main process
            const handlers: Record<string, Function[]> = {};
            const mockMainProcess = {
                kill: vi.fn(() => {
                    // Simulate exit when kill is called
                    if (handlers['exit']) {
                        handlers['exit'].forEach(h => h());
                    }
                }),
                removeAllListeners: vi.fn(),
                on: vi.fn((event, cb) => {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(cb);
                })
            };
            (client as any).process = mockMainProcess;
            (client as any).sessionId = 'test-session';

            await client.cleanup();

            expect(mockMainProcess.kill).toHaveBeenCalled();
            expect(mockPlugin.triggerManager.clearTurnWrites).toHaveBeenCalled();
        });
    });
});

