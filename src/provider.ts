'use strict';

import * as ev from 'events';
import * as vsc from 'vscode';
import Client from './dcd/client';
import * as util from './dcd/util';

export default class Provider extends ev.EventEmitter implements vsc.CompletionItemProvider {
    public provideCompletionItems(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        let bufferPos = document.offsetAt(position);
        let client = new Client(bufferPos, util.Operation.Completion, token);

        client.on('error', () => {
            this.emit('restart');
        })

        return new Promise((resolve) => {
            client.write(document.getText(), resolve);
        });
    }
}