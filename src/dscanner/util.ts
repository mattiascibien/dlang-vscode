'use strict';

import * as vsc from 'vscode';

export enum Operation {
    Lint,
    DocumentSymbols,
    WorkspaceSymbols
};

const symbolKind = new Map<string, vsc.SymbolKind>();

symbolKind.set('g', vsc.SymbolKind.Enum);
symbolKind.set('e', vsc.SymbolKind.Property);
symbolKind.set('v', vsc.SymbolKind.Variable);
symbolKind.set('i', vsc.SymbolKind.Interface);
symbolKind.set('c', vsc.SymbolKind.Class);
symbolKind.set('s', vsc.SymbolKind.Class);
symbolKind.set('f', vsc.SymbolKind.Function);
symbolKind.set('u', vsc.SymbolKind.Class);
symbolKind.set('T', vsc.SymbolKind.Constructor);
symbolKind.set('a', vsc.SymbolKind.Constant);

export { symbolKind };