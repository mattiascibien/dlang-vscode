'use strict';

import * as ev from 'events';
import * as vsc from 'vscode';
import Server from './dcd/server';
import Client from './dcd/client';
import * as dcdUtil from './dcd/util';
import Dfmt from './dfmt';
import Dscanner from './dscanner/dscanner';
import * as dscannerUtil from './dscanner/util';

export default class Provider extends ev.EventEmitter implements
    vsc.CompletionItemProvider,
    vsc.SignatureHelpProvider,
    vsc.DefinitionProvider,
    vsc.HoverProvider,
    vsc.DocumentFormattingEditProvider,
    vsc.DocumentSymbolProvider,
    vsc.WorkspaceSymbolProvider {
    public provideCompletionItems(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, dcdUtil.Operation.Completion);
    }

    public provideSignatureHelp(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, dcdUtil.Operation.Calltips);
    }

    public provideDefinition(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, dcdUtil.Operation.Definition);
    }

    public provideHover(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ) {
        return this.provide(document, position, token, dcdUtil.Operation.Documentation);
    }

    public provideDocumentFormattingEdits(
        document: vsc.TextDocument,
        options: vsc.FormattingOptions,
        token: vsc.CancellationToken
    ) {
        let dfmt = new Dfmt(document, options, token);
        return new Promise(dfmt.execute.bind(dfmt));
    }

    public provideDocumentSymbols(
        document: vsc.TextDocument,
        token: vsc.CancellationToken
    ) {
        let dscanner = new Dscanner(document, token, dscannerUtil.Operation.DocumentSymbols);
        return new Promise(dscanner.execute.bind(dscanner));
    }

    public provideWorkspaceSymbols(
        query: string,
        token: vsc.CancellationToken
    ) {
        return new Promise((resolve, reject) => {
            vsc.workspace.findFiles('**/*.d*', null).then((uris) => {
                let promises: PromiseLike<vsc.SymbolInformation[]>[] = uris.map((uri) => {
                    return vsc.workspace.openTextDocument(uri).then((document) => {
                        if (document && document.languageId === 'd') {
                            let dscanner = new Dscanner(document, token, dscannerUtil.Operation.WorkspaceSymbols);
                            return new Promise(dscanner.execute.bind(dscanner));
                        }
                    });
                });

                Promise.all(promises).then((symbolInformationLists) => {
                    resolve(symbolInformationLists.reduce((previous, current) => {
                        return current ? (previous || []).concat(current) : previous;
                    }));
                });
            });
        });
    }

    private provide(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken,
        operation: dcdUtil.Operation
    ) {
        let client = new Client(document, position, token, operation);

        client.on('error', () => {
            if (!Server.instanceLaunched) {
                this.emit('restart');
            }
        });

        return new Promise(client.execute.bind(client));
    }
};