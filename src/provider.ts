'use strict';

import * as ev from 'events';
import * as vsc from 'vscode';
import Server from './dcd/server';
import Client from './dcd/client';
import * as util from './dcd/util';
import Dfmt from './dfmt';

export default class Provider extends ev.EventEmitter implements
    vsc.CompletionItemProvider,
    vsc.SignatureHelpProvider,
    vsc.DefinitionProvider,
    vsc.DocumentFormattingEditProvider {
    public provideCompletionItems(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, util.Operation.Completion);
    }

    public provideSignatureHelp(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, util.Operation.Calltips);
    }

    public provideDefinition(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, util.Operation.Definition);
    }

    public provideDocumentFormattingEdits(
        document: vsc.TextDocument,
        options: vsc.FormattingOptions,
        token: vsc.CancellationToken
    ) {
        let dfmt = new Dfmt(document, options, token);

        return new Promise((resolve, reject) => {
            dfmt.execute(resolve, reject);
        });
    }

    private provide(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken,
        operation: util.Operation
    ) {
        let client = new Client(document, position, token, operation);

        client.on('error', () => {
            if (!Server.instanceLaunched) {
                this.emit('restart');
            }
        })

        return new Promise((resolve, reject) => {
            client.execute(resolve, reject);
        });
    }
}