'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';
import * as mpkg from 'meta-pkg';
import Tasks from './tasks';
import Dub from './dub';
import Provider from './provider';
import Dfix from './dfix';
import DProfileViewer from './d-profile-viewer';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import Dscanner from './dscanner/dscanner';
import * as dscannerUtil from './dscanner/util';
import * as dscannerConfig from './dscanner/config';
import { D_MODE } from './mode';

let toolsInstaller: vsc.StatusBarItem;
let tasksGenerator: vsc.StatusBarItem;
let packageInstallers = new Map<string, mpkg.Installer[]>();
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
                return Tool.dub.build(p, 'release', this._buildConfig);
            });
    }

    public setup() {
        let toolEnabled = vsc.workspace.getConfiguration().get<boolean>(`d.tools.enabled.${this._configName}`);

        if (!toolEnabled) {
            return Promise.resolve(undefined);
        }

        let toolPath = vsc.workspace.getConfiguration().get<string>('d.tools.' + this._configName
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
            output.appendLine('Found ' + this._name
                + (this._buildConfig ? ` (${this._buildConfig})` : '')
                + ' : ' + toolPath);
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
        value: vsc.workspace.rootPath ? path.basename(vsc.workspace.rootPath) : ''
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
    let packageNames = ['dmd', 'ldc', 'gdc', 'dub'];
    let packagePromises = packageNames
        .map((packageName) => path.join(__dirname, '..', '..', 'packages', packageName + '.json'))
        .map((p) => new Promise((resolve) => fs.readFile(p, (err, data) => resolve(data.toString()))));

    return Promise.all(packagePromises)
        .then((packagesStrings: string[]) => packagesStrings.map(JSON.parse.bind(JSON)))
        .then((packages: mpkg.Package[]) => packages.forEach(mpkg.registerPackage.bind(mpkg)))
        .then(() => packageNames.map(mpkg.getInstallers.bind(mpkg)))
        .then(Promise.all.bind(Promise))
        .then((allInstallers: mpkg.Installer[][]) => {
            allInstallers.forEach((installers, i) => {
                if (installers.length) {
                    packageInstallers.set(packageNames[i], installers);
                }
            });

            toolsInstaller = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right);
            toolsInstaller.text = '$(tools) Install tools';
            toolsInstaller.command = 'dlang.install';

            return mpkg.isInstalled('dub')
                .then((dubInstalled) => {
                    if (!dubInstalled) {
                        return vsc.window.showInformationMessage('Dub is not installed',
                            ...packageInstallers.get('dub')
                                .map((installer) => ({
                                    title: 'install with ' + installer.prettyName,
                                    installer: installer
                                })))
                            .then((choice) => {
                                if (!choice) {
                                    throw new Error('Dub is not going to be installed');
                                }

                                return choice.installer.install(output.append.bind(output))
                                    .then(() => vsc.window.showInformationMessage('Dub is now installed'));
                            });
                    }
                });
        }).then(() => packageNames.map(mpkg.isInstalled.bind(mpkg)))
        .then(Promise.all.bind(Promise))
        .then((installed: boolean[]) => packageNames
            .map((name, i) => installed[i] ? mpkg.isUpgradable(name) : false))
        .then(Promise.all.bind(Promise))
        .then((upgrades: boolean[]) => packageNames.filter((name, i) => upgrades[i]))
        .then((upgradablePackages: string[]) => upgradablePackages
            .map((name) => vsc.window.showInformationMessage(name + ' can be upgraded',
                { title: 'upgrade', name: name }))
            .map((message) => message.then((choice) => ({
                name: choice && choice.name,
                installers: choice
                    ? packageInstallers.get(choice.name)
                    : <mpkg.Installer[]>[]
            }))).map((installersPromise) => installersPromise.then((results) => {
                let fallbackInstaller = results.installers
                    .find((installer) => installer.name === 'fallback');

                if (fallbackInstaller) {
                    return fallbackInstaller.install(output.append.bind(output))
                        .then(vsc.window.showInformationMessage.bind(vsc.window,
                            results.name + ' was upgraded'));
                }
            })))
        .then(Promise.all.bind(Promise))
        .then(start.bind(null, context))
        .catch(console.log.bind(console));
};

export function deactivate() {
    if (server) {
        server.stop();
    }
};

export function start(context: vsc.ExtensionContext) {
    if (vsc.workspace.rootPath) {
        tasks = new Tasks();
        context.subscriptions.push(tasks);
    }

    let dub = new Dub(output);
    let provider = new Provider();

    output.show(true);
    context.subscriptions.push(output, dub);

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

            if (vsc.workspace.rootPath) {
                server.importSelections(context.subscriptions);
            }
        });

        context.subscriptions.push(completionProvider, signatureProvider, definitionProvider, hoverProvider);

        if (vsc.workspace.rootPath) {
            return server.importSelections(context.subscriptions);
        }
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
        let codeActionsProvider = vsc.languages.registerCodeActionsProvider(D_MODE, provider);
        let diagnosticCollection = vsc.languages.createDiagnosticCollection();

        Dscanner.collection = diagnosticCollection;

        vsc.workspace.onDidSaveTextDocument(dscannerUtil.lintDocument.bind(dscannerUtil));
        vsc.workspace.onDidOpenTextDocument(dscannerUtil.lintDocument.bind(dscannerUtil));
        vsc.workspace.textDocuments.forEach(dscannerUtil.lintDocument.bind(dscannerUtil));
        vsc.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri);
        });

        context.subscriptions.push(documentSymbolProvider, workspaceSymbolProvider, codeActionsProvider, diagnosticCollection);
    };

    let tasksFile: string;

    if (vsc.workspace.rootPath) {
        tasksFile = path.join(vsc.workspace.rootPath, '.vscode', 'tasks.json')

        fs.stat(tasksFile, (err) => {
            if (err) {
                tasksGenerator = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Right);
                tasksGenerator.command = 'dlang.default-tasks';
                tasksGenerator.text = '$(list-unordered) Generate default tasks';
                tasksGenerator.tooltip = 'Generate default tasks in .vscode for building with dub';
                tasksGenerator.color = 'yellow';
                tasksGenerator.show();
            }
        });
    }

    return registerCommands(context.subscriptions, dub)
        .then(dcdClientTool.setup.bind(dcdClientTool))
        .then(dcdServerTool.setup.bind(dcdServerTool))
        .then(dfmtTool.setup.bind(dfmtTool))
        .then(dscannerTool.setup.bind(dscannerTool))
        .then(() => {
            if (vsc.workspace.rootPath) {
                let tasksWatcher = vsc.workspace.createFileSystemWatcher(tasksFile);

                tasksWatcher.onDidCreate(tasks.showChoosers.bind(tasks), null, context.subscriptions);
                tasksWatcher.onDidChange(tasks.updateChoosers.bind(tasks), null, context.subscriptions);
                tasksWatcher.onDidDelete(tasks.hideChoosers.bind(tasks), null, context.subscriptions);
                tasks.showChoosers();

                context.subscriptions.push(tasksWatcher);
            }
        });
};

function registerCommands(subscriptions: vsc.Disposable[], dub: Dub) {
    subscriptions.push(vsc.commands.registerCommand('dlang.default-tasks', () => {
        tasks.createFile();

        if (tasksGenerator) {
            tasksGenerator.dispose();
        }
    }));

    let packageNames = Array.from(packageInstallers.keys());

    subscriptions.push(vsc.commands.registerCommand('dlang.install', () => {
        let installedPackageName: string;
        let size: number;

        Promise.all(packageNames.map(mpkg.isInstalled.bind(mpkg)))
            .then((installed) => packageNames.filter((name, i) => !installed[i]))
            .then((names: string[]) => {
                size = names.length;
                return vsc.window.showQuickPick(names);
            }).then((packageName) => {
                if (!packageName) {
                    throw new Error('No tool selected');
                }

                installedPackageName = packageName;

                if (packageInstallers.get(packageName).length > 1) {
                    return vsc.window.showInformationMessage(`Install ${packageName} using...`,
                        ...packageInstallers.get(packageName).map((installer) => installer.prettyName))
                        .then((choice) => ({
                            name: packageName,
                            installer: packageInstallers.get(packageName)
                                .find((installer) => installer.prettyName === choice)
                        }));
                }

                return { name: packageName, installer: packageInstallers.get(packageName)[0] };
            }).then((result) => {
                if (result) {
                    result.installer.install(output.append.bind(output))
                        .then(vsc.window.showInformationMessage.bind(vsc.window, result.name + ' is now installed'));

                    return size <= 1;
                }

                return false;
            }).then((hideToolsInstaller) => {
                if (hideToolsInstaller) {
                    toolsInstaller.dispose();
                }
            }).catch(console.log.bind(console));
    }));

    Promise.all(packageNames.map(mpkg.isInstalled.bind(mpkg)))
        .then((installed) => {
            if (installed.indexOf(false) !== -1) {
                toolsInstaller.show();
            }
        });

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

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.fetch', () =>
        vsc.window.showInputBox({
            prompt: 'The package to search for',
            placeHolder: 'Package name'
        }).then((packageName) => dub.search(packageName))
            .then((packages: any[]) => vsc.window.showQuickPick(packages
                .map(packageToQuickPickItem),
                { matchOnDescription: true }))
            .then((result: any) => {
                if (result) {
                    dub.fetch(result.label);
                }
            })));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.remove', () =>
        dub.list().then((packages) =>
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
            }))));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.upgrade', dub.upgrade.bind(dub)));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.convert', () =>
        vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Conversion format' })
            .then((format) => {
                if (format) {
                    dub.convert(format);
                }
            })));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.dustmite', dub.dustmite.bind(dub)));

    subscriptions.push(vsc.commands.registerCommand('dlang.tasks.compiler', () =>
        vsc.window.showQuickPick(Tasks.compilers).then((compiler) => {
            if (compiler) {
                tasks.compiler = compiler;
            }
        })));

    subscriptions.push(vsc.commands.registerCommand('dlang.tasks.build', () =>
        vsc.window.showQuickPick(Tasks.builds).then((build) => {
            if (build) {
                tasks.build = build;
            }
        })));

    subscriptions.push(vsc.commands.registerCommand('dlang.actions.config', (code: string) => {
        dscannerConfig.mute(code);
    }));

    dscannerUtil.fixes.forEach((fix, issue) => {
        if (fix.action) {
            subscriptions.push(vsc.commands.registerTextEditorCommand(fix.command.command, fix.action));
        }
    });

    let dfixTool = new Tool('dfix');
    let dProfileViewerTool = new Tool('d-profile-viewer', { configName: 'dProfileViewer' });

    dfixTool.activate = () => {
        Dfix.toolDirectory = dfixTool.toolDirectory;
        Dfix.toolFile = dfixTool.toolFile || 'dfix';

        subscriptions.push(vsc.commands.registerCommand('dlang.actions.dfix', (diagnostic: vsc.Diagnostic, uri: vsc.Uri) => {
            let applyDfix = (document: vsc.TextDocument) => document
                .save()
                .then(() => {
                    let changeDisposable = vsc.workspace.onDidChangeTextDocument((event) => {
                        new Dscanner(event.document, null, dscannerUtil.Operation.Lint);
                        changeDisposable.dispose();
                    });

                    return new Promise((resolve) => new Dfix(document.fileName, resolve));
                });

            if (uri) {
                return vsc.workspace.openTextDocument(uri).then(applyDfix);
            }

            let choices = ['Run on open file(s)', 'Run on workspace'];

            vsc.window.showQuickPick(choices).then((value) => {
                if (value === choices[0]) {
                    vsc.workspace.textDocuments.forEach(applyDfix);
                } else {
                    vsc.workspace.saveAll(false).then(() => {
                        new Dfix(vsc.workspace.rootPath, null);
                    });
                }
            });
        }));
    };

    dProfileViewerTool.activate = () => {
        DProfileViewer.toolDirectory = dProfileViewerTool.toolDirectory;
        DProfileViewer.toolFile = dProfileViewerTool.toolFile || 'd-profile-viewer';

        subscriptions.push(vsc.commands.registerCommand('dlang.d-profile-viewer', () =>
            new Promise((resolve) => {
                new DProfileViewer(vsc.workspace.rootPath, resolve);
            }).then(() => {
                vsc.commands.executeCommand('vscode.previewHtml',
                    vsc.Uri.file(path.join(vsc.workspace.rootPath, 'trace.html')));
            })));
    };

    return dfixTool.setup().then(dProfileViewerTool.setup.bind(dProfileViewerTool));
}
