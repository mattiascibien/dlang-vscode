// export default function type(dcdType: string) {
//     // TODO
// }

import * as vsc from 'vscode';

let types = new Map<string, vsc.CompletionItemKind>();

types.set('c', vsc.CompletionItemKind.Class);
types.set('i', vsc.CompletionItemKind.Interface);
types.set('s', vsc.CompletionItemKind.Class);
types.set('u', vsc.CompletionItemKind.Class);
types.set('v', vsc.CompletionItemKind.Variable);
types.set('m', vsc.CompletionItemKind.Field);
types.set('k', vsc.CompletionItemKind.Keyword);
types.set('f', vsc.CompletionItemKind.Function);
types.set('g', vsc.CompletionItemKind.Enum);
types.set('e', vsc.CompletionItemKind.Enum);
types.set('P', vsc.CompletionItemKind.Module);
types.set('M', vsc.CompletionItemKind.Module);
types.set('a', vsc.CompletionItemKind.Value);
types.set('A', vsc.CompletionItemKind.Value);
types.set('I', vsc.CompletionItemKind.Reference);
types.set('t', vsc.CompletionItemKind.Class);
types.set('T', vsc.CompletionItemKind.Class);

export default types;