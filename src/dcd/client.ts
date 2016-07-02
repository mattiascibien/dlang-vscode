'use strict';

import * as ev from 'events';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import Server from './server';
import * as util from './util';

export default class Client extends ev.EventEmitter {
    public static path: string;
    private _client: cp.ChildProcess;
    private _commas: number;

    public constructor(
        private _document: vsc.TextDocument,
        private _position: vsc.Position,
        private _token: vsc.CancellationToken,
        private _operation: util.Operation
    ) {
        super();

        let args = ['-c', String(this.getCompletionPosition())];

        if (this._operation === util.Operation.Definition) {
            args.push('-l');
        } else if (this._operation === util.Operation.Documentation) {
            args.push('-d');
        }

        this._client = cp.spawn(path.join(Client.path, 'dcd-client'), args.concat(util.getTcpArgs()));

        this._client.on('exit', (code: number) => {
            if (code) {
                this.emit('error');
            }
        });
    }

    public execute(resolve: Function, reject: Function) {
        let reader = rl.createInterface(this._client.stdout, null);
        let completions: vsc.CompletionItem[] = [];
        let signatureHelp = new vsc.SignatureHelp();
        let completionType: string;

        switch (this._operation) {
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

        this._token.onCancellationRequested(() => {
            this._client.kill();
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
                    signatureHelp.signatures.push(this.getSignatureInformation(line));
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
                                let text = data.toString().slice(0, Number(parts[1])); // TODO : can go too far
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

        if (this._operation === util.Operation.Completion || this._operation === util.Operation.Calltips) {
            reader.on('close', () => {
                switch (completionType) {
                    case null:
                        reject();
                        break;

                    case 'identifiers':
                        resolve(completions);
                        break;

                    default:
                        let infoLine = this._document.lineAt(this._position.line).text;
                        let infoArgs = infoLine.substring(infoLine.lastIndexOf('(', this._position.character), this._position.character);
                        let infoNumArg = infoArgs.match(/,/g);

                        signatureHelp.activeParameter = infoNumArg ? infoNumArg.length : 0;
                        resolve(signatureHelp);

                        break;
                }
            });
        }

        this._client.stdin.end(this._document.getText());
    }

    private getCompletionPosition() {
        if (this._operation === util.Operation.Calltips) {
            let text = this._document.getText(new vsc.Range(new vsc.Position(0, 0), this._position));

            if (text.lastIndexOf(')') < text.lastIndexOf('(')) {
                return text.lastIndexOf('(') + 1;
            }
        }

        return this._document.offsetAt(this._position);
    }

    private getSignatureInformation(line: string) {
        let lineArgs = line.substring(line.lastIndexOf('(') + 1, line.lastIndexOf(')')).split(/\s*,\s*/);
        let information = new vsc.SignatureInformation(line);

        lineArgs.forEach((arg) => {
            information.parameters.push(new vsc.ParameterInformation(arg));
        });

        return information;
    }
};