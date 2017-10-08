'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as rep from './report';
import * as util from './util';

export default class Dscanner {
    public static toolDirtory = '';
    public static toolFile = '';
    public static collection: vsc.DiagnosticCollection;
    private _dscanner: cp.ChildProcess;

    public constructor(
        private _document: vsc.TextDocument,
        private _token: vsc.CancellationToken,
        private _operation: util.Operation
    ) {
        if (this._operation === util.Operation.Lint) {
            this.lint();
        } else {
            this._dscanner = cp.spawn(path.join(Dscanner.toolDirtory, Dscanner.toolFile), ['--ctags', _document.fileName]);
        }
    }

    public execute(resolve: Function, reject: Function) {
        let reader = rl.createInterface(this._dscanner.stdout, null);
        let declarations: vsc.SymbolInformation[] = [];

        this._token.onCancellationRequested(() => {
            this._dscanner.kill();
            reject();
        });

        reader.on('line', (line: string) => {
            let match = line.match(/([^\t]+)\t[^\t]+\t\d+;"\t(.)\tline:(\d+)/);

            if (match) {
                let name = match[1];
                let kind = util.symbolKind.get(match[2]);
                let range = this._document.lineAt(Number(match[3]) - 1).range;

                declarations.push(new vsc.SymbolInformation(match[1], kind, range, this._document.uri));
            }
        });

        reader.on('close', resolve.bind(null, declarations));
    }

    public lint() {
        let output = '';
        let args = ['--report', this._document.fileName];

        if (vsc.workspace.workspaceFolders) {
            args.push('--config', path.join(vsc.workspace.getWorkspaceFolder(this._document.uri).uri.fsPath, 'dscanner.ini'));
        }

        this._dscanner = cp.spawn(path.join(Dscanner.toolDirtory, Dscanner.toolFile), args);
        this._dscanner.stdout.on('data', (data) => output += data.toString());
        this._dscanner.stdout.on('close', () => {
            try {
                let report: rep.Report = JSON.parse(output.replace(/\\\\"/g, '\\"'));
                let diagnostics = report.issues.map((issue) => {
                    let position = new vsc.Position(issue.line - 1, issue.column - 1);
                    let range = this._document.getWordRangeAtPosition(position);

                    if (!range) {
                        range = new vsc.Range(new vsc.Position(issue.line - 1, issue.column - 1),
                            new vsc.Position(issue.line - 1, issue.column));
                    }

                    let diagnostic = new vsc.Diagnostic(range, issue.message, rep.getSeverity(issue.key));

                    diagnostic.code = issue.key;
                    diagnostic.source = 'Dscanner';

                    return diagnostic;
                });

                Dscanner.collection.set(this._document.uri, diagnostics);
            } catch (err) { }
        });
    }
};