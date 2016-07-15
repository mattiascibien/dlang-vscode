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
import {D_MODE} from './mode';

let server: Server;
let tasks: Tasks;

export function activate(context: vsc.ExtensionContext) {
    if (Dub.check()) {
        vsc.window.showErrorMessage('Dub command not found');
        return;
    }

    tasks = new Tasks();

    let dub = new Dub();
    let provider = new Provider();

    context.subscriptions.push(tasks, dub);

    Promise.all([registerCommands(context.subscriptions, dub),
        dub.fetch('dcd'),
        dub.fetch('dfmt'),
        dub.fetch('dscanner')])
        .then(dub.getLatestVersion.bind(dub, 'dcd'))
        .then((p: any) => dub.build(p, 'server'))
        .then((p: any) => dub.build(p, 'client'))
        .then((p: any) => {
            Server.path = Client.path = p.path;
            Server.dub = dub;

            server = new Server();
            let completionProvider = vsc.languages.registerCompletionItemProvider(D_MODE, provider, '.');
            let signatureProvider = vsc.languages.registerSignatureHelpProvider(D_MODE, provider, '(', ',');
            let definitionProvider = vsc.languages.registerDefinitionProvider(D_MODE, provider);

            provider.on('restart', () => {
                server.start();
            });

            context.subscriptions.push(completionProvider, signatureProvider, definitionProvider);
        })
        .then(() => server.importSelections(context.subscriptions))
        .then(dub.getLatestVersion.bind(dub, 'dfmt'))
        .then(dub.build.bind(dub))
        .then((p: any) => {
            Dfmt.path = p.path;

            let formattingProvider = vsc.languages.registerDocumentFormattingEditProvider(D_MODE, provider);

            context.subscriptions.push(formattingProvider);
        })
        .then(dub.getLatestVersion.bind(dub, 'dscanner'))
        .then(dub.build.bind(dub))
        .then((p: any) => {
            Dscanner.path = p.path;

            let documentSymbolProvider = vsc.languages.registerDocumentSymbolProvider(D_MODE, provider);
            let workspaceSymbolProvider = vsc.languages.registerWorkspaceSymbolProvider(provider);
            let diagnosticCollection = vsc.languages.createDiagnosticCollection();
            let lintDocument = (document: vsc.TextDocument) => {
                if (document.languageId === 'd') {
                    new Dscanner(document, null, util.Operation.Lint);
                }
            };

            Dscanner.collection = diagnosticCollection;

            vsc.workspace.onDidSaveTextDocument(lintDocument);
            vsc.workspace.onDidOpenTextDocument(lintDocument);
            vsc.workspace.textDocuments.forEach(lintDocument);

            context.subscriptions.push(documentSymbolProvider, workspaceSymbolProvider, diagnosticCollection);
        })
        .then(() => {
            let tasksWatcher = vsc.workspace.createFileSystemWatcher(path.join(vsc.workspace.rootPath, '.vscode', 'tasks.json'));

            tasksWatcher.onDidCreate(tasks.showChoosers.bind(tasks), null, context.subscriptions);
            tasksWatcher.onDidChange(tasks.updateChoosers.bind(tasks), null, context.subscriptions);
            tasksWatcher.onDidDelete(tasks.hideChoosers.bind(tasks), null, context.subscriptions);
            tasks.showChoosers();

            context.subscriptions.push(tasksWatcher);
        });
};

export function deactivate() {
    if (server) {
        server.stop();
    }
};

function registerCommands(subscriptions: vsc.Disposable[], dub: Dub) {
    subscriptions.push(vsc.commands.registerCommand('dlang.default-tasks', tasks.createFile.bind(tasks)));

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
        }).then(dub.search.bind(dub)).then((packages: any) => {
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
        vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Conversion format' }).then(dub.convert.bind(dub));
    }));

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

    return Promise.all([dub.fetch('dfix'), dub.fetch('d-profile-viewer')])
        .then(dub.getLatestVersion.bind(dub, 'dfix'))
        .then(dub.build.bind(dub))
        .then((p: any) => {
            Dfix.path = p.path;

            subscriptions.push(vsc.commands.registerCommand('dlang.dfix', () => {
                let choices = ['Run on open file(s)', 'Run on workspace'];

                vsc.window.showQuickPick(choices).then((value) => {
                    if (value === choices[0]) {
                        vsc.workspace.textDocuments.forEach((document) => {
                            document.save().then(() => {
                                new Dfix(document.fileName);
                            });
                        })
                    } else {
                        vsc.workspace.saveAll(false).then(() => {
                            new Dfix(vsc.workspace.rootPath);
                        });
                    }
                });
            }));
        })
        .then(dub.getLatestVersion.bind(dub, 'd-profile-viewer'))
        .then(dub.build.bind(dub))
        .then((p: any) => {
            DProfileViewer.path = p.path;

            subscriptions.push(vsc.commands.registerCommand('dlang.d-profile-viewer', () => {
                return new Promise((resolve) => {
                    new DProfileViewer(vsc.workspace.rootPath, resolve);
                }).then(() => {
                    vsc.commands.executeCommand('vscode.previewHtml', vsc.Uri.file(path.join(vsc.workspace.rootPath, 'trace.html')));
                });
            }));
        });
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