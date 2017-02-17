'use strict';

import * as path from 'path';
import * as cp from 'child_process';

export default class Dfix {
    public static toolDirectory = '';
    public static toolFile = '';

    public constructor(private _fileOrDir: string) { }

    public execute(resolve: Function, reject: Function) {
        cp.spawn(path.join(Dfix.toolDirectory, Dfix.toolFile), [this._fileOrDir], resolve);
    }
};