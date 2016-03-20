'use strict';

import * as ev from 'events';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import Server from './server';
import * as util from './util';

export default class Client extends ev.EventEmitter {
    public static path: string;
    private _client: cp.ChildProcess;

    public constructor(
        private _document: vsc.TextDocument,
        position: number,
        private _token: vsc.CancellationToken,
        private _op: util.Operation
    ) {
        super();

        let args = ['-c', String(position)];

        if (this._op === util.Operation.Definition) {
            args.push('-l');
        } else if (this._op === util.Operation.Documentation) {
            args.push('-d');
        }

        this._client = cp.spawn(Client.path + 'dcd-client', args);

        this._client.on('exit', (code: number) => {
            if (code) {
                this.emit('error');
            }
        });
    }

    public execute(resolve: Function) {
        let reader = rl.createInterface({ input: this._client.stdout, output: null });
        let completions: vsc.CompletionItem[] = [];
        let completionType: string;

        switch (this._op) {
            case util.Operation.Definition:
                completionType = 'definition';
                break;

            case util.Operation.Documentation:
                completionType = 'documentation';
                break;

            default:
                completionType = null;
                break;
        }

        this._token.onCancellationRequested((e) => {
            resolve();
        });

        reader.on('line', (line: string) => {
            let parts = line.split('\t');

            switch (completionType) {
                case 'identifiers':
                    let item = new vsc.CompletionItem(parts[0]);

                    item.kind = util.types.get(parts[1]);
                    completions.push(item);

                    break;

                case 'calltips':
                    // TODO
                    break;

                case 'definition':
                    let filename = parts[0] === 'stdin' ? this._document.fileName : parts[0];

                    resolve(parts.length > 1
                        ? new vsc.Location(vsc.Uri.file(filename), this._document.positionAt(Number(parts[1])))
                        : null);

                    break;

                default:
                    completionType = line;
                    break;
            }
        });

        reader.on('close', () => {
            resolve(completions);
        });

        this._client.stdin.write(this._document.getText());
        this._client.stdin.end();
    }
}