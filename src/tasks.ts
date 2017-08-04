'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';
import Dub from './dub';

export default class Tasks implements vsc.Disposable {
    private static _builds = [
        'debug',
        'plain',
        'release',
        'release-debug',
        'release-nobounds',
        'unittest',
        'profile',
        'profile-gc',
        'docs',
        'ddox',
        'cov',
        'unittest-cov'
    ];
    private static _configs = ['<none>'];
    private _dub: Dub;
    private _watcher: vsc.FileSystemWatcher;
    private _builds: string[] = [];
    private _configs: string[] = [];
    private _tasksFile: string;
    private _choosers: {
        compiler: vsc.StatusBarItem,
        build: vsc.StatusBarItem,
        config: vsc.StatusBarItem
    };

    public get compilers() {
        let installedCompilers = new Set<string>();
        let isWin = process.platform === 'win32';

        ['dmd', 'ldc2', 'gdc', 'ldmd2', 'gdmd'].forEach((compiler) =>
            process.env.PATH.split(isWin ? ';' : ':').forEach((dir) => {
                try {
                    fs.accessSync(path.join(dir, compiler + (isWin ? '.exe' : '')), fs.constants.F_OK);
                    installedCompilers.add(compiler);
                } catch (e) { }
            }));

        return Array.from(installedCompilers);
    }

    public get builds() {
        return Tasks._builds.concat(this._builds);
    }

    public get configs() {
        return Tasks._configs.concat(this._configs);
    }

    public set compiler(compiler: string) {
        this.apply(this.changeArgument.bind(this, 'compiler', compiler), true);
    }

    public set build(build: string) {
        this.apply(this.changeArgument.bind(this, 'build', build), true);
    }

    public set config(config: string) {
        this.apply(this.changeArgument.bind(this, 'config', config), true);
    }

    public constructor(dub: Dub) {
        this._dub = dub;

        if (vsc.workspace.rootPath) {
            let extensions = ['json', 'sdl'];
            let filePath = path.join(vsc.workspace.rootPath, 'dub.*');
            let listener = (e: vsc.Uri) => {
                if (path.extname(e.path).match(extensions.join('|'))) {
                    this.updateInfo(e.fsPath);
                }
            };

            this._watcher = vsc.workspace.createFileSystemWatcher(filePath);
            this._watcher.onDidCreate(listener);
            this._watcher.onDidChange(listener);
            this._watcher.onDidDelete(() => {
                this._builds = [];
                this._configs = [];
            });

            extensions.forEach((ext) => {
                let filePath = path.join(vsc.workspace.rootPath, 'dub.' + ext);

                fs.access(filePath, fs.constants.R_OK, (err) => {
                    if (!err) {
                        this.updateInfo(filePath);
                    }
                });
            });
        }

        this._tasksFile = path.join(vsc.workspace.rootPath, '.vscode', 'tasks.json');
        this._choosers = {
            compiler: vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Left, 12),
            build: vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Left, 11),
            config: vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Left, 10)
        };

        this._choosers.compiler.command = 'dlang.tasks.compiler';
        this._choosers.compiler.tooltip = 'Compiler used by dub';

        this._choosers.build.command = 'dlang.tasks.build';
        this._choosers.build.tooltip = 'Build target';

        this._choosers.config.command = 'dlang.tasks.config';
        this._choosers.config.tooltip = 'Build configuration';
    }

    public dispose() {
        this._watcher.dispose();
        this.hideChoosers();

        for (let chooser in this._choosers) {
            this._choosers[chooser].dispose();
        }
    }

    public createFile() {
        fs.mkdir(path.join(vsc.workspace.rootPath, '.vscode'), () => {
            fs.access(this._tasksFile, fs.constants.W_OK, (err) => {
                if (!err) {
                    vsc.window.showWarningMessage('File tasks.json already exists', 'overwrite').then((choice) => {
                        if (choice === 'overwrite') {
                            this.writeFile(defaultTasks);
                        }
                    });
                } else {
                    this.writeFile(defaultTasks);
                }
            });
        });
    };

    public writeFile(json: any) {
        fs.writeFile(this._tasksFile, JSON.stringify(json, null, vsc.workspace.getConfiguration().get('editor.tabSize', 4)), null);
    }

    public getFile() {
        return new Promise((resolve) =>
            fs.readFile(this._tasksFile, (err, data) =>
                resolve(err ? null : JSON.parse(data.toString()))));
    }

    public showChoosers() {
        fs.access(this._tasksFile, (err) => {
            if (!err) {
                for (let chooser in this._choosers) {
                    this._choosers[chooser].show();
                }

                this.updateChoosers();
            }
        });
    }

    public updateChoosers() {
        this._choosers.compiler.text = '$(tools) ' + this.compilers[0];
        this._choosers.build.text = '$(gear) ' + this.builds[0];
        this._choosers.config.text = '$(settings) ' + this.configs[0];

        this.apply((args) => args.forEach((arg) => {
            let map = {
                compiler: {
                    chooser: this._choosers.compiler,
                    icon: '$(tools)'
                },
                build: {
                    chooser: this._choosers.build,
                    icon: '$(gear)'
                },
                config: {
                    chooser: this._choosers.config,
                    icon: '$(settings)'
                }
            };

            for (let item in map) {
                let match = arg.match(new RegExp(`--${item}=(.*)`));

                if (match) {
                    map[item].chooser.text = map[item].icon + ' ' + match[1];
                }
            }
        }));
    }

    public hideChoosers() {
        for (let chooser in this._choosers) {
            this._choosers[chooser].hide();
        }
    }

    private updateInfo(dubPath: string) {
        if (path.extname(dubPath) == 'sdl') {
            dubPath = this._dub.getJSONFromSDL(dubPath);
        }

        fs.readFile(dubPath, (err, data) => {
            try {
                let json = JSON.parse(data.toString());

                if (json.buildTypes) {
                    this._builds = [];

                    for (let type in json.buildTypes) {
                        this._builds.push(type);
                    }
                }

                if (json.configurations) {
                    this._configs = json.configurations.map((config) => config.name);
                }
            } catch (err) { }
        });
    }

    private apply(predicate: (args: string[]) => (string[] | void), write?: boolean) {
        return this.getFile().then((json: any) => {
            if (json && json.tasks) {
                json.tasks.forEach((task) => {
                    if (task.taskName.match(/build|test/)) {
                        task.args = predicate(task.args || []) || task.args;
                    }
                });

                if (write) {
                    this.writeFile(json);
                    this.updateChoosers();
                }
            }
        });
    }

    private changeArgument(argument: string, value: string, args: string[]) {
        let compilerArg = args.find((arg) => !!arg.match(new RegExp(`--${argument}=.*`)));

        if (value && value !== Tasks._configs[0]) {
            args.push(`--${argument}=` + value);
        }

        return args.filter((arg) => arg !== compilerArg);
    }
};

const defaultTasks = {
    'version': '0.1.0',
    'command': 'dub',
    'isShellCommand': true,
    'showOutput': 'silent',
    'options': {
        'env': {
            'LANG': 'C'
        }
    },
    'tasks': [
        {
            'taskName': 'build',
            'isBuildCommand': true,
            'problemMatcher': '$dub-build'
        },
        {
            'taskName': 'test',
            'isTestCommand': true,
            'problemMatcher': '$dub-test'
        },
        {
            'taskName': 'run'
        },
        {
            'taskName': 'clean'
        }
    ]
};