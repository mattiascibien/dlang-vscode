'use strict';

import * as vsc from 'vscode';

export const D_MODE = { language: 'd', scheme: 'file' };

export function getRootPath() {
    return vsc.workspace.workspaceFolders
        ? vsc.window.activeTextEditor
            ? (vsc.workspace.getWorkspaceFolder(vsc.window.activeTextEditor.document.uri) || vsc.workspace.workspaceFolders[0]).uri.fsPath
            : vsc.workspace.workspaceFolders[0].uri.fsPath
        : null;
};

export function chooseRootPath() {
    if (!vsc.workspace.workspaceFolders) {
        return Promise.resolve<string>(null);
    }

    const stdRootPath = Promise.resolve(vsc.workspace.workspaceFolders[0].uri.fsPath);
    let rootPath: Thenable<string> = stdRootPath;

    if (vsc.workspace.workspaceFolders.length > 1) {
        rootPath = vsc.window.showQuickPick(vsc.workspace.workspaceFolders.map((f) => f.uri.fsPath))
            .then((rp) => rp || stdRootPath);
    }

    return rootPath;
}