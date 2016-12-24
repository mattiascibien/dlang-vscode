'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';

export default class Dfmt {
    public static toolDirectory = '';
    public static toolFile = '';
    private _dfmt: cp.ChildProcess;

    public constructor(
        private _document: vsc.TextDocument,
        options: vsc.FormattingOptions,
        private _token: vsc.CancellationToken
    ) {
        let args = [
            '--indent_style',
            options.insertSpaces ? 'space' : 'tab',
            '--indent_size',
            String(options.tabSize),
            '--tab_width',
            String(options.tabSize)
        ];

        [
            'alignSwitchStatements',
            'braceStyle',
            'endOfLine',
            'softMaxLineLength',
            'maxLineLength',
            'outdentAttributes',
            'spaceAfterCast',
            'selectiveImportSpace',
            'splitOperatorAtLineEnd',
            'compactLabeledStatements'
        ].forEach((attr) => {
            args.push('--' + attr.replace(/[A-Z]/g, (found) => {
                return '_' + found.toLowerCase();
            }), String(vsc.workspace.getConfiguration().get('d.dfmt.' + attr)));
        });

        this._dfmt = cp.spawn(path.join(Dfmt.toolDirectory, Dfmt.toolFile), args);
    }

    public execute(resolve: Function, reject: Function) {
        let output = '';

        this._token.onCancellationRequested(() => {
            this._dfmt.kill();
            reject();
        });

        this._dfmt.stdout.on('data', (data) => {
            output += data;
        });

        this._dfmt.on('exit', () => {
            let lastLine = this._document.lineCount - 1;
            let lastCol = this._document.lineAt(lastLine).text.length;
            let range = new vsc.Range(0, 0, lastLine, lastCol);

            resolve([new vsc.TextEdit(range, output)]);
        });

        this._dfmt.stdin.end(this._document.getText());
    }
};