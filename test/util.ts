import * as path from 'path';
import * as vscode from 'vscode';
import * as tmp from 'tmp';

let tmpUri: vscode.Uri;

export { tmpUri };

export function setTmpUri(path: string) {
    tmpUri = vscode.Uri.file(path);
};

export function uris(test: string, files: string[]) {
    let result = new Map<string, vscode.Uri>();

    files.forEach((file) =>
        result.set(file, vscode.Uri.file(path.join(vscode.workspace.rootPath, test, file))));

    return result;
}
