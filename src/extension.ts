'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';
import Tasks from './tasks';
import Dub from './dub';
import Provider from './provider';
import Dfix from './dfix';
import DProfileViewer from './dProfileViewer';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import Dscanner from './dscanner/dscanner';
import * as util from './dscanner/util';
import { D_MODE } from './mode';

let server: Server;
let tasks: Tasks;
let output = vsc.window.createOutputChannel('D language');

class Tool {
    public static dub: Dub;
    public activate: Function;
    private _name: string;
    private _configName: string;
    private _buildConfig: string;
    private _isSystemTool = false;
    private _toolDirectory: string;
    private _toolFile: string;

    public get toolDirectory() {
        return this._toolDirectory;
    }

    public get toolFile() {
        return this._toolFile;
    }

    public constructor(name: string, options?: { configName?: string, buildConfig?: string }) {
        options = options || {};
        this._name = name;
        this._configName = options.configName || name;
        this._buildConfig = options.buildConfig;
    }

    public fetch() {
        return Tool.dub.fetch(this._name);
    }

    public build() {
        return Tool.dub.getLatestVersion(this._name)
            .then((p) => {
                this._toolDirectory = p.path;
                return p;
            })
            .then((p) => Tool.dub.build(p, 'release', this._buildConfig));
    }

    public setup() {
        let toolPath: string;

        toolPath = vsc.workspace.getConfiguration().get<string>('d.tools.' + this._configName
            + (this._buildConfig ? '.' + this._buildConfig : ''));

        if (path.isAbsolute(toolPath)) {
            try {
                fs.accessSync(toolPath, fs.constants.F_OK);
                this._isSystemTool = true;
            } catch (e) { }
        } else {
            let isWin = process.platform === 'win32';

            process.env.PATH.split(isWin ? ';' : ':').forEach((dir) => {
                try {
                    fs.accessSync(path.join(dir, toolPath + (isWin ? '.exe' : '')), fs.constants.F_OK);
                    this._isSystemTool = true;
                } catch (e) { }
            });
        }

        if (this._isSystemTool) {
            this._toolDirectory = path.dirname(toolPath);
            this._toolFile = path.basename(toolPath);
            output.appendLine('Found ' + this._name + (this._buildConfig ? ` (${this._buildConfig})` : '') + ' : ' + toolPath);
        }

        let promise = this._isSystemTool ? Promise.resolve(null)
            : this.fetch().then(this.build.bind(this));

        if (this.activate) {
            promise = promise.then(this.activate.bind(this));
        }

        return promise;
    }
}

const initOptions = [
    {
        prompt: 'The name of the package',
        placeHolder: 'Name',
        value: path.basename(vsc.workspace.rootPath)
    },
    {
        prompt: 'Brief description of the package',
        placeHolder: 'Description'
    },
    {
        prompt: 'The name of the author of the package',
        placeHolder: 'Author name',
        value: process.env.USERNAME
    },
    {
        prompt: 'The license of the package',
        placeHolder: 'License'
    },
    {
        prompt: 'The copyright of the package',
        placeHolder: 'Copyright'
    }
];

export function activate(context: vsc.ExtensionContext) {
    if (Dub.check()) {
        vsc.window.showErrorMessage('Dub command not found');
        return;
    }

    tasks = new Tasks();

    let dub = new Dub(output);
    let provider = new Provider();

    output.show(true);
    context.subscriptions.push(tasks, output, dub);

    let dcdClientTool = new Tool('dcd', { buildConfig: 'client' });
    let dcdServerTool = new Tool('dcd', { buildConfig: 'server' });
    let dfmtTool = new Tool('dfmt');
    let dscannerTool = new Tool('dscanner');

    Tool.dub = dub;

    dcdClientTool.activate = () => {
        Client.toolDirectory = dcdClientTool.toolDirectory;
        Client.toolFile = dcdClientTool.toolFile || 'dcd-client';
    };

    dcdServerTool.activate = () => {
        Server.toolDirectory = dcdServerTool.toolDirectory;
        Server.toolFile = dcdServerTool.toolFile || 'dcd-server';
        Server.dub = dub;

        server = new Server();
        output.appendLine('DCD : starting server...');

        let completionProvider = vsc.languages.registerCompletionItemProvider(D_MODE, provider, '.');
        let signatureProvider = vsc.languages.registerSignatureHelpProvider(D_MODE, provider, '(', ',');
        let definitionProvider = vsc.languages.registerDefinitionProvider(D_MODE, provider);
        let hoverProvider = vsc.languages.registerHoverProvider(D_MODE, provider);

        provider.on('restart', () => {
            output.appendLine('DCD : restarting server...');
            server.start();
            server.importSelections(context.subscriptions);
        });

        context.subscriptions.push(completionProvider, signatureProvider, definitionProvider, hoverProvider);

        return server.importSelections(context.subscriptions);
    };

    dfmtTool.activate = () => {
        Dfmt.toolDirectory = dfmtTool.toolDirectory;
        Dfmt.toolFile = dfmtTool.toolFile || 'dfmt';

        let formattingProvider = vsc.languages.registerDocumentFormattingEditProvider(D_MODE, provider);

        context.subscriptions.push(formattingProvider);
    };

    dscannerTool.activate = () => {
        Dscanner.toolDirtory = dscannerTool.toolDirectory;
        Dscanner.toolFile = dscannerTool.toolFile || 'dscanner';

        let documentSymbolProvider = vsc.languages.registerDocumentSymbolProvider(D_MODE, provider);
        let workspaceSymbolProvider = vsc.languages.registerWorkspaceSymbolProvider(provider);
        let diagnosticCollection = vsc.languages.createDiagnosticCollection();
        let lintDocument = (document: vsc.TextDocument) => {
            if (document.languageId === D_MODE.language) {
                new Dscanner(document, null, util.Operation.Lint);
            }
        };

        Dscanner.collection = diagnosticCollection;

        vsc.workspace.onDidSaveTextDocument(lintDocument);
        vsc.workspace.onDidOpenTextDocument(lintDocument);
        vsc.workspace.textDocuments.forEach(lintDocument);
        vsc.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri);
        });

        context.subscriptions.push(documentSymbolProvider, workspaceSymbolProvider, diagnosticCollection);
    };

    registerCommands(context.subscriptions, dub)
        .then(dcdClientTool.setup.bind(dcdClientTool))
        .then(dcdServerTool.setup.bind(dcdServerTool))
        .then(dfmtTool.setup.bind(dfmtTool))
        .then(dscannerTool.setup.bind(dscannerTool))
        .then(() => {
            let tasksWatcher = vsc.workspace.createFileSystemWatcher(path.join(vsc.workspace.rootPath, '.vscode', 'tasks.json'));

            tasksWatcher.onDidCreate(tasks.showChoosers.bind(tasks), null, context.subscriptions);
            tasksWatcher.onDidChange(tasks.updateChoosers.bind(tasks), null, context.subscriptions);
            tasksWatcher.onDidDelete(tasks.hideChoosers.bind(tasks), null, context.subscriptions);
            tasks.showChoosers();

            context.subscriptions.push(tasksWatcher);
        })
        .then(output.hide.bind(output));
};

export function deactivate() {
    if (server) {
        server.stop();
    }
};

function registerCommands(subscriptions: vsc.Disposable[], dub: Dub) {
    subscriptions.push(vsc.commands.registerCommand('dlang.default-tasks', tasks.createFile.bind(tasks)));

    subscriptions.push(vsc.commands.registerCommand('dlang.dcd.import', (uri: vsc.Uri) => {
        if (uri) {
            server.importPath(uri.fsPath);
            return;
        }

        vsc.window.showInputBox({ placeHolder: 'Path' }).then((importPath) => {
            if (importPath) {
                server.importPath(importPath);
            }
        });
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.init', () => {
        let initEntries: string[] = [];
        let thenable = vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Recipe format' });

        initOptions.forEach((options) => {
            thenable = thenable.then((result) => {
                initEntries.push(result || '');
                return vsc.window.showInputBox(options);
            });
        });

        thenable.then((result) => {
            initEntries.push(result);
            dub.init(initEntries);
        });
    }));

    let packageToQuickPickItem = (p) => {
        return {
            label: p.name,
            description: p.version,
            detail: p.description
        };
    };

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.fetch', () => {
        vsc.window.showInputBox({
            prompt: 'The package to search for',
            placeHolder: 'Package name'
        }).then((packageName) => {
            return dub.search(packageName);
        }).then((packages: any[]) => {
            return vsc.window.showQuickPick(packages.map(packageToQuickPickItem),
                { matchOnDescription: true });
        }).then((result: any) => {
            if (result) {
                dub.fetch(result.label);
            }
        });
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.remove', () => {
        dub.list().then((packages) => {
            vsc.window.showQuickPick(packages.sort((p1, p2) => {
                return p1.name > p2.name ? 1
                    : p1.name < p2.name ? -1
                        : p1.version > p2.version ? 1
                            : p1.version < p2.version ? -1
                                : 0;
            }).map(packageToQuickPickItem), { matchOnDescription: true }).then((result) => {
                if (result) {
                    dub.remove(result.label, result.description);
                }
            });
        });
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.upgrade', dub.upgrade.bind(dub)));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.convert', () => {
        vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Conversion format' }).then((format) => {
            if (format) {
                dub.convert(format);
            }
        });
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.dustmite', dub.dustmite.bind(dub)));

    subscriptions.push(vsc.commands.registerCommand('dlang.tasks.compiler', () => {
        vsc.window.showQuickPick(Tasks.compilers).then((compiler) => {
            if (compiler) {
                tasks.compiler = compiler;
            }
        });
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.tasks.build', () => {
        vsc.window.showQuickPick(Tasks.builds).then((build) => {
            if (build) {
                tasks.build = build;
            }
        });
    }));

    let dfixTool = new Tool('dfix');
    let dProfileViewerTool = new Tool('d-profile-viewer', { configName: 'dProfileViewer' });

    dfixTool.activate = () => {
        Dfix.toolDirectory = dfixTool.toolDirectory;
        Dfix.toolFile = dfixTool.toolFile || 'dfix';

        subscriptions.push(vsc.commands.registerCommand('dlang.dfix', (uri: vsc.Uri) => {
            let applyDfix = (document: vsc.TextDocument) => {
                document.save().then(() => {
                    let changeDisposable = vsc.workspace.onDidChangeTextDocument((event) => {
                        new Dscanner(event.document, null, util.Operation.Lint);
                        changeDisposable.dispose();
                    });

                    new Dfix(document.fileName);
                });
            };

            if (uri) {
                vsc.workspace.openTextDocument(uri).then(applyDfix);
                return;
            }

            let choices = ['Run on open file(s)', 'Run on workspace'];

            vsc.window.showQuickPick(choices).then((value) => {
                if (value === choices[0]) {
                    vsc.workspace.textDocuments.forEach(applyDfix);
                } else {
                    vsc.workspace.saveAll(false).then(() => {
                        new Dfix(vsc.workspace.rootPath);
                    });
                }
            });
        }));
    };

    dProfileViewerTool.activate = () => {
        DProfileViewer.toolDirectory = dProfileViewerTool.toolDirectory;
        DProfileViewer.toolFile = dProfileViewerTool.toolFile || 'd-profile-viewer';

        subscriptions.push(vsc.commands.registerCommand('dlang.d-profile-viewer', () => {
            return new Promise((resolve) => {
                new DProfileViewer(vsc.workspace.rootPath, resolve);
            }).then(() => {
                vsc.commands.executeCommand('vscode.previewHtml', vsc.Uri.file(path.join(vsc.workspace.rootPath, 'trace.html')));
            });
        }));
    };

    return dfixTool.setup().then(dProfileViewerTool.setup.bind(dProfileViewerTool));
}