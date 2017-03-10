'use strict';

import * as vsc from 'vscode';

const types = new Map<string, vsc.CompletionItemKind>();

types.set('c', vsc.CompletionItemKind.Class);
types.set('i', vsc.CompletionItemKind.Interface);
types.set('s', vsc.CompletionItemKind.Class);
types.set('u', vsc.CompletionItemKind.Enum);
types.set('v', vsc.CompletionItemKind.Variable);
types.set('m', vsc.CompletionItemKind.Field);
types.set('k', vsc.CompletionItemKind.Keyword);
types.set('f', vsc.CompletionItemKind.Function);
types.set('g', vsc.CompletionItemKind.Enum);
types.set('e', vsc.CompletionItemKind.Field);
types.set('P', vsc.CompletionItemKind.Module);
types.set('M', vsc.CompletionItemKind.Module);
types.set('a', vsc.CompletionItemKind.Value);
types.set('A', vsc.CompletionItemKind.Value);
types.set('I', vsc.CompletionItemKind.Reference);
types.set('t', vsc.CompletionItemKind.Function);
types.set('T', vsc.CompletionItemKind.Snippet);

export { types };

export enum Operation {
    Completion,
    Calltips,
    Definition,
    Documentation
};

export function getTcpArgs() {
    return vsc.workspace.getConfiguration().get('d.dcd.tcp')
        ? ['--tcp', '--port', String(vsc.workspace.getConfiguration().get('d.dcd.port'))]
        : [];
}