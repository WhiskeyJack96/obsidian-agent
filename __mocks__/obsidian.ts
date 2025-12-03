export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  parent: any;
  stat: any;
  vault: any;

  constructor() {
    this.path = '';
    this.basename = '';
    this.extension = '';
    this.name = '';
  }
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class Vault {
  on(event: string, callback: (...args: any[]) => any, ctx?: any): any {
    return {}; // Return mock EventRef
  }
  
  async read(file: TFile): Promise<string> {
    return "";
  }
  
  async create(path: string, data: string, options?: any): Promise<TFile> {
    const file = new TFile();
    file.path = path;
    return file;
  }
  
  async modify(file: TFile, data: string, options?: any): Promise<void> {}
  
  getFileByPath(path: string): TFile | null {
    return null;
  }

  getMarkdownFiles(): TFile[] {
    return [];
  }

  adapter: any;
  
  constructor() {
      this.adapter = new FileSystemAdapter();
      this.adapter.exists = async (path: string) => false;
      this.adapter.read = async (path: string) => "";
      this.adapter.write = async (path: string, data: string) => {};
  }
}

export class Plugin {
  app: any;
  
  constructor(app: any) {
    this.app = app;
  }
  
  registerEvent(eventRef: any): void {}
  addSettingTab(): void {}
  addCommand(): void {}
  registerView(): void {}
  addRibbonIcon(): void {}
  loadData(): Promise<any> { return Promise.resolve({}); }
  saveData(data: any): Promise<void> { return Promise.resolve(); }
}

export class MetadataCache {
  getFileCache(file: TFile): any {
    return null; // Will be mocked in tests
  }

  getBacklinksForFile(): any {
    return null;
  }
}

export class FileManager {
  async processFrontMatter(
    file: TFile,
    callback: (frontmatter: any) => void
  ): Promise<void> {
    // Will be mocked in tests
  }
}

export class App {
  vault: Vault;
  workspace: any;
  metadataCache: MetadataCache;
  fileManager: FileManager;

  constructor() {
    this.vault = new Vault();
    this.metadataCache = new MetadataCache();
    this.fileManager = new FileManager();
    this.workspace = {
        getLeavesOfType: () => [],
        detachLeavesOfType: () => {},
        getLeaf: () => ({
            setViewState: async () => {}
        }),
        getActiveFile: () => null
    };
  }
}

export interface DataAdapter {
    getName(): string;
    exists(normalizedPath: string, sensitive?: boolean): Promise<boolean>;
    stat(normalizedPath: string): Promise<any | null>;
    list(normalizedPath: string): Promise<any>;
    read(normalizedPath: string): Promise<string>;
    write(normalizedPath: string, data: string): Promise<void>;
}

export class FileSystemAdapter implements DataAdapter {
    getName(): string {
        return "FileSystemAdapter";
    }

    getBasePath(): string {
        return "";
    }

    exists(normalizedPath: string, sensitive?: boolean): Promise<boolean> {
        return Promise.resolve(false);
    }

    stat(normalizedPath: string): Promise<any | null> {
        return Promise.resolve(null);
    }

    list(normalizedPath: string): Promise<any> {
        return Promise.resolve({ files: [], folders: [] });
    }

    read(normalizedPath: string): Promise<string> {
        return Promise.resolve("");
    }

    write(normalizedPath: string, data: string): Promise<void> {
        return Promise.resolve();
    }
}
