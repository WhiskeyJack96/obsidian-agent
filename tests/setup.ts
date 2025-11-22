import { vi } from 'vitest';

// Mock Obsidian's DOM extensions
if (typeof HTMLElement !== 'undefined') {
    HTMLElement.prototype.createDiv = function(params?: any) {
        const div = document.createElement('div');
        if (params?.cls) {
            if (Array.isArray(params.cls)) {
                div.classList.add(...params.cls);
            } else {
                div.classList.add(params.cls);
            }
        }
        if (params?.text) div.textContent = params.text;
        this.appendChild(div);
        return div;
    };

    HTMLElement.prototype.createEl = function(tag: string, params?: any) {
        const el = document.createElement(tag);
        if (params?.cls) {
             if (Array.isArray(params.cls)) {
                el.classList.add(...params.cls);
            } else {
                el.classList.add(params.cls);
            }
        }
        if (params?.text) el.textContent = params.text;
        if (params?.value) (el as any).value = params.value;
        this.appendChild(el);
        return el;
    };

    HTMLElement.prototype.empty = function() {
        while (this.firstChild) {
            this.removeChild(this.firstChild);
        }
    };

    HTMLElement.prototype.addClass = function(...classes: string[]) {
        this.classList.add(...classes);
    };

    HTMLElement.prototype.removeClass = function(...classes: string[]) {
        this.classList.remove(...classes);
    };

    HTMLElement.prototype.hasClass = function(cls: string) {
        return this.classList.contains(cls);
    };

    HTMLElement.prototype.setText = function(text: string) {
        this.textContent = text;
    };
}
