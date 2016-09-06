'use strict';

import * as path from 'path';
import * as cp from 'child_process';

export default class Dfix {
    public static path: string;

    public constructor(fileOrDir: string) {
        cp.spawn(path.join(Dfix.path, 'dfix'), [fileOrDir]);
    }
};