'use strict';

import * as vsc from 'vscode';
import Dub from './dub';
import CompletionProvider from './provider';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import {D_MODE} from './mode';

export function activate(context: vsc.ExtensionContext) {
    if (Dub.check()) {
        vsc.window.showErrorMessage('Dub command not found');
        return;
    }

    let dub = new Dub();
    let provider = new CompletionProvider();

    context.subscriptions.push(dub);

    Promise.all([dub.fetch('dcd'), dub.fetch('dfmt'), dub.fetch('dscanner')])
        .then(dub.build.bind(dub, 'dcd', 'server'))
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