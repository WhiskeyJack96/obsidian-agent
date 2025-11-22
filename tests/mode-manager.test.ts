import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModeManager } from '../mode-manager';
import { ACPClient } from '../acp-client';

// Mock ACPClient
class MockACPClient {
    getModeState = vi.fn();
    setMode = vi.fn().mockResolvedValue(undefined);
}

describe('ModeManager', () => {
    let container: HTMLElement;
    let modeManager: ModeManager;
    let onModeChange: any;
    let mockClient: any;

    beforeEach(() => {
        container = document.createElement('div');
        onModeChange = vi.fn();
        modeManager = new ModeManager(container, onModeChange);
        mockClient = new MockACPClient();
        modeManager.setClient(mockClient as unknown as ACPClient);
    });

    it('should create a select element', () => {
        const select = container.querySelector('select');
        expect(select).toBeTruthy();
        expect(select?.classList.contains('acp-mode-selector')).toBe(true);
        expect(select?.disabled).toBe(true);
    });

    it('should update mode options', () => {
        const modeState = {
            currentModeId: 'default',
            availableModes: [
                { id: 'default', name: 'Default', description: 'Default mode' },
                { id: 'code', name: 'Code', description: 'Coding mode' }
            ]
        };

        modeManager.updateModeSelector(modeState);

        const select = container.querySelector('select');
        expect(select?.disabled).toBe(false);
        expect(select?.options.length).toBe(2);
        expect(select?.value).toBe('default');
    });

    it('should update current mode', () => {
        const modeState = {
            currentModeId: 'default',
            availableModes: [
                { id: 'default', name: 'Default' },
                { id: 'code', name: 'Code' }
            ]
        };
        
        // Setup initial state
        modeManager.updateModeSelector(modeState);
        
        // Mock client response for getModeState used inside updateCurrentMode
        mockClient.getModeState.mockReturnValue(modeState);

        modeManager.updateCurrentMode('code');

        const select = container.querySelector('select');
        expect(select?.value).toBe('code');
        expect(onModeChange).toHaveBeenCalledWith('Code');
    });

    it('should handle mode change from UI', async () => {
        const modeState = {
            currentModeId: 'default',
            availableModes: [
                { id: 'default', name: 'Default' },
                { id: 'code', name: 'Code' }
            ]
        };
        
        modeManager.updateModeSelector(modeState);
        mockClient.getModeState.mockReturnValue(modeState);

        const select = container.querySelector('select')!;
        select.value = 'code';
        
        // Trigger change event manually
        select.dispatchEvent(new Event('change'));
        
        // Wait for async handler
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockClient.setMode).toHaveBeenCalledWith('code');
        expect(onModeChange).toHaveBeenCalledWith('Code');
    });

    it('should handle errors during mode change', async () => {
        const modeState = {
            currentModeId: 'default',
            availableModes: [
                { id: 'default', name: 'Default' },
                { id: 'broken', name: 'Broken' }
            ]
        };
        
        modeManager.updateModeSelector(modeState);
        mockClient.getModeState.mockReturnValue(modeState);
        mockClient.setMode.mockRejectedValue(new Error('Network error'));

        const select = container.querySelector('select')!;
        select.value = 'broken';
        
        select.dispatchEvent(new Event('change'));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockClient.setMode).toHaveBeenCalledWith('broken');
        // Should revert value
        expect(select.value).toBe('default');
    });

    it('should reset correctly', () => {
        const modeState = {
            currentModeId: 'default',
            availableModes: [{ id: 'default', name: 'Default' }]
        };
        modeManager.updateModeSelector(modeState);
        
        const select = container.querySelector('select')!;
        expect(select.disabled).toBe(false);
        expect(select.options.length).toBe(1);
        
        modeManager.reset();
        
        expect(select.disabled).toBe(true);
        expect(select.options.length).toBe(0);
    });
});

