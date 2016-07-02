'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';
import * as util from './util';
import Dub from '../dub';

export default class Server {
    public static path: string;
    public static dub: Dub;
    private static _instanceLaunched: boolean;

    public static get instanceLaunched() {
        return Server._instanceLaunched;
    }

    public constructor() {
        this.start();
    }

    public start() {
        let additions = new Set<string>();
        let additionsImports: string[] = [];

        if (Server.dub.paths) {
            Server.dub.paths.forEach((p) => {
                this.importDirs(p).forEach((dir) => {
                    additions.add(dir);
                });
            });
        }

        if (vsc.workspace.rootPath) {
            this.importDirs(vsc.workspace.rootPath + path.sep).forEach((dir) => {
                additions.add(dir);
            });

            additions.add(vsc.workspace.rootPath);
        }

        additions.forEach((item) => {
            additionsImports.push('-I' + item);
        });

        try {
            let section = 'd.dmdConf.' + (process.platform === 'win32' ? 'windows' : 'posix');
            let configFile = vsc.workspace.getConfiguration().get<string>(section);
            fs.accessSync(configFile);

            let conf = fs.readFileSync(configFile).toString();
            let result = conf.match(/-I[^\s"]+/g);

            result.forEach((match) => {
                if (process.platform === 'win32') {
                    match = match.replace('%@P%', path.dirname(configFile));
                }

                additionsImports.push(match);
            });
        } catch (e) { }

        let args = ['--logLevel', 'off'].concat(util.getTcpArgs());
        let server = cp.spawn(path.join(Server.path, 'dcd-server'), additionsImports.concat(args));
        Server._instanceLaunched = true;

        server.on('exit', () => {
            Server._instanceLaunched = false;
        });
    }

    public stop() {
        cp.spawn(path.join(Server.path, 'dcd-client'), ['--shutdown'].concat(util.getTcpArgs()));
    }

    private importDirs(dubPath: string) {
        let imp = new Set<string>();

        ['json', 'sdl'].forEach((dubExt) => {
            let dubFile = path.join(dubPath, 'dub.' + dubExt);

            try {
                fs.accessSync(dubFile, fs.R_OK);
                let dubData;
                let sourcePaths: string[] = [];

                if (dubExt === 'json') {
                    dubData = require(dubFile);
                } else {
                    dubData = require(Server.dub.getJSONFromSDL(dubFile));
                }

                let allPackages = [dubData];

                if (dubData.subPackages) {
                    allPackages = allPackages.concat(dubData.subPackages);
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
};