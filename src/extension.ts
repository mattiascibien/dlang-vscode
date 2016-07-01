'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';
import tasks from './tasks';
import Dub from './dub';
import Provider from './provider';
import Dfix from './dfix';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import Dscanner from './dscanner';
import {D_MODE} from './mode';

let server: Server;

export function activate(context: vsc.ExtensionContext) {
    if (Dub.check()) {
        vsc.window.showErrorMessage('Dub command not found');
        return;
    }

    let dub = new Dub();
    let provider = new Provider();

    context.subscriptions.push(dub);
    Promise.all([registerCommands(context.subscriptions, dub), dub.fetch('dcd'), dub.fetch('dfmt'), dub.fetch('dscanner')])
        .then(dub.build.bind(dub, 'dcd', 'server'))
        .then(dub.build.bind(dub, 'dcd', 'client'))
        .then(() => {
            Server.path = Client.path = dub.packages.get('dcd').path;
            Server.dub = dub;

            server = new Server(dub.paths);
            let completionProvider = vsc.languages.registerCompletionItemProvider(D_MODE, provider, '.');
            let signatureProvider = vsc.languages.registerSignatureHelpProvider(D_MODE, provider, '(', ',');
            let definitionProvider = vsc.languages.registerDefinitionProvider(D_MODE, provider);

            provider.on('restart', () => {
                server.start(dub.paths);
            });

            context.subscriptions.push(completionProvider);
            context.subscriptions.push(signatureProvider);
            context.subscriptions.push(definitionProvider);
        })
        .then(dub.build.bind(dub, 'dfmt'))
        .then(() => {
            Dfmt.path = dub.packages.get('dfmt').path;

            let formattingProvider = vsc.languages.registerDocumentFormattingEditProvider(D_MODE, provider);

            context.subscriptions.push(formattingProvider);
        })
        .then(dub.build.bind(dub, 'dscanner'))
        .then(() => {
            Dscanner.path = dub.packages.get('dscanner').path;

            let diagnosticCollection = vsc.languages.createDiagnosticCollection();
            let lintDocument = (document: vsc.TextDocument) => {
                if (document.languageId === 'd') {
                    new Dscanner(document);
                }
            };

            Dscanner.collection = diagnosticCollection;

            vsc.workspace.onDidSaveTextDocument(lintDocument);
            vsc.workspace.onDidOpenTextDocument(lintDocument);
            vsc.workspace.textDocuments.forEach(lintDocument);

            context.subscriptions.push(diagnosticCollection);
        });
};

export function deactivate() {
    if (server) {
        server.stop();
    }
};

function registerCommands(subscriptions: vsc.Disposable[], dub: Dub) {
    let jsb = require('js-beautify').js_beautify;

    subscriptions.push(vsc.commands.registerCommand('dlang.default-tasks',
        fs.mkdir.bind(null, path.join(vsc.workspace.rootPath, '.vscode'),
            fs.writeFile.bind(null, path.join(vsc.workspace.rootPath, '.vscode', 'tasks.json'),
                jsb(JSON.stringify(tasks))))));

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

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.fetch', () => {
        vsc.window.showInputBox({
            prompt: 'The package to search for',
            placeHolder: 'Package name'
        }).then((name) => {
            return vsc.window.showQuickPick(dub.search(name), { matchOnDescription: true });
        }).then((arg) => {
            if (arg) {
                dub.fetch(arg.label);
            }
        });
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.remove', () => {
        let packages: string[] = [];

        dub.packages.forEach((value, name) => {
            packages.push(name);
        });

        vsc.window.showQuickPick(packages).then(dub.remove.bind(dub));
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.upgrade', () => {
        dub.upgrade();
    }));

    subscriptions.push(vsc.commands.registerCommand('dlang.dub.convert', () => {
        vsc.window.showQuickPick(['json', 'sdl'], { placeHolder: 'Conversion format' }).then(dub.convert.bind(dub));
    }));

    return dub.fetch('dfix')
        .then(dub.build.bind(dub, 'dfix'))
        .then(() => {
            Dfix.path = dub.packages.get('dfix').path;

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