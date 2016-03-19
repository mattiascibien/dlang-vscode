'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';

export default class Server extends vsc.Disposable {
    public static path: string;

    public constructor(paths?: string[]) {
        super(null);
        this.start(paths);
    }

    public dispose() {
        this.stop();
    }

    public start(paths?: string[]) {
        let additions = new Set<string>();
        let additionsArray: string[] = [];

        if (paths) {
            for (let i = 0; i < paths.length; i++) {
                let dirs = this.importDirs(paths[i]);

                dirs.forEach((dir) => {
                    additions.add('-I' + dir);
                });
            }
        }

        if (vsc.workspace.rootPath) {
            this.importDirs(vsc.workspace.rootPath + path.sep).forEach((dir) => {
                additions.add('-I' + dir);
            });
        }

        additions.forEach((item) => {
            additionsArray.push(item);
        })

        cp.spawn(Server.path + 'dcd-server', additionsArray, { stdio: 'ignore' });
    }

    public stop() {
        cp.spawn('dcd-client', ['--shutdown']);
    }

    private importDirs(path: string) {
        let imp = new Set<string>();

        ['json', 'sdl'].forEach((dubExt) => {
            let dubFile = path + 'dub.' + dubExt;

            try {
                fs.accessSync(dubFile, fs.R_OK);
                let dub: any;
                let sourcePaths: string[] = [];

                if (dubExt === 'json') {
                    dub = require(dubFile);
                } else {
                    // TODO : SDLang
                    return imp;
                }

                let allPackages = [dub];

                if (dub.subPackages) {
                    allPackages = allPackages.concat(dub.subPackages);
                }

                allPackages.forEach((p) => {
                    [
                        p.sourcePaths,
                        p.importPaths,
                        ['source/', 'src/']
                    ].forEach((sourceArray) => {
                        if (sourceArray) {
                            sourcePaths = sourcePaths.concat(sourceArray);
                        }
                    });
                });

                sourcePaths.forEach((p: string) => {
                    try {
                        fs.accessSync(path + p, fs.R_OK);
                        imp.add(path + p);
                    } catch (e) { }
                });
            } catch (e) { }
        })

        return imp;
    }
}