'use strict';

import * as fs from 'fs';
import * as p from 'path';
import * as cp from 'child_process';
import * as rl from 'readline';
import * as vsc from 'vscode';
import * as tmp from 'tmp';
import * as msg from './messenger';

export default class Dub extends vsc.Disposable {
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
        return cp.spawnSync('dub', ['--help']).error;
    }

    public constructor() {
        super(null);
    }

    public dispose() {
        this._tmp.removeCallback();
        this._packages.clear();
    }

    public fetch(packageName: string, build?: boolean) {
        msg.add('Fetching', packageName);

        let fetcher = cp.spawn('dub', ['fetch', packageName]);
        let fetchPromise = new Promise((resolve) => {
            fetcher.on('exit', resolve);
        });

        return fetchPromise.then(() => {
            msg.remove('Fetching', packageName);
            return this.refresh();
        }).then(() => {
            if (build) {
                return this.build(packageName);
            }
        })
    }

    public build(packageName: string, config?: string) {
        let packageNamePretty = packageName + (config ? ` (${config})` : '');
        msg.add('Building', packageNamePretty);

        let options = [
            'build',
            '--root=' + this._packages.get(packageName).path,
        ];

        if (config) {
            options.push('--config=' + config);
        }

        let builder = cp.spawn('dub', options);
        let buildPromise = new Promise((resolve) => {
            builder.on('exit', resolve);
        });

        buildPromise.then(() => {
            msg.remove('Building', packageNamePretty);
        });

        return buildPromise;
    }

    public convert(path: string) {
        if (!this._tmp) {
            this._tmp = tmp.dirSync();
        }

        let sdlData = fs.readFileSync(path);
        let dubSdl = p.join(this._tmp.name, 'dub.sdl');
        let dubJson = p.join(this._tmp.name, 'dub.json');

        fs.writeFileSync(dubSdl, sdlData);

        if (fs.existsSync(dubJson)) {
            fs.unlinkSync(dubJson);
        }

        let res = cp.spawnSync('dub', ['convert', '--format=json'], {
            cwd: this._tmp.name
        });

        return dubJson;
    }

    public refresh() {
        let dub = cp.spawn('dub', ['list']);
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
    // let reg = '^[0-9.]*$';

    // return !second.match(reg) || (first.match(reg) && (first > second));

    return second == "~master" || first > second;
}