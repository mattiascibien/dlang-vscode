'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as p from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as tmp from 'tmp';
import escapeStringRegexp = require('escape-string-regexp');

export default class Dub extends vsc.Disposable {
    public static executable = vsc.workspace.getConfiguration().get('d.tools.dub', 'dub');
    private _tmp: tmp.SynchrounousResult;

    public constructor(private _output: vsc.OutputChannel) {
        super(null);
        this._tmp = tmp.dirSync();
    }

    public dispose() {
        this._tmp.removeCallback();
    }

    public init(entries: string[]) {
        return this.launchCommand('init', [], vsc.workspace.rootPath, { stdin: entries.join(os.EOL) });
    }

    public fetch(packageName: string, version?: string) {
        let args = [packageName];

        if (version) {
            args.push('--version=' + version);
        }

        return this.launchCommand('fetch', args);
    }

    public remove(packageName: string, version?: string) {
        let args = [packageName];

        if (version) {
            args.push('--version=' + version);
        }

        return this.launchCommand('remove', args);
    }

    public upgrade() {
        return this.launchCommand('upgrade', []);
    }

    public list(): Promise<Package[]> {
        let match = this._tmp.name.match(/^.*?[\\/]/);
        return this.launchCommand('list', [], null, { cwd: match[0] }).then((result: any) => {
            if (result.code) {
                return [];
            }

            let packages: Package[] = [];

            result.lines.shift();
            result.lines.pop();
            result.lines.forEach((line: string) => {
                let match = line.match(/([^\s]+) ([^\s]+): (.+)/);
                packages.push(new Package(match[1], match[2], match[3]));
            });

            return packages;
        });
    }

    public search(packageName: string): Promise<Package[]> {
        return this.launchCommand('search', [packageName]).then((result: any) => {
            if (result.code) {
                return [];
            }

            let packages: Package[] = [];

            result.lines.shift();
            result.lines.forEach((line: string) => {
                let formattedLine = line.replace(/\s+/, ' ');
                let match = formattedLine.match(/([^\s]+) \(([^\s]+)\) (.+)/);

                packages.push(new Package(match[1], match[2], null, match[3]));
            });

            return packages;
        });
    }

    public build(p: Package, type: string, config?: string): Promise<Package> {
        let packageName = p.name.replace(/-\w/g, (found) => found.substr(1, 1).toUpperCase());
        let compiler = vsc.workspace.getConfiguration().get<string>(`d.${packageName}.compiler`);
        let args = ['--build=' + type, '--compiler=' +
            (compiler || vsc.workspace.getConfiguration().get('d.dub.compiler', 'dmd'))];

        if (config) {
            args.push('--config=' + config);
        }

        return this.launchCommand('build', args,
            p.name + (config ? ` (${config})` : ''),
            { cwd: p.path })
            .then(() => p);
    }

    public convert(format: string) {
        return this.launchCommand('convert', ['--format=' + format], 'to ' + format);
    }

    public dustmite() {
        let dustmitePath = p.join(this._tmp.name, p.basename(vsc.workspace.rootPath));
        let args: string[];

        return new Promise(del.bind(null, [dustmitePath, dustmitePath + '.reduced']))
            .then(() => new Promise((resolve) => {
                fs.readFile(p.join(vsc.workspace.rootPath, '.vscode', 'tasks.json'), (err, data) => {
                    if (err) {
                        resolve();
                        return;
                    }

                    let tasks = JSON.parse(data.toString()).tasks;
                    let task = tasks.find((task: any) => task.taskName === 'build');

                    if (task) {
                        args = task.args;
                    }

                    resolve(this.launchCommand('build', args || [], vsc.workspace.rootPath));
                });
            })).then((buildResult: any) => {
                if (buildResult.code) {
                    return vsc.window.showQuickPick(buildResult.lines, { placeHolder: 'Select a line' });
                }

                vsc.window.showInformationMessage('The project builds correctly');
            }).then((line: string) => {
                if (line) {
                    this._output.show(true);
                    return this.launchCommand('dustmite', (args || []).concat([
                        dustmitePath,
                        '--combined',
                        '--compiler-regex=' + escapeStringRegexp(line)
                    ]), vsc.workspace.rootPath, { verbose: true });
                }
            }).then((dustmiteResult: any) => {
                if (dustmiteResult && !dustmiteResult.code) {
                    vsc.commands.executeCommand('vscode.openFolder', vsc.Uri.file(dustmitePath + '.reduced'), true);
                }
            });
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

    private launchCommand(command: string,
        args: any,
        message?: string,
        options?: {
            cwd?: string,
            stdin?: string,
            verbose?: boolean
        }) {
        options = options || {};
        options.cwd = options.cwd || vsc.workspace.rootPath;

        if (args.length) {
            this._output.appendLine('Dub ' + command + ' : ' + (message || args[0]));
        }

        let dubProcess = cp.spawn(Dub.executable, [command].concat(args), { cwd: options.cwd });
        let outReader = rl.createInterface(dubProcess.stdout, null);
        let errReader = rl.createInterface(dubProcess.stderr, null);
        let out: string[] = [];
        let err: string[] = [];

        if (options.stdin) {
            dubProcess.stdin.end(options.stdin);
        }

        outReader.on('line', (line: string) => {
            out.push(line);

            if (options.verbose) {
                this._output.appendLine(line);
            }
        });

        errReader.on('line', (line: string) => {
            err.push(line);

            if (options.verbose) {
                this._output.appendLine(line);
            }
        });

        return new Promise((resolve) => {
            dubProcess.on('exit', (code) => {
                if (code) {
                    err.forEach(this._output.appendLine.bind(this._output));
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
    return second === '~master' || (first !== '~master' && first > second);
}

function del(pathOrPaths: string | string[], callback: Function) {
    let paths = pathOrPaths instanceof Array ? pathOrPaths : [pathOrPaths];
    let path = paths.pop();

    if (path) {
        fs.stat(path, (err, stats) => {
            if (err) {
                new Promise(del.bind(null, paths));
                callback();
                return;
            }

            if (stats.isFile()) {
                fs.unlink(path, callback.bind(null));
            } else if (stats.isDirectory()) {
                fs.readdir(path, (err, files) => {
                    Promise.all(files.map((file) => {
                        paths.push(p.join(path, file));
                        return new Promise(del.bind(null, paths));
                    })).then(fs.rmdir.bind(null, path, callback));
                });
            } else {
                callback();
            }
        });
    } else {
        callback();
    }
}
