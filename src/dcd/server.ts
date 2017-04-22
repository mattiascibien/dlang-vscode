'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';
import * as util from './util';
import Dub from '../dub';
import Client from './client';

export default class Server {
    public static toolDirectory = '';
    public static toolFile = '';
    public static dub: Dub;
    private static _instanceLaunched: boolean;
    private _dubSelectionsWatcher: vsc.FileSystemWatcher;

    public static get instanceLaunched() {
        return Server._instanceLaunched;
    }

    public constructor() {
        this.start();
    }

    public start() {
        let additionsImports = vsc.workspace.getConfiguration().get<Array<string>>('d.dcd.imports', [])
            .map((i) => '-I' + (path.isAbsolute(i) || !vsc.workspace.rootPath
                ? i
                : path.join(vsc.workspace.rootPath, i)));

        if (vsc.workspace.rootPath) {
            this.getImportDirs(vsc.workspace.rootPath)
                .forEach((dir) => additionsImports.push('-I' + dir));
        }

        try {
            let section = 'd.dmdConf.' + {
                linux: 'linux',
                darwin: 'osx',
                win32: 'windows'
            }[process.platform];

            let configFile = vsc.workspace.getConfiguration().get<string>(section);
            fs.accessSync(configFile);

            let conf = fs.readFileSync(configFile).toString();
            let result = conf.match(/-I[^\s"]+/g);

            additionsImports = additionsImports
                .concat(result.map((match) => match.replace('%@P%', path.dirname(configFile))));
        } catch (e) { }

        let args = ['--logLevel', 'off'].concat(util.getTcpArgs());
        let server = cp.spawn(path.join(Server.toolDirectory, Server.toolFile), additionsImports.concat(args), { stdio: 'ignore' });
        Server._instanceLaunched = true;

        server.on('exit', () => Server._instanceLaunched = false);
    }

    public stop() {
        cp.spawn(path.join(Client.toolDirectory, Client.toolFile), ['--shutdown'].concat(util.getTcpArgs()));
        this._dubSelectionsWatcher.dispose();
    }

    public importPath(p: string) {
        return cp.spawn(path.join(Client.toolDirectory, Client.toolFile), ['-I' + p]);
    }

    public importSelections(subscriptions: vsc.Disposable[]) {
        let selectionsUri = vsc.Uri.file(path.join(vsc.workspace.rootPath, 'dub.selections.json'));
        let importPackageDirs = (uri: vsc.Uri) => {
            return new Promise((resolve) => {
                fs.readFile(uri.fsPath, (err, data) => {
                    if (data) {
                        this.importPackages(JSON.parse(data.toString()).versions).then(resolve);
                    } else {
                        resolve();
                    }
                });
            });
        };

        this._dubSelectionsWatcher = vsc.workspace.createFileSystemWatcher(selectionsUri.fsPath);
        this._dubSelectionsWatcher.onDidCreate(importPackageDirs, null, subscriptions);
        this._dubSelectionsWatcher.onDidChange(importPackageDirs, null, subscriptions);

        return importPackageDirs(selectionsUri);
    }

    private importPackages(selections) {
        return Server.dub.list().then((packages) => {
            return new Promise((resolve) => {
                cp.spawn(path.join(Client.toolDirectory, Client.toolFile), ['--clearCache']).on('exit', () => {
                    let clients: cp.ChildProcess[] = [];

                    for (let selection in selections) {
                        let importPath: string;

                        packages.forEach((p) => {
                            if (selection === p.name && selections[selection] === p.version) {
                                importPath = p.path;
                            }
                        });

                        if (importPath) {
                            this.getImportDirs(importPath)
                                .forEach((dir) => clients.push(this.importPath(dir)));
                        }
                    }

                    Promise.all(clients
                        .map((client) => new Promise((res) => client
                            .on('exit', res)))).then(resolve);
                });
            });
        });
    }

    private getImportDirs(dubPath: string) {
        let imp = new Set<string>();

        ['json', 'sdl'].forEach((dubExt) => {
            let dubFile = path.join(dubPath, 'dub.' + dubExt);

            try {
                fs.accessSync(dubFile, fs.constants.R_OK);
                let dubData;
                let sourcePaths: string[] = [];

                dubData = require(dubExt === 'json' ? dubFile : Server.dub.getJSONFromSDL(dubFile));

                let allPackages = [dubData];

                if (dubData.subPackages) {
                    allPackages = allPackages.concat(dubData.subPackages);
                }

                allPackages.forEach((p) => {
                    if (p instanceof String) {
                        let impAdded = this.getImportDirs(path.join(dubPath, <string>p));
                        impAdded.forEach((newP) => imp.add(newP));
                    } else {
                        [
                            p.sourcePaths,
                            p.importPaths,
                            ['source/', 'src/']
                        ].forEach((sourceArray) => {
                            if (sourceArray) {
                                sourcePaths = sourcePaths.concat(sourceArray);
                            }
                        });
                    }
                });

                sourcePaths.forEach((p: string) => {
                    try {
                        fs.accessSync(path.join(dubPath, p), fs.constants.R_OK);
                        imp.add(path.join(dubPath, p));
                    } catch (e) { }
                });
            } catch (e) { }
        });

        return imp;
    }
};
