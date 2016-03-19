'use strict';

import * as ev from 'events';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import Server from './server';
import types from './types';

export default class Client extends ev.EventEmitter {
    public static path: string;
    private _client: cp.ChildProcess;

    public constructor(position: number, private _token: vsc.CancellationToken) {
        super();

        this._client = cp.spawn(Client.path + 'dcd-client', ['-c', String(position)]);

        this._client.on('exit', (code: number) => {
            if (code) {
                this.emit('error');
            }
        });
    }

    public write(text: string, resolve: Function) {
        let reader = rl.createInterface({ input: this._client.stdout, output: null });
        let completions: vsc.CompletionItem[] = [];
        let completionType: string = null;

        this._token.onCancellationRequested((e) => {
            resolve();
        });

        reader.on('line', (line: string) => {
            let parts = line.split('\t');

            switch (completionType) {
                case 'identifiers':
                    let item = new vsc.CompletionItem(parts[0]);

                    item.kind = types.get(parts[1]);
                    completions.push(item);

                    break;

                case 'calltips':
                    // TODO
                    break;

                default:
                    completionType = line;
                    break;
            }
        });

        reader.on('close', () => {
            resolve(completions);
        });

        this._client.stdin.write(text);
        this._client.stdin.end();
    }
}