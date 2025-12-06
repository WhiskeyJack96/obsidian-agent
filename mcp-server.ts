import { App, Command } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Express, Request, Response } from 'express';
import { z } from 'zod';
import { Server } from 'http';

interface MCPServerConfig {
	app: App;
	port: number;
}

// Extended App interface to access undocumented Obsidian commands API
interface ObsidianApp extends App {
	commands: {
		listCommands(): Command[];
		executeCommandById(commandId: string): boolean;
	};
}

export class ObsidianMCPServer {
	private mcpServer: McpServer;
	private expressApp: Express;
	private httpServer: Server | null = null;
	private obsidianApp: App;
	private port: number;

	constructor(config: MCPServerConfig) {
		this.obsidianApp = config.app;
		this.port = config.port;

		// Initialize MCP server
		this.mcpServer = new McpServer({
			name: 'obsidian-commands',
			version: '1.0.0'
		});

		// Initialize Express app
		this.expressApp = express();
		this.expressApp.use(express.json());

		// Register tools
		this.registerTools();

		// Set up MCP endpoint
		this.setupEndpoint();
	}

	private registerTools() {
		// Tool 1: List all available Obsidian commands
		this.mcpServer.registerTool(
			'list_obsidian_commands',
			{
				title: 'List Obsidian Commands',
				description: 'Returns a list of all available Obsidian commands with their IDs and names. Use this to discover what commands are available before executing them.',
				inputSchema: {},
				outputSchema: {
					commands: z.array(z.object({
						id: z.string(),
						name: z.string()
					}))
				}
			},
			async () => {
				try {
					// Get all commands from Obsidian
					const commands: Command[] = (this.obsidianApp as ObsidianApp).commands.listCommands();

					// Format commands for output
					const formattedCommands = commands.map(cmd => ({
						id: cmd.id,
						name: cmd.name
					}));

					const output = { commands: formattedCommands };

					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(output, null, 2)
							}
						],
						structuredContent: output
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
					return {
						content: [
							{
								type: 'text' as const,
								text: `Error listing commands: ${errorMessage}`
							}
						],
						isError: true
					};
				}
			}
		);

		// Tool 2: Execute an Obsidian command by ID
		this.mcpServer.registerTool(
			'execute_obsidian_command',
			{
				title: 'Execute Obsidian Command',
				description: 'Executes a specific Obsidian command by its ID. First use list_obsidian_commands to find the command ID you want to execute. Returns success status and any error messages.',
				inputSchema: {
					commandId: z.string().describe('The ID of the Obsidian command to execute. Example: "editor:toggle-bold"')
				},
				outputSchema: {
					success: z.boolean(),
					message: z.string()
				}
			},
			async ({ commandId }: { commandId: string }) => {
				try {
					// Verify command exists
					const commands: Command[] = (this.obsidianApp as ObsidianApp).commands.listCommands();
					const commandExists = commands.some(cmd => cmd.id === commandId);

					if (!commandExists) {
						const output = {
							success: false,
							message: `Command with ID "${commandId}" not found. Use list_obsidian_commands to see available commands.`
						};

						return {
							content: [
								{
									type: 'text' as const,
									text: JSON.stringify(output, null, 2)
								}
							],
							structuredContent: output
						};
					}

					// Execute the command
					const success = (this.obsidianApp as ObsidianApp).commands.executeCommandById(commandId);

					const output = {
						success: Boolean(success),
						message: success
							? `Successfully executed command: ${commandId}`
							: `Command executed but returned false: ${commandId}`
					};

					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(output, null, 2)
								}
						],
						structuredContent: output
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
					const output = {
						success: false,
						message: `Error executing command "${commandId}": ${errorMessage}`
					};

					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(output, null, 2)
							}
						],
						structuredContent: output
					};
				}
			}
		);

		// Tool 3: Search notes
		this.mcpServer.registerTool(
			'search_notes',
			{
				title: 'Search Notes',
				description: 'Search for notes in the vault by content or filename. Returns matching file paths.',
				inputSchema: {
					query: z.string().describe('The search query')
				},
				outputSchema: {
					results: z.array(z.string())
				}
			},
			async ({ query }: { query: string }) => {
				try {
					const files = this.obsidianApp.vault.getMarkdownFiles();
					const results = files
						.filter(file => 
							file.path.toLowerCase().includes(query.toLowerCase()) || 
							file.basename.toLowerCase().includes(query.toLowerCase())
						)
						.map(file => file.path)
						.slice(0, 20); // Limit to 20 results

					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify(results, null, 2)
							}
						],
						structuredContent: { results }
					};
				} catch (error) {
					return {
						content: [
							{
								type: 'text' as const,
								text: `Error searching notes: ${error instanceof Error ? error.message : String(error)}`
							}
						],
						isError: true
					};
				}
			}
		);
	}

	private setupEndpoint() {
		this.expressApp.post('/mcp', async (req: Request, res: Response) => {
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true
			});

			res.on('close', () => {
				transport.close();
			});

			await this.mcpServer.connect(transport);
			await transport.handleRequest(req, res, req.body);
		});
	}

	async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.httpServer = this.expressApp.listen(this.port, () => {
					console.debug(`Obsidian MCP Server running on http://localhost:${this.port}/mcp`);
					resolve();
				});

				this.httpServer.on('error', (error) => {
					reject(error);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.httpServer) {
				this.httpServer.close(() => {
					console.debug('Obsidian MCP Server stopped');
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	getPort(): number {
		return this.port;
	}
}
