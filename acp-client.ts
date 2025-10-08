import { spawn, ChildProcess } from 'child_process';
import { ClientSideConnection, ndJsonStream, Client, Agent } from '@zed-industries/agent-client-protocol';
import { Readable as NodeReadable, Writable as NodeWritable } from 'stream';
import { ReadableStream, WritableStream } from 'stream/web';
import { App, Notice } from 'obsidian';
import { ACPClientSettings } from './settings';
import * as schema from '@zed-industries/agent-client-protocol';

export interface SessionUpdate {
	type: 'message' | 'tool_call' | 'plan' | 'mode_change';
	data: any;
}

export class ACPClient {
	private app: App;
	private settings: ACPClientSettings;
	private process: ChildProcess | null = null;
	private connection: ClientSideConnection | null = null;
	private sessionId: string | null = null;
	private terminals: Map<string, ChildProcess> = new Map();
	private updateCallback: ((update: SessionUpdate) => void) | null = null;

	constructor(app: App, settings: ACPClientSettings) {
		this.app = app;
		this.settings = settings;
	}

	setUpdateCallback(callback: (update: SessionUpdate) => void) {
		this.updateCallback = callback;
	}

	async initialize(): Promise<void> {
		if (!this.settings.agentCommand) {
			throw new Error('Agent command not configured. Please configure in settings.');
		}

		// Spawn the agent process
		// If the command is a Node.js script, run it with node explicitly
		const isNodeScript = this.settings.agentCommand.endsWith('.js') ||
							 this.settings.agentCommand.includes('node_modules');

		let command: string;
		let args: string[];

		if (isNodeScript) {
			// Run with node explicitly to avoid PATH issues
			command = '/opt/homebrew/bin/node';
			args = [this.settings.agentCommand, ...this.settings.agentArgs];
		} else {
			command = this.settings.agentCommand;
			args = this.settings.agentArgs;
		}

		this.process = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '')
			}
		});

		this.process.on('error', (err) => {
			new Notice(`Agent process error: ${err.message}`);
			console.error('Agent process error:', err);
		});

		this.process.on('exit', (code) => {
			console.log(`Agent process exited with code ${code}`);
			this.cleanup();
		});

		// Convert Node.js streams to Web Streams
		const stdin = this.process.stdin as NodeWritable;
		const stdout = this.process.stdout as NodeReadable;

		// Create Web WritableStream from Node.js Writable
		const webOutputStream = new WritableStream<Uint8Array>({
			write(chunk) {
				stdin.write(chunk);
			},
			close() {
				stdin.end();
			}
		});

		// Create Web ReadableStream from Node.js Readable
		const webInputStream = new ReadableStream<Uint8Array>({
			start(controller) {
				stdout.on('data', (chunk: Buffer) => {
					controller.enqueue(new Uint8Array(chunk));
				});
				stdout.on('end', () => {
					controller.close();
				});
				stdout.on('error', (err) => {
					controller.error(err);
				});
			}
		});

		// Create the stream using ndJsonStream
		const stream = ndJsonStream(webOutputStream, webInputStream);

		// Create ClientSideConnection with proper signature
		this.connection = new ClientSideConnection(
			(agent: Agent): Client => {
				return {
					requestPermission: this.handleRequestPermission.bind(this),
					sessionUpdate: this.handleSessionUpdate.bind(this),
					readTextFile: this.handleReadTextFile.bind(this),
					writeTextFile: this.handleWriteTextFile.bind(this),
					createTerminal: this.handleTerminalCreate.bind(this),
					terminalOutput: this.handleTerminalOutput.bind(this),
					releaseTerminal: this.handleTerminalRelease.bind(this),
					waitForTerminalExit: this.handleTerminalWaitForExit.bind(this),
					killTerminal: this.handleTerminalKill.bind(this)
				};
			},
			stream
		);

		// Initialize the agent
		const initResponse = await this.connection.initialize({
			protocolVersion: 1,
			clientCapabilities: {
				fs: {
					readTextFile: true,
					writeTextFile: true
				},
				terminal: true
			}
		});

		console.log('Agent initialized:', initResponse);
	}

	async createSession(): Promise<void> {
		if (!this.connection) {
			throw new Error('Not connected to agent');
		}

		// Get vault base path - use adapter's getBasePath if available
		const basePath = (this.app.vault.adapter as any).getBasePath?.() || process.cwd();

		const response = await this.connection.newSession({
			cwd: basePath,
			mcpServers: []
		});

		this.sessionId = response.sessionId;
		console.log('Session created:', this.sessionId);
	}

	async sendPrompt(prompt: string): Promise<void> {
		if (!this.connection || !this.sessionId) {
			throw new Error('No active session');
		}

		await this.connection.prompt({
			sessionId: this.sessionId,
			prompt: [{
				type: 'text',
				text: prompt
			}]
		});
	}

	async cancelSession(): Promise<void> {
		if (!this.connection || !this.sessionId) {
			return;
		}

		await this.connection.cancel({
			sessionId: this.sessionId
		});
	}

	// Client method implementations
	private async handleSessionUpdate(params: schema.SessionNotification): Promise<void> {
		if (this.updateCallback) {
			this.updateCallback({
				type: 'message',
				data: params
			});
		}
	}

	private async handleReadTextFile(params: schema.ReadTextFileRequest): Promise<schema.ReadTextFileResponse> {
		try {
			const file = this.app.vault.getAbstractFileByPath(params.path);
			if (!file) {
				throw new Error(`File not found: ${params.path}`);
			}

			const content = await this.app.vault.read(file as any);
			return { content };
		} catch (err) {
			throw new Error(`Failed to read file: ${err.message}`);
		}
	}

	private async handleWriteTextFile(params: schema.WriteTextFileRequest): Promise<schema.WriteTextFileResponse> {
		try {
			const file = this.app.vault.getAbstractFileByPath(params.path);
			if (file) {
				await this.app.vault.modify(file as any, params.content);
			} else {
				await this.app.vault.create(params.path, params.content);
			}
			return {};
		} catch (err) {
			throw new Error(`Failed to write file: ${err.message}`);
		}
	}

	private async handleRequestPermission(params: schema.RequestPermissionRequest): Promise<schema.RequestPermissionResponse> {
		if (this.settings.autoApprovePermissions && params.options && params.options.length > 0) {
			return {
				outcome: {
					outcome: 'selected',
					optionId: params.options[0].optionId
				}
			};
		}

		// In a real implementation, show a modal to the user
		// For now, auto-approve the first option if available
		console.log('Permission requested:', params);
		if (params.options && params.options.length > 0) {
			return {
				outcome: {
					outcome: 'selected',
					optionId: params.options[0].optionId
				}
			};
		}

		return {
			outcome: {
				outcome: 'cancelled'
			}
		};
	}

	private async handleTerminalCreate(params: schema.CreateTerminalRequest): Promise<schema.CreateTerminalResponse> {
		const terminalId = Math.random().toString(36).substring(7);

		const basePath = (this.app.vault.adapter as any).getBasePath?.() || process.cwd();
		const terminal = spawn(params.command, params.args || [], {
			cwd: params.cwd || basePath,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		this.terminals.set(terminalId, terminal);

		return { terminalId };
	}

	private async handleTerminalOutput(params: schema.TerminalOutputRequest): Promise<schema.TerminalOutputResponse> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		// Collect output
		let output = '';

		return new Promise((resolve) => {
			terminal.stdout?.on('data', (data) => {
				output += data.toString();
			});

			terminal.stderr?.on('data', (data) => {
				output += data.toString();
			});

			// Return current output immediately
			setTimeout(() => {
				const response: schema.TerminalOutputResponse = {
					output,
					truncated: false
				};

				if (terminal.exitCode !== null) {
					response.exitStatus = {
						exitCode: terminal.exitCode
					};
				}

				resolve(response);
			}, 100);
		});
	}

	private async handleTerminalKill(params: schema.KillTerminalCommandRequest): Promise<schema.KillTerminalResponse | void> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		terminal.kill();
	}

	private async handleTerminalRelease(params: schema.ReleaseTerminalRequest): Promise<schema.ReleaseTerminalResponse | void> {
		const terminal = this.terminals.get(params.terminalId);
		if (terminal) {
			terminal.kill();
			this.terminals.delete(params.terminalId);
		}
	}

	private async handleTerminalWaitForExit(params: schema.WaitForTerminalExitRequest): Promise<schema.WaitForTerminalExitResponse> {
		const terminal = this.terminals.get(params.terminalId);
		if (!terminal) {
			throw new Error(`Terminal not found: ${params.terminalId}`);
		}

		return new Promise((resolve) => {
			terminal.on('exit', (code) => {
				resolve({ exitCode: code || 0 });
			});
		});
	}

	cleanup(): void {
		// Clean up terminals
		for (const terminal of this.terminals.values()) {
			terminal.kill();
		}
		this.terminals.clear();

		// Kill agent process
		if (this.process) {
			this.process.kill();
			this.process = null;
		}

		this.connection = null;
		this.sessionId = null;
	}
}
