'use strict';

import * as vsc from 'vscode';
import Dub from './dub';
import Provider from './provider';
import Server from './dcd/server';
import Client from './dcd/client';

const selector = { languages: 'd', scheme: 'file' };

export function activate(context: vsc.ExtensionContext) {
    if (Dub.check()) {
        vsc.window.showErrorMessage('Dub command not found');
        return;
    }

    let dub = new Dub();

    context.subscriptions.push(dub);

    dub.fetch('dcd').then(() => {
        return Promise.all([dub.build('dcd', 'server'), dub.build('dcd', 'client')]);
    }).then(() => {
        Server.path = Client.path = dub.packages.get('dcd').path;

        let server = new Server(dub.paths);
        let provider = new Provider();
        let itemProvider = vsc.languages.registerCompletionItemProvider(selector, provider, '.');

        provider.on('restart', () => {
            server.start(dub.paths);
        });

        context.subscriptions.push(server);
        context.subscriptions.push(itemProvider);
    });
}

export function deactivate() { }