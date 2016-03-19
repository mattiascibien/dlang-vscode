'use strict';

import * as vsc from 'vscode';
import Dub from './dub';
import Server from './server';
import Client from './client';
import Provider from './provider';

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