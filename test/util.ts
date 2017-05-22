import * as path from 'path';
import * as vscode from 'vscode';
import * as tmp from 'tmp';

const extension = vscode.extensions.getExtension('dlang-vscode.dlang');

export { extension };

let tmpUri: vscode.Uri;

export function getTmpUri() {
    return tmpUri;
}

export function setTmpUri(path: string) {
    tmpUri = vscode.Uri.file(path);
};

export function uris(test: string, files: string[]) {
    let result = new Map<string, vscode.Uri>();

    files.forEach((file) => {
        let p = path.join(extension.extensionPath, 'test', 'd', test, file);
        result.set(file, vscode.Uri.file(p))
    });

    return result;
}
