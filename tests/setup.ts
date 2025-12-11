
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

    HTMLElement.prototype.createEl = function<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        o?: string | { cls?: string | string[]; text?: string; value?: string; },
        callback?: (el: HTMLElementTagNameMap[K]) => void
    ): HTMLElementTagNameMap[K] {
        const el = document.createElement(tag);

        // Handle o parameter (can be string for class or object)
        const params = typeof o === 'string' ? { cls: o } : o;

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

        if (callback) callback(el);

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
