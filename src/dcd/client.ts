'use strict';

import * as ev from 'events';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as fs from 'fs';
import * as os from 'os';
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

    public execute(resolve: Function, reject: Function) {
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
            reject();
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
                    if (parts.length < 2) {
                        reject();
                        return;
                    }

                    let filename = parts[0];
                    let position = this._document.positionAt(Number(parts[1]));

                    if (filename === 'stdin') {
                        resolve(new vsc.Location(vsc.Uri.file(this._document.fileName), position));
                    } else {
                        fs.readFile(filename, (err, data) => {
                            if (!err) {
                                let text = data.toString().slice(0, Number(parts[1])); // FIXME : can go too far
                                position = new vsc.Position(text.match(new RegExp(os.EOL, 'g')).length,
                                    text.slice(text.lastIndexOf(os.EOL)).length - 1);

                                resolve(new vsc.Location(vsc.Uri.file(filename), position));
                            }
                        });
                    }

                    break;

                default:
                    completionType = line;
                    break;
            }
        });

        if (this._op === util.Operation.Completion) {
            reader.on('close', () => {
                resolve(completions);
            });
        }

        this._client.stdin.write(this._document.getText());
        this._client.stdin.end();
    }
}