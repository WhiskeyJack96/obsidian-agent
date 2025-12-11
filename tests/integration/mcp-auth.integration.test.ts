import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ObsidianMCPServer } from '../../mcp-server';
import { App } from 'obsidian';

describe('MCP Token Authentication Integration', () => {
	let app: App;
	let mcpServer: ObsidianMCPServer;
	const port = 13101; // Use a high port less likely to conflict

	beforeEach(() => {
		app = new App();
		mcpServer = new ObsidianMCPServer({
			app,
			port
		});
	});

	afterEach(async () => {
		if (mcpServer) {
			try {
				await mcpServer.stop();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	describe('Full Session Lifecycle with Auth', () => {
		it('should enforce auth throughout session lifecycle', async () => {
			// Start MCP server
			await mcpServer.start();

			// Before token added - request should fail
			let response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);

			// Simulate session creation - add token
			const token = 'session-token-123456789012345678901234567890123456789012345678901234567890';
			mcpServer.addAuthToken(token);

			// Request with correct token should work
			response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).not.toBe(401);

			// Request with wrong token should fail
			response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': 'Bearer wrong-token'
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);

			// Simulate session cleanup - remove token
			mcpServer.removeAuthToken(token);

			// Request with removed token should fail
			response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);
		});
	});

	describe('Multiple Concurrent Sessions', () => {
		it('should support multiple concurrent sessions with independent tokens', async () => {
			await mcpServer.start();

			// Session 1: Create and add token
			const token1 = 'token-session-1-11111111111111111111111111111111111111111111111111111111111111';
			mcpServer.addAuthToken(token1);

			// Session 2: Create and add different token
			const token2 = 'token-session-2-22222222222222222222222222222222222222222222222222222222222222';
			mcpServer.addAuthToken(token2);

			// Both tokens should be valid
			const response1 = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token1}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);

			const response2 = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token2}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);

			expect(response1.status).not.toBe(401);
			expect(response2.status).not.toBe(401);

			// Cross-session requests should fail
			const crossResponse = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token1}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(crossResponse.status).not.toBe(401); // token1 still valid

			// Cleanup session 1 - remove token1
			mcpServer.removeAuthToken(token1);

			// token1 should now fail
			const response1After = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token1}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response1After.status).toBe(401);

			// token2 should still work
			const response2After = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token2}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response2After.status).not.toBe(401);

			// Cleanup session 2
			mcpServer.removeAuthToken(token2);

			// Both tokens should fail
			const finalResponse = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token2}`
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(finalResponse.status).toBe(401);
		});

		it('should handle rapid token addition and removal', async () => {
			await mcpServer.start();

			// Rapidly add tokens
			const tokens = Array.from({ length: 5 }, (_, i) => 
				`token-${i}-${'0'.repeat(55 - String(i).length)}${i}` // Ensure 64 chars
			);

			tokens.forEach(token => mcpServer.addAuthToken(token));

			// All should be valid
			for (const token of tokens) {
				const response = await fetch(
					`http://localhost:${port}/mcp`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${token}`
						},
						body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
					}
				);
				expect(response.status).not.toBe(401);
			}

			// Remove every other token
			mcpServer.removeAuthToken(tokens[0]);
			mcpServer.removeAuthToken(tokens[2]);
			mcpServer.removeAuthToken(tokens[4]);

			// Removed tokens should fail
			for (const token of [tokens[0], tokens[2], tokens[4]]) {
				const response = await fetch(
					`http://localhost:${port}/mcp`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${token}`
						},
						body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
					}
				);
				expect(response.status).toBe(401);
			}

			// Remaining tokens should succeed
			for (const token of [tokens[1], tokens[3]]) {
				const response = await fetch(
					`http://localhost:${port}/mcp`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${token}`
						},
						body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
					}
				);
				expect(response.status).not.toBe(401);
			}
		});
	});

	describe('Auth Security Properties', () => {
		it('should not allow unauthorized access even with malformed requests', async () => {
			await mcpServer.start();

			const token = 'valid-token-' + '0'.repeat(52); // 64 chars
			mcpServer.addAuthToken(token);

			// Empty auth header
			let response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': ''
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);

			// Space-only auth header
			response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': ' '
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);

			// Bearer with no token
			response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': 'Bearer '
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);

			// Bearer with whitespace token
			response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': 'Bearer    '
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);
		});

		it('should reject all requests when no tokens configured', async () => {
			await mcpServer.start();

			// No tokens added - all requests should require auth but fail
			const response = await fetch(
				`http://localhost:${port}/mcp`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': 'Bearer some-token'
					},
					body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
				}
			);
			expect(response.status).toBe(401);
		});
	});
});
