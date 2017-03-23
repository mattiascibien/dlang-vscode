'use strict';

import * as path from 'path';
import * as cp from 'child_process';

export default class Dfix {
    public static toolDirectory = '';
    public static toolFile = '';

    public constructor(fileOrDir: string, resolve: Function) {
        cp.spawn(path.join(Dfix.toolDirectory, Dfix.toolFile), [fileOrDir], {
            cwd: fileOrDir
        }).on('exit', resolve);
    }
};