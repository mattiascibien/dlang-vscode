'use strict';

import * as vsc from 'vscode';
import * as cp from 'child_process';
import * as rl from 'readline';

export default class Dub extends vsc.Disposable {
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
        return cp.spawnSync('dub', ['--help']).error;
    }

    public constructor() {
        super(null);
    }

    public dispose() {
        this._packages = null;
    }

    public fetch(packageName: string, build?: boolean) {
        let fetch = cp.spawn('dub', ['fetch', packageName]);

        return new Promise((resolve) => {
            fetch.on('exit', resolve);
        }).then(() => {
            return this.refresh();
        }).then(() => {
            if (build) {
                return this.build(packageName);
            }
        })
    }

    public build(packageName: string, config?: string) {
        let options = ['build', '--root=' + this._packages.get(packageName).path];

        if (config) {
            options.push('--config=' + config);
        }

        let build = cp.spawn('dub', options);

        return new Promise((resolve) => {
            build.on('exit', resolve);
        });
    }

    public refresh() {
        let dub = cp.spawn('dub', ['list']);
        let reader = rl.createInterface({ input: dub.stdout, output: null });
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
        })
    }
}

export class Package {
    public constructor(private _version: string, private _path: string) { }

    get version() {
        return this._version;
    }

    get path() {
        return this._path;
    }
}

function isVersionSuperior(first: string, second: string) {
    let reg = '^[0-9.]*$';

    return !second.match(reg) || (first.match(reg) && (first > second));
}