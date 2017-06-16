import * as fs from 'fs';
import * as vscode from 'vscode';
import * as tmp from 'tmp';
import * as util from './util';

before(function (done) {
    this.timeout(0);
    util.extension.activate().then(() => tmp.tmpName({ postfix: '.d' }, (err, path) => {
        util.setTmpUri(path);
        done();
    }));
});

after(function (done) {
    this.timeout(0);
    util.extension.exports.dcd.server.stop();
    vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        .then(() => fs.unlink(util.getTmpUri().fsPath, done));
});
