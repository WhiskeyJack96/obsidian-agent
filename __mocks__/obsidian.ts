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

export class App {
  vault: Vault;
  workspace: any;
  metadataCache: any;
  
  constructor() {
    this.vault = new Vault();
    this.workspace = {
        getLeavesOfType: () => [],
        detachLeavesOfType: () => {},
        getLeaf: () => ({
            setViewState: async () => {}
        }),
        getActiveFile: () => null
    };
    this.metadataCache = {
        getBacklinksForFile: () => null
    };
  }
}

export class FileSystemAdapter {
    getBasePath() { return ""; }
}
