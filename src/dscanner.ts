'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';

export default class Dscanner {
    public static path: string;
    public static collection: vsc.DiagnosticCollection;

    public constructor(document: vsc.TextDocument) {
        let output = '';
        let dscanner = cp.spawn(path.join(Dscanner.path, 'dscanner'), ['--report']);

        dscanner.stdout.on('data', (data) => {
            output += data;
        });

        dscanner.on('exit', () => {
            // TODO : create diagnostics when dscanner accepts code from stdin
        });

        dscanner.stdin.write(document.getText());
        dscanner.stdin.end();
    }
}