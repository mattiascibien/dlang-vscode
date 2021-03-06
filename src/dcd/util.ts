'use strict';

import * as vsc from 'vscode';

const types = new Map<string, vsc.CompletionItemKind>();

types.set('c', vsc.CompletionItemKind.Class);
types.set('i', vsc.CompletionItemKind.Interface);
types.set('s', vsc.CompletionItemKind.Struct);
types.set('u', vsc.CompletionItemKind.Enum);
types.set('v', vsc.CompletionItemKind.Variable);
types.set('m', vsc.CompletionItemKind.Field);
types.set('k', vsc.CompletionItemKind.Keyword);
types.set('f', vsc.CompletionItemKind.Function);
types.set('g', vsc.CompletionItemKind.Enum);
types.set('e', vsc.CompletionItemKind.EnumMember);
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
    let config = vsc.workspace.getConfiguration('d.dcd');
    return config.get('tcp')
        ? ['--tcp', '--port', String(config.get('port'))]
        : [];
};