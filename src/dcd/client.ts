'use strict';

import * as ev from 'events';
import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as util from './util';

export default class Client extends ev.EventEmitter {
    public static toolDirectory = '';
    public static toolFile = '';
    private _client: cp.ChildProcess;

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

        this._client = cp.spawn(path.join(Client.toolDirectory, Client.toolFile), args.concat(util.getTcpArgs()));
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
            let parts = line.split(/\s+/);

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
                    if (parts.length < 2 || isNaN(Number(parts[1]))) {
                        reject();
                        return;
                    }

                    let documentThenable: Thenable<vsc.TextDocument>;
                    let filename = parts[0];

                    if (filename === 'stdin') {
                        documentThenable = new Promise((res) => res(this._document));
                    } else {
                        documentThenable = vsc.workspace.openTextDocument(filename);
                    }

                    documentThenable.then((document) =>
                        resolve(new vsc.Location(document.uri, document.positionAt(Number(parts[1])))));

                    break;

                case 'documentation':
                    if (line.length) {
                        resolve(new vsc.Hover(parseDoc(line)));
                    } else {
                        reject();
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

                    case 'calltips':
                        let infoLine = this._document.lineAt(this._position.line).text;
                        let infoArgs = infoLine.substring(infoLine.lastIndexOf('(', this._position.character), this._position.character);
                        let infoNumArg = infoArgs.match(/,/g);

                        signatureHelp.activeParameter = infoNumArg ? infoNumArg.length : 0;
                        signatureHelp.activeSignature = 0;
                        resolve(signatureHelp);

                        break;
                }
            });
        }

        this._client.stdin.end(this._document.getText(), 'ascii');
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

        information.parameters = information.parameters
            .concat(lineArgs.map((arg) => new vsc.ParameterInformation(arg)));

        return information;
    }
};

function parseDoc(docLine: string) {
    let result: vsc.MarkedString[] = docLine
        .replace(/\$\(\w+\s*([^)]+?)\)/g, '`$1`')
        .replace(/(?!=\\)\\n/g, '\n')
        .replace('\\\\', '\\')
        .split(/-+\n/g);

    for (let i = 1; i < result.length; i += 2) {
        result[i] = {
            value: result[i].toString(),
            language: 'd'
        };
    }

    return result;
}