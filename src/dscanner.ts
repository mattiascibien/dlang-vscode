'use strict';

import * as cp from 'child_process';
import * as vsc from 'vscode';

export default class Dscanner {
    public static path: string;
    public static collection: vsc.DiagnosticCollection;

    public constructor(document: vsc.TextDocument) {
        let output = '';
        let dscanner = cp.spawn(Dscanner.path + 'dscanner', ['--report']);

        console.log(Dscanner.path + 'dscanner');

        dscanner.stdout.on('data', (data) => {
            console.log('data', data.toString());
            output += data;
        });

        dscanner.on('exit', () => {
            console.log('exit');
            console.log(output);
        });

        dscanner.stdin.write(document.getText());
        dscanner.stdin.end();

        console.log('cons');
    }
}