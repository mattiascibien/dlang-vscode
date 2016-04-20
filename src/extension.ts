'use strict';

import * as vsc from 'vscode';
import Dub from './dub';
import Provider from './provider';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import {D_MODE} from './mode';
import * as request from 'request';

export function activate(context: vsc.ExtensionContext) {
    if (Dub.check()) {
        vsc.window.showErrorMessage('Dub command not found');
        return;
    }

    let dub = new Dub();
    let provider = new Provider();

    context.subscriptions.push(dub);

    Promise.all([dub.fetch('dcd'), dub.fetch('dfmt'), dub.fetch('dscanner')])
        .then(dub.build.bind(dub, 'dcd', 'server'))
        .then(() => {
            
            vsc.commands.registerCommand("extension.dub-install", (args) => {
                request('http://code.dlang.org/packages/index.json', function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        let pkgs = JSON.parse(body);
                        
                        vsc.window.showQuickPick(pkgs).then(function (pkg) {   
                            dub.fetch(pkg, true).then(function(result) {
                                vsc.window.showInformationMessage("Package '" + pkg + "' installed succesfully.");
                            }); 
                        })
                    }
                    else {
                        vsc.window.showErrorMessage("Cannot query dub online API for packages");
                    }
                })
            });
            
            vsc.commands.registerCommand("extension.dub-uninstall", (args) => {
                let installedPackages = dub.packages;
                
                let quickPickItems = new Array<vsc.QuickPickItem>();
                
                installedPackages.forEach(function(pkg, name) {
                    quickPickItems.push({
                        label: name,
                        description: pkg.version,
                    });
                });
                
                vsc.window.showQuickPick(quickPickItems).then(function (pkg) {
                    dub.remove(pkg.label).then(function(result) {
                        vsc.window.showInformationMessage("Package '" + pkg.label + "' removed succesfully.");
                    }); 
                })
            });
            
        })
        .then(() => {
            Server.path = Client.path = dub.packages.get('dcd').path;

            let server = new Server(dub.paths);
            let completionProvider = vsc.languages.registerCompletionItemProvider(D_MODE, provider, '.');
            let signatureProvider = vsc.languages.registerSignatureHelpProvider(D_MODE, provider, '(', ',');
            let definitionProvider = vsc.languages.registerDefinitionProvider(D_MODE, provider);
            
            provider.on('restart', () => {
                server.start(dub.paths);
            });

            context.subscriptions.push(server);
            context.subscriptions.push(completionProvider);
            context.subscriptions.push(signatureProvider);
            context.subscriptions.push(definitionProvider);
        }).then(dub.build.bind(dub, 'dcd', 'client'))
        .then(dub.build.bind(dub, 'dfmt'))
        .then(() => {
            Dfmt.path = dub.packages.get('dfmt').path;

            let formattingProvider = vsc.languages.registerDocumentFormattingEditProvider(D_MODE, provider);

            context.subscriptions.push(formattingProvider);
        });
}

export function deactivate() { }