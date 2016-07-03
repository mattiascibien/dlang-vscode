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
    private _packages = new Map<string, Package>();

    get packages() {
        return this._packages;
    }

    get paths() {
        let result: string[] = [];

        this._packages.forEach((p) => {
            result.push(p.path);
        });

        return result;
    }

    public static check() {
        return cp.spawnSync(Dub.executable, ['--help']).error;
    }

    public constructor() {
        super(null);
        this._tmp = tmp.dirSync();
    }

    public dispose() {
        this._tmp.removeCallback();
        this._packages.clear();
    }

    public init(entries: string[]) {
        return this.launchCommand('init', ['--root=' + vsc.workspace.rootPath],
            vsc.workspace.rootPath, entries.join(os.EOL));
    }

    public fetch(packageName: string) {
        return this.launchCommand('fetch', [packageName]).then(() => {
            return this.refresh();
        });
    }

    public remove(packageName: string) {
        return this.launchCommand('remove', [packageName]).then(() => {
            return this.refresh();
        });
    }

    public upgrade() {
        return this.launchCommand('upgrade', ['--root=' + vsc.workspace.rootPath]);
    }

    public search(packageName: string) {
        return this.launchCommand('search', [packageName]).then((result: any) => {
            if (result.code) {
                return [];
            } else {
                let packageNames: vsc.QuickPickItem[] = [];
                let firstLine = true;

                result.lines.forEach((line) => {
                    if (firstLine) {
                        firstLine = false
                    } else {
                        let formattedLine: string = line.replace(/\s+/, ' ');
                        let firstSpace = formattedLine.indexOf(' ');
                        let secondSpace = formattedLine.indexOf(' ', firstSpace + 1);

                        packageNames.push({
                            label: formattedLine.substring(0, firstSpace),
                            description: formattedLine.substring(secondSpace + 1),
                        });
                    }
                });

                return packageNames;
            }
        });
    }

    public build(packageName: string, config?: string) {
        let args = ['--root=' + this._packages.get(packageName).path];

        if (config) {
            args.push('--config=' + config);
        }

        return this.launchCommand('build', args, packageName + (config ? ` (${config})` : ''));
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

        if (fs.existsSync(dubJson)) {
            fs.unlinkSync(dubJson);
        }

        let res = cp.spawnSync(Dub.executable, ['convert', '--format=json'], {
            cwd: this._tmp.name
        });

        return dubJson;
    }

    public refresh() {
        let dub = cp.spawn(Dub.executable, ['list']);
        let reader = rl.createInterface(dub.stdout, null);
        let firstLine = true;

        reader.on('line', (line: string) => {
            if (firstLine) {
                firstLine = false;
            } else if (line.length) {
                line = line.trim();

                let name = line.slice(0, line.indexOf(' '));
                let rest = line.slice(line.indexOf(' ') + 1);
                let version = rest.slice(0, rest.indexOf(' ') - 1);
                let path = rest.slice(rest.indexOf(' ') + 1);

                if (!this._packages.get(name)
                    || isVersionSuperior(version, this._packages.get(name).version)) {
                    this._packages.set(name, new Package(version, path));
                }
            }
        });

        return new Promise((resolve) => {
            reader.on('close', resolve);
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
    public constructor(private _version: string, private _path: string) { }

    get version() {
        return this._version;
    }

    get path() {
        return this._path;
    }
};

function isVersionSuperior(first: string, second: string) {
    return second === '~master' || first > second;
}