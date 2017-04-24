import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as util from './util';

const spacings = [0, 2, 4, 8];
const uris = util.uris('dfmt', ['main.d', 'tabs.d'].concat(spacings.map((n) => `spaces-${n}.d`)));

describe('dfmt', function () {
    this.slow(500);
    this.timeout(1500);

    before(function (done) {
        fs.copy(uris.get('main.d').fsPath, util.tmpUri.fsPath, () => {
            vscode.commands.executeCommand('vscode.open', util.tmpUri)
                .then(() => done());
        });
    });

    spacings.forEach((n) => {
        context('with ' + (n ? `${n} spaces` : 'tabs'), function () {
            const options = { insertSpaces: n !== 0, tabSize: n };

            it('should format with ' + (n ? `${n} spaces` : 'tabs'), function () {
                return vscode.commands
                    .executeCommand('vscode.executeFormatDocumentProvider', util.tmpUri, options)
                    .then((edits: vscode.TextEdit[]) => {
                        let workspaceEdit = new vscode.WorkspaceEdit();
                        workspaceEdit.set(util.tmpUri, edits);
                        return vscode.workspace.applyEdit(workspaceEdit);
                    }).then(() => new Promise((resolve) =>
                        fs.readFile(uris.get(n ? `spaces-${n}.d` : 'tabs.d').fsPath, (err, data) => resolve(data))))
                    .then((data) => {
                        let doc = vscode.workspace.textDocuments
                            .find((doc) => doc.uri.fsPath === util.tmpUri.fsPath);
                        assert.equal(doc.getText(), data.toString());
                    });
            });
        });
    });
});
