'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';
import * as mpkg from 'meta-pkg';
import * as dscannerUtil from './dscanner/util';
import * as dscannerConfig from './dscanner/config';
import * as misc from './misc';
import Dub from './dub';
import Provider from './provider';
import Dfix from './dfix';
import DProfileViewer from './d-profile-viewer';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import Dscanner from './dscanner/dscanner';

let toolsInstaller: vsc.StatusBarItem;
let tasksGenerator: vsc.StatusBarItem;
let packageInstallers = new Map<string, mpkg.Installer[]>();
let server: Server;
let output = vsc.window.createOutputChannel('D language');

class Tool {
    public static dub: Dub;
    public activate: Function;
    private _name: string;
    private _version: string;
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
        return Tool.dub.search(this._name)
            .then((packages) => packages.find((pkg) => pkg.name === this._name))
            .then((pkg) => {
                this._version = pkg.version;
                return Tool.dub.fetch(this._name, pkg ? pkg.version : undefined);
            });
    }

    public build() {
        return Tool.dub.list()
            .then((packages) => packages.find((p) => p.name === this._name && p.version === this._version))
            .then((pkg) => {
                this._toolDirectory = pkg.path;
                return Tool.dub.build(pkg, 'release', this._buildConfig);
            });
    }

    public setup(progress?: vsc.Progress<{ message?: string }>) {
        let toolEnabled = vsc.workspace.getConfiguration('d.tools.enabled').get<boolean>(this._configName);

        if (progress) {
            progress.report({ message: 'Setting up ' + this._name });
        }

        if (!toolEnabled) {
            return Promise.resolve(undefined);
        }

        let toolPath = vsc.workspace.getConfiguration('d.tools')
            .get<string>(this._configName + (this._buildConfig ? '.' + this._buildConfig : ''));

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

export function activate(context: vsc.ExtensionContext) {
    let packageNames = ['dmd', 'ldc', 'gdc', 'dub'];
    let packagePromises = packageNames
        .map((packageName) => path.join(__dirname, '..', '..', 'packages', packageName + '.json'))
        .map((p) => new Promise((resolve) => fs.readFile(p, (err, data) => resolve(data.toString()))));

    return Promise.all(packagePromises)
        .then((packagesStrings: string[]) => packagesStrings.map(JSON.parse.bind(JSON)))
        .then((packages: mpkg.Package[]) => packages.forEach(mpkg.registerPackage))
        .then(() => packageNames.map(mpkg.getInstallers))
        .then((promises) => Promise.all(promises))
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
        }).then(() => packageNames.map(mpkg.isInstalled))
        .then((promises) => Promise.all(promises))
        .then((installed: boolean[]) => packageNames
            .map((name, i) => installed[i] ? mpkg.isUpgradable(name) : false))
        .then((promises) => Promise.all(promises))
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
        .then((promises) => Promise.all(promises))
        .then(start.bind(null, context))
        .then(() => ({
            dcd: {
                server: {
                    start: () => server.start(),
                    stop: () => server.stop()
                }
            }
        }))
        .catch(console.log.bind(console));
};

export function deactivate() {
    if (server) {
        server.stop();
    }
};

function start(context: vsc.ExtensionContext) {
    let dub = new Dub(output);
    let provider = new Provider();

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

        let completionProvider = vsc.languages.registerCompletionItemProvider(misc.D_MODE, provider, '.');
        let signatureProvider = vsc.languages.registerSignatureHelpProvider(misc.D_MODE, provider, '(', ',');
        let definitionProvider = vsc.languages.registerDefinitionProvider(misc.D_MODE, provider);
        let hoverProvider = vsc.languages.registerHoverProvider(misc.D_MODE, provider);

        provider.on('restart', () => {
            output.appendLine('DCD : restarting server...');
            server.start();

            if (vsc.workspace.workspaceFolders) {
                vsc.workspace.workspaceFolders.forEach((f) =>
                    server.importSelections(f.uri.fsPath, context.subscriptions));
            }
        });

        context.subscriptions.push(completionProvider, signatureProvider, definitionProvider, hoverProvider);

        let importSelections = (added: vsc.WorkspaceFolder[], removed: vsc.WorkspaceFolder[]) =>
            Promise.all(added.map((f) => server.importSelections(f.uri.fsPath, context.subscriptions))
                .concat(removed.map((f) => server.unimportSelections(f.uri.fsPath, context.subscriptions))));

        vsc.workspace.onDidChangeWorkspaceFolders((event) => importSelections(event.added, event.removed));

        if (vsc.workspace.workspaceFolders) {
            return importSelections(vsc.workspace.workspaceFolders, []);
        }
    };

    dfmtTool.activate = () => {
        Dfmt.toolDirectory = dfmtTool.toolDirectory;
        Dfmt.toolFile = dfmtTool.toolFile || 'dfmt';

        let formattingProvider = vsc.languages.registerDocumentFormattingEditProvider(misc.D_MODE, provider);

        context.subscriptions.push(formattingProvider);
    };

    dscannerTool.activate = () => {
        Dscanner.toolDirtory = dscannerTool.toolDirectory;
        Dscanner.toolFile = dscannerTool.toolFile || 'dscanner';

        let documentSymbolProvider = vsc.languages.registerDocumentSymbolProvider(misc.D_MODE, provider);
        let workspaceSymbolProvider = vsc.languages.registerWorkspaceSymbolProvider(provider);
        let codeActionsProvider = vsc.languages.registerCodeActionsProvider(misc.D_MODE, provider);
        let diagnosticCollection = vsc.languages.createDiagnosticCollection();

        Dscanner.collection = diagnosticCollection;

        vsc.workspace.onDidSaveTextDocument(dscannerUtil.lintDocument.bind(dscannerUtil));
        vsc.workspace.onDidOpenTextDocument(dscannerUtil.lintDocument.bind(dscannerUtil));
        vsc.workspace.textDocuments.forEach(dscannerUtil.lintDocument.bind(dscannerUtil));
        vsc.workspace.onDidCloseTextDocument((document) => diagnosticCollection.delete(document.uri));

        context.subscriptions.push(documentSymbolProvider, workspaceSymbolProvider, codeActionsProvider, diagnosticCollection);
    };

    return vsc.window.withProgress({ location: vsc.ProgressLocation.Window },
        (progress) => registerCommands(context.subscriptions, dub, progress)
            .then(dcdClientTool.setup.bind(dcdClientTool, progress))
            .then(dcdServerTool.setup.bind(dcdServerTool, progress))
            .then(dfmtTool.setup.bind(dfmtTool, progress))
            .then(dscannerTool.setup.bind(dscannerTool, progress))
            .then(() => context.subscriptions.push(vsc.workspace.registerTaskProvider('dub', provider))));
}

function registerCommands(subscriptions: vsc.Disposable[], dub: Dub, progress: vsc.Progress<{ message: string }>) {
    let packageNames = Array.from(packageInstallers.keys());

    subscriptions.push(vsc.commands.registerCommand('dlang.install', () => {
        let installedPackageName: string;
        let size: number;

        Promise.all(packageNames.map(mpkg.isInstalled))
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

    Promise.all(packageNames.map(mpkg.isInstalled))
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
        if (!vsc.workspace.workspaceFolders) {
            return;
        }

        const initOptions: any[] = [
            {
                prompt: 'Name of the package',
                placeHolder: 'Name'
            },
            {
                prompt: 'Brief description of the package',
                placeHolder: 'Description'
            },
            {
                prompt: 'Name of the author of the package',
                placeHolder: 'Author name',
                value: process.env.USERNAME
            },
            {
                prompt: 'License of the package',
                placeHolder: 'License'
            },
            {
                prompt: 'Copyright of the package',
                placeHolder: 'Copyright'
            }
        ];

        let thenable = misc.chooseRootPath().then((rp) => initOptions[0].value = path.basename(rootPath = rp))
            .then(() => vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Recipe format' }));

        let rootPath: string;
        let initEntries: string[] = [];

        initOptions.forEach((options) => {
            thenable = thenable.then((result) => {
                initEntries.push(result || '');
                return vsc.window.showInputBox(options);
            });
        });

        thenable.then((result) => {
            initEntries.push(result);
            dub.init(rootPath, initEntries);
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
            vsc.window.showQuickPick(packages
                .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
                .map(packageToQuickPickItem), { matchOnDescription: true }).then((result) => {
                    if (result) {
                        dub.remove(result.label, result.description);
                    }
                }))));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.upgrade', () =>
        misc.chooseRootPath().then((rootPath) => dub.upgrade(rootPath))));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.convert', () =>
        misc.chooseRootPath().then((rootPath) =>
            vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Conversion format' })
                .then((format) => {
                    if (format) {
                        dub.convert(rootPath, format);
                    }
                }))));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.dustmite', () => {
        if (!vsc.workspace.workspaceFolders) {
            return;
        }

        misc.chooseRootPath().then(dub.dustmite.bind(dub));
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.actions.config',
        (code: string) => dscannerConfig.mute(code)));

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

            let choices = ['Run on open file(s)', 'Run everywhere'];

            vsc.window.showQuickPick(choices).then((value) => {
                if (value === choices[0]) {
                    vsc.workspace.textDocuments.forEach(applyDfix);
                } else if (vsc.workspace.workspaceFolders) {
                    vsc.workspace.saveAll(false).then(() =>
                        vsc.workspace.workspaceFolders.forEach((f) => new Dfix(f.uri.fsPath, () => null)));
                }
            });
        }));
    };

    dProfileViewerTool.activate = () => {
        DProfileViewer.toolDirectory = dProfileViewerTool.toolDirectory;
        DProfileViewer.toolFile = dProfileViewerTool.toolFile || 'd-profile-viewer';

        subscriptions.push(vsc.commands.registerCommand('dlang.d-profile-viewer', () => {
            if (vsc.workspace.workspaceFolders) {
                return misc.chooseRootPath()
                    .then((rootPath) => new Promise((resolve) => new DProfileViewer(rootPath, resolve))
                        .then(() => vsc.commands.executeCommand('vscode.previewHtml',
                            vsc.Uri.file(path.join(rootPath, 'trace.html')))));
            }
        }));
    };

    return dfixTool.setup(progress).then(dProfileViewerTool.setup.bind(dProfileViewerTool, progress));
}
