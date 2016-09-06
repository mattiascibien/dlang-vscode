'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as vsc from 'vscode';

export default class Tasks implements vsc.Disposable {
    private _tasksFile: string;
    private _choosers: {
        compiler: vsc.StatusBarItem,
        build: vsc.StatusBarItem
    };

    public static get compilers() {
        let compilers = [
            'dmd',
            'ldc',
            'gdc',
            'ldmd',
            'gdmd'
        ];

        let installedCompilers = new Set<string>();
        let isWin = process.platform === 'win32';

        compilers.forEach((compiler) => {
            process.env.PATH.split(isWin ? ';' : ':').forEach((dir) => {
                try {
                    fs.accessSync(path.join(dir, compiler + (isWin ? '.exe' : '')), fs.F_OK);
                    installedCompilers.add(compiler);
                } catch (e) { }
            });
        });

        return Array.from(installedCompilers);
    }

    public static get builds() {
        return [
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
    }

    public constructor() {
        this._tasksFile = path.join(vsc.workspace.rootPath, '.vscode', 'tasks.json');
        this._choosers = {
            compiler: vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Left, 10),
            build: vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Left, 11)
        };

        this._choosers.compiler.command = 'dlang.tasks.compiler';
        this._choosers.compiler.tooltip = 'Compiler used by dub';

        this._choosers.build.command = 'dlang.tasks.build';
        this._choosers.build.tooltip = 'Build target';
    }

    public dispose() {
        this.hideChoosers();

        for (let chooser in this._choosers) {
            this._choosers[chooser].dispose();
        }
    }

    public createFile() {
        fs.mkdir(path.join(vsc.workspace.rootPath, '.vscode'), () => {
            fs.access(this._tasksFile, fs.W_OK, (err) => {
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
        fs.writeFile(this._tasksFile, JSON.stringify(json, null, vsc.workspace.getConfiguration().get('editor.tabSize', 4)));
    }

    public getFile() {
        return new Promise((resolve) => {
            fs.readFile(this._tasksFile, (err, data) => {
                resolve(err ? null : JSON.parse(data.toString()));
            });
        });
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
        this._choosers.compiler.text = '$(tools) ' + Tasks.compilers[0];
        this._choosers.build.text = '$(gear) ' + Tasks.builds[0];

        this.apply((args) => {
            args.forEach((arg) => {
                let map = {
                    compiler: {
                        chooser: this._choosers.compiler,
                        icon: '$(tools)'
                    },
                    build: {
                        chooser: this._choosers.build,
                        icon: '$(gear)'
                    }
                };

                for (let regexp in map) {
                    let match = arg.match(new RegExp(`--${regexp}=(.*)`));

                    if (match) {
                        map[regexp].chooser.text = map[regexp].icon + ' ' + match[1];
                    }
                }
            });
        });
    }

    public hideChoosers() {
        for (let chooser in this._choosers) {
            this._choosers[chooser].hide();
        }
    }

    public set compiler(compiler: string) {
        this.apply(this.changeArgument.bind(this, 'compiler', compiler), true);
    }

    public set build(build: string) {
        this.apply(this.changeArgument.bind(this, 'build', build), true);
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
        let compilerArg = args.find((arg) => {
            return !!arg.match(new RegExp(`--${argument}=.*`));
        });

        let newArg = `--${argument}=` + value;

        args.push(newArg);

        return args.filter((arg) => {
            return arg !== compilerArg;
        });
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
            'problemMatcher': {
                'fileLocation': [
                    'relative',
                    '${workspaceRoot}'
                ],
                'pattern': {
                    'regexp': '^(.+\\.di?)[\\D](\\d+)(,|:)?(\\d+)?\\S+\\s+([Ee]rror|[Ww]arning):\\s+(.+)$',
                    'file': 1,
                    'line': 2,
                    'column': 4,
                    'severity': 5,
                    'message': 6
                }
            },
        },
        {
            'taskName': 'test',
            'isTestCommand': true,
            'problemMatcher': {
                'fileLocation': [
                    'relative',
                    '${workspaceRoot}'
                ],
                'pattern': {
                    'regexp': '^.+@(.+\\.di?)\\((\\d+)\\S+\\s+(.+)$',
                    'file': 1,
                    'line': 2,
                    'message': 3
                }
            }
        },
        {
            'taskName': 'run'
        },
        {
            'taskName': 'clean'
        }
    ]
};