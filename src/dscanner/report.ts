'use strict';

import * as vsc from 'vscode';

export interface Report {
    issues: {
        key: string;
        filename: string;
        line: number;
        column: number;
        message: string;
    }[],
    interfaceCount: number,
    classCount: number,
    functionCount: number,
    termplateCount: number,
    structCount: number,
    statementCount: number,
    lineOfCodeCount: number,
    undocumentedPublicSymbols: number
};

export function getSeverity(key: string) {
    switch (key.split('.')[1]) {
        case 'syntax':
            return vsc.DiagnosticSeverity.Error;

        case 'bugs':
        case 'deprecated':
            return vsc.DiagnosticSeverity.Warning;

        default:
            return vsc.DiagnosticSeverity.Information;
    }
};