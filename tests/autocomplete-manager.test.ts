import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutocompleteManager } from '../autocomplete-manager';
import { App, TFile } from 'obsidian';

describe('AutocompleteManager', () => {
    let app: App;
    let inputField: HTMLTextAreaElement;
    let autocompleteContainer: HTMLElement;
    let manager: AutocompleteManager;

    beforeEach(() => {
        app = new App();
        inputField = document.createElement('textarea');
        autocompleteContainer = document.createElement('div');
        manager = new AutocompleteManager(app, inputField, autocompleteContainer);
        
        // Mock TFile
        const mockFile = new TFile();
        mockFile.path = 'test-file.md';
        mockFile.basename = 'test-file';
        
        // Setup default mocks
        vi.spyOn(app.vault, 'getMarkdownFiles').mockReturnValue([mockFile]);
        app.workspace.getActiveFile = vi.fn().mockReturnValue(null);
    });

    it('should instantiate correctly', () => {
        expect(manager).toBeDefined();
    });

    it('should trigger command autocomplete with /', () => {
        manager.setAvailableCommands([{ name: 'test-command', description: 'Test' }]);
        
        inputField.value = '/tes';
        inputField.selectionStart = 4;
        inputField.selectionEnd = 4;
        
        manager.handleInput();
        
        expect(autocompleteContainer.classList.contains('acp-hidden')).toBe(false);
        const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].textContent).toContain('test-command');
    });

    it('should trigger file autocomplete with @', () => {
        inputField.value = '@test';
        inputField.selectionStart = 5;
        inputField.selectionEnd = 5;
        
        manager.handleInput();
        
        expect(autocompleteContainer.classList.contains('acp-hidden')).toBe(false);
        const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
        // Should have "Open Files" + matching file
        expect(items.length).toBeGreaterThan(0);
    });

    it('should trigger open_files autocomplete', () => {
        inputField.value = '@open_files ';
        inputField.selectionStart = 12;
        inputField.selectionEnd = 12;
        
        // Mock open files
        const leafMock = { view: { file: { path: 'open.md', basename: 'open' } } };
        vi.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue([leafMock] as any);
        
        manager.handleInput();
        
        expect(autocompleteContainer.classList.contains('acp-hidden')).toBe(false);
        const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].textContent).toContain('open');
    });

    it('should hide autocomplete when no match', () => {
        inputField.value = 'just text';
        inputField.selectionStart = 9;
        
        manager.handleInput();
        
        expect(autocompleteContainer.classList.contains('acp-hidden')).toBe(true);
    });
    
    it('should select item on enter', () => {
         manager.setAvailableCommands([{ name: 'cmd', description: 'Test' }]);
         
         inputField.value = '/cm';
         inputField.selectionStart = 3;
         
         manager.handleInput();
         
         // Simulate Enter key
         const event = new KeyboardEvent('keydown', { key: 'Enter' });
         const handled = manager.handleKeyDown(event);
         
         expect(handled).toBe(true);
         expect(inputField.value).toContain('/cmd ');
    });

    it('should navigate selection with arrow keys', () => {
        manager.setAvailableCommands([
            { name: 'cmd1', description: '1' },
            { name: 'cmd2', description: '2' },
            { name: 'cmd3', description: '3' }
        ]);
        
        inputField.value = '/cmd';
        inputField.selectionStart = 4;
        
        manager.handleInput();
        
        const items = autocompleteContainer.querySelectorAll('.acp-autocomplete-item');
        
        // Initial selection should be 0
        expect(items[0].classList.contains('selected')).toBe(true);
        
        // Down -> 1
        manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(items[1].classList.contains('selected')).toBe(true);
        expect(items[0].classList.contains('selected')).toBe(false);
        
        // Down -> 2
        manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(items[2].classList.contains('selected')).toBe(true);
        
        // Down (wrap) -> 0
        manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(items[0].classList.contains('selected')).toBe(true);
        
        // Up (wrap) -> 2
        manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        expect(items[2].classList.contains('selected')).toBe(true);
    });

    it('should hide on Escape', () => {
        manager.setAvailableCommands([{ name: 'test', description: 'Test' }]);
        inputField.value = '/tes';
        inputField.selectionStart = 4;
        
        manager.handleInput();
        expect(autocompleteContainer.classList.contains('acp-hidden')).toBe(false);
        
        const handled = manager.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(handled).toBe(true);
        expect(autocompleteContainer.classList.contains('acp-hidden')).toBe(true);
    });
});

