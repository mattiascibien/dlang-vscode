'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as stream from 'stream';
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
        let additionsImports: string[] = [];

        if (paths) {
            for (let i = 0; i < paths.length; i++) {
                let dirs = this.importDirs(paths[i]);

                dirs.forEach((dir) => {
                    additions.add(dir);
                });
            }
        }

        if (vsc.workspace.rootPath) {
            this.importDirs(vsc.workspace.rootPath + path.sep).forEach((dir) => {
                additions.add(dir);
            });

            additions.add(vsc.workspace.rootPath);
        }

        additions.forEach((item) => {
            additionsImports.push('-I' + item);
        })

        if (process.platform === 'win32') {
            additionsImports.push('-IC:\\D\\dmd2\\src\\phobos');
        } else {
            try {
                fs.accessSync('/etc/dmd.conf');

                let conf = fs.readFileSync('/etc/dmd.conf').toString();
                let result = conf.match(/-I\S+/g);

                result.forEach(match => {
                    additionsImports.push(match);
                });
            } catch (e) { }
        }

        cp.spawn(path.join(Server.path, 'dcd-server'), additionsImports, { stdio: 'ignore' });
    }

    public stop() {
        cp.spawn('dcd-client', ['--shutdown']);
    }

    private importDirs(dubPath: string) {
        let imp = new Set<string>();

        ['json', 'sdl'].forEach((dubExt) => {
            let dubFile = path.join(dubPath, 'dub.' + dubExt);

            try {
                fs.accessSync(dubFile, fs.R_OK);
                let dub: any;
                let sourcePaths: string[] = [];

                if (dubExt === 'json') {
                    dub = require(dubFile);
                } else {
                    // TODO : SDLang
                    dub = new Object();
                }

                let allPackages = [dub];

                if (dub.subPackages) {
                    allPackages = allPackages.concat(dub.subPackages);
                }

                allPackages.forEach((p) => {
                    if (p instanceof String) {
                        let impAdded = this.importDirs(path.join(dubPath, p));
                        impAdded.forEach((newP) => {
                            imp.add(newP);
                        });
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
                        fs.accessSync(path.join(dubPath, p), fs.R_OK);
                        imp.add(path.join(dubPath, p));
                    } catch (e) { }
                });
            } catch (e) { }
        })

        return imp;
    }
}