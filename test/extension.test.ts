import * as fs from 'fs';
import * as vscode from 'vscode';
import * as tmp from 'tmp';
import * as util from './util';

const extension = vscode.extensions.getExtension('dlang-vscode.dlang');

before(function (done) {
    this.timeout(0);
    extension.activate()
        .then(() => new Promise((resolve) =>
            tmp.tmpName({ postfix: '.d' }, (err, path) => {
                util.setTmpUri(path);
                resolve();
            })))
        .then(() => done());
});

after(function (done) {
    this.timeout(0);
    extension.exports.dcd.server.stop();
    vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        .then(() => fs.unlink(util.tmpUri.fsPath, done));
});
