'use strict';

import * as ev from 'events';
import * as vsc from 'vscode';
import * as dcdUtil from './dcd/util';
import * as dscannerUtil from './dscanner/util';
import * as misc from './misc';
import Dub from './dub';
import Server from './dcd/server';
import Client from './dcd/client';
import Dfmt from './dfmt';
import Dscanner from './dscanner/dscanner';

export default class Provider extends ev.EventEmitter implements
    vsc.CompletionItemProvider,
    vsc.SignatureHelpProvider,
    vsc.DefinitionProvider,
    vsc.HoverProvider,
    vsc.DocumentFormattingEditProvider,
    vsc.DocumentSymbolProvider,
    vsc.WorkspaceSymbolProvider,
    vsc.CodeActionProvider,
    vsc.TaskProvider {
    public provideCompletionItems(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ): Promise<any> {
        return this.dcdProvide(document, position, token, dcdUtil.Operation.Completion);
    }

    public provideSignatureHelp(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ): Promise<any> {
        return this.dcdProvide(document, position, token, dcdUtil.Operation.Calltips);
    }

    public provideDefinition(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ): Promise<any> {
        return this.dcdProvide(document, position, token, dcdUtil.Operation.Definition);
    }

    public provideHover(
        document: vsc.TextDocument,
        position: vsc.Position,
        token: vsc.CancellationToken
    ): Promise<any> {
        return this.dcdProvide(document, position, token, dcdUtil.Operation.Documentation);
    }

    public provideDocumentFormattingEdits(
        document: vsc.TextDocument,
        options: vsc.FormattingOptions,
        token: vsc.CancellationToken
    ): Promise<vsc.TextEdit[]> {
        let dfmt = new Dfmt(document, options, token);
        return new Promise(dfmt.execute.bind(dfmt));
    }

    public provideDocumentSymbols(
        document: vsc.TextDocument,
        token: vsc.CancellationToken
    ): Promise<vsc.SymbolInformation[]> {
        let dscanner = new Dscanner(document, token, dscannerUtil.Operation.DocumentSymbols);
        return new Promise(dscanner.execute.bind(dscanner));
    }

    public provideWorkspaceSymbols(
        query: string,
        token: vsc.CancellationToken
    ): Promise<vsc.SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            vsc.workspace.findFiles('**/*.d*', null).then((uris) => {
                let promises: PromiseLike<vsc.SymbolInformation[]>[] = uris.map((uri) => {
                    return vsc.workspace.openTextDocument(uri).then((document) => {
                        if (document && document.languageId === 'd') {
                            let dscanner = new Dscanner(document, token, dscannerUtil.Operation.WorkspaceSymbols);
                            return new Promise<vsc.SymbolInformation[]>(dscanner.execute.bind(dscanner));
                        }
                    });
                });

                Promise.all(promises).then((symbolInformationLists) =>
                    resolve(symbolInformationLists.reduce((previous, current) =>
                        current ? (previous || []).concat(current) : previous)));
            });
        });
    }

    public provideCodeActions(
        document: vsc.TextDocument,
        range: vsc.Range,
        context: vsc.CodeActionContext,
        token: vsc.CancellationToken
    ) {
        let filteredDiagnostics = context.diagnostics
            .filter((d) => d.range.isEqual(range))
            .filter((d) => dscannerUtil.fixes.get(<string>d.code));
        let actions = filteredDiagnostics
            .filter((d) => dscannerUtil.fixes.get(<string>d.code).command)
            .map((d) => {
                let fix = dscannerUtil.fixes.get(<string>d.code);
                return Object.assign({ arguments: [d, ...fix.getArgs(document, range)] }, fix.command);
            });
        let disablers = vsc.workspace.workspaceFolders
            ? filteredDiagnostics
                .filter((d) => dscannerUtil.fixes.get(<string>d.code).checkName)
                .map((d) => ({
                    title: 'Disable Check: ' + d.code,
                    command: 'dlang.actions.config',
                    arguments: [d.code]
                }))
            : [];

        return actions.concat(disablers);
    }

    public provideTasks(token?: vsc.CancellationToken) {
        let tasks = ['build', 'clean', 'test']
            .map((name) => new vsc.Task({ type: 'dub', task: name }, name, 'dub',
                new vsc.ProcessExecution(Dub.executable, [name], { cwd: misc.getRootPath() }),
                ['$dub-build', '$dub-test']));

        tasks[0].group = vsc.TaskGroup.Build;
        tasks[1].group = vsc.TaskGroup.Clean;
        tasks[2].group = vsc.TaskGroup.Test;

        return tasks;
    }

    public resolveTask(task: vsc.Task, token?: vsc.CancellationToken) {
        return undefined;
    }

    private dcdProvide(
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