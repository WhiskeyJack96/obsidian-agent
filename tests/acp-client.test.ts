import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACPClient } from '../acp-client';
import { App, TFile } from 'obsidian';
import { EventEmitter } from 'events';

// Hoist mock function so it's accessible in factory and tests
const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    ClientSideConnection: vi.fn(),
    ndJsonStream: vi.fn()
}));

// Mock child_process
vi.mock('child_process', () => ({
    spawn: mocks.spawn,
    default: { spawn: mocks.spawn }
}));

// Mock shell-env
vi.mock('shell-env', () => ({
    shellEnv: vi.fn().mockResolvedValue({ PATH: '/mock/path' })
}));

// Mock @agentclientprotocol/sdk
vi.mock('@agentclientprotocol/sdk', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        ClientSideConnection: mocks.ClientSideConnection,
        ndJsonStream: mocks.ndJsonStream
    };
});

import { spawn } from 'child_process';
import { ClientSideConnection } from '@agentclientprotocol/sdk';

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
            autoApproveWritePermission: true,
            obsidianFocussedPrompt: false,
            enableMCPServer: false
        };

        client = new ACPClient(app, mockSettings, mockPlugin);
        
        // Mock getVaultPath (private method, but we can mock the adapter)
        vi.spyOn(app.vault.adapter as any, 'getBasePath').mockReturnValue('/vault/root');

        // Reset mocks
        mocks.spawn.mockReset();
        mocks.ClientSideConnection.mockReset();
        mocks.ndJsonStream.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(client).toBeDefined();
    });

    describe('Lifecycle', () => {
        let mockProcess: any;
        let mockConnection: any;

        beforeEach(() => {
            mockProcess = new EventEmitter();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();
            mockProcess.stdin = new EventEmitter();
            mockProcess.stdin.write = vi.fn();
            mockProcess.stdin.end = vi.fn();
            mockProcess.kill = vi.fn();
            
            mocks.spawn.mockReturnValue(mockProcess);

            mockConnection = {
                initialize: vi.fn().mockResolvedValue({ agentCapabilities: { loadSession: true } }),
                newSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1', modes: { currentModeId: 'default', availableModes: [] } }),
                prompt: vi.fn().mockResolvedValue({}),
                cancel: vi.fn().mockResolvedValue(undefined),
                loadSession: vi.fn().mockResolvedValue({ modes: { currentModeId: 'default', availableModes: [] } }),
                setSessionMode: vi.fn().mockResolvedValue(undefined)
            };

            mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
            mocks.ndJsonStream.mockReturnValue({});
        });

        it('should initialize successfully', async () => {
            await client.initialize();

            expect(mocks.spawn).toHaveBeenCalled();
            expect(mocks.ClientSideConnection).toHaveBeenCalled();
            expect(mockConnection.initialize).toHaveBeenCalled();
        });

        it('should fail initialize if no command', async () => {
            mockSettings.agentCommand = '';
            await expect(client.initialize()).rejects.toThrow('Agent command not configured');
        });

        it('should create session', async () => {
            await client.initialize();
            await client.createSession();

            expect(mockConnection.newSession).toHaveBeenCalled();
            expect(client.getSessionId()).toBe('sess-1');
        });

        it('should fail create session if not connected', async () => {
            await expect(client.createSession()).rejects.toThrow('Not connected to agent');
        });

        it('should send prompt', async () => {
            await client.initialize();
            await client.createSession();
            await client.sendPrompt('hello');

            expect(mockConnection.prompt).toHaveBeenCalledWith(expect.objectContaining({
                sessionId: 'sess-1',
                prompt: [{ type: 'text', text: 'hello' }]
            }));
        });

        it('should cancel session', async () => {
            await client.initialize();
            await client.createSession();
            await client.cancelSession();

            expect(mockConnection.cancel).toHaveBeenCalledWith({ sessionId: 'sess-1' });
        });

        it('should load session', async () => {
            await client.initialize();
            await client.loadSession('sess-existing');

            expect(mockConnection.loadSession).toHaveBeenCalledWith(expect.objectContaining({
                sessionId: 'sess-existing'
            }));
            expect(client.getSessionId()).toBe('sess-existing');
        });
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
            mockProcess.stdin = new EventEmitter();
            mockProcess.stdin.write = vi.fn();
            mockProcess.stdin.end = vi.fn();
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

        it('should create a shell terminal if no args', async () => {
            const result = await (client as any).handleTerminalCreate({
                command: 'ls'
            });

            expect(mocks.spawn).toHaveBeenCalledWith('ls', [], expect.objectContaining({
                shell: true
            }));
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

        it('should capture terminal exit code', async () => {
            const { terminalId } = await (client as any).handleTerminalCreate({
                command: 'echo',
                args: ['hello']
            });

            // Simulate exit
            mockProcess.exitCode = 123;

            const output = await (client as any).handleTerminalOutput({ terminalId });

            expect(output.exitStatus).toEqual({ exitCode: 123 });
        });

        it('should handle invalid terminal id', async () => {
            await expect((client as any).handleTerminalOutput({ terminalId: 'invalid' }))
                .rejects.toThrow('Terminal not found');
        });

        it('should handle invalid terminal id in waitForExit', async () => {
            await expect((client as any).handleTerminalWaitForExit({ terminalId: 'invalid' }))
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

        it('should release terminal', async () => {
            const { terminalId } = await (client as any).handleTerminalCreate({
                command: 'sleep',
                args: ['10']
            });

            await (client as any).handleTerminalRelease({ terminalId });

            expect(mockProcess.kill).toHaveBeenCalled();
            // Should fail now as it's deleted
            await expect((client as any).handleTerminalOutput({ terminalId }))
                .rejects.toThrow('Terminal not found');
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

    describe('Edge Cases', () => {
        describe('File Operations', () => {
            it('should fallback to adapter write if create fails', async () => {
                vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(null);
                // Force vault.create to fail
                vi.spyOn(app.vault, 'create').mockRejectedValue(new Error('Vault create failed'));
                vi.spyOn(app.vault.adapter, 'write').mockResolvedValue(undefined);

                await (client as any).handleWriteTextFile({
                    path: '/vault/root/.gitignore',
                    content: 'node_modules'
                });

                expect(app.vault.create).toHaveBeenCalled();
                expect(app.vault.adapter.write).toHaveBeenCalledWith('.gitignore', 'node_modules');
            });

            it('should throw if user rejects diff', async () => {
                mockSettings.autoApproveWritePermission = false;
                const mockFile = new TFile();
                mockFile.path = 'test.md';
                
                vi.spyOn(app.vault, 'getFileByPath').mockReturnValue(mockFile);
                vi.spyOn(app.vault, 'read').mockResolvedValue('old');
                
                mockPlugin.openDiffView.mockResolvedValue({
                    setDiffData: (data: any, resolve: any) => {
                        resolve({ approved: false });
                    }
                });

                await expect((client as any).handleWriteTextFile({
                    path: '/vault/root/test.md',
                    content: 'new'
                })).rejects.toThrow('User rejected the file write');
            });
        });

        describe('Capabilities', () => {
            it('should not support loadSession if agent capability missing', async () => {
                const mockProcess = new EventEmitter();
                (mockProcess as any).stdout = new EventEmitter();
                (mockProcess as any).stderr = new EventEmitter();
                (mockProcess as any).stdin = new EventEmitter();
                (mockProcess as any).stdin.write = vi.fn();
                (mockProcess as any).stdin.end = vi.fn();
                mocks.spawn.mockReturnValue(mockProcess);

                const mockConnection = {
                    initialize: vi.fn().mockResolvedValue({ agentCapabilities: { loadSession: false } }),
                    newSession: vi.fn(),
                    loadSession: vi.fn()
                };
                mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
                mocks.ndJsonStream.mockReturnValue({});
                
                await client.initialize();
                
                expect(client.supportsLoadSession()).toBe(false);
                await expect(client.loadSession('sess-1')).rejects.toThrow('Agent does not support loading sessions');
            });
        });

        describe('Configuration', () => {
            it('should pass system prompt if configured', async () => {
                const mockProcess = new EventEmitter();
                (mockProcess as any).stdout = new EventEmitter();
                (mockProcess as any).stderr = new EventEmitter();
                (mockProcess as any).stdin = new EventEmitter();
                (mockProcess as any).stdin.write = vi.fn();
                (mockProcess as any).stdin.end = vi.fn();
                mocks.spawn.mockReturnValue(mockProcess);

                mockSettings.obsidianFocussedPrompt = true;
                const mockConnection = {
                    initialize: vi.fn().mockResolvedValue({}),
                    newSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1' })
                };
                mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
                mocks.ndJsonStream.mockReturnValue({});
                
                await client.initialize();
                await client.createSession();
                
                expect(mockConnection.newSession).toHaveBeenCalledWith(expect.objectContaining({
                    _meta: expect.objectContaining({
                        systemPrompt: expect.any(String)
                    })
                }));
            });

            it('should configure MCP servers if enabled', async () => {
                const mockProcess = new EventEmitter();
                (mockProcess as any).stdout = new EventEmitter();
                (mockProcess as any).stderr = new EventEmitter();
                (mockProcess as any).stdin = new EventEmitter();
                (mockProcess as any).stdin.write = vi.fn();
                (mockProcess as any).stdin.end = vi.fn();
                mocks.spawn.mockReturnValue(mockProcess);

                mockSettings.enableMCPServer = true;
                mockSettings.mcpServerPort = 4000;
                mockPlugin.mcpServer = {
                    addAuthToken: vi.fn(),
                    removeAuthToken: vi.fn()
                };
                
                const mockConnection = {
                    initialize: vi.fn().mockResolvedValue({}),
                    newSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1' })
                };
                mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
                mocks.ndJsonStream.mockReturnValue({});
                
                await client.initialize();
                await client.createSession();
                
                expect(mockConnection.newSession).toHaveBeenCalledWith(expect.objectContaining({
                    mcpServers: expect.arrayContaining([
                        expect.objectContaining({
                            type: 'http',
                            name: 'obsidian-commands',
                            url: 'http://localhost:4000/mcp'
                        })
                    ])
                }));
            });
        });

        describe('Process Errors', () => {
            it('should handle process error', async () => {
                const mockProcess = new EventEmitter();
                (mockProcess as any).stdout = new EventEmitter();
                (mockProcess as any).stderr = new EventEmitter();
                (mockProcess as any).stdin = new EventEmitter();
                (mockProcess as any).stdin.write = vi.fn();
                (mockProcess as any).stdin.end = vi.fn();
                mocks.spawn.mockReturnValue(mockProcess);
                
                const mockConnection = {
                    initialize: vi.fn().mockResolvedValue({}),
                };
                mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
                mocks.ndJsonStream.mockReturnValue({});
                
                // Spy on console.error
                const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
                
                await client.initialize();
                
                mockProcess.emit('error', new Error('Process failed'));
                
                expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Agent process error'), expect.any(Error));
            });

            it('should handle unexpected exit', async () => {
                const mockProcess = new EventEmitter();
                (mockProcess as any).stdout = new EventEmitter();
                (mockProcess as any).stderr = new EventEmitter();
                (mockProcess as any).stdin = new EventEmitter();
                (mockProcess as any).stdin.write = vi.fn();
                (mockProcess as any).stdin.end = vi.fn();
                // Make removeAllListeners actually work to prevent infinite loops
                const originalRemoveAllListeners = mockProcess.removeAllListeners.bind(mockProcess);
                (mockProcess as any).removeAllListeners = vi.fn((event?: string) => {
                    return originalRemoveAllListeners(event);
                });
                // Make kill() emit exit event to simulate real process behavior
                (mockProcess as any).kill = vi.fn(() => {
                    mockProcess.emit('exit', 0);
                });

                mocks.spawn.mockReturnValue(mockProcess);

                const mockConnection = {
                    initialize: vi.fn().mockResolvedValue({}),
                };
                mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
                mocks.ndJsonStream.mockReturnValue({});

                await client.initialize();
                (client as any).sessionId = 'sess-1';

                // Spy on cleanup
                const cleanupSpy = vi.spyOn(client, 'cleanup');

                // Simulate unexpected exit
                mockProcess.emit('exit', 1);

                // Wait for async cleanup
                await new Promise(resolve => setTimeout(resolve, 0));

                // Should trigger cleanup
                expect(cleanupSpy).toHaveBeenCalled();
                expect(mockPlugin.triggerManager.clearTurnWrites).toHaveBeenCalled();
                expect(client.getSessionId()).toBeNull();
            });
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

    describe('MCP Token Authentication', () => {
        let mockProcess: any;
        let mockConnection: any;

        beforeEach(() => {
            mockProcess = new EventEmitter();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();
            mockProcess.stdin = new EventEmitter();
            mockProcess.stdin.write = vi.fn();
            mockProcess.stdin.end = vi.fn();
            mockProcess.kill = vi.fn();
            
            mocks.spawn.mockReturnValue(mockProcess);

            mockConnection = {
                initialize: vi.fn().mockResolvedValue({ agentCapabilities: { loadSession: true } }),
                newSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1', modes: { currentModeId: 'default', availableModes: [] } }),
                loadSession: vi.fn().mockResolvedValue({ modes: { currentModeId: 'default', availableModes: [] } })
            };

            mocks.ClientSideConnection.mockImplementation(function() { return mockConnection; });
            mocks.ndJsonStream.mockReturnValue({});

            mockPlugin.mcpServer = {
                addAuthToken: vi.fn(),
                removeAuthToken: vi.fn()
            };
        });

        describe('Token Generation in createSession()', () => {
            it('should generate a random token', async () => {
                mockSettings.enableMCPServer = true;
                
                await client.initialize();
                await client.createSession();

                expect(mockPlugin.mcpServer.addAuthToken).toHaveBeenCalledWith(expect.any(String));
                const token = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];
                expect(token).toHaveLength(64); // 256 bits = 32 bytes = 64 hex chars
            });

            it('should generate different tokens for different sessions', async () => {
                mockSettings.enableMCPServer = true;
                
                await client.initialize();
                await client.createSession();

                const token1 = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];

                // Reset for second session
                mockPlugin.mcpServer.addAuthToken.mockClear();
                
                // Create another session
                await client.createSession();

                const token2 = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];
                expect(token1).not.toBe(token2);
            });

            it('should include token in Authorization header', async () => {
                mockSettings.enableMCPServer = true;
                
                await client.initialize();
                await client.createSession();

                const token = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];
                
                expect(mockConnection.newSession).toHaveBeenCalledWith(expect.objectContaining({
                    mcpServers: expect.arrayContaining([
                        expect.objectContaining({
                            headers: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Authorization',
                                    value: `Bearer ${token}`
                                })
                            ])
                        })
                    ])
                }));
            });

            it('should not add token when MCP server disabled', async () => {
                mockSettings.enableMCPServer = false;
                mockPlugin.mcpServer = null;
                
                await client.initialize();
                await client.createSession();

                expect(mockConnection.newSession).toHaveBeenCalledWith(expect.objectContaining({
                    mcpServers: []
                }));
            });

            it('should handle null mcpServer gracefully', async () => {
                mockSettings.enableMCPServer = true;
                mockPlugin.mcpServer = null;
                
                await client.initialize();
                await expect(client.createSession()).resolves.not.toThrow();
            });
        });

        describe('Token Generation in loadSession()', () => {
            it('should generate token on loadSession', async () => {
                mockSettings.enableMCPServer = true;
                
                await client.initialize();
                await client.loadSession('sess-existing');

                expect(mockPlugin.mcpServer.addAuthToken).toHaveBeenCalledWith(expect.any(String));
            });

            it('should pass token in headers to loadSession request', async () => {
                mockSettings.enableMCPServer = true;
                
                await client.initialize();
                await client.loadSession('sess-existing');

                const token = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];
                
                expect(mockConnection.loadSession).toHaveBeenCalledWith(expect.objectContaining({
                    mcpServers: expect.arrayContaining([
                        expect.objectContaining({
                            headers: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Authorization',
                                    value: `Bearer ${token}`
                                })
                            ])
                        })
                    ])
                }));
            });

            it('should generate different token than createSession', async () => {
                mockSettings.enableMCPServer = true;
                
                await client.initialize();
                await client.createSession();

                const token1 = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];

                mockPlugin.mcpServer.addAuthToken.mockClear();

                await client.loadSession('sess-existing');

                const token2 = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];
                expect(token1).not.toBe(token2);
            });
        });

        describe('Token Cleanup', () => {
            it('should remove token from MCP server on cleanup', async () => {
                mockSettings.enableMCPServer = true;
                
                const handlers: Record<string, Function[]> = {};
                const mockMainProcess = new EventEmitter();
                (mockMainProcess as any).stdout = new EventEmitter();
                (mockMainProcess as any).stderr = new EventEmitter();
                (mockMainProcess as any).stdin = new EventEmitter();
                (mockMainProcess as any).stdin.write = vi.fn();
                (mockMainProcess as any).stdin.end = vi.fn();
                (mockMainProcess as any).kill = vi.fn(() => {
                    mockMainProcess.emit('exit', 0);
                });

                mocks.spawn.mockReturnValue(mockMainProcess);

                await client.initialize();
                await client.createSession();

                const token = mockPlugin.mcpServer.addAuthToken.mock.calls[0][0];

                await client.cleanup();

                expect(mockPlugin.mcpServer.removeAuthToken).toHaveBeenCalledWith(token);
            });

            it('should handle null mcpServer during cleanup', async () => {
                mockSettings.enableMCPServer = true;
                mockPlugin.mcpServer = null;
                
                const mockMainProcess = new EventEmitter();
                (mockMainProcess as any).stdout = new EventEmitter();
                (mockMainProcess as any).stderr = new EventEmitter();
                (mockMainProcess as any).stdin = new EventEmitter();
                (mockMainProcess as any).stdin.write = vi.fn();
                (mockMainProcess as any).stdin.end = vi.fn();
                (mockMainProcess as any).kill = vi.fn(() => {
                    mockMainProcess.emit('exit', 0);
                });

                mocks.spawn.mockReturnValue(mockMainProcess);

                await client.initialize();
                await expect(client.cleanup()).resolves.not.toThrow();
            });

            it('should clear mcpAuthToken field after cleanup', async () => {
                mockSettings.enableMCPServer = true;
                
                const mockMainProcess = new EventEmitter();
                (mockMainProcess as any).stdout = new EventEmitter();
                (mockMainProcess as any).stderr = new EventEmitter();
                (mockMainProcess as any).stdin = new EventEmitter();
                (mockMainProcess as any).stdin.write = vi.fn();
                (mockMainProcess as any).stdin.end = vi.fn();
                (mockMainProcess as any).kill = vi.fn(() => {
                    mockMainProcess.emit('exit', 0);
                });

                mocks.spawn.mockReturnValue(mockMainProcess);
                mockPlugin.mcpServer = {
                    addAuthToken: vi.fn(),
                    removeAuthToken: vi.fn()
                };

                await client.initialize();
                await client.createSession();

                expect((client as any).mcpAuthToken).not.toBeNull();

                await client.cleanup();

                expect((client as any).mcpAuthToken).toBeNull();
            });
        });
    });
});

