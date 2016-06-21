'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';

export default class Dscanner {
    public static path: string;
    public static collection: vsc.DiagnosticCollection;

    public constructor(document: vsc.TextDocument) {
        let dscanner = cp.spawn(path.join(Dscanner.path, 'dscanner'), ['--styleCheck', document.fileName]);
        let reader = rl.createInterface(dscanner.stdout, null);
        let diagnostics: vsc.Diagnostic[] = [];

        reader.on('line', (line: string) => {
            let infoPattern = /\(\d+:\d+\)\[\w+\]/;
            let result = infoPattern.exec(line);
            let info = result[0];

            let position = info.match(/\(\d+:\d+\)/)[0].replace(/\(|\)/g, '').split(':');
            let linePosition = Number(position[0]) - 1;
            let charPosition = Number(position[1]) - 1;
            let range = document.getWordRangeAtPosition(new vsc.Position(linePosition, charPosition));
            let message = line.split(info)[1].substr(2);
            let severity: vsc.DiagnosticSeverity;

            if (!range) {
                range = new vsc.Range(new vsc.Position(linePosition, charPosition),
                    new vsc.Position(linePosition, charPosition + 1));
            }

            switch (info.match(/\[\w+\]/)[0].replace(/\[\]/, '')) {
                case '[error]':
                    severity = vsc.DiagnosticSeverity.Error;
                    break;

                case '[warn]':
                    severity = vsc.DiagnosticSeverity.Warning;
                    break;

                default:
                    severity = vsc.DiagnosticSeverity.Information;
                    break;
            }

            let diagnostic = new vsc.Diagnostic(range, message, severity);

            diagnostics.push(diagnostic);
        });

        dscanner.on('exit', () => {
            Dscanner.collection.set(document.uri, diagnostics);
        });
    }
}