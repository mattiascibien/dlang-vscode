'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as p from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as tmp from 'tmp';
import * as msg from './messenger';

export default class Dub extends vsc.Disposable {
    public static executable = vsc.workspace.getConfiguration().get('d.dub', 'dub');
    private _tmp: tmp.SynchrounousResult;

    public static check() {
        return cp.spawnSync(Dub.executable, ['--help']).error;
    }

    public constructor() {
        super(null);
        this._tmp = tmp.dirSync();
    }

    public dispose() {
        this._tmp.removeCallback();
    }

    public init(entries: string[]) {
        return this.launchCommand('init', ['--root=' + vsc.workspace.rootPath],
            vsc.workspace.rootPath, entries.join(os.EOL));
    }

    public fetch(packageName: string) {
        return this.launchCommand('fetch', [packageName]);
    }

    public remove(packageName: string, version?: string) {
        let args = [packageName];

        if (version) {
            args.push('--version=' + version);
        }

        return this.launchCommand('remove', args);
    }

    public upgrade() {
        return this.launchCommand('upgrade', ['--root=' + vsc.workspace.rootPath]);
    }

    public list() {
        return this.launchCommand('list', []).then((result: any) => {
            if (result.code) {
                return [];
            } else {
                let packages: Package[] = [];

                result.lines.shift();
                result.lines.pop();
                result.lines.forEach((line: string) => {
                    let match = line.match(/([^\s]+) ([^\s]+): (.+)/);
                    packages.push(new Package(match[1], match[2], match[3]));
                });

                return packages;
            }
        });
    }

    public search(packageName: string) {
        return this.launchCommand('search', [packageName]).then((result: any) => {
            if (result.code) {
                return [];
            } else {
                let packages: Package[] = [];

                result.lines.shift();
                result.lines.forEach((line: string) => {
                    let formattedLine = line.replace(/\s+/, ' ');
                    let match = formattedLine.match(/([^\s]+) \(([^\s]+)\) (.+)/);

                    packages.push(new Package(match[1], match[2], null, match[3]));
                });

                return packages;
            }
        });
    }

    public build(p: Package, type: string, config?: string) {
        let args = ['--root=' + p.path, '--build=' + type];

        if (config) {
            args.push('--config=' + config);
        }

        return this.launchCommand('build', args, p.name + (config ? ` (${config})` : ''))
            .then(() => { return p; });
    }

    public convert(format: string) {
        return this.launchCommand('convert', [
            '--format=' + format,
            '--root=' + vsc.workspace.rootPath
        ], 'to ' + format);
    }

    public getJSONFromSDL(path: string) {
        let sdlData = fs.readFileSync(path);
        let dubSdl = p.join(this._tmp.name, 'dub.sdl');
        let dubJson = p.join(this._tmp.name, 'dub.json');

        fs.writeFileSync(dubSdl, sdlData);

        try {
            fs.accessSync(dubJson);
            fs.unlinkSync(dubJson);
        } catch (e) { }

        let res = cp.spawnSync(Dub.executable, ['convert', '--format=json'], {
            cwd: this._tmp.name
        });

        return dubJson;
    }

    public getLatestVersion(packageName: string) {
        return this.list().then((packages) => {
            return packages.reduce((previous, next) => {
                if (!previous) {
                    return next;
                }

                if (!next) {
                    return previous;
                }

                if (next.name === packageName) {
                    return previous && previous.name !== packageName
                        ? next : isVersionSuperior(next.version, previous.version)
                            ? next : previous;
                }

                if (previous.name === packageName) {
                    return previous;
                }

                return null;
            });
        });
    }

    private launchCommand(command: string, args: any, message?: string, stdin?: string) {
        if (args.length) {
            msg.add(command, message || args[0]);
        }

        let dubProcess = cp.spawn(Dub.executable, [command].concat(args));
        let outReader = rl.createInterface(dubProcess.stdout, null);
        let errReader = rl.createInterface(dubProcess.stderr, null);
        let out: string[] = [];
        let err: string[] = [];

        if (stdin) {
            dubProcess.stdin.end(stdin);
        }

        outReader.on('line', (line: string) => {
            out.push(line);
        });

        errReader.on('line', (line: string) => {
            err.push(line);
        });

        return new Promise((resolve) => {
            dubProcess.on('exit', (code) => {
                if (args.length) {
                    msg.remove(command, message || args[0]);
                }

                if (code) {
                    vsc.window.showErrorMessage(err.toString());
                }

                resolve({
                    code,
                    lines: code ? err : out
                });
            });
        });
    }
};

export class Package {
    public constructor(
        private _name: string,
        private _version: string,
        private _path: string,
        private _description?: string
    ) { }

    get name() {
        return this._name;
    }

    get version() {
        return this._version;
    }

    get path() {
        return this._path;
    }

    get description() {
        return this._description;
    }
};

function isVersionSuperior(first: string, second: string) {
    return second === '~master' || first > second;
}