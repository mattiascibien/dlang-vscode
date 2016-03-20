'use strict';

import * as ev from 'events';
import * as vsc from 'vscode';
import Client from './dcd/client';
import * as util from './dcd/util';

export default class Provider extends ev.EventEmitter
    implements vsc.CompletionItemProvider, vsc.DefinitionProvider {
    public provideCompletionItems(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, util.Operation.Completion);
    }

    public provideDefinition(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, util.Operation.Definition);
    }

    private provide(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken,
        operation: util.Operation
    ) {
        let bufferPos = document.offsetAt(position);
        let client = new Client(document, bufferPos, token, operation);

        client.on('error', () => {
            this.emit('restart');
        })

        return new Promise((resolve) => {
            client.execute(resolve);
        });
    }
}