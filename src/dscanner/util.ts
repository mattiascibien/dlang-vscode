'use strict';

import * as vsc from 'vscode';
import Dscanner from './dscanner';

export enum Operation {
    Lint,
    DocumentSymbols,
    WorkspaceSymbols
};

let fixes = new Map<string, {
    command: vsc.Command,
    diagnostic?: vsc.Diagnostic,
    getArgs: (document: vsc.TextDocument, range: vsc.Range) => any[],
    action?: (textEditor: vsc.TextEditor, edit: vsc.TextEditorEdit,
        diagnostic: vsc.Diagnostic, ...args: any[]) => void
}>();

fixes.set('dscanner.style.alias_syntax', {
    command: {
        title: 'Run Dfix',
        command: 'dlang.actions.dfix'
    },
    getArgs: (document, range) => [document.uri]
});

fixes.set('dscanner.deprecated.delete_keyword', {
    command: {
        title: 'Replace `delete` With `destroy()`',
        command: 'dlang.actions.replaceDeletes'
    },
    getArgs: (document, range) => [range],
    action: (editor, edit, diagnostic: vsc.Diagnostic, range: vsc.Range) => {
        if (range) {
            let match = editor.document.lineAt(range.start).text.match(/delete\s+(\w+)/);
            let fullRange = new vsc.Range(range.start,
                new vsc.Position(range.start.line, range.start.character + match[0].length));

            edit.replace(fullRange, `destroy(${match[1]})`);
            eraseDiagnostic(editor, diagnostic);
        }
    }
});

fixes.set('dscanner.style.imports_sortedness', {
    command: {
        title: 'Sort Imports',
        command: 'dlang.actions.sortImports'
    },
    getArgs: (document, range) => [range],
    action: (editor, edit, diagnostic: vsc.Diagnostic, range: vsc.Range) => {
        if (range) {
            let startLineNum = range.start.line;
            let numberedLines = new Map<number, vsc.TextLine>();
            let line: vsc.TextLine;
            let linesAdded = true;

            numberedLines.set(startLineNum, editor.document.lineAt(startLineNum));

            for (let i = 1; linesAdded; ++i) {
                linesAdded = false;

                for (let sign = -1; sign <= 1; sign += 2) {
                    if (startLineNum + sign * i >= 0
                        && startLineNum + sign * i < editor.document.lineCount) {
                        line = editor.document.lineAt(startLineNum + sign * i);

                        if (line.text.match(/\s*import\s+[\w.]+\s*;\s*/)) {
                            numberedLines.set(startLineNum + sign * i,
                                editor.document.lineAt(startLineNum + sign * i));
                            linesAdded = true;
                        }
                    }
                }
            }

            let numbers = Array.from(numberedLines.keys()).sort();
            let lines = Array.from(numberedLines.values())
                .sort((a, b) => a.text.localeCompare(b.text));

            numbers.forEach((n, i) => edit.replace(numberedLines.get(n).range, lines[i].text));
            eraseDiagnostic(editor, diagnostic);
        }
    }
});

function eraseDiagnostic(editor: vsc.TextEditor, diagnostic: vsc.Diagnostic) {
    Dscanner.collection.set(editor.document.uri,
        Dscanner.collection.get(editor.document.uri)
            .filter((d) => d !== diagnostic));
}

export { fixes };